-- Add boolean column to indicate PIN status without exposing the hash
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_transaction_pin boolean NOT NULL DEFAULT false;

-- Populate from existing data
UPDATE public.profiles SET has_transaction_pin = (transaction_pin IS NOT NULL);

-- Create trigger to keep has_transaction_pin in sync
CREATE OR REPLACE FUNCTION public.sync_has_transaction_pin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.has_transaction_pin := (NEW.transaction_pin IS NOT NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_has_transaction_pin
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_has_transaction_pin();

-- Revoke SELECT on sensitive PIN columns from anon and authenticated roles
REVOKE SELECT (transaction_pin, failed_pin_attempts, pin_locked_until) ON public.profiles FROM anon;
REVOKE SELECT (transaction_pin, failed_pin_attempts, pin_locked_until) ON public.profiles FROM authenticated;