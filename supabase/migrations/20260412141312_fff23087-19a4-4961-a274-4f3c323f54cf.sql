-- Remove overly permissive SELECT on pricing_config (admins already have full access via the ALL policy)
DROP POLICY IF EXISTS "Authenticated users can view active pricing" ON public.pricing_config;

-- Remove overly permissive SELECT on provider_config
DROP POLICY IF EXISTS "Authenticated users can view provider config" ON public.provider_config;

-- Restrict service_plans visibility to authenticated users only (was public)
DROP POLICY IF EXISTS "Users can view enabled plans" ON public.service_plans;
CREATE POLICY "Authenticated users can view enabled plans"
ON public.service_plans
FOR SELECT
TO authenticated
USING (is_enabled = true);