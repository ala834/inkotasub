
-- Create trusted_devices table for device binding
CREATE TABLE public.trusted_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT,
  platform TEXT,
  biometric_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);

-- Enable RLS
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own devices
CREATE POLICY "Users can view their own trusted devices"
ON public.trusted_devices FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can add their own trusted devices"
ON public.trusted_devices FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trusted devices"
ON public.trusted_devices FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trusted devices"
ON public.trusted_devices FOR DELETE
USING (auth.uid() = user_id);
