-- Add transaction_pin column to profiles for transaction security
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS transaction_pin TEXT;

-- Add failed_pin_attempts column to track failed attempts
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS failed_pin_attempts INTEGER DEFAULT 0;

-- Add pin_locked_until column for lockout
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMP WITH TIME ZONE;

-- Create index for faster duplicate transaction checks
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON public.transactions(reference);

-- Create index for faster user transaction lookups
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON public.transactions(user_id, created_at DESC);