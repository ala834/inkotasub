DROP POLICY IF EXISTS "Users can view public app settings" ON public.app_settings;

CREATE POLICY "Users can view public app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR key = ANY (ARRAY[
    'support_email', 'whatsapp_number', 'support_phone',
    'service_data_enabled', 'service_airtime_enabled',
    'service_electricity_enabled', 'service_cable_enabled',
    'service_exam_pin_enabled', 'maintenance_mode',
    'registration_enabled', 'app_name', 'app_version',
    'recharge_card_enabled',
    'deposit_charge_amount', 'referral_bonus_amount'
  ])
);