// fetch() qui joint automatiquement le token de session Supabase,
// pour les routes API protégées (/api/tts, /api/chat, …).
import { supabase } from "@/lib/supabaseClient";

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let token = "";
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token || "";
  } catch {}
  const headers = new Headers(init.headers || {});
  if (token) headers.set("x-supabase-auth", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
