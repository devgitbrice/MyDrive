import { NextRequest } from "next/server";
import { fetchQontoApiTxs, fetchQontoRows, isInternalTransfer, QONTO_SOURCES } from "@/lib/qonto";

// Comptes branchés en direct sur l'API Qonto (clé login:secret dans les
// variables d'environnement), avec repli sur une copie synchronisée via
// le MCP Qonto et stockée dans le drive.
const LIVE_SOURCES: Record<string, { loginEnv: string; secretEnv: string; docTitle: string }> = {
  gennn: {
    loginEnv: "QONTO_GENNN_LOGIN",
    secretEnv: "QONTO_GENNN_SECRET",
    docTitle: "Qonto Gennn — Transactions (sync MCP)",
  },
  nm: {
    loginEnv: "QONTO_NM_LOGIN",
    secretEnv: "QONTO_NM_SECRET",
    docTitle: "Qonto Nouvo Media — Transactions (sync MCP)",
  },
};

async function txsFromDrive(docTitle: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(
    `${url}/rest/v1/MyDrive?select=content&title=eq.${encodeURIComponent(docTitle)}&deleted_at=is.null&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  const rows = await res.json();
  if (!rows.length) throw new Error(`Ni clé API configurée, ni copie MCP « ${docTitle} » dans le drive`);
  const data = JSON.parse(rows[0].content || "{}");
  return { txs: data.transactions || [], fetchedAt: data.updatedAt || null };
}

export const runtime = "nodejs";
// Le Sheet change peu : on sert une version en cache 5 minutes.
export const revalidate = 300;

// Transactions Qonto au format compact pour les onglets Qonto de /finances.
// ?src=nouvo (défaut) ou ?src=gennn.
export async function GET(req: NextRequest) {
  try {
    const srcKey = req.nextUrl.searchParams.get("src") || "nouvo";
    const live = LIVE_SOURCES[srcKey];
    if (live) {
      // Temps réel via l'API Qonto si la clé est configurée, sinon la
      // copie MCP du drive.
      const login = process.env[live.loginEnv];
      const secret = process.env[live.secretEnv];
      if (login && secret) {
        const { txs, balance, accounts } = await fetchQontoApiTxs(login, secret);
        return Response.json({ ok: true, count: txs.length, fetchedAt: new Date().toISOString(), live: true, balance, accounts, transactions: txs });
      }
      const { txs, fetchedAt } = await txsFromDrive(live.docTitle);
      return Response.json({ ok: true, count: txs.length, fetchedAt, live: false, transactions: txs });
    }

    const src = QONTO_SOURCES[srcKey];
    if (!src) return Response.json({ ok: false, error: "Source inconnue" }, { status: 400 });
    if (!src.sheetId) {
      return Response.json({ ok: false, error: "Export Google Sheets non configuré pour ce compte." }, { status: 502 });
    }
    const rows = await fetchQontoRows(src.sheetId);
    // Les virements internes (Compte principal ↔ Coffre) sont écartés :
    // ils ne représentent ni recette ni dépense réelle.
    const txs = rows
      .filter((r) => /^\d{4}-/.test(r["emitted at"] || "") && !isInternalTransfer(r, src.ownName))
      .map((r) => ({
        id: r["slug transaction"] || "",
        date: r["emitted at"],
        label: (r["counterparty name"] || "(sans nom)").trim(),
        amount: parseFloat(r.amount || "0") || 0,
        side: r.side === "credit" ? "credit" : "debit",
        status: r.status,
        category: r.category || "",
        subcategory: r.subcategory || "",
        operationType: r["operation type"] || "",
        account: r["account name"] || "",
        reference: (r.reference || "").trim(),
        note: (r["internal note"] || "").trim(),
        attachments: (r["attachment names"] || "").trim(),
      }));
    return Response.json({ ok: true, count: txs.length, fetchedAt: new Date().toISOString(), transactions: txs });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
