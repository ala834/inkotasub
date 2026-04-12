
-- Add username column to profiles
ALTER TABLE public.profiles ADD COLUMN username text;

-- Add unique constraint
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);

-- Add index for fast lookups
CREATE INDEX idx_profiles_username ON public.profiles (username);

-- Update handle_new_user to save username from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, username, referral_code)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'full_name',
      LOWER(NEW.raw_user_meta_data ->> 'username'),
      UPPER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT) FROM 1 FOR 8))
    );
    
    INSERT INTO public.wallets (user_id)
    VALUES (NEW.id);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$function$;
