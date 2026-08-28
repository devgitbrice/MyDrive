"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Tri = "oui" | "non" | "so" | "";

interface Fiche {
  version: 1;
  businessModel: {
    formation: boolean; conseil: boolean; sponsoring: boolean;
    publicite: boolean; abonnement: boolean; dev: boolean; autre: string;
  };
  produits: { statut: Tri; lien: string };
  presence: {
    site: { statut: Tri; url: string };
    appIos: { statut: Tri; url: string };
    ga4: { statut: Tri };
    trafic: string;
    linkedin: { statut: Tri; url: string; abonnes: string };
    youtube: { statut: Tri; url: string };
    instagram: { statut: Tri; url: string };
    telegram: { statut: Tri; url: string };
    whatsapp: { statut: Tri; url: string };
    newsletter: { statut: Tri; url: string };
    podcast: { statut: Tri; spotify: string; deezer: string; apple: string };
    pubMeta: { statut: Tri };
    pubGoogle: { statut: Tri };
  };
  commercial: {
    cibles: { statut: Tri; lien: string };
    contactPerso: { statut: Tri };
    phoning: { statut: Tri; lien: string };
    mailing: { statut: Tri; lien: string };
  };
}

function emptyFiche(): Fiche {
  return {
    version: 1,
    businessModel: { formation: false, conseil: false, sponsoring: false, publicite: false, abonnement: false, dev: false, autre: "" },
    produits: { statut: "", lien: "" },
    presence: {
      site: { statut: "", url: "" },
      appIos: { statut: "", url: "" },
      ga4: { statut: "" },
      trafic: "",
      linkedin: { statut: "", url: "", abonnes: "" },
      youtube: { statut: "", url: "" },
      instagram: { statut: "", url: "" },
      telegram: { statut: "", url: "" },
      whatsapp: { statut: "", url: "" },
      newsletter: { statut: "", url: "" },
      podcast: { statut: "", spotify: "", deezer: "", apple: "" },
      pubMeta: { statut: "" },
      pubGoogle: { statut: "" },
    },
    commercial: {
      cibles: { statut: "", lien: "" },
      contactPerso: { statut: "" },
      phoning: { statut: "", lien: "" },
      mailing: { statut: "", lien: "" },
    },
  };
}

// Fusionne le contenu stocké avec la structure par défaut (tolère les champs manquants).
function parseFiche(raw: string | null): Fiche {
  const base = emptyFiche();
  if (!raw) return base;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return base;
    return {
      ...base,
      ...p,
      businessModel: { ...base.businessModel, ...(p.businessModel || {}) },
      produits: { ...base.produits, ...(p.produits || {}) },
      presence: {
        ...base.presence,
        ...(p.presence || {}),
        site: { ...base.presence.site, ...(p.presence?.site || {}) },
        appIos: { ...base.presence.appIos, ...(p.presence?.appIos || {}) },
        ga4: { ...base.presence.ga4, ...(p.presence?.ga4 || {}) },
        linkedin: { ...base.presence.linkedin, ...(p.presence?.linkedin || {}) },
        youtube: { ...base.presence.youtube, ...(p.presence?.youtube || {}) },
        instagram: { ...base.presence.instagram, ...(p.presence?.instagram || {}) },
        telegram: { ...base.presence.telegram, ...(p.presence?.telegram || {}) },
        whatsapp: { ...base.presence.whatsapp, ...(p.presence?.whatsapp || {}) },
        newsletter: { ...base.presence.newsletter, ...(p.presence?.newsletter || {}) },
        podcast: { ...base.presence.podcast, ...(p.presence?.podcast || {}) },
        pubMeta: { ...base.presence.pubMeta, ...(p.presence?.pubMeta || {}) },
        pubGoogle: { ...base.presence.pubGoogle, ...(p.presence?.pubGoogle || {}) },
      },
      commercial: {
        ...base.commercial,
        ...(p.commercial || {}),
        cibles: { ...base.commercial.cibles, ...(p.commercial?.cibles || {}) },
        contactPerso: { ...base.commercial.contactPerso, ...(p.commercial?.contactPerso || {}) },
        phoning: { ...base.commercial.phoning, ...(p.commercial?.phoning || {}) },
        mailing: { ...base.commercial.mailing, ...(p.commercial?.mailing || {}) },
      },
    };
  } catch {
    return base;
  }
}

function TriState({ value, onChange }: { value: Tri; onChange: (v: Tri) => void }) {
  const opts: { v: Tri; label: string; on: string }[] = [
    { v: "oui", label: "Oui", on: "bg-green-600 border-green-500 text-white" },
    { v: "non", label: "Non", on: "bg-red-600 border-red-500 text-white" },
    { v: "so", label: "S.O.", on: "bg-neutral-600 border-neutral-500 text-white" },
  ];
  return (
    <div className="inline-flex gap-1">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(value === o.v ? "" : o.v)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
            value === o.v ? o.on : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500 placeholder:text-neutral-600"
    />
  );
}

// Ligne : libellé + tri-state, et champs "si oui" affichés seulement si Oui.
function Row({
  label, statut, onStatut, children,
}: { label: string; statut: Tri; onStatut: (v: Tri) => void; children?: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-neutral-800">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-neutral-200">{label}</span>
        <TriState value={statut} onChange={onStatut} />
      </div>
      {statut === "oui" && children && <div className="mt-2 space-y-2 pl-1">{children}</div>}
    </div>
  );
}

const BM_LABELS: { key: keyof Fiche["businessModel"]; label: string }[] = [
  { key: "formation", label: "Vente de formation" },
  { key: "conseil", label: "Conseil / prestation" },
  { key: "sponsoring", label: "Sponsoring de contenu" },
  { key: "publicite", label: "Publicité (display / affiliation)" },
  { key: "abonnement", label: "Abonnement" },
  { key: "dev", label: "Vente de développement" },
];

export default function FicheEditor({ item }: { item: any }) {
  const [title, setTitle] = useState(item.title || "");
  const [fiche, setFiche] = useState<Fiche>(() => parseFiche(item.content));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const backHref = `/mydrive?folder=${item.parent_id ?? "__unfiled__"}`;

  const scheduleSave = useCallback((nextTitle: string, nextFiche: Fiche) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(async () => {
      const { error } = await supabase
        .from("MyDrive")
        .update({ title: nextTitle.trim() || "Fiche projet", content: JSON.stringify(nextFiche) })
        .eq("id", item.id);
      setStatus(error ? "idle" : "saved");
    }, 700);
  }, [item.id]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Met à jour la fiche via un updater et déclenche la sauvegarde.
  const update = useCallback((fn: (f: Fiche) => Fiche) => {
    setFiche((prev) => {
      const next = fn(prev);
      scheduleSave(title, next);
      return next;
    });
  }, [scheduleSave, title]);

  const onTitle = (v: string) => { setTitle(v); scheduleSave(v, fiche); };

  const p = fiche.presence;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
      <header className="flex items-center justify-between gap-3 mb-5">
        <Link href={backHref} className="text-neutral-500 hover:text-white transition-colors">
          <ChevronLeft size={22} />
        </Link>
        <span className="text-xs text-neutral-500">
          {status === "saving" ? "Sauvegarde…" : status === "saved" ? "Sauvegardé" : ""}
        </span>
      </header>

      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder="Nom du projet"
        className="w-full bg-transparent text-2xl font-semibold text-white outline-none mb-6 border-b border-transparent focus:border-neutral-700"
      />

      {/* 1. Business model */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">1. Business model</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {BM_LABELS.map(({ key, label }) => {
            const on = fiche.businessModel[key] as boolean;
            return (
              <button
                key={key}
                type="button"
                onClick={() => update((f) => ({ ...f, businessModel: { ...f.businessModel, [key]: !on } }))}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                  on ? "bg-blue-600 border-blue-500 text-white" : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white"
                }`}
              >
                {on ? "☑" : "☐"} {label}
              </button>
            );
          })}
        </div>
        <Text
          value={fiche.businessModel.autre}
          onChange={(v) => update((f) => ({ ...f, businessModel: { ...f.businessModel, autre: v } }))}
          placeholder="Autre business model…"
        />
        <div className="mt-3">
          <Row label="Liste de produits en vente avec tarif" statut={fiche.produits.statut}
            onStatut={(v) => update((f) => ({ ...f, produits: { ...f.produits, statut: v } }))}>
            <Text value={fiche.produits.lien} onChange={(v) => update((f) => ({ ...f, produits: { ...f.produits, lien: v } }))} placeholder="Lien vers la liste / la boutique" />
          </Row>
        </div>
      </section>

      {/* 2. Présence en ligne */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">2. Présence en ligne</h2>
        <Row label="Site web existant" statut={p.site.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, site: { ...f.presence.site, statut: v } } }))}>
          <Text value={p.site.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, site: { ...f.presence.site, url: v } } }))} placeholder="URL du site" />
        </Row>
        <Row label="App iOS" statut={p.appIos.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, appIos: { ...f.presence.appIos, statut: v } } }))}>
          <Text value={p.appIos.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, appIos: { ...f.presence.appIos, url: v } } }))} placeholder="Lien App Store" />
        </Row>
        <Row label="GA4 installé" statut={p.ga4.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, ga4: { statut: v } } }))} />
        <div className="py-3 border-b border-neutral-800">
          <span className="text-sm text-neutral-200 block mb-2">Trafic mensuel</span>
          <Text value={p.trafic} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, trafic: v } }))} placeholder="ex : 1 200 visiteurs / mois" />
        </div>
        <Row label="LinkedIn" statut={p.linkedin.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, linkedin: { ...f.presence.linkedin, statut: v } } }))}>
          <Text value={p.linkedin.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, linkedin: { ...f.presence.linkedin, url: v } } }))} placeholder="URL de la page" />
          <Text value={p.linkedin.abonnes} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, linkedin: { ...f.presence.linkedin, abonnes: v } } }))} placeholder="Nombre d'abonnés" />
        </Row>
        <Row label="YouTube" statut={p.youtube.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, youtube: { ...f.presence.youtube, statut: v } } }))}>
          <Text value={p.youtube.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, youtube: { ...f.presence.youtube, url: v } } }))} placeholder="URL de la chaîne" />
        </Row>
        <Row label="Instagram" statut={p.instagram.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, instagram: { ...f.presence.instagram, statut: v } } }))}>
          <Text value={p.instagram.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, instagram: { ...f.presence.instagram, url: v } } }))} placeholder="URL du profil" />
        </Row>
        <Row label="Telegram" statut={p.telegram.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, telegram: { ...f.presence.telegram, statut: v } } }))}>
          <Text value={p.telegram.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, telegram: { ...f.presence.telegram, url: v } } }))} placeholder="URL du canal" />
        </Row>
        <Row label="Liste WhatsApp" statut={p.whatsapp.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, whatsapp: { ...f.presence.whatsapp, statut: v } } }))}>
          <Text value={p.whatsapp.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, whatsapp: { ...f.presence.whatsapp, url: v } } }))} placeholder="Lien d'invitation" />
        </Row>
        <Row label="Newsletter" statut={p.newsletter.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, newsletter: { ...f.presence.newsletter, statut: v } } }))}>
          <Text value={p.newsletter.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, newsletter: { ...f.presence.newsletter, url: v } } }))} placeholder="Lien d'inscription" />
        </Row>
        <Row label="Podcast" statut={p.podcast.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, podcast: { ...f.presence.podcast, statut: v } } }))}>
          <Text value={p.podcast.spotify} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, podcast: { ...f.presence.podcast, spotify: v } } }))} placeholder="URL Spotify" />
          <Text value={p.podcast.deezer} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, podcast: { ...f.presence.podcast, deezer: v } } }))} placeholder="URL Deezer" />
          <Text value={p.podcast.apple} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, podcast: { ...f.presence.podcast, apple: v } } }))} placeholder="URL Apple Podcast" />
        </Row>
        <Row label="Pub lancée sur Meta Business Suite" statut={p.pubMeta.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, pubMeta: { statut: v } } }))} />
        <Row label="Pub lancée sur Google Ads" statut={p.pubGoogle.statut}
          onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, pubGoogle: { statut: v } } }))} />
      </section>

      {/* 3. Commercial */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">3. Commercial</h2>
        <Row label="Liste de catégories de cible précise établie" statut={fiche.commercial.cibles.statut}
          onStatut={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, cibles: { ...f.commercial.cibles, statut: v } } }))}>
          <Text value={fiche.commercial.cibles.lien} onChange={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, cibles: { ...f.commercial.cibles, lien: v } } }))} placeholder="Lien vers la liste de cibles" />
        </Row>
        <Row label="Contact réseaux personnels" statut={fiche.commercial.contactPerso.statut}
          onStatut={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, contactPerso: { statut: v } } }))} />
        <Row label="Phoning fait" statut={fiche.commercial.phoning.statut}
          onStatut={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, phoning: { ...f.commercial.phoning, statut: v } } }))}>
          <Text value={fiche.commercial.phoning.lien} onChange={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, phoning: { ...f.commercial.phoning, lien: v } } }))} placeholder="Lien vers la liste" />
        </Row>
        <Row label="Mailing fait" statut={fiche.commercial.mailing.statut}
          onStatut={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, mailing: { ...f.commercial.mailing, statut: v } } }))}>
          <Text value={fiche.commercial.mailing.lien} onChange={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, mailing: { ...f.commercial.mailing, lien: v } } }))} placeholder="Lien vers la liste" />
        </Row>
      </section>
    </div>
  );
}
