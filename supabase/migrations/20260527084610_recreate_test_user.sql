/*
  # Recreate Test Users

  Delete existing test users and recreate them properly using
  the auth.users table with correct Supabase defaults.
*/

-- First delete the problematic users (cascade will remove identities, profiles, etc.)
DELETE FROM auth.users WHERE email = 'organizer@firma.pl';
DELETE FROM auth.users WHERE email = 'dostawca@agencja.pl';

-- Insert internal user with proper defaults
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  is_sso_user,
  is_anonymous
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'organizer@firma.pl',
  crypt('password123', gen_salt('bf', 10)),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Anna Kowalska","role":"internal"}'::jsonb,
  now(),
  now(),
  encode(gen_random_bytes(32), 'hex'),
  '',
  '',
  '',
  false,
  false;

-- Insert external user with proper defaults  
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change_token_current,
  is_sso_user,
  is_anonymous
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'dostawca@agencja.pl',
  crypt('password123', gen_salt('bf', 10)),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Tomasz Nowak","role":"external","company_name":"Agencja Pracy Tempus"}'::jsonb,
  now(),
  now(),
  encode(gen_random_bytes(32), 'hex'),
  '',
  '',
  '',
  false,
  false;
