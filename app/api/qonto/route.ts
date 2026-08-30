import { NextRequest } from "next/server";
import { fetchQontoRows, isInternalTransfer, QONTO_SOURCES } from "@/lib/qonto";

export const runtime = "nodejs";
// Le Sheet change peu : on sert une version en cache 5 minutes.
export const revalidate = 300;

// Transactions Qonto au format compact pour les onglets Qonto de /finances.
// ?src=nouvo (défaut) ou ?src=gennn.
export async function GET(req: NextRequest) {
  try {
    const src = QONTO_SOURCES[req.nextUrl.searchParams.get("src") || "nouvo"];
    if (!src) return Response.json({ ok: false, error: "Source inconnue" }, { status: 400 });
    if (!src.sheetId) {
      return Response.json({ ok: false, error: "Export Google Sheets non configuré pour ce compte (variable QONTO_GENNN_SHEET_ID)." }, { status: 502 });
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
