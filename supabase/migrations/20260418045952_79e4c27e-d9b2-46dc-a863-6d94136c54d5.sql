CREATE TABLE public.flowpay_manual_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  plan_name text NOT NULL,
  price numeric NOT NULL CHECK (price >= 0),
  api_plan_id text,
  plan_type text NOT NULL DEFAULT 'SME',
  validity text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_flowpay_manual_plans_network ON public.flowpay_manual_plans(network);
CREATE INDEX idx_flowpay_manual_plans_enabled ON public.flowpay_manual_plans(is_enabled);

ALTER TABLE public.flowpay_manual_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage flowpay manual plans"
  ON public.flowpay_manual_plans
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view enabled flowpay manual plans"
  ON public.flowpay_manual_plans
  FOR SELECT
  TO authenticated
  USING (is_enabled = true);

CREATE TRIGGER update_flowpay_manual_plans_updated_at
  BEFORE UPDATE ON public.flowpay_manual_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();