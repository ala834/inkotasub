-- Add provider column to vtu_orders table
ALTER TABLE public.vtu_orders ADD COLUMN IF NOT EXISTS provider_used text DEFAULT 'subpadi';
ALTER TABLE public.vtu_orders ADD COLUMN IF NOT EXISTS fallback_attempted boolean DEFAULT false;
ALTER TABLE public.vtu_orders ADD COLUMN IF NOT EXISTS fallback_provider text;
ALTER TABLE public.vtu_orders ADD COLUMN IF NOT EXISTS fallback_response jsonb;

-- Create provider_config table for admin control
CREATE TABLE IF NOT EXISTS public.provider_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL,
  network text,
  primary_provider text NOT NULL DEFAULT 'subpadi',
  fallback_provider text DEFAULT 'smeplug',
  fallback_enabled boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(service_type, network)
);

-- Enable RLS
ALTER TABLE public.provider_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for provider_config
CREATE POLICY "Admins can manage provider config" ON public.provider_config
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view provider config" ON public.provider_config
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);

-- Insert default provider configurations
INSERT INTO public.provider_config (service_type, network, primary_provider, fallback_provider, fallback_enabled)
VALUES 
  ('airtime', 'MTN', 'subpadi', 'smeplug', true),
  ('airtime', 'GLO', 'subpadi', 'smeplug', true),
  ('airtime', 'AIRTEL', 'subpadi', 'smeplug', true),
  ('airtime', '9MOBILE', 'subpadi', 'smeplug', true),
  ('data', 'MTN', 'subpadi', 'smeplug', true),
  ('data', 'GLO', 'subpadi', 'smeplug', true),
  ('data', 'AIRTEL', 'subpadi', 'smeplug', true),
  ('data', '9MOBILE', 'subpadi', 'smeplug', true),
  ('electricity', NULL, 'subpadi', 'smeplug', true),
  ('cable', NULL, 'subpadi', 'smeplug', true)
ON CONFLICT (service_type, network) DO NOTHING;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_provider_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_provider_config_updated_at
  BEFORE UPDATE ON public.provider_config
  FOR EACH ROW EXECUTE FUNCTION update_provider_config_updated_at();