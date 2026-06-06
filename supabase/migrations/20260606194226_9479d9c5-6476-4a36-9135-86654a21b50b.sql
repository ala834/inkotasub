ALTER TABLE public.virtual_accounts
  ADD COLUMN IF NOT EXISTS wallet_type text NOT NULL DEFAULT 'main';

ALTER TABLE public.virtual_accounts
  DROP CONSTRAINT IF EXISTS virtual_accounts_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS virtual_accounts_user_wallet_type_key
  ON public.virtual_accounts (user_id, wallet_type);