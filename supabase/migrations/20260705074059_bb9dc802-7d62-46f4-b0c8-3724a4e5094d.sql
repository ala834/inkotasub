-- Grant Data API access to user_push_tokens (was missing, blocking PostgREST)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO authenticated;
GRANT ALL ON public.user_push_tokens TO service_role;

-- Allow admins to view all push tokens (for admin push diagnostics/targeting)
DROP POLICY IF EXISTS "Admins can view all push tokens" ON public.user_push_tokens;
CREATE POLICY "Admins can view all push tokens"
  ON public.user_push_tokens
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_user_push_tokens_updated_at ON public.user_push_tokens;
CREATE TRIGGER trg_user_push_tokens_updated_at
  BEFORE UPDATE ON public.user_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();