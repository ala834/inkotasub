CREATE OR REPLACE FUNCTION public.is_developer_api_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.api_access_requests
    WHERE user_id = _user_id
      AND status = 'approved'
  );
$$;

CREATE TABLE IF NOT EXISTS public.developer_api_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type public.service_type NOT NULL,
  provider_source text NOT NULL,
  network text,
  plan_name text NOT NULL,
  plan_id text NOT NULL,
  validation_id text,
  developer_price numeric NOT NULL DEFAULT 0,
  user_price numeric NOT NULL DEFAULT 0,
  reseller_price numeric NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  is_hidden_from_users boolean NOT NULL DEFAULT false,
  auto_hide_on_failure boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0,
  last_failure_at timestamp with time zone,
  last_failure_reason text,
  last_success_at timestamp with time zone,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.developer_api_plans ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_api_plans_unique_catalog
  ON public.developer_api_plans (service_type, provider_source, COALESCE(network, ''), plan_id);

CREATE INDEX IF NOT EXISTS idx_developer_api_plans_service_network
  ON public.developer_api_plans (service_type, network, is_enabled, is_hidden_from_users);

CREATE INDEX IF NOT EXISTS idx_developer_api_plans_provider_source
  ON public.developer_api_plans (provider_source, service_type);

CREATE INDEX IF NOT EXISTS idx_developer_api_plans_failure_queue
  ON public.developer_api_plans (failure_count DESC, last_failure_at DESC);

DROP POLICY IF EXISTS "Admins can manage developer api plans" ON public.developer_api_plans;
CREATE POLICY "Admins can manage developer api plans"
ON public.developer_api_plans
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Approved developers can view active developer api plans" ON public.developer_api_plans;
CREATE POLICY "Approved developers can view active developer api plans"
ON public.developer_api_plans
FOR SELECT
TO authenticated
USING (
  public.is_developer_api_approved(auth.uid())
  AND is_enabled = true
  AND is_hidden_from_users = false
);

DROP TRIGGER IF EXISTS update_developer_api_plans_updated_at ON public.developer_api_plans;
CREATE TRIGGER update_developer_api_plans_updated_at
BEFORE UPDATE ON public.developer_api_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();