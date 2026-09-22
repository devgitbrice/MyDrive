"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Chemins accessibles sans être connecté.
const PUBLIC_PREFIXES = ["/login", "/view/"];

function isPublic(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const hasSession = !!data.session;
      setAuthed(hasSession);
      setReady(true);
      if (!hasSession && !isPublic(pathname)) {
        router.replace("/login");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAuthed(!!session);
      if (!session && !isPublic(pathname)) router.replace("/login");
    });

    // Rafraîchit le jeton dès que l'app redevient visible (iOS coupe le
    // refresh auto en arrière-plan → sinon "Load failed" au retour).
    // Garde anti-rafale : focus + visibilitychange se déclenchent souvent
    // ensemble, et deux refresh parallèles avec le même jeton provoquent une
    // révocation en chaîne côté Supabase (boucle de déconnexion + 429).
    let refreshing = false;
    let lastRefresh = 0;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshing || Date.now() - lastRefresh < 30_000) return;
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) return;
        const exp = (data.session.expires_at ?? 0) * 1000;
        // Si le token expire dans moins de 2 min (ou est expiré), on le renouvelle.
        if (exp - Date.now() < 120_000 && !refreshing) {
          refreshing = true;
          lastRefresh = Date.now();
          supabase.auth.refreshSession().catch(() => {}).finally(() => { refreshing = false; });
        }
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [pathname, router]);

  // Pages publiques : toujours affichées.
  if (isPublic(pathname)) return <>{children}</>;

  // En attente de la vérification de session.
  if (!ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-neutral-950 text-neutral-500">
        Chargement…
      </div>
    );
  }

  // Pas connecté : on n'affiche rien (redirection en cours).
  if (!authed) return null;

  return <>{children}</>;
}
