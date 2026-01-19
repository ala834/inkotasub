-- Create service_plans table to store plans from SUBPADI with base prices
CREATE TABLE public.service_plans (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    service_type TEXT NOT NULL CHECK (service_type IN ('airtime', 'data', 'cable', 'electricity')),
    network TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    base_price NUMERIC NOT NULL DEFAULT 0,
    validity TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    is_manual BOOLEAN NOT NULL DEFAULT false,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(service_type, network, plan_id)
);

-- Enable RLS
ALTER TABLE public.service_plans ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "Admins can manage service plans"
ON public.service_plans
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
);

-- All authenticated users can read enabled plans
CREATE POLICY "Users can view enabled plans"
ON public.service_plans
FOR SELECT
USING (is_enabled = true);

-- Create price_change_log table for audit
CREATE TABLE public.price_change_log (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID NOT NULL,
    plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE,
    pricing_config_id UUID REFERENCES public.pricing_config(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('profit_updated', 'plan_enabled', 'plan_disabled', 'plan_added', 'plan_synced')),
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.price_change_log ENABLE ROW LEVEL SECURITY;

-- Only admins can access price change logs
CREATE POLICY "Admins can manage price change logs"
ON public.price_change_log
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
);

-- Create trigger for updated_at
CREATE TRIGGER update_service_plans_updated_at
BEFORE UPDATE ON public.service_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster queries
CREATE INDEX idx_service_plans_service_network ON public.service_plans(service_type, network);
CREATE INDEX idx_service_plans_enabled ON public.service_plans(is_enabled) WHERE is_enabled = true;