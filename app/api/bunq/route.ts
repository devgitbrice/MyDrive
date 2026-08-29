import { fetchBunqPayments } from "@/lib/bunq";

export const runtime = "nodejs";
export const maxDuration = 60;
// Les données changent peu : version en cache 5 minutes, comme /api/qonto.
export const revalidate = 300;

// Transactions bunq au format compact de l'onglet Perso (même forme que
// /api/qonto pour réutiliser la même vue).
export async function GET() {
  try {
    const payments = await fetchBunqPayments();
    const txs = payments.map((p) => {
      const value = parseFloat(p.amount?.value || "0") || 0;
      return {
        id: `bunq-${p.monetary_account_id}-${p.id}`,
        date: p.created?.replace(" ", "T") || "",
        label: (p.counterparty_alias?.display_name || "(sans nom)").trim(),
        amount: Math.abs(value),
        side: value < 0 ? "debit" : "credit",
        status: "completed",
        category: "",
        subcategory: "",
        operationType: (p.type || "").toLowerCase(),
        account: String(p.monetary_account_id),
        reference: (p.description || "").trim(),
        note: "",
        attachments: "",
      };
    });
    return Response.json({ ok: true, count: txs.length, fetchedAt: new Date().toISOString(), transactions: txs });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
