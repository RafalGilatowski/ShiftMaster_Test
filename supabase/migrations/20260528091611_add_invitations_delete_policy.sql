/*
  # Add DELETE policy for invitations table

  ## Problem
  The invitations table had RLS enabled but no DELETE policy.
  Without a DELETE policy, Supabase silently rejects deletions (returns success
  but removes 0 rows), causing the UI to appear to delete a supplier while the
  row persists in the database and reappears after page refresh.

  ## Fix
  Add a DELETE policy restricted to internal users only.
*/

CREATE POLICY "Internal users can delete invitations"
  ON invitations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'internal'
    )
  );
