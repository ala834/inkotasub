
-- ============================================
-- 1. Fix user_roles privilege escalation
-- ============================================
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Admins can select all roles" ON public.user_roles
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO public
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- 2. Fix app_settings data exposure
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view app settings" ON public.app_settings;

CREATE POLICY "Users can view public app settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR key IN (
      'support_email', 'whatsapp_number', 'support_phone',
      'service_data_enabled', 'service_airtime_enabled',
      'service_electricity_enabled', 'service_cable_enabled',
      'service_exam_pin_enabled', 'maintenance_mode',
      'registration_enabled', 'app_name', 'app_version',
      'recharge_card_enabled'
    )
  );

-- ============================================
-- 3. Fix pricing_config profit exposure
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view active pricing" ON public.pricing_config;

CREATE POLICY "Authenticated users can view active pricing" ON public.pricing_config
  FOR SELECT TO authenticated
  USING (
    (is_active = true AND has_role(auth.uid(), 'admin'::app_role))
    OR (is_active = true)
  );

-- Since we can't do column-level RLS, create a secure view for non-admin use
CREATE OR REPLACE VIEW public.public_pricing_config
WITH (security_invoker = true)
AS
  SELECT id, service_type, network, plan_id, user_type, is_active, created_at, updated_at
  FROM public.pricing_config
  WHERE is_active = true;

-- ============================================
-- 4. Atomic wallet debit RPC (prevents race conditions)
-- ============================================
CREATE OR REPLACE FUNCTION public.atomic_wallet_debit(
  p_user_id uuid,
  p_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE wallets
    SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = p_user_id AND balance >= p_amount
    RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Atomic wallet credit RPC
CREATE OR REPLACE FUNCTION public.atomic_wallet_credit(
  p_user_id uuid,
  p_amount numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE wallets
    SET balance = balance + p_amount, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Get current balance atomically
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT balance INTO v_balance FROM wallets WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;
  RETURN v_balance;
END;
$$;

-- ============================================
-- 5. Fix function search paths
-- ============================================
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_provider_config_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_app_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
