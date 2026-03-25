ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON public.otp_codes (email) WHERE email IS NOT NULL;