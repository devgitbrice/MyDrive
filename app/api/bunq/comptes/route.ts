import { fetchBunqAccounts } from "@/lib/bunq";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Solde de chaque compte / sous-compte bunq (nom, type, statut, solde).
export async function GET() {
  try {
    const comptes = await fetchBunqAccounts();
    return Response.json({ ok: true, fetchedAt: new Date().toISOString(), comptes });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
