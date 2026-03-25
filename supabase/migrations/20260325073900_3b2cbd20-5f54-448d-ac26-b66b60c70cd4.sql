
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
