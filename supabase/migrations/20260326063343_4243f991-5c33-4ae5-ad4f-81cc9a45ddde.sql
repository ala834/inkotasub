
-- 1. Financial Ledger System - Immutable audit trail
CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id),
  user_id uuid NOT NULL,
  entry_type text NOT NULL, -- 'wallet_debit', 'wallet_credit', 'provider_charge', 'profit_margin', 'refund', 'admin_adjustment'
  amount numeric NOT NULL,
  balance_before numeric NOT NULL,
  balance_after numeric NOT NULL,
  reference text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Make ledger immutable - no updates or deletes
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all ledger entries" ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own ledger entries" ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role can insert (edge functions only)
CREATE POLICY "Service role can insert ledger entries" ON public.ledger_entries
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_ledger_entries_user_id ON public.ledger_entries(user_id);
CREATE INDEX idx_ledger_entries_transaction_id ON public.ledger_entries(transaction_id);
CREATE INDEX idx_ledger_entries_created_at ON public.ledger_entries(created_at DESC);

-- 2. Fraud detection tracking table
CREATE TABLE public.fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  flag_type text NOT NULL, -- 'rapid_purchase', 'high_volume', 'suspicious_pattern'
  severity text NOT NULL DEFAULT 'warning', -- 'warning', 'block', 'review'
  details jsonb,
  resolved boolean DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fraud flags" ON public.fraud_flags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert fraud flags" ON public.fraud_flags
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE INDEX idx_fraud_flags_user_id ON public.fraud_flags(user_id);
CREATE INDEX idx_fraud_flags_created_at ON public.fraud_flags(created_at DESC);

-- 3. Provider metrics tracking
CREATE TABLE public.provider_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  service_type text NOT NULL,
  response_time_ms integer,
  success boolean NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view provider metrics" ON public.provider_metrics
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert provider metrics" ON public.provider_metrics
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE INDEX idx_provider_metrics_provider ON public.provider_metrics(provider, created_at DESC);
CREATE INDEX idx_provider_metrics_created_at ON public.provider_metrics(created_at DESC);

-- Auto-cleanup old metrics (keep 30 days)
CREATE INDEX idx_provider_metrics_cleanup ON public.provider_metrics(created_at);
