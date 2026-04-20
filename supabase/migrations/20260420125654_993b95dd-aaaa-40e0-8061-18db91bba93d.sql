
-- 1. API access requests
CREATE TABLE public.api_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reason TEXT,
  business_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own access requests" ON public.api_access_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own access requests" ON public.api_access_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage access requests" ON public.api_access_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_api_access_requests_updated_at
  BEFORE UPDATE ON public.api_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. API keys
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL, -- first 8 chars shown to user
  key_hash TEXT NOT NULL UNIQUE, -- sha-256 of full key
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_user ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own api keys" ON public.api_keys
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own api keys" ON public.api_keys
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all api keys" ON public.api_keys
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manage api keys" ON public.api_keys
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 3. API wallets (separate per-developer wallet)
CREATE TABLE public.api_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own api wallet" ON public.api_wallets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all api wallets" ON public.api_wallets
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update api wallets" ON public.api_wallets
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role manage api wallets" ON public.api_wallets
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 4. API wallet ledger
CREATE TABLE public.api_wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entry_type TEXT NOT NULL, -- credit | debit
  amount NUMERIC NOT NULL,
  balance_before NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  reference TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_wallet_ledger_user ON public.api_wallet_ledger(user_id, created_at DESC);
ALTER TABLE public.api_wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own api ledger" ON public.api_wallet_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all api ledger" ON public.api_wallet_ledger
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role insert api ledger" ON public.api_wallet_ledger
  FOR INSERT TO service_role WITH CHECK (true);

-- 5. API request logs
CREATE TABLE public.api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  api_key_id UUID,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  request_body JSONB,
  response_body JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_request_logs_user ON public.api_request_logs(user_id, created_at DESC);
CREATE INDEX idx_api_request_logs_key ON public.api_request_logs(api_key_id, created_at DESC);
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own api logs" ON public.api_request_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all api logs" ON public.api_request_logs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role insert api logs" ON public.api_request_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- 6. Helper functions
CREATE OR REPLACE FUNCTION public.atomic_api_wallet_debit(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_new_balance NUMERIC;
BEGIN
  UPDATE api_wallets
    SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = p_user_id AND balance >= p_amount
    RETURNING balance INTO v_new_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_api_balance';
  END IF;
  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.atomic_api_wallet_credit(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_new_balance NUMERIC;
BEGIN
  INSERT INTO api_wallets (user_id, balance) VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  UPDATE api_wallets
    SET balance = balance + p_amount, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_api_wallet_balance(p_user_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_balance NUMERIC;
BEGIN
  SELECT balance INTO v_balance FROM api_wallets WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  RETURN v_balance;
END;
$$;

CREATE TRIGGER trg_api_wallets_updated_at
  BEFORE UPDATE ON public.api_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
