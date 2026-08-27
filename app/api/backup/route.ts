import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sauvegarde hebdomadaire : dump JSON de la table MyDrive vers le bucket
// Storage (backups/YYYY-MM-DD.json). Déclenchée par le cron Vercel.
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
  const H = { apikey: key, Authorization: `Bearer ${key}` };

  const r = await fetch(`${url}/rest/v1/MyDrive?select=*`, { headers: H });
  if (!r.ok) return new Response("Fetch failed", { status: 502 });
  const rows = await r.json();

  const day = new Date().toISOString().slice(0, 10);
  const path = `backups/mydrive-${day}.json`;
  const up = await fetch(`${url}/storage/v1/object/MyDrive/${path}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json", "x-upsert": "true" },
    body: JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, rows }),
  });
  if (!up.ok) return new Response("Upload failed: " + (await up.text()), { status: 502 });

  return Response.json({ ok: true, count: rows.length, path });
}
