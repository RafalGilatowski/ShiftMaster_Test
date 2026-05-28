import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Try env first (set via Supabase secrets), fallback to vault
    let resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    if (!resendApiKey) {
      const adminForVault = createClient(supabaseUrl, serviceRoleKey);
      const { data: vaultData } = await adminForVault.rpc("vault_get_secret_by_name", { secret_name: "RESEND_API_KEY" }).maybeSingle();
      resendApiKey = vaultData?.decrypted_secret ?? "";
    };

    // Verify caller is an authenticated internal user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "internal") {
      return new Response(JSON.stringify({ error: "Only internal users can send invitations" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, appUrl } = await req.json();
    if (!email || !appUrl) {
      return new Response(JSON.stringify({ error: "Missing email or appUrl" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing pending invitation for this email
    const { data: existing } = await supabaseAdmin
      .from("invitations")
      .select("id, status")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "Istnieje już aktywne zaproszenie dla tego adresu e-mail." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = generateToken();
    const inviteLink = `${appUrl}?token=${token}`;

    // Save invitation to DB
    const { error: insertError } = await supabaseAdmin.from("invitations").insert({
      email,
      token,
      status: "pending",
      invited_by: user.id,
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email via Resend — recipient fixed to owner address (Resend free tier restriction)
    const emailPayload = {
      from: "VMS Portal <onboarding@resend.dev>",
      to: ["rafal.gilatowski@profitia.pl"],
      subject: "Zaproszenie do systemu VMS Portal",
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #f8fafc; border-radius: 12px;">
          <div style="background: #1e40af; border-radius: 10px; padding: 20px 24px; margin-bottom: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">VMS Portal</h1>
            <p style="color: #93c5fd; margin: 4px 0 0; font-size: 13px;">Vendor Management System</p>
          </div>
          <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 12px;">Nowe zaproszenie</h2>
          <p style="color: #475569; font-size: 15px; margin: 0 0 16px;">Cześć! To jest zaproszenie dla systemu VMS przeznaczone dla adresu: <strong>${email}</strong>.</p>
          <p style="color: #475569; font-size: 15px; margin: 0 0 24px;">Oto Twój link:</p>
          <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">Dołącz do systemu</a>
          <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0;">Link wygasa po 7 dniach.</p>
          <p style="color: #cbd5e1; font-size: 11px; margin: 8px 0 0; word-break: break-all;">${inviteLink}</p>
        </div>
      `,
    };

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      // Invitation was saved but email failed — still return success with warning
      return new Response(JSON.stringify({
        success: true,
        emailWarning: resendData?.message ?? "Email sending failed",
        token,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
