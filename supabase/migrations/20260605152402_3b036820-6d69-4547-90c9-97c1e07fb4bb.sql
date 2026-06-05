
-- 1. Cashback wallets
CREATE TABLE IF NOT EXISTS public.cashback_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned NUMERIC NOT NULL DEFAULT 0,
  total_spent NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cashback_wallets TO authenticated;
GRANT ALL ON public.cashback_wallets TO service_role;

ALTER TABLE public.cashback_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cashback wallet"
  ON public.cashback_wallets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all cashback wallets"
  ON public.cashback_wallets FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_cashback_wallets_updated_at
  BEFORE UPDATE ON public.cashback_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Cashback settings
CREATE TABLE IF NOT EXISTS public.cashback_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL UNIQUE,
  percentage NUMERIC NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  max_cashback NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cashback_settings TO authenticated;
GRANT ALL ON public.cashback_settings TO service_role;

ALTER TABLE public.cashback_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view cashback settings"
  ON public.cashback_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage cashback settings"
  ON public.cashback_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_cashback_settings_updated_at
  BEFORE UPDATE ON public.cashback_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.cashback_settings (service_type, percentage, is_enabled) VALUES
  ('airtime', 0.5, true),
  ('data', 1.0, true),
  ('electricity', 0.5, true),
  ('cable', 1.0, true),
  ('exam_pin', 1.0, true),
  ('recharge_card', 0.5, true)
ON CONFLICT (service_type) DO NOTHING;

-- 3. Extend cashback_transactions
ALTER TABLE public.cashback_transactions
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'manual' CHECK (type IN ('earned','spent','manual')),
  ADD COLUMN IF NOT EXISTS source_transaction_id UUID,
  ADD COLUMN IF NOT EXISTS service_type TEXT;

ALTER TABLE public.cashback_transactions
  ALTER COLUMN admin_id DROP NOT NULL,
  ALTER COLUMN reason DROP NOT NULL;

-- 4. Atomic cashback wallet helpers
CREATE OR REPLACE FUNCTION public.atomic_cashback_credit(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new_balance NUMERIC;
BEGIN
  INSERT INTO cashback_wallets (user_id, balance) VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE cashback_wallets
    SET balance = balance + p_amount,
        total_earned = total_earned + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_cashback_debit(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new_balance NUMERIC;
BEGIN
  UPDATE cashback_wallets
    SET balance = balance - p_amount,
        total_spent = total_spent + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id AND balance >= p_amount
    RETURNING balance INTO v_new_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_cashback';
  END IF;
  RETURN v_new_balance;
END;
$$;

-- 5. Award cashback after a successful transaction
CREATE OR REPLACE FUNCTION public.award_cashback_for_transaction(
  p_user_id UUID,
  p_transaction_id UUID,
  p_service_type TEXT,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_setting RECORD;
  v_cashback NUMERIC;
  v_before NUMERIC;
  v_after NUMERIC;
  v_existing UUID;
BEGIN
  -- Avoid double award per source transaction
  SELECT id INTO v_existing FROM cashback_transactions
    WHERE source_transaction_id = p_transaction_id AND type = 'earned' LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN 0; END IF;

  SELECT * INTO v_setting FROM cashback_settings WHERE service_type = p_service_type;
  IF NOT FOUND OR v_setting.is_enabled = false OR v_setting.percentage <= 0 THEN
    RETURN 0;
  END IF;

  v_cashback := round((p_amount * v_setting.percentage / 100.0)::numeric, 2);
  IF v_setting.max_cashback IS NOT NULL AND v_cashback > v_setting.max_cashback THEN
    v_cashback := v_setting.max_cashback;
  END IF;
  IF v_cashback <= 0 THEN RETURN 0; END IF;

  INSERT INTO cashback_wallets (user_id, balance) VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_before FROM cashback_wallets WHERE user_id = p_user_id;
  v_after := public.atomic_cashback_credit(p_user_id, v_cashback);

  INSERT INTO cashback_transactions (
    user_id, admin_id, amount, reason, balance_before, balance_after,
    reference, type, source_transaction_id, service_type
  ) VALUES (
    p_user_id, NULL, v_cashback,
    'Cashback earned on ' || p_service_type || ' purchase',
    v_before, v_after,
    'CB_EARN_' || p_transaction_id::text,
    'earned', p_transaction_id, p_service_type
  );

  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    p_user_id,
    'Cashback Earned 🎉',
    'You earned ₦' || v_cashback::text || ' cashback on your ' || p_service_type || ' purchase.',
    'success'
  );

  RETURN v_cashback;
END;
$$;

-- 6. Redeem cashback into main wallet (used by Use Cashback)
CREATE OR REPLACE FUNCTION public.redeem_cashback_to_wallet(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cashback_before NUMERIC;
  v_cashback_after NUMERIC;
  v_wallet_after NUMERIC;
  v_ref TEXT;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT balance INTO v_cashback_before FROM cashback_wallets WHERE user_id = p_user_id;
  IF v_cashback_before IS NULL OR v_cashback_before < p_amount THEN
    RAISE EXCEPTION 'insufficient_cashback';
  END IF;

  v_cashback_after := public.atomic_cashback_debit(p_user_id, p_amount);
  v_wallet_after := public.atomic_wallet_credit(p_user_id, p_amount);

  v_ref := 'CB_REDEEM_' || gen_random_uuid()::text;

  INSERT INTO cashback_transactions (
    user_id, admin_id, amount, reason, balance_before, balance_after, reference, type
  ) VALUES (
    p_user_id, NULL, p_amount,
    'Cashback redeemed to wallet',
    v_cashback_before, v_cashback_after, v_ref, 'spent'
  );

  RETURN jsonb_build_object(
    'cashback_before', v_cashback_before,
    'cashback_after', v_cashback_after,
    'wallet_after', v_wallet_after,
    'amount', p_amount,
    'reference', v_ref
  );
END;
$$;

-- 7. Backfill cashback_wallets rows for existing users (best-effort)
INSERT INTO public.cashback_wallets (user_id, balance)
SELECT user_id, 0 FROM public.wallets
ON CONFLICT (user_id) DO NOTHING;
