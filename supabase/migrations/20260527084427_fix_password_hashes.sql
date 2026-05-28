/*
  # Update Password Hashes

  Supabase uses bcrypt with cost factor 10. The previous seed used cost 6.
  This updates the passwords with proper Supabase-compatible hashes.
*/

DO $$
DECLARE
  internal_user_id uuid;
  external_user_id uuid;
BEGIN
  SELECT id INTO internal_user_id FROM auth.users WHERE email = 'organizer@firma.pl';
  SELECT id INTO external_user_id FROM auth.users WHERE email = 'dostawca@agencja.pl';

  -- Update password hash for internal user (password123)
  IF internal_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt('password123', gen_salt('bf', 10))
    WHERE id = internal_user_id;
  END IF;

  -- Update password hash for external user (password123)
  IF external_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt('password123', gen_salt('bf', 10))
    WHERE id = external_user_id;
  END IF;
END $$;
