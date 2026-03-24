DROP POLICY "Service role can manage OTP codes" ON public.otp_codes;
CREATE POLICY "Service role can manage OTP codes"
  ON public.otp_codes FOR ALL TO service_role
  USING (true) WITH CHECK (true);