CREATE POLICY "Admins can update virtual accounts"
ON public.virtual_accounts
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));