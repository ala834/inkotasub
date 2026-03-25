-- Performance indexes for high-traffic tables
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON public.transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id_created ON public.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_vtu_orders_user_id_created ON public.vtu_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vtu_orders_transaction_id ON public.vtu_orders(transaction_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_pricing_config_lookup ON public.pricing_config(service_type, is_active, user_type);
CREATE INDEX IF NOT EXISTS idx_provider_config_lookup ON public.provider_config(service_type, is_active);