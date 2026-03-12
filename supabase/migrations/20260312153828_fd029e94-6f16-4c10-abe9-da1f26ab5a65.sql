
-- Create KYC level enum
CREATE TYPE public.kyc_level AS ENUM ('level_1', 'level_2', 'level_3');

-- Create KYC status enum
CREATE TYPE public.kyc_status AS ENUM ('pending', 'approved', 'rejected');

-- Create KYC verifications table
CREATE TABLE public.kyc_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  level kyc_level NOT NULL,
  status kyc_status NOT NULL DEFAULT 'pending',
  
  -- Level 1 fields (auto-filled from registration)
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  
  -- Level 2 fields
  full_name TEXT,
  date_of_birth DATE,
  nin_number TEXT,
  nin_verified BOOLEAN DEFAULT false,
  
  -- Level 3 fields
  bvn_number TEXT,
  bvn_verified BOOLEAN DEFAULT false,
  selfie_url TEXT,
  selfie_verified BOOLEAN DEFAULT false,
  address TEXT,
  city TEXT,
  state TEXT,
  
  -- Admin review
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add kyc_level column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_level kyc_level DEFAULT 'level_1';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_transaction_limit NUMERIC DEFAULT 50000;

-- Create unique index so each user can only have one submission per level
CREATE UNIQUE INDEX idx_kyc_user_level ON public.kyc_verifications (user_id, level);

-- Enable RLS
ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own KYC" ON public.kyc_verifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own KYC" ON public.kyc_verifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending KYC" ON public.kyc_verifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can view all KYC" ON public.kyc_verifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all KYC" ON public.kyc_verifications
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE TRIGGER update_kyc_updated_at
  BEFORE UPDATE ON public.kyc_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
