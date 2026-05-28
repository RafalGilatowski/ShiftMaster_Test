/*
  # Seed Test Users

  Creates two demo accounts for prototype testing:
  1. Internal user (organizer): organizer@firma.pl / password123
  2. External user (supplier): dostawca@agencja.pl / password123
*/

DO $$
DECLARE
  internal_id uuid;
  external_id uuid;
BEGIN
  -- Create internal user if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'organizer@firma.pl') THEN
    internal_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    ) VALUES (
      internal_id,
      '00000000-0000-0000-0000-000000000000',
      'organizer@firma.pl',
      crypt('password123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Anna Kowalska","role":"internal","company_name":""}',
      'authenticated',
      'authenticated',
      now(),
      now()
    );
  END IF;

  -- Create external user if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dostawca@agencja.pl') THEN
    external_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    ) VALUES (
      external_id,
      '00000000-0000-0000-0000-000000000000',
      'dostawca@agencja.pl',
      crypt('password123', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Tomasz Nowak","role":"external","company_name":"Agencja Pracy Tempus"}',
      'authenticated',
      'authenticated',
      now(),
      now()
    );
  END IF;
END $$;
