import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PHYSICAL_RECIPIENT = "rafal.gilatowski@profitia.pl";

function formatPLN(v: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(v);
}

function formatDeadlinePL(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── HTML layouts ─────────────────────────────────────────────────────────────

function baseHtml(headerColor: string, headerTitle: string, badge: string, body: string, orderId: string): string {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;margin:0;padding:0}
    .wrap{max-width:620px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .hdr{background:${headerColor};padding:36px 40px 28px}
    .hdr h1{color:#fff;margin:0 0 4px;font-size:21px;font-weight:700}
    .hdr p{color:rgba(255,255,255,.7);margin:0;font-size:14px}
    .badge{display:inline-block;background:rgba(255,255,255,.18);color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;margin-top:14px;letter-spacing:.03em}
    .body{padding:36px 40px}
    .intro{color:#475569;font-size:15px;line-height:1.65;margin:0 0 28px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:28px}
    .card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px}
    .lbl{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
    .val{font-size:15px;font-weight:700;color:#0f172a}
    .full{grid-column:1/-1}
    .deadline-card{background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;margin-bottom:28px}
    .deadline-lbl{font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    .deadline-val{font-size:17px;font-weight:800;color:#92400e}
    table.dept{width:100%;border-collapse:collapse;margin-bottom:28px;font-size:13px}
    table.dept thead tr{background:#f1f5f9}
    table.dept th{text-align:left;padding:9px 12px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e2e8f0}
    table.dept td{padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#334155}
    table.dept td.num{text-align:right;font-weight:700;color:#0f172a}
    .cta{text-align:center;margin:8px 0 0}
    .btn{display:inline-block;text-decoration:none;font-weight:600;font-size:14px;padding:13px 30px;border-radius:10px}
    .btn-blue{background:#1d4ed8;color:#fff}
    .ftr{background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center}
    .ftr p{color:#94a3b8;font-size:12px;margin:0}
    .note{background:#f1f5f9;border-radius:10px;padding:12px 16px;font-size:12px;color:#64748b;margin-top:4px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>${headerTitle}</h1>
      <p>VMS Portal &mdash; Vendor Management System</p>
      <span class="badge">${badge}</span>
    </div>
    <div class="body">${body}</div>
    <div class="ftr"><p>VMS Portal &copy; ${new Date().getFullYear()} &middot; Wiadomość automatyczna &middot; ID: ${orderId}</p></div>
  </div>
</body>
</html>`;
}

// ─── Email builders ───────────────────────────────────────────────────────────

interface DeptInfo {
  department: string;
  workersNeeded: number;
  daysCount: number;
  startDate: string;
  requiredShifts: string[];
}

function buildNewOrderEmail(opts: {
  plant: string; departments: DeptInfo[]; offerDeadline: string;
  createdByName: string; appUrl: string; orderId: string; recipientEmail: string;
}) {
  const { plant, departments, offerDeadline, createdByName, appUrl, orderId, recipientEmail } = opts;
  const totalWorkers = departments.reduce((s, d) => s + d.workersNeeded, 0);

  const deptsRows = departments.map(d => {
    const shifts = d.requiredShifts.map(s => s.startsWith("06") ? "Zmiana I" : "Zmiana II").join(", ");
    const dateStr = new Date(d.startDate).toLocaleDateString("pl-PL", { day: "2-digit", month: "short", year: "numeric" });
    return `<tr>
      <td>${d.department}</td>
      <td>${dateStr}</td>
      <td>${d.daysCount} dni</td>
      <td>${shifts}</td>
      <td class="num">${d.workersNeeded} os.</td>
    </tr>`;
  }).join("");

  const body = `
    <p class="note" style="margin-bottom:20px;color:#475569;font-size:13px">
      <strong>Uwaga (tryb testowy):</strong> Mail kierowany do: <strong>${recipientEmail}</strong>
    </p>
    <p class="intro">
      Otrzymujesz to powiadomienie, ponieważ <strong>${createdByName}</strong> opublikował nowe zapotrzebowanie na pracowników tymczasowych dla zakładu <strong>${plant}</strong>.<br>
      Prosimy o zapoznanie się ze szczegółami i złożenie oferty przez portal do wskazanego terminu.
    </p>

    <div class="deadline-card">
      <div class="deadline-lbl">Termin składania ofert (DEADLINE)</div>
      <div class="deadline-val">${formatDeadlinePL(offerDeadline)}</div>
    </div>

    <div class="grid">
      <div class="card"><div class="lbl">Zakład</div><div class="val">${plant}</div></div>
      <div class="card"><div class="lbl">Pracownicy łącznie</div><div class="val">${totalWorkers} os.</div></div>
      <div class="card"><div class="lbl">Liczba wydziałów</div><div class="val">${departments.length}</div></div>
    </div>

    <table class="dept">
      <thead>
        <tr>
          <th>Wydział</th><th>Data od</th><th>Czas</th><th>Zmiany</th><th style="text-align:right">Pracownicy</th>
        </tr>
      </thead>
      <tbody>${deptsRows}</tbody>
    </table>

    <div class="cta"><a class="btn btn-blue" href="${appUrl}">Przejdź do portalu i złóż ofertę &rarr;</a></div>`;

  return {
    subject: `Nowe zapytanie ofertowe - ${plant}`,
    html: baseHtml("linear-gradient(135deg,#1e3a5f 0%,#1d4ed8 100%)", `Nowe zapytanie ofertowe &mdash; ${plant}`, "Wymaga odpowiedzi", body, orderId),
  };
}

function buildCancelEmail(opts: {
  plant: string; orderId: string; recipientEmail: string;
}) {
  const { plant, orderId, recipientEmail } = opts;
  const body = `
    <p class="note" style="margin-bottom:20px;color:#475569;font-size:13px">
      <strong>Uwaga (tryb testowy):</strong> Mail kierowany do: <strong>${recipientEmail}</strong>
    </p>
    <p class="intro">
      Informujemy, że zapytanie ofertowe dla zakładu <strong>${plant}</strong> zostało <strong>anulowane</strong> i zamknięte bez wyboru dostawcy.<br><br>
      Dziękujemy za zainteresowanie i zapraszamy do udziału w przyszłych postępowaniach.
    </p>
    <div class="card" style="display:inline-block;margin-bottom:20px">
      <div class="lbl">Zakład</div>
      <div class="val">${plant}</div>
    </div>`;

  return {
    subject: `Postępowanie anulowane - ${plant}`,
    html: baseHtml("linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)", `Postępowanie anulowane &mdash; ${plant}`, "Zamknięte bez wyboru dostawcy", body, orderId),
  };
}

function buildCancelWithOffersEmail(opts: {
  plant: string; orderId: string; recipientEmail: string;
}) {
  const { plant, orderId, recipientEmail } = opts;
  const body = `
    <p class="note" style="margin-bottom:20px;color:#475569;font-size:13px">
      <strong>Uwaga (tryb testowy):</strong> Mail kierowany do: <strong>${recipientEmail}</strong>
    </p>
    <p class="intro">
      Szanowni Państwo,<br><br>
      informujemy, że postępowanie o numerze <strong>${orderId}</strong> dla <strong>${plant}</strong>,
      na które złożyli Państwo ofertę, zostało <strong>anulowane</strong> przez użytkownika wewnętrznego.<br><br>
      Dziękujemy za czas poświęcony na przygotowanie wyceny i zapraszamy do udziału w przyszłych postępowaniach.
    </p>
    <div class="card" style="display:inline-block;margin-bottom:20px">
      <div class="lbl">Zakład</div>
      <div class="val">${plant}</div>
    </div>`;

  return {
    subject: `Anulowanie postępowania zakupowego - ${plant}`,
    html: baseHtml("linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)", `Anulowanie postępowania zakupowego &mdash; ${plant}`, "Postępowanie anulowane", body, orderId),
  };
}

function buildAcceptWinnerEmail(opts: {
  plant: string; orderId: string; recipientEmail: string;
  departments: DeptInfo[]; totalValue: number;
}) {
  const { plant, orderId, recipientEmail, departments, totalValue } = opts;

  const deptsRows = departments.map(d => {
    const dateStr = new Date(d.startDate).toLocaleDateString("pl-PL", { day: "2-digit", month: "short", year: "numeric" });
    return `<tr>
      <td>${d.department}</td>
      <td>${dateStr}</td>
      <td>${d.daysCount} dni</td>
      <td class="num">${d.workersNeeded} os.</td>
    </tr>`;
  }).join("");

  const body = `
    <p class="note" style="margin-bottom:20px;color:#475569;font-size:13px">
      <strong>Uwaga (tryb testowy):</strong> Mail kierowany do: <strong>${recipientEmail}</strong>
    </p>
    <p class="intro">
      Gratulacje! Twoja oferta dla zakładu <strong>${plant}</strong> została <strong>zaakceptowana</strong>. Jesteś wybranym dostawcą w tym postępowaniu.<br><br>
      Poniżej znajdziesz podsumowanie zaakceptowanych wydziałów i łączną wartość kontraktu.
    </p>
    <table class="dept">
      <thead>
        <tr><th>Wydział</th><th>Data od</th><th>Czas</th><th style="text-align:right">Pracownicy</th></tr>
      </thead>
      <tbody>${deptsRows}</tbody>
    </table>
    <div class="card full" style="background:#f0fdf4;border-color:#bbf7d0">
      <div class="lbl" style="color:#166534">Łączna wartość kontraktu</div>
      <div class="val" style="color:#166534;font-size:20px">${formatPLN(totalValue)}</div>
    </div>`;

  return {
    subject: `Twoja oferta została ZAAKCEPTOWANA - ${plant}`,
    html: baseHtml("linear-gradient(135deg,#064e3b 0%,#059669 100%)", `Oferta zaakceptowana &mdash; ${plant}`, "Wybrany dostawca", body, orderId),
  };
}

function buildAcceptLoserEmail(opts: {
  plant: string; orderId: string; recipientEmail: string;
}) {
  const { plant, orderId, recipientEmail } = opts;
  const body = `
    <p class="note" style="margin-bottom:20px;color:#475569;font-size:13px">
      <strong>Uwaga (tryb testowy):</strong> Mail kierowany do: <strong>${recipientEmail}</strong>
    </p>
    <p class="intro">
      Dziękujemy za udział w postępowaniu ofertowym dla zakładu <strong>${plant}</strong>.<br><br>
      Informujemy, że postępowanie zostało rozstrzygnięte i tym razem zdecydowaliśmy się na wybór innej oferty.<br><br>
      Doceniamy Twój udział i zapraszamy do udziału w przyszłych zapytaniach ofertowych.
    </p>
    <div class="card" style="display:inline-block;margin-bottom:20px">
      <div class="lbl">Zakład</div>
      <div class="val">${plant}</div>
    </div>`;

  return {
    subject: `Rozstrzygnięcie postępowania - ${plant}`,
    html: baseHtml("linear-gradient(135deg,#1e293b 0%,#475569 100%)", `Rozstrzygnięcie postępowania &mdash; ${plant}`, "Informacja o wyniku", body, orderId),
  };
}

// ─── Send helper ──────────────────────────────────────────────────────────────

async function sendEmail(apiKey: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VMS Portal <onboarding@resend.dev>",
      to: [PHYSICAL_RECIPIENT],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

// ─── Request types ────────────────────────────────────────────────────────────

interface NewOrderPayload {
  type: "new_order";
  orderId: string;
  plant: string;
  departments: DeptInfo[];
  offerDeadline: string;
  createdByName: string;
  appUrl: string;
  supplierEmails: string[];
}

interface CancelPayload {
  type: "cancel";
  orderId: string;
  plant: string;
  recipientEmails: string[];
}

interface CancelWithOffersPayload {
  type: "cancel_with_offers";
  orderId: string;
  plant: string;
  recipientEmails: string[];
}

interface AcceptPayload {
  type: "accept";
  orderId: string;
  plant: string;
  winnerEmail: string;
  winnerName: string;
  loserEmails: string[];
  departments: DeptInfo[];
  totalValue: number;
}

type Payload = NewOrderPayload | CancelPayload | CancelWithOffersPayload | AcceptPayload;

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "re_AHNjPX4u_GMvK54dCYjgh2d1pXpAezLRs";

    const payload: Payload = await req.json();
    const sent: string[] = [];

    if (payload.type === "new_order") {
      for (const email of payload.supplierEmails) {
        const { subject, html } = buildNewOrderEmail({
          plant: payload.plant,
          departments: payload.departments,
          offerDeadline: payload.offerDeadline,
          createdByName: payload.createdByName,
          appUrl: payload.appUrl,
          orderId: payload.orderId,
          recipientEmail: email,
        });
        await sendEmail(RESEND_API_KEY, subject, html);
        sent.push(email);
      }

    } else if (payload.type === "cancel") {
      for (const email of payload.recipientEmails) {
        const { subject, html } = buildCancelEmail({ plant: payload.plant, orderId: payload.orderId, recipientEmail: email });
        await sendEmail(RESEND_API_KEY, subject, html);
        sent.push(email);
      }

    } else if (payload.type === "cancel_with_offers") {
      for (const email of payload.recipientEmails) {
        const { subject, html } = buildCancelWithOffersEmail({ plant: payload.plant, orderId: payload.orderId, recipientEmail: email });
        await sendEmail(RESEND_API_KEY, subject, html);
        sent.push(email);
      }

    } else if (payload.type === "accept") {
      const { subject: ws, html: wh } = buildAcceptWinnerEmail({
        plant: payload.plant,
        orderId: payload.orderId,
        recipientEmail: payload.winnerEmail,
        departments: payload.departments,
        totalValue: payload.totalValue,
      });
      await sendEmail(RESEND_API_KEY, ws, wh);
      sent.push(payload.winnerEmail);

      for (const email of payload.loserEmails) {
        const { subject, html } = buildAcceptLoserEmail({ plant: payload.plant, orderId: payload.orderId, recipientEmail: email });
        await sendEmail(RESEND_API_KEY, subject, html);
        sent.push(email);
      }
    }

    return new Response(JSON.stringify({ success: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
