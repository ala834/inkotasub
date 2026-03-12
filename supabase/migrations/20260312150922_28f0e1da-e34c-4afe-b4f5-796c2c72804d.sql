
-- Add new columns to trusted_devices for device management
ALTER TABLE public.trusted_devices 
  ADD COLUMN IF NOT EXISTS device_model text,
  ADD COLUMN IF NOT EXISTS os_version text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS blocked_by uuid,
  ADD COLUMN IF NOT EXISTS block_reason text;

-- Allow admins to view all devices
CREATE POLICY "Admins can view all devices"
ON public.trusted_devices
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update any device (block/unblock)
CREATE POLICY "Admins can update all devices"
ON public.trusted_devices
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow service role full access for edge functions
CREATE POLICY "Service role can manage all devices"
ON public.trusted_devices
FOR ALL
USING (auth.role() = 'service_role');
