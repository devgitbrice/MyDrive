// Garde d'authentification pour les routes API qui consomment du crédit
// (OpenAI, etc.) : exige un token de session Supabase valide.
import { NextRequest } from "next/server";

export async function requireUser(req: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const authHeader = req.headers.get("x-supabase-auth") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!token || !url || !anon) {
    return {
      ok: false,
      res: new Response(JSON.stringify({ error: "Authentification requise" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      }),
    };
  }

  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error("invalid");
    const user = await r.json();
    if (!user?.id) throw new Error("invalid");
    return { ok: true, userId: user.id };
  } catch {
    return {
      ok: false,
      res: new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      }),
    };
  }
}
