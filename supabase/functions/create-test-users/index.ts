import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function createOrUpdateUser(supabaseUrl: string, serviceRoleKey: string, payload: object) {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const internalResult = await createOrUpdateUser(supabaseUrl, serviceRoleKey, {
      email: "test.internal@vms.pl",
      password: "Test1234!",
      email_confirm: true,
      user_metadata: {
        full_name: "Jan Testowy",
        role: "internal",
      },
    });

    const externalResult = await createOrUpdateUser(supabaseUrl, serviceRoleKey, {
      email: "test.external@vms.pl",
      password: "Test1234!",
      email_confirm: true,
      user_metadata: {
        full_name: "Anna Dostawca",
        role: "external",
        company_name: "Agencja Testowa Sp. z o.o.",
      },
    });

    // Insert profiles if users were created
    if (internalResult.id) {
      await fetch(`${supabaseUrl}/rest/v1/profiles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          id: internalResult.id,
          role: "internal",
          full_name: "Jan Testowy",
          company_name: "",
        }),
      });
    }

    if (externalResult.id) {
      await fetch(`${supabaseUrl}/rest/v1/profiles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceRoleKey,
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          id: externalResult.id,
          role: "external",
          full_name: "Anna Dostawca",
          company_name: "Agencja Testowa Sp. z o.o.",
        }),
      });
    }

    return new Response(
      JSON.stringify({
        internal: { email: "test.internal@vms.pl", password: "Test1234!", result: internalResult },
        external: { email: "test.external@vms.pl", password: "Test1234!", result: externalResult },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
