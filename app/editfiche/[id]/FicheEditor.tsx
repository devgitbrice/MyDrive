"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LayoutGrid, Sparkles, Volume2, Loader2, Square } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";
import { toast } from "@/components/Toaster";

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
  analyse: { text: string; generatedAt: number };
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
    analyse: { text: "", generatedAt: 0 },
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
      analyse: { ...base.analyse, ...(p.analyse || {}) },
    };
  } catch {
    return base;
  }
}

// Convertit la fiche en texte lisible pour alimenter l'analyse LLM.
function buildSummary(f: Fiche, projet: string): string {
  const tri = (v: Tri) => (v === "oui" ? "oui" : v === "non" ? "non" : v === "so" ? "sans objet" : "non renseigné");
  const bm = BM_LABELS.filter((b) => f.businessModel[b.key]).map((b) => b.label);
  if (f.businessModel.autre) bm.push("autre : " + f.businessModel.autre);
  const p = f.presence;
  const net = (k: keyof Fiche["presence"], label: string) => {
    const n = p[k] as Net;
    return `${label} : ${tri(n.statut)}${n.abonnes ? ` (${n.abonnes} abonnés)` : ""}`;
  };
  const lines = [
    `Priorité : ${f.priorite === "prioritaire" ? "prioritaire" : f.priorite === "veille" ? "en veille" : "non définie"}`,
    `Business model : ${bm.length ? bm.join(", ") : "non défini"}${f.businessModel.principal ? ` (principal : ${BM_LABELS.find((b) => b.key === f.businessModel.principal)?.label})` : ""}`,
    `Produits en vente avec tarif : ${tri(f.produits.statut)}`,
    `Site web : ${tri(p.site.statut)}${p.site.url ? ` (${p.site.url})` : ""}`,
    `App iOS : ${tri(p.appIos.statut)}`,
    `GA4 installé : ${tri(p.ga4.statut)}`,
    `Trafic mensuel : ${p.trafic || "non renseigné"}`,
    net("linkedin", "LinkedIn"),
    net("youtube", "YouTube"),
    net("instagram", "Instagram"),
    net("telegram", "Telegram"),
    net("whatsapp", "Liste WhatsApp"),
    net("newsletter", "Newsletter"),
    `Podcast : ${tri(p.podcast.statut)}`,
    `Pub Meta : ${tri(p.pubMeta.statut)}`,
    `Pub Google Ads : ${tri(p.pubGoogle.statut)}`,
    `Cibles précises établies : ${tri(f.commercial.cibles.statut)}`,
    `Contact réseaux personnels : ${tri(f.commercial.contactPerso.statut)}`,
    `Phoning fait : ${tri(f.commercial.phoning.statut)}`,
    `Mailing fait : ${tri(f.commercial.mailing.statut)}`,
    `CA / mois : ${f.kpis.ca || "non renseigné"}`,
    `Prochaine action notée : ${f.kpis.prochaineAction || "aucune"}`,
  ];
  return lines.join("\n");
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
  const router = useRouter();
  const [title, setTitle] = useState(item.title || "");
  // Nom du projet = nom du dossier parent (utilisé pour l'analyse et l'audio).
  const [projetName, setProjetName] = useState<string>(item.title || "");
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

  // --- Analyse IA (ChatGPT) + lecture audio (TTS OpenAI) ---
  const [generating, setGenerating] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const generateAnalyse = useCallback(async () => {
    setGenerating(true);
    try {
      const summary = buildSummary(fiche, projetName);
      const res = await authFetch("/api/analyze-fiche", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, projet: projetName }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || "Analyse indisponible");
      update((f) => ({ ...f, analyse: { text: data.text, generatedAt: Date.now() } }));
    } catch (e: any) {
      toast("Erreur analyse : " + (e?.message || ""));
    } finally {
      setGenerating(false);
    }
  }, [fiche, projetName, update]);

  // WAV silencieux (0 échantillon) pour débloquer l'audio dans le geste utilisateur iOS.
  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); }
    setSpeaking(false);
  }, []);

  const speak = useCallback(async () => {
    if (speaking) { stopAudio(); return; }
    const text = fiche.analyse.text;
    if (!text) return;

    // 1) Débloque l'élément audio MAINTENANT (dans le geste de clic) — indispensable sur iOS.
    let audio = audioRef.current;
    if (!audio) { audio = new Audio(); audioRef.current = audio; }
    try { audio.src = SILENT; audio.play().catch(() => {}); } catch {}

    setSpeaking(true);
    try {
      const res = await authFetch("/api/tts-openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "alloy" }),
      });
      if (!res.ok) throw new Error("TTS indisponible");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // 2) L'élément est déjà débloqué → le vrai audio peut jouer.
      audio.src = url;
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); };
      await audio.play();
    } catch (e: any) {
      toast("Erreur lecture audio : " + (e?.message || ""));
      setSpeaking(false);
    }
  }, [speaking, fiche.analyse.text, stopAudio]);

  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  // --- Navigation entre fiches (swipe gauche/droite sur mobile) ---
  const [nav, setNav] = useState<{ prev?: string; next?: string; index: number; total: number }>({ index: -1, total: 0 });
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("MyDrive")
        .select("id, parent_id").eq("doc_type", "fiche").is("deleted_at", null);
      if (!alive || !data) return;
      const parents = Array.from(new Set(data.map((d: any) => d.parent_id).filter(Boolean)));
      const names: Record<string, string> = {};
      if (parents.length) {
        const { data: f } = await supabase.from("MyDrive").select("id, title").in("id", parents);
        (f || []).forEach((x: any) => { names[x.id] = x.title; });
      }
      const sorted = data
        .map((d: any) => ({ id: d.id, name: names[d.parent_id] || "" }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
      if (item.parent_id && names[item.parent_id]) setProjetName(names[item.parent_id]);
      const idx = sorted.findIndex((x) => x.id === item.id);
      if (idx === -1) return;
      setNav({
        prev: idx > 0 ? sorted[idx - 1].id : undefined,
        next: idx < sorted.length - 1 ? sorted[idx + 1].id : undefined,
        index: idx, total: sorted.length,
      });
    })();
    return () => { alive = false; };
  }, [item.id]);

  const goPrev = useCallback(() => { if (nav.prev) router.push(`/editfiche/${nav.prev}`); }, [nav.prev, router]);
  const goNext = useCallback(() => { if (nav.next) router.push(`/editfiche/${nav.next}`); }, [nav.next, router]);

  // Détection du swipe horizontal (en ignorant les gestes partis d'un champ éditable).
  const touch = useRef<{ x: number; y: number; el: EventTarget | null } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, el: e.target };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current; touch.current = null;
    if (!start) return;
    const el = start.el as HTMLElement | null;
    if (el && el.closest && el.closest("input, textarea, select")) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return; // swipe horizontal net requis
    if (dx < 0) goNext(); else goPrev();
  };

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
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="flex items-center justify-between gap-3 mb-4">
        <Link href={backHref} className="text-neutral-500 hover:text-white transition-colors"><ChevronLeft size={22} /></Link>
        <div className="flex items-center gap-3">
          {nav.total > 1 && (
            <div className="flex items-center gap-1 text-neutral-500">
              <button type="button" onClick={goPrev} disabled={!nav.prev} aria-label="Fiche précédente"
                className="p-1 rounded-md hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition-colors">
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs tabular-nums">{nav.index + 1}/{nav.total}</span>
              <button type="button" onClick={goNext} disabled={!nav.next} aria-label="Fiche suivante"
                className="p-1 rounded-md hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
          )}
          <Link href="/portefeuille" className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition-colors">
            <LayoutGrid size={14} /> Portefeuille
          </Link>
          <span className="text-xs text-neutral-500">{status === "saving" ? "Sauvegarde…" : status === "saved" ? "Sauvegardé" : ""}</span>
        </div>
      </header>

      <input value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Nom du projet"
        className="w-full bg-transparent text-2xl font-semibold text-white outline-none border-b border-transparent focus:border-neutral-700" />
      {projetName && projetName !== title && (
        <p className="text-xs text-neutral-500 mb-4">Projet : <span className="text-neutral-300">{projetName}</span></p>
      )}
      {(!projetName || projetName === title) && <div className="mb-4" />}

      {/* Analyse IA + lecteur audio */}
      <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-400">
            <Sparkles size={14} /> Analyse IA
          </span>
          <div className="flex items-center gap-2">
            {fiche.analyse.text && (
              <button type="button" onClick={speak}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-teal-500/40 text-teal-300 hover:bg-teal-500/10 transition-colors">
                {speaking ? <><Square size={12} /> Stop</> : <><Volume2 size={12} /> Écouter</>}
              </button>
            )}
            <button type="button" onClick={generateAnalyse} disabled={generating}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-teal-500/40 text-teal-300 hover:bg-teal-500/10 transition-colors disabled:opacity-50">
              {generating ? <><Loader2 size={12} className="animate-spin" /> Analyse…</> : (fiche.analyse.text ? "Régénérer" : "Générer l'analyse")}
            </button>
          </div>
        </div>
        {fiche.analyse.text ? (
          <p className="text-sm text-neutral-200 leading-relaxed">{fiche.analyse.text}</p>
        ) : (
          <p className="text-xs text-neutral-500">Génère une analyse d'environ 100 mots à partir des infos de la fiche (ChatGPT), avec lecture audio.</p>
        )}
      </div>

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
