-- Add failure tracking to flowpay_manual_plans
ALTER TABLE public.flowpay_manual_plans
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_failure_reason text,
  ADD COLUMN IF NOT EXISTS permanently_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_success_at timestamp with time zone;

-- Add failure tracking to service_plans
ALTER TABLE public.service_plans
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_failure_reason text,
  ADD COLUMN IF NOT EXISTS permanently_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_success_at timestamp with time zone;

-- Helpful indexes for the admin "Failed/Unstable Plans" view
CREATE INDEX IF NOT EXISTS idx_flowpay_manual_plans_failure_count
  ON public.flowpay_manual_plans (failure_count DESC, last_failure_at DESC)
  WHERE failure_count > 0;

CREATE INDEX IF NOT EXISTS idx_service_plans_failure_count
  ON public.service_plans (failure_count DESC, last_failure_at DESC)
  WHERE failure_count > 0;