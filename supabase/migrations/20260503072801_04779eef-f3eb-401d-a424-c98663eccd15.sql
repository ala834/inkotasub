ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
-- Mark all existing users as verified to avoid forcing verification for them
UPDATE public.profiles SET email_verified = true WHERE email_verified = false;