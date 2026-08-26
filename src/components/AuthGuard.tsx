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

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
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
