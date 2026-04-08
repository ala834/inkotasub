
ALTER TABLE public.service_plans 
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'subpadi',
  ADD COLUMN IF NOT EXISTS selling_price numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
