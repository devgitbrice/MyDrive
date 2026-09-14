"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type L = { label: string; url: string };
type Section = { title?: string; links: L[] };

// Normalise une adresse en URL cliquable (https + gestion des liens déjà complets).
function href(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return "https://" + url.replace(/^\/+/, "");
}

const SECTIONS: Section[] = [
  {
    title: "APP",
    links: [{ label: "APP", url: "https://app.gennn.live/login" }],
  },
];

const PUBLIC_PREFIXES = ["/login", "/view/"];
function isPublic(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));
}

export default function SiteFooter() {
  const pathname = usePathname() || "/";
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthed(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted) setAuthed(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Masqué si non connecté ou sur les pages publiques.
  if (!authed || isPublic(pathname)) return null;

  return (
    <footer className="mt-16 border-t border-neutral-800 bg-neutral-950/60 px-6 py-10 text-sm">
      <div className="mx-auto max-w-5xl flex flex-wrap gap-12">
        {SECTIONS.map((section, i) => (
          <div key={i} className="space-y-2">
            {section.title && (
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                {section.title}
              </h3>
            )}
            <ul className="space-y-1.5">
              {section.links.map((l) => (
                <li key={l.label + l.url}>
                  <a
                    href={href(l.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-neutral-400 hover:text-white transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-5xl mt-8 pt-6 border-t border-neutral-900 text-xs text-neutral-600">
        © {new Date().getFullYear()} BriceMatter
      </div>
    </footer>
  );
}
