"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, LayoutGrid } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Tri = "oui" | "non" | "so" | "";
type Prio = "prioritaire" | "veille" | "";

interface Net { statut: Tri; url: string; abonnes: string }

interface Fiche {
  version: 2;
  priorite: Prio;
  businessModel: {
    formation: boolean; conseil: boolean; sponsoring: boolean;
    publicite: boolean; abonnement: boolean; dev: boolean; autre: string; principal: string;
  };
  produits: { statut: Tri; lien: string };
  presence: {
    site: { statut: Tri; url: string };
    appIos: { statut: Tri; url: string };
    ga4: { statut: Tri };
    trafic: string;
    linkedin: Net;
    youtube: Net;
    instagram: Net;
    telegram: Net;
    whatsapp: Net;
    newsletter: Net;
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
  kpis: { ca: string; prochaineAction: string };
}

const net = (): Net => ({ statut: "", url: "", abonnes: "" });

function emptyFiche(): Fiche {
  return {
    version: 2,
    priorite: "",
    businessModel: { formation: false, conseil: false, sponsoring: false, publicite: false, abonnement: false, dev: false, autre: "", principal: "" },
    produits: { statut: "", lien: "" },
    presence: {
      site: { statut: "", url: "" },
      appIos: { statut: "", url: "" },
      ga4: { statut: "" },
      trafic: "",
      linkedin: net(), youtube: net(), instagram: net(), telegram: net(), whatsapp: net(), newsletter: net(),
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
    kpis: { ca: "", prochaineAction: "" },
  };
}

function parseFiche(raw: string | null): Fiche {
  const base = emptyFiche();
  if (!raw) return base;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return base;
    const mNet = (o: any): Net => ({ ...net(), ...(o || {}) });
    const pr = p.presence || {};
    return {
      ...base,
      ...p,
      version: 2,
      priorite: p.priorite ?? "",
      businessModel: { ...base.businessModel, ...(p.businessModel || {}) },
      produits: { ...base.produits, ...(p.produits || {}) },
      presence: {
        ...base.presence, ...pr,
        site: { ...base.presence.site, ...(pr.site || {}) },
        appIos: { ...base.presence.appIos, ...(pr.appIos || {}) },
        ga4: { ...base.presence.ga4, ...(pr.ga4 || {}) },
        linkedin: mNet(pr.linkedin), youtube: mNet(pr.youtube), instagram: mNet(pr.instagram),
        telegram: mNet(pr.telegram), whatsapp: mNet(pr.whatsapp), newsletter: mNet(pr.newsletter),
        podcast: { ...base.presence.podcast, ...(pr.podcast || {}) },
        pubMeta: { ...base.presence.pubMeta, ...(pr.pubMeta || {}) },
        pubGoogle: { ...base.presence.pubGoogle, ...(pr.pubGoogle || {}) },
      },
      commercial: {
        ...base.commercial, ...(p.commercial || {}),
        cibles: { ...base.commercial.cibles, ...(p.commercial?.cibles || {}) },
        contactPerso: { ...base.commercial.contactPerso, ...(p.commercial?.contactPerso || {}) },
        phoning: { ...base.commercial.phoning, ...(p.commercial?.phoning || {}) },
        mailing: { ...base.commercial.mailing, ...(p.commercial?.mailing || {}) },
      },
      kpis: { ...base.kpis, ...(p.kpis || {}) },
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
    <div className="inline-flex gap-1 shrink-0">
      {opts.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(value === o.v ? "" : o.v)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
            value === o.v ? o.on : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500 placeholder:text-neutral-600" />
  );
}

function Row({ label, statut, onStatut, children }: { label: string; statut: Tri; onStatut: (v: Tri) => void; children?: React.ReactNode }) {
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

const SubTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mt-4 mb-1">{children}</h3>
);

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
      const { error } = await supabase.from("MyDrive")
        .update({ title: nextTitle.trim() || "Fiche projet", content: JSON.stringify(nextFiche) })
        .eq("id", item.id);
      setStatus(error ? "idle" : "saved");
    }, 700);
  }, [item.id]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const update = useCallback((fn: (f: Fiche) => Fiche) => {
    setFiche((prev) => { const next = fn(prev); scheduleSave(title, next); return next; });
  }, [scheduleSave, title]);

  const onTitle = (v: string) => { setTitle(v); scheduleSave(v, fiche); };
  const p = fiche.presence;

  // --- Synthèse ---
  const counts = useMemo(() => {
    const pres = [p.site, p.appIos, p.ga4, p.linkedin, p.youtube, p.instagram, p.telegram, p.whatsapp, p.newsletter, p.podcast, p.pubMeta, p.pubGoogle];
    const presOui = pres.filter((x: any) => x.statut === "oui").length;
    const com = [fiche.commercial.cibles, fiche.commercial.contactPerso, fiche.commercial.phoning, fiche.commercial.mailing];
    const comOui = com.filter((x) => x.statut === "oui").length;
    return { presOui, presTot: pres.length, comOui, comTot: com.length };
  }, [p, fiche.commercial]);

  const checkedBM = BM_LABELS.filter((b) => fiche.businessModel[b.key]);

  // Champ réseau réutilisable (url + abonnés)
  const NetFields = (key: "linkedin" | "youtube" | "instagram" | "telegram" | "whatsapp" | "newsletter", urlPh: string) => (
    <>
      <Text value={(p[key] as Net).url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, [key]: { ...(f.presence[key] as Net), url: v } } }))} placeholder={urlPh} />
      <Text value={(p[key] as Net).abonnes} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, [key]: { ...(f.presence[key] as Net), abonnes: v } } }))} placeholder="Nombre d'abonnés" />
    </>
  );
  const netStatut = (key: "linkedin" | "youtube" | "instagram" | "telegram" | "whatsapp" | "newsletter") =>
    (v: Tri) => update((f) => ({ ...f, presence: { ...f.presence, [key]: { ...(f.presence[key] as Net), statut: v } } }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
      <header className="flex items-center justify-between gap-3 mb-4">
        <Link href={backHref} className="text-neutral-500 hover:text-white transition-colors"><ChevronLeft size={22} /></Link>
        <div className="flex items-center gap-4">
          <Link href="/portefeuille" className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors">
            <LayoutGrid size={14} /> Portefeuille
          </Link>
          <span className="text-xs text-neutral-500">{status === "saving" ? "Sauvegarde…" : status === "saved" ? "Sauvegardé" : ""}</span>
        </div>
      </header>

      <input value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Nom du projet"
        className="w-full bg-transparent text-2xl font-semibold text-white outline-none mb-4 border-b border-transparent focus:border-neutral-700" />

      {/* Bandeau synthèse + priorité */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button type="button" onClick={() => update((f) => ({ ...f, priorite: f.priorite === "prioritaire" ? "" : "prioritaire" }))}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${fiche.priorite === "prioritaire" ? "bg-amber-500 border-amber-400 text-black" : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white"}`}>
            🎯 Prioritaire
          </button>
          <button type="button" onClick={() => update((f) => ({ ...f, priorite: f.priorite === "veille" ? "" : "veille" }))}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${fiche.priorite === "veille" ? "bg-neutral-600 border-neutral-500 text-white" : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white"}`}>
            💤 En veille
          </button>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-neutral-400">
          <span>Présence : <span className="text-white font-semibold">{counts.presOui}/{counts.presTot}</span></span>
          <span>Commercial : <span className="text-white font-semibold">{counts.comOui}/{counts.comTot}</span></span>
          <span>Business model : <span className="text-white font-semibold">{checkedBM.length + (fiche.businessModel.autre ? 1 : 0)}</span></span>
        </div>
      </div>

      {/* 1. Business model */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">1. Business model</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {BM_LABELS.map(({ key, label }) => {
            const on = fiche.businessModel[key] as boolean;
            return (
              <button key={key} type="button"
                onClick={() => update((f) => ({ ...f, businessModel: { ...f.businessModel, [key]: !on, principal: f.businessModel.principal === key && on ? "" : f.businessModel.principal } }))}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${on ? "bg-blue-600 border-blue-500 text-white" : "bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-white"}`}>
                {on ? "☑" : "☐"} {label}
              </button>
            );
          })}
        </div>
        {checkedBM.length > 1 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-neutral-500">Principal :</span>
            <select value={fiche.businessModel.principal}
              onChange={(e) => update((f) => ({ ...f, businessModel: { ...f.businessModel, principal: e.target.value } }))}
              className="bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-sm text-white outline-none focus:border-blue-500">
              <option value="">—</option>
              {checkedBM.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          </div>
        )}
        <Text value={fiche.businessModel.autre} onChange={(v) => update((f) => ({ ...f, businessModel: { ...f.businessModel, autre: v } }))} placeholder="Autre business model…" />
        <div className="mt-3">
          <Row label="Liste de produits en vente avec tarif" statut={fiche.produits.statut} onStatut={(v) => update((f) => ({ ...f, produits: { ...f.produits, statut: v } }))}>
            <Text value={fiche.produits.lien} onChange={(v) => update((f) => ({ ...f, produits: { ...f.produits, lien: v } }))} placeholder="Lien vers la liste / la boutique" />
          </Row>
        </div>
      </section>

      {/* 2. Présence en ligne */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">2. Présence en ligne</h2>
        <SubTitle>Owned</SubTitle>
        <Row label="Site web existant" statut={p.site.statut} onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, site: { ...f.presence.site, statut: v } } }))}>
          <Text value={p.site.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, site: { ...f.presence.site, url: v } } }))} placeholder="URL du site" />
        </Row>
        <Row label="App iOS" statut={p.appIos.statut} onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, appIos: { ...f.presence.appIos, statut: v } } }))}>
          <Text value={p.appIos.url} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, appIos: { ...f.presence.appIos, url: v } } }))} placeholder="Lien App Store" />
        </Row>
        <Row label="GA4 installé" statut={p.ga4.statut} onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, ga4: { statut: v } } }))} />
        <div className="py-3 border-b border-neutral-800">
          <span className="text-sm text-neutral-200 block mb-2">Trafic mensuel</span>
          <Text value={p.trafic} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, trafic: v } }))} placeholder="ex : 1 200 visiteurs / mois" />
        </div>
        <Row label="Newsletter" statut={p.newsletter.statut} onStatut={netStatut("newsletter")}>{NetFields("newsletter", "Lien d'inscription")}</Row>

        <SubTitle>Réseaux sociaux</SubTitle>
        <Row label="LinkedIn" statut={p.linkedin.statut} onStatut={netStatut("linkedin")}>{NetFields("linkedin", "URL de la page")}</Row>
        <Row label="YouTube" statut={p.youtube.statut} onStatut={netStatut("youtube")}>{NetFields("youtube", "URL de la chaîne")}</Row>
        <Row label="Instagram" statut={p.instagram.statut} onStatut={netStatut("instagram")}>{NetFields("instagram", "URL du profil")}</Row>
        <Row label="Telegram" statut={p.telegram.statut} onStatut={netStatut("telegram")}>{NetFields("telegram", "URL du canal")}</Row>
        <Row label="Liste WhatsApp" statut={p.whatsapp.statut} onStatut={netStatut("whatsapp")}>{NetFields("whatsapp", "Lien d'invitation")}</Row>

        <SubTitle>Podcast</SubTitle>
        <Row label="Podcast" statut={p.podcast.statut} onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, podcast: { ...f.presence.podcast, statut: v } } }))}>
          <Text value={p.podcast.spotify} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, podcast: { ...f.presence.podcast, spotify: v } } }))} placeholder="URL Spotify" />
          <Text value={p.podcast.deezer} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, podcast: { ...f.presence.podcast, deezer: v } } }))} placeholder="URL Deezer" />
          <Text value={p.podcast.apple} onChange={(v) => update((f) => ({ ...f, presence: { ...f.presence, podcast: { ...f.presence.podcast, apple: v } } }))} placeholder="URL Apple Podcast" />
        </Row>

        <SubTitle>Publicité</SubTitle>
        <Row label="Pub lancée sur Meta Business Suite" statut={p.pubMeta.statut} onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, pubMeta: { statut: v } } }))} />
        <Row label="Pub lancée sur Google Ads" statut={p.pubGoogle.statut} onStatut={(v) => update((f) => ({ ...f, presence: { ...f.presence, pubGoogle: { statut: v } } }))} />
      </section>

      {/* 3. Commercial */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">3. Commercial</h2>
        <Row label="Liste de catégories de cible précise établie" statut={fiche.commercial.cibles.statut} onStatut={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, cibles: { ...f.commercial.cibles, statut: v } } }))}>
          <Text value={fiche.commercial.cibles.lien} onChange={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, cibles: { ...f.commercial.cibles, lien: v } } }))} placeholder="Lien vers la liste de cibles" />
        </Row>
        <Row label="Contact réseaux personnels" statut={fiche.commercial.contactPerso.statut} onStatut={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, contactPerso: { statut: v } } }))} />
        <Row label="Phoning fait" statut={fiche.commercial.phoning.statut} onStatut={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, phoning: { ...f.commercial.phoning, statut: v } } }))}>
          <Text value={fiche.commercial.phoning.lien} onChange={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, phoning: { ...f.commercial.phoning, lien: v } } }))} placeholder="Lien vers la liste" />
        </Row>
        <Row label="Mailing fait" statut={fiche.commercial.mailing.statut} onStatut={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, mailing: { ...f.commercial.mailing, statut: v } } }))}>
          <Text value={fiche.commercial.mailing.lien} onChange={(v) => update((f) => ({ ...f, commercial: { ...f.commercial, mailing: { ...f.commercial.mailing, lien: v } } }))} placeholder="Lien vers la liste" />
        </Row>
      </section>

      {/* 4. KPIs & action */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">4. KPIs & prochaine action</h2>
        <div className="space-y-2">
          <div>
            <span className="text-sm text-neutral-200 block mb-1">Chiffre d'affaires / mois</span>
            <Text value={fiche.kpis.ca} onChange={(v) => update((f) => ({ ...f, kpis: { ...f.kpis, ca: v } }))} placeholder="ex : 0 € / mois" />
          </div>
          <div>
            <span className="text-sm text-neutral-200 block mb-1">Prochaine action</span>
            <Text value={fiche.kpis.prochaineAction} onChange={(v) => update((f) => ({ ...f, kpis: { ...f.kpis, prochaineAction: v } }))} placeholder="La prochaine chose concrète à faire" />
          </div>
        </div>
      </section>
    </div>
  );
}
