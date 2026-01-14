-- Create app_settings table for storing application configuration
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage app settings
CREATE POLICY "Admins can manage app settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can read app settings (for public settings like logo)
CREATE POLICY "Authenticated users can view app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

-- Insert default app settings
INSERT INTO public.app_settings (key, value, description) VALUES
  ('app_name', 'INKOTA SUB', 'Application name'),
  ('support_email', 'support@inkotasub.com', 'Support email address'),
  ('support_phone', '+234 800 000 0000', 'Support phone number'),
  ('logo_url', NULL, 'Application logo URL'),
  ('terms_url', NULL, 'Terms of service URL'),
  ('privacy_url', NULL, 'Privacy policy URL'),
  ('refund_policy', 'Refunds are processed within 24 hours for failed transactions.', 'Refund policy text');

-- Add suspended_at column to profiles for user suspension
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone DEFAULT NULL;

-- Add RLS policy for admins to update all profiles (for suspension)
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger to update updated_at on app_settings
CREATE OR REPLACE FUNCTION public.update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_app_settings_updated_at();