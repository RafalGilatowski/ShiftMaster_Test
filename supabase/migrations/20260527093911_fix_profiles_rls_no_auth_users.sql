/*
  # Fix profiles RLS - remove auth.users query

  The policy was querying auth.users which is not accessible to the
  authenticated role. Replace with a check on raw_user_meta_data via
  auth.jwt() to avoid the permission denied error.
*/

DROP POLICY IF EXISTS "Internal users can view all profiles" ON profiles;

-- Internal users can view all profiles using JWT claims (no auth.users query needed)
CREATE POLICY "Internal users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'internal'
  );
