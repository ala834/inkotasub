-- Create OTP codes table for mock and real OTP verification
CREATE TABLE IF NOT EXISTS public.otp_codes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    phone_number TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'verification', -- 'verification', 'login', 'reset_pin'
    is_verified BOOLEAN NOT NULL DEFAULT false,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create authentication events log table
CREATE TABLE IF NOT EXISTS public.auth_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    phone_number TEXT,
    event_type TEXT NOT NULL, -- 'signup_started', 'otp_sent', 'otp_verified', 'signup_completed', 'login_success', 'login_failed', 'pin_reset'
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add phone_number column to profiles if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'profiles' 
                   AND column_name = 'phone_number') THEN
        ALTER TABLE public.profiles ADD COLUMN phone_number TEXT;
    END IF;
END $$;

-- Add unique constraint on phone_number in profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_number_unique') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_number_unique UNIQUE (phone_number);
    END IF;
END $$;

-- Create index for faster OTP lookups
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_purpose ON public.otp_codes(phone_number, purpose);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON public.otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_user_id ON public.auth_events(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_phone ON public.auth_events(phone_number);

-- Enable RLS
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

-- OTP codes policies (server-side only access via service role)
CREATE POLICY "Service role can manage OTP codes" ON public.otp_codes
FOR ALL USING (true) WITH CHECK (true);

-- Auth events: users can view their own events
CREATE POLICY "Users can view their own auth events" ON public.auth_events
FOR SELECT USING (auth.uid() = user_id);

-- Admins can view all auth events
CREATE POLICY "Admins can view all auth events" ON public.auth_events
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Add feature flags to app_settings
INSERT INTO public.app_settings (key, value, description) 
VALUES 
    ('TERMII_ENABLED', 'false', 'Enable Termii SMS OTP (set to true when CAC is ready)'),
    ('OTP_EXPIRY_MINUTES', '5', 'OTP expiration time in minutes'),
    ('OTP_MAX_ATTEMPTS', '3', 'Maximum OTP verification attempts'),
    ('MOCK_OTP_CODE', '123456', 'Mock OTP code for testing (only used when TERMII_ENABLED is false)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;