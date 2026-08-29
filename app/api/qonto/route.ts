import { fetchQontoRows, isInternalTransfer } from "@/lib/qonto";

export const runtime = "nodejs";
// Le Sheet change peu : on sert une version en cache 5 minutes.
export const revalidate = 300;

// Transactions Qonto au format compact pour l'onglet Qonto de /finances.
export async function GET() {
  try {
    const rows = await fetchQontoRows();
    // Les virements internes (Compte principal ↔ Coffre) sont écartés :
    // ils ne représentent ni recette ni dépense réelle.
    const txs = rows
      .filter((r) => /^\d{4}-/.test(r["emitted at"] || "") && !isInternalTransfer(r))
      .map((r) => ({
        date: r["emitted at"],
        label: (r["counterparty name"] || "(sans nom)").trim(),
        amount: parseFloat(r.amount || "0") || 0,
        side: r.side === "credit" ? "credit" : "debit",
        status: r.status,
        category: r.category || "",
        account: r["account name"] || "",
      }));
    return Response.json({ ok: true, count: txs.length, transactions: txs });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
