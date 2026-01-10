-- Create virtual_accounts table to store Paystack DVA details
CREATE TABLE public.virtual_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  account_number VARCHAR(20) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  bank_code VARCHAR(10),
  provider VARCHAR(50) DEFAULT 'paystack',
  customer_id VARCHAR(100),
  customer_code VARCHAR(100),
  dva_id VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.virtual_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only view their own virtual account
CREATE POLICY "Users can view their own virtual account" 
ON public.virtual_accounts 
FOR SELECT 
USING (auth.uid() = user_id);

-- Only service role can insert/update virtual accounts (via edge functions)
CREATE POLICY "Service role can manage virtual accounts" 
ON public.virtual_accounts 
FOR ALL 
USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE TRIGGER update_virtual_accounts_updated_at
BEFORE UPDATE ON public.virtual_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for virtual_accounts
ALTER PUBLICATION supabase_realtime ADD TABLE public.virtual_accounts;