
CREATE OR REPLACE FUNCTION public.release_advisory_lock(lock_key bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pg_advisory_unlock(lock_key);
$$;
