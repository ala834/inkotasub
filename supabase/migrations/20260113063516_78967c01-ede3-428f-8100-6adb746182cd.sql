-- Create pricing_config table for dynamic pricing
CREATE TABLE public.pricing_config (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    service_type TEXT NOT NULL, -- 'airtime', 'data', 'electricity', 'cable'
    network TEXT, -- 'MTN', 'AIRTEL', 'GLO', '9MOBILE', null for all
    plan_id TEXT, -- specific plan id or null for all plans in service/network
    user_type TEXT NOT NULL DEFAULT 'user', -- 'user' or 'agent'
    profit_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
    profit_value NUMERIC NOT NULL DEFAULT 0, -- profit percentage or fixed amount
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(service_type, network, plan_id, user_type)
);

-- Add agent status to profiles for pricing differentiation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_agent BOOLEAN DEFAULT false;

-- Enable RLS on pricing_config
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- Only admins can manage pricing config
CREATE POLICY "Admins can manage pricing config" 
ON public.pricing_config 
FOR ALL 
USING (has_role(auth.uid(), 'admin'));

-- All authenticated users can view active pricing for calculating prices
CREATE POLICY "Authenticated users can view active pricing" 
ON public.pricing_config 
FOR SELECT 
USING (auth.role() = 'authenticated' AND is_active = true);

-- Create updated_at trigger
CREATE TRIGGER update_pricing_config_updated_at
BEFORE UPDATE ON public.pricing_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default pricing configurations
INSERT INTO public.pricing_config (service_type, network, plan_id, user_type, profit_type, profit_value) VALUES
-- Airtime default pricing
('airtime', NULL, NULL, 'user', 'percentage', 3),
('airtime', NULL, NULL, 'agent', 'percentage', 1.5),
-- Data default pricing
('data', NULL, NULL, 'user', 'percentage', 5),
('data', NULL, NULL, 'agent', 'percentage', 2),
-- Electricity default pricing
('electricity', NULL, NULL, 'user', 'fixed', 100),
('electricity', NULL, NULL, 'agent', 'fixed', 50),
-- Cable default pricing
('cable', NULL, NULL, 'user', 'percentage', 2),
('cable', NULL, NULL, 'agent', 'percentage', 1);