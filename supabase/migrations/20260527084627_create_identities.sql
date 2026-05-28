/*
  # Create Identities for Test Users

  Add the required identity records for authentication.
*/

DO $$
DECLARE
  internal_user record;
  external_user record;
BEGIN
  -- Get user data
  SELECT id, email INTO internal_user FROM auth.users WHERE email = 'organizer@firma.pl';
  SELECT id, email INTO external_user FROM auth.users WHERE email = 'dostawca@agencja.pl';

  -- Create identity for internal user
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
    internal_user.id,
    internal_user.id,
    internal_user.email,
    jsonb_build_object('sub', internal_user.id::text, 'email', internal_user.email),
    'email',
    now(),
    now(),
    now()
  );

  -- Create identity for external user
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
    external_user.id,
    external_user.id,
    external_user.email,
    jsonb_build_object('sub', external_user.id::text, 'email', external_user.email),
    'email',
    now(),
    now(),
    now()
  );
END $$;
