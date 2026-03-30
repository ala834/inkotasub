CREATE OR REPLACE FUNCTION public.admin_reset_pin_lock(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE profiles SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE user_id = target_user_id;
END;
$$