/*
  # Fix profiles table

  1. Add missing `email` column to profiles
  2. Fix default value for `role` column (should be 'external', not 'internal')
  3. Update handle_new_user trigger function to be safe against missing columns
*/

-- Add missing email column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email text NOT NULL DEFAULT '';
  END IF;
END $$;

-- Fix default role value
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'external';

-- Recreate handle_new_user to be robust
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, company_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'external'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company_name', ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
