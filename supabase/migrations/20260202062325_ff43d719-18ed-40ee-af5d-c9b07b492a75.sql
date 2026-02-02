-- Add service control settings to app_settings
INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('service_data_enabled', 'true', 'Enable/disable data service'),
  ('service_airtime_enabled', 'true', 'Enable/disable airtime service'),
  ('service_electricity_enabled', 'true', 'Enable/disable electricity service'),
  ('service_cable_enabled', 'true', 'Enable/disable cable TV service'),
  ('service_exam_pin_enabled', 'false', 'Enable/disable exam pin service (not supported by SUBPADI)')
ON CONFLICT (key) DO NOTHING;