CREATE TABLE public.beneficiaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  service_type TEXT NOT NULL,
  identifier TEXT NOT NULL,
  label TEXT,
  network TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_type, identifier)
);

CREATE INDEX idx_beneficiaries_user_service ON public.beneficiaries (user_id, service_type);

ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own beneficiaries"
ON public.beneficiaries FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own beneficiaries"
ON public.beneficiaries FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own beneficiaries"
ON public.beneficiaries FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own beneficiaries"
ON public.beneficiaries FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_beneficiaries_updated_at
BEFORE UPDATE ON public.beneficiaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();