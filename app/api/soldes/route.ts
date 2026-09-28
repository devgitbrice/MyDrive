import { fetchBunqBalance } from "@/lib/bunq";
import { fetchQontoBalance } from "@/lib/qonto";

export const runtime = "nodejs";
export const maxDuration = 30;
// Même cache que /api/qonto et /api/bunq.
export const revalidate = 300;

type Solde = { label: string; balance: number | null; error?: string };

async function qonto(label: string, loginEnv: string, secretEnv: string): Promise<Solde> {
  const login = process.env[loginEnv];
  const secret = process.env[secretEnv];
  if (!login || !secret) return { label, balance: null, error: "Clé API Qonto non configurée" };
  try {
    return { label, balance: (await fetchQontoBalance(login, secret)).balance };
  } catch (e) {
    return { label, balance: null, error: String(e) };
  }
}

async function bunq(): Promise<Solde> {
  try {
    return { label: "Bunq", balance: await fetchBunqBalance() };
  } catch (e) {
    return { label: "Bunq", balance: null, error: String(e) };
  }
}

// Soldes seuls (sans transactions) de chaque banque, pour les tableaux de
// bord externes (page Suivi de usa2026). Revolut n'a pas d'intégration.
export async function GET() {
  const soldes = await Promise.all([
    bunq(),
    qonto("Qonto Nouvo Media", "QONTO_NM_LOGIN", "QONTO_NM_SECRET"),
    qonto("Qonto Gennn", "QONTO_GENNN_LOGIN", "QONTO_GENNN_SECRET"),
    Promise.resolve<Solde>({ label: "Revolut", balance: null, error: "Pas d'intégration Revolut" }),
  ]);
  return Response.json({ ok: true, fetchedAt: new Date().toISOString(), soldes });
}
