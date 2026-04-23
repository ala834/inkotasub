ALTER TABLE public.vtu_orders
ADD COLUMN IF NOT EXISTS provider_status text,
ADD COLUMN IF NOT EXISTS provider_message text,
ADD COLUMN IF NOT EXISTS provider_plan_id text,
ADD COLUMN IF NOT EXISTS provider_reference text,
ADD COLUMN IF NOT EXISTS fallback_history jsonb;

CREATE INDEX IF NOT EXISTS idx_vtu_orders_provider_reference
ON public.vtu_orders (provider_reference);

CREATE INDEX IF NOT EXISTS idx_vtu_orders_status_created_at
ON public.vtu_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vtu_orders_provider_status
ON public.vtu_orders (provider_status);