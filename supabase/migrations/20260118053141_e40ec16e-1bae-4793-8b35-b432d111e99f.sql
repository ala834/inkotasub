-- Assign admin role to inkotasub123@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('a1d0bb96-2ae2-4f42-addb-25b1b1c1fa58', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Create admin activity log table for audit purposes
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID NOT NULL,
    action TEXT NOT NULL,
    target_user_id UUID,
    target_type TEXT,
    target_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on admin_activity_log
ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view activity logs
CREATE POLICY "Admins can view activity logs"
ON public.admin_activity_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert activity logs
CREATE POLICY "Admins can insert activity logs"
ON public.admin_activity_log
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_admin_id ON public.admin_activity_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created_at ON public.admin_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_target_user ON public.admin_activity_log(target_user_id);

-- Add maintenance mode and other settings if they don't exist
INSERT INTO public.app_settings (key, value, description)
VALUES 
    ('maintenance_mode', 'false', 'Enable or disable maintenance mode'),
    ('disable_registration', 'false', 'Disable new user registration'),
    ('min_wallet_funding', '100', 'Minimum wallet funding amount'),
    ('max_wallet_funding', '1000000', 'Maximum wallet funding amount'),
    ('min_transfer_amount', '100', 'Minimum transfer amount'),
    ('max_transfer_amount', '500000', 'Maximum transfer amount')
ON CONFLICT (key) DO NOTHING;