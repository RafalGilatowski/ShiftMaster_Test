/*
  # Fix RLS Infinite Recursion on profiles table

  The policy "Internal users can view all profiles" was causing infinite recursion
  by querying profiles within a policy on profiles.

  Fixed approach: Use auth.jwt() to check the role stored in app_metadata instead.
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Internal users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Recreate policies without recursion

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Internal users can view all profiles using auth.jwt()
-- Check the raw_user_meta_data role directly
CREATE POLICY "Internal users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users 
      WHERE raw_user_meta_data->>'role' = 'internal'
    )
  );
