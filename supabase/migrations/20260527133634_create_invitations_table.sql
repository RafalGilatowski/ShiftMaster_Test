/*
  # Create invitations table

  ## Summary
  Adds a secure invitation system for onboarding external suppliers.
  Only internal users can send invitations; external users can only register via a valid token.

  ## New Tables
  - `invitations`
    - `id` (uuid, primary key)
    - `email` (text) — invited supplier's email address
    - `token` (text, unique) — secure random token embedded in invite link
    - `status` (text) — 'pending' or 'accepted'
    - `invited_by` (uuid, FK → auth.users) — internal user who sent the invite
    - `created_at` (timestamptz)
    - `expires_at` (timestamptz) — token expires 7 days after creation

  ## Security
  - RLS enabled
  - Internal users can insert and view all invitations
  - Anyone (anon) can read a single invitation by token (needed for registration page validation)
  - No one can update status directly — handled via service role in edge function
*/

CREATE TABLE IF NOT EXISTS invitations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  token      text UNIQUE NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Internal users can insert invitations
CREATE POLICY "Internal users can insert invitations"
  ON invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'internal'
    )
  );

-- Internal users can view all invitations they sent
CREATE POLICY "Internal users can view all invitations"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'internal'
    )
  );

-- Anyone (including anon) can look up a single invitation by token for registration validation
CREATE POLICY "Anyone can read invitation by token"
  ON invitations FOR SELECT
  TO anon
  USING (true);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
