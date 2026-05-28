/*
  # Fix Test Users Authentication

  The seed migration created users directly in auth.users table,
  but they're missing entries in auth.identities which Supabase
  uses for authentication.
*/

DO $$
DECLARE
  internal_user_id uuid;
  external_user_id uuid;
BEGIN
  -- Get user IDs
  SELECT id INTO internal_user_id FROM auth.users WHERE email = 'organizer@firma.pl';
  SELECT id INTO external_user_id FROM auth.users WHERE email = 'dostawca@agencja.pl';

  -- Create identity for internal user if not exists
  IF internal_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = internal_user_id
  ) THEN
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      internal_user_id,
      internal_user_id,
      'organizer@firma.pl',
      jsonb_build_object('sub', internal_user_id::text, 'email', 'organizer@firma.pl'),
      'email',
      now(),
      now(),
      now()
    );
  END IF;

  -- Create identity for external user if not exists
  IF external_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = external_user_id
  ) THEN
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      external_user_id,
      external_user_id,
      'dostawca@agencja.pl',
      jsonb_build_object('sub', external_user_id::text, 'email', 'dostawca@agencja.pl'),
      'email',
      now(),
      now(),
      now()
    );
  END IF;
END $$;
