-- Create referrals table
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL,
  referred_id UUID NOT NULL,
  referral_code TEXT NOT NULL,
  reward_percentage NUMERIC NOT NULL DEFAULT 5.00,
  reward_amount NUMERIC DEFAULT NULL,
  rewarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add referral_code to profiles
ALTER TABLE public.profiles ADD COLUMN referral_code TEXT UNIQUE;

-- Generate unique referral codes for existing users
UPDATE public.profiles 
SET referral_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8))
WHERE referral_code IS NULL;

-- Make referral_code NOT NULL after populating
ALTER TABLE public.profiles ALTER COLUMN referral_code SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN referral_code SET DEFAULT UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));

-- Create push_subscriptions table for browser notifications
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for referrals
CREATE POLICY "Users can view their own referrals as referrer"
ON public.referrals FOR SELECT
USING (auth.uid() = referrer_id);

CREATE POLICY "Users can view their own referrals as referred"
ON public.referrals FOR SELECT
USING (auth.uid() = referred_id);

CREATE POLICY "Admins can view all referrals"
ON public.referrals FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for push_subscriptions
CREATE POLICY "Users can manage their own push subscriptions"
ON public.push_subscriptions FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RLS policies for notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Update handle_new_user to generate referral code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, referral_code)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', UPPER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT) FROM 1 FOR 8)));
    
    INSERT INTO public.wallets (user_id)
    VALUES (NEW.id);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$$;