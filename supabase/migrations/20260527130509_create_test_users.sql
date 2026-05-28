/*
  # Create test users

  Creates two test accounts directly in auth.users:
  - test.internal@vms.pl — role: internal (Pracownik Wewnętrzny)
  - test.external@vms.pl — role: external (Dostawca Zewnętrzny)

  Both accounts use bcrypt-hashed password: Test1234!
  Identities are created so email/password login works.
  Profiles are inserted matching the user IDs.
*/

DO $$
DECLARE
  internal_id uuid := gen_random_uuid();
  external_id uuid := gen_random_uuid();
BEGIN

  -- Internal user
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_sent_at, recovery_sent_at,
    last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_super_admin, confirmation_token,
    email_change, email_change_token_new, recovery_token
  ) VALUES (
    internal_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'test.internal@vms.pl',
    crypt('Test1234!', gen_salt('bf')),
    now(), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"internal","full_name":"Jan Testowy"}',
    now(), now(), false, '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    internal_id,
    'test.internal@vms.pl',
    jsonb_build_object('sub', internal_id::text, 'email', 'test.internal@vms.pl'),
    'email',
    now(), now(), now()
  );

  INSERT INTO public.profiles (id, role, full_name, company_name)
  VALUES (internal_id, 'internal', 'Jan Testowy', '')
  ON CONFLICT (id) DO NOTHING;


  -- External user
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_sent_at, recovery_sent_at,
    last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_super_admin, confirmation_token,
    email_change, email_change_token_new, recovery_token
  ) VALUES (
    external_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'test.external@vms.pl',
    crypt('Test1234!', gen_salt('bf')),
    now(), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"external","full_name":"Anna Dostawca"}',
    now(), now(), false, '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    external_id,
    'test.external@vms.pl',
    jsonb_build_object('sub', external_id::text, 'email', 'test.external@vms.pl'),
    'email',
    now(), now(), now()
  );

  INSERT INTO public.profiles (id, role, full_name, company_name)
  VALUES (external_id, 'external', 'Anna Dostawca', 'Agencja Testowa Sp. z o.o.')
  ON CONFLICT (id) DO NOTHING;

END $$;
