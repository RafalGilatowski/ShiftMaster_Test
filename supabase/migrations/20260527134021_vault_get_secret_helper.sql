/*
  # Vault secret helper function

  Creates a helper RPC function that allows the service role to retrieve
  a decrypted secret from vault by name. Used by edge functions that
  cannot access Deno.env secrets set outside the dashboard.
*/

CREATE OR REPLACE FUNCTION vault_get_secret_by_name(secret_name text)
RETURNS TABLE(decrypted_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT ds.decrypted_secret
    FROM vault.decrypted_secrets ds
    WHERE ds.name = secret_name
    LIMIT 1;
END;
$$;
