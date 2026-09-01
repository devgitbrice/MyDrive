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
    links: [{ label: "MyDrive", url: "mydrive.bricematter.com" }],
  },
  {
    title: "IA",
    links: [
      { label: "Management", url: "management.gennn.live" },
      { label: "News", url: "www.gennn.live" },
      { label: "Studio", url: "studio.gennn.live" },
      { label: "Conseil", url: "conseil.gennn.live" },
      { label: "Formation", url: "formation.gennn.live" },
    ],
  },
  {
    title: "Média B2B",
    links: [
      { label: "Nouvo Media", url: "nouvo.media" },
      { label: "Numactu", url: "numactu.fr" },
      { label: "Gennn", url: "www.gennn.live" },
      { label: "DroitSocial", url: "droitsocialactu.com" },
      { label: "Piactu", url: "piactu.fr" },
      { label: "Formation Nouvo Media", url: "formation.nouvo.media" },
    ],
  },
  {
    title: "Média B2C",
    links: [
      { label: "TTTrip", url: "tttrip.live" },
      { label: "Orrors", url: "orrors.com" },
    ],
  },
  {
    title: "Work In Progress",
    links: [
      { label: "Agentic", url: "agentic.gennn.live" },
      { label: "Gennn Press", url: "press.gennn.live" },
      { label: "Grab the Grail", url: "grabthegrail.com" },
      { label: "MyChat", url: "mychat.bricematter.com" },
      { label: "TopShoperz", url: "topshoperz.com" },
    ],
  },
  {
    title: "Tools",
    links: [
      { label: "Claude Code", url: "https://claude.ai/code" },
      { label: "Vercel Deployment", url: "https://vercel.com/bricems-projects/photo-app/deployments" },
      { label: "Github", url: "www.github.com" },
      { label: "Gandi", url: "www.gandi.net" },
    ],
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
      <div className="mx-auto max-w-5xl grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
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
