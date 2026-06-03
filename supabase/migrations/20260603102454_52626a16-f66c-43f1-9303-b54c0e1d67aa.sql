-- 1. Realtime: deny all broadcast/presence access by default (postgres_changes still works via RLS on source tables)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny realtime broadcast and presence by default" ON realtime.messages;
CREATE POLICY "Deny realtime broadcast and presence by default"
  ON realtime.messages
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 2. Prevent users from inserting a role for themselves (defence-in-depth alongside admin check)
DROP POLICY IF EXISTS "Prevent self role assignment" ON public.user_roles;
CREATE POLICY "Prevent self role assignment"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() <> user_id);

-- 3. Revoke EXECUTE on internal SECURITY DEFINER helpers from client roles.
--    These are only invoked by service_role from edge functions.
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.atomic_wallet_debit(uuid, numeric)',
    'public.atomic_wallet_credit(uuid, numeric)',
    'public.atomic_api_wallet_debit(uuid, numeric)',
    'public.atomic_api_wallet_credit(uuid, numeric)',
    'public.get_wallet_balance(uuid)',
    'public.get_api_wallet_balance(uuid)',
    'public.try_advisory_lock(bigint)',
    'public.release_advisory_lock(bigint)',
    'public.enqueue_email(text, jsonb)',
    'public.read_email_batch(text, integer, integer)',
    'public.delete_email(text, bigint)',
    'public.move_to_dlq(text, text, bigint, jsonb)',
    'public.admin_reset_pin_lock(uuid)',
    'public.handle_new_user()',
    'public.update_updated_at_column()',
    'public.sync_has_transaction_pin()',
    'public.update_provider_config_updated_at()',
    'public.update_app_settings_updated_at()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- 4. Restrict avatar listing to the owning user's folder; public direct URLs still work.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Users can list their own avatar folder"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );