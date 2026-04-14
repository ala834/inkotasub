-- Drop old unique constraint that doesn't include provider
ALTER TABLE public.service_plans DROP CONSTRAINT service_plans_service_type_network_plan_id_key;

-- Add new unique constraint that includes provider
ALTER TABLE public.service_plans ADD CONSTRAINT service_plans_service_type_provider_network_plan_id_key 
  UNIQUE (service_type, provider, network, plan_id);