-- Add plan_type column to service_plans
ALTER TABLE public.service_plans 
ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'GENERAL';

-- Create index for plan_type filtering
CREATE INDEX IF NOT EXISTS idx_service_plans_plan_type ON public.service_plans (plan_type);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_service_plans_type_network_enabled 
ON public.service_plans (service_type, network, is_enabled, plan_type);

-- Auto-categorize existing plans based on plan_name keywords
UPDATE public.service_plans 
SET plan_type = CASE
  WHEN LOWER(plan_name) LIKE '%corporate%' THEN 'CORPORATE'
  WHEN LOWER(plan_name) LIKE '%gifting%' OR LOWER(plan_name) LIKE '%gift%' THEN 'GIFTING'
  WHEN LOWER(plan_name) LIKE '%sme%' THEN 'SME'
  ELSE 'GENERAL'
END
WHERE service_type = 'data';