
-- Add passcode tracking fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS passcode_set boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_locked_until timestamptz;

-- All existing users are legacy password users => need to set a passcode via OTP reset flow
-- (default is false which already enforces this)

-- Update handle_new_user trigger so that NEW signups (which now always use a 6-digit passcode)
-- are marked as passcode_set=true.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text;
BEGIN
    v_phone := NULLIF(NEW.raw_user_meta_data ->> 'phone_number', '');

    INSERT INTO public.profiles (user_id, full_name, username, referral_code, phone_number, email_verified, passcode_set)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'full_name',
      LOWER(NEW.raw_user_meta_data ->> 'username'),
      UPPER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT) FROM 1 FOR 8)),
      v_phone,
      false,
      true
    );

    INSERT INTO public.wallets (user_id) VALUES (NEW.id);
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');

    RETURN NEW;
END;
$function$;
