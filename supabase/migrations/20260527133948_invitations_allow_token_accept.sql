/*
  # Allow token-based invitation acceptance

  Adds a policy that lets anyone (anon/authenticated) update an invitation's
  status to 'accepted' when they know the exact token. This is needed for
  the registration flow where the user arrives via an invite link.
*/

CREATE POLICY "Token holder can accept invitation"
  ON invitations FOR UPDATE
  TO anon
  USING (status = 'pending' AND expires_at > now())
  WITH CHECK (status = 'accepted');

-- Also allow authenticated users to accept (in case they are already logged in)
CREATE POLICY "Authenticated token holder can accept invitation"
  ON invitations FOR UPDATE
  TO authenticated
  USING (status = 'pending' AND expires_at > now())
  WITH CHECK (status = 'accepted');
