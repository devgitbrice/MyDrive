import { NextRequest } from "next/server";
import { fetchQontoRows, type QontoRow as Tx } from "@/lib/qonto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Synchronisation Qonto : lit l'export Google Sheets (CSV) et régénère les
// documents « Qonto <année> » du dossier Finances/Qonto. Déclenchée par le
// cron Vercel, ou manuellement via GET /api/qonto-sync.

const MOIS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function eur(x: number): string {
  return x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ") + " €";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TABLE = 'style="width:100%;border-collapse:collapse;margin:12px 0 24px 0;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);font-size:14px"';
const th = (a: string) => `style="text-align:${a};padding:10px 14px;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;opacity:0.6;border-bottom:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04)"`;
const td = (a: string) => `style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:${a};font-variant-numeric:tabular-nums"`;

function buildYearDoc(year: string, txs: Tx[]): string {
  const ok = txs.filter((r) => r.status !== "declined");
  const declined = txs.length - ok.length;
  let credit = 0;
  let debit = 0;
  const months = new Map<number, [number, number, number]>();
  const partiesD = new Map<string, number>();
  const partiesC = new Map<string, number>();
  for (const r of ok) {
    const a = parseFloat(r.amount || "0") || 0;
    const m = parseInt(r["emitted at"].slice(5, 7), 10);
    const mv = months.get(m) || [0, 0, 0];
    const name = (r["counterparty name"] || "(sans nom)").trim();
    if (r.side === "credit") {
      credit += a; mv[0] += a;
      partiesC.set(name, (partiesC.get(name) || 0) + a);
    } else {
      debit += a; mv[1] += a;
      partiesD.set(name, (partiesD.get(name) || 0) + a);
    }
    mv[2]++;
    months.set(m, mv);
  }
  const net = credit - debit;
  const color = net >= 0 ? "#4ade80" : "#f87171";
  const h: string[] = [];
  h.push(`<h1 style="font-size:32px;font-weight:700;margin:0 0 8px 0;letter-spacing:-0.01em">Qonto ${year}</h1>`);
  h.push(`<p style="font-size:13px;opacity:0.7;line-height:1.6;margin:8px 0 20px 0">Compte Nouvo Media — ${ok.length} transactions (${declined} refusées exclues des totaux). Synchronisé depuis Google Sheets le ${new Date().toLocaleDateString("fr-FR")}.</p>`);
  h.push(`<h2>Synthèse</h2><ul><li>Encaissements — <strong>${eur(credit)}</strong></li><li>Dépenses — <strong>${eur(debit)}</strong></li><li>Net — <strong style="color:${color}">${eur(net)}</strong></li></ul>`);
  h.push(`<h2>Détail mensuel</h2><table ${TABLE}><thead><tr><th ${th("left")}>Mois</th><th ${th("right")}>Encaissements</th><th ${th("right")}>Dépenses</th><th ${th("right")}>Net</th><th ${th("right")}>Tx</th></tr></thead><tbody>`);
  for (const m of [...months.keys()].sort((a, b) => a - b)) {
    const [c, d, n] = months.get(m)!;
    const nc = c - d >= 0 ? "#4ade80" : "#f87171";
    h.push(`<tr><td ${td("left")}>${MOIS[m]}</td><td ${td("right")}>${eur(c)}</td><td ${td("right")}>${eur(d)}</td><td ${td("right")}><strong style="color:${nc}">${eur(c - d)}</strong></td><td ${td("right")}>${n}</td></tr>`);
  }
  h.push("</tbody></table>");
  const tops: Array<[string, Map<string, number>]> = [
    ["Top 15 dépenses par contrepartie", partiesD],
    ["Top 15 encaissements par contrepartie", partiesC],
  ];
  for (const [label, parties] of tops) {
    const top = [...parties.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    h.push(`<h2>${label}</h2><table ${TABLE}><thead><tr><th ${th("left")}>Contrepartie</th><th ${th("right")}>Total</th></tr></thead><tbody>`);
    for (const [name, amt] of top) {
      h.push(`<tr><td ${td("left")}>${esc(name)}</td><td ${td("right")}>${eur(amt)}</td></tr>`);
    }
    h.push("</tbody></table>");
  }
  return h.join("");
}

export async function GET(req: NextRequest) {
  // Vercel cron envoie l'en-tête Authorization: Bearer $CRON_SECRET si défini.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const got = req.headers.get("authorization") || "";
    if (got !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  let txs: Tx[];
  try {
    txs = await fetchQontoRows();
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }

  // Dossier Finances puis dossier Qonto (créé au besoin).
  const finRes = await fetch(
    `${url}/rest/v1/MyDrive?select=id&title=eq.Finances&parent_id=is.null&deleted_at=is.null&limit=1`,
    { headers: H }
  );
  const fin = await finRes.json();
  if (!fin.length) return new Response("Dossier Finances introuvable", { status: 500 });
  const finId = fin[0].id;

  const qontoRes = await fetch(
    `${url}/rest/v1/MyDrive?select=id&title=eq.Qonto&parent_id=eq.${finId}&deleted_at=is.null&limit=1`,
    { headers: H }
  );
  let qonto = await qontoRes.json();
  if (!qonto.length) {
    const created = await fetch(`${url}/rest/v1/MyDrive`, {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ title: "Qonto", parent_id: finId, doc_type: null, content: "", observation: "", image_path: "", image_url: "" }),
    });
    qonto = await created.json();
  }
  const qontoId = qonto[0].id;

  // Regroupe par année d'émission puis crée/actualise chaque doc annuel.
  const byYear = new Map<string, Tx[]>();
  for (const r of txs) {
    const y = (r["emitted at"] || "").slice(0, 4);
    if (!/^\d{4}$/.test(y)) continue;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }

  const updated: string[] = [];
  for (const [year, list] of [...byYear.entries()].sort()) {
    const title = `Qonto ${year}`;
    const content = buildYearDoc(year, list);
    const exRes = await fetch(
      `${url}/rest/v1/MyDrive?select=id&title=eq.${encodeURIComponent(title)}&parent_id=eq.${qontoId}&deleted_at=is.null&limit=1`,
      { headers: H }
    );
    const ex = await exRes.json();
    if (ex.length) {
      await fetch(`${url}/rest/v1/MyDrive?id=eq.${ex[0].id}`, {
        method: "PATCH",
        headers: H,
        body: JSON.stringify({ content }),
      });
    } else {
      await fetch(`${url}/rest/v1/MyDrive`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ title, parent_id: qontoId, doc_type: "doc", content, observation: "", image_path: "", image_url: "" }),
      });
    }
    updated.push(title);
  }

  return Response.json({ ok: true, transactions: txs.length, updated });
}
