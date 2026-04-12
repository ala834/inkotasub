INSERT INTO public.app_settings (key, value, description)
VALUES ('EMAIL_TEST_MODE', 'false', 'When enabled, emails are logged to console and email_send_log instead of being sent via Resend. Useful for development testing.')
ON CONFLICT (key) DO NOTHING;