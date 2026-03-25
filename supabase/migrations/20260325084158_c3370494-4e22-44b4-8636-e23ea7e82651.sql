-- Create advisory lock function for transaction serialization
CREATE OR REPLACE FUNCTION public.try_advisory_lock(lock_key bigint)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pg_try_advisory_lock(lock_key);
$$;