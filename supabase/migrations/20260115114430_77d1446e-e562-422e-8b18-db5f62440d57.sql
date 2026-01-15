-- Add whatsapp_number setting and update existing support settings with actual values
INSERT INTO public.app_settings (key, value, description) 
VALUES ('whatsapp_number', '+2349034226643', 'WhatsApp contact number')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Update support email with actual value
UPDATE public.app_settings SET value = 'inkotasub123@gmail.com' WHERE key = 'support_email';

-- Update support phone with actual value
UPDATE public.app_settings SET value = '+2349034226643' WHERE key = 'support_phone';