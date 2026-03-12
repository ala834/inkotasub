CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_number_unique 
ON public.profiles (phone_number) 
WHERE phone_number IS NOT NULL;