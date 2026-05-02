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

    INSERT INTO public.profiles (user_id, full_name, username, referral_code, phone_number)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'full_name',
      LOWER(NEW.raw_user_meta_data ->> 'username'),
      UPPER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT) FROM 1 FOR 8)),
      v_phone
    );

    INSERT INTO public.wallets (user_id) VALUES (NEW.id);
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');

    RETURN NEW;
END;
$function$;