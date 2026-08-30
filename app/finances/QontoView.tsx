"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export interface QTx {
  id: string;
  date: string;
  label: string;
  amount: number;
  side: "credit" | "debit";
  status: string;
  category: string;
  subcategory: string;
  operationType: string;
  account: string;
  reference: string;
  note: string;
  attachments: string;
}

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MOIS_COURT = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const PAGE = 50;
const NON_CLASSE = "Non classé";
const STATUTS: [string, string][] = [["completed", "Réalisée"], ["pending", "En cours"], ["declined", "Refusée"]];
const STATUT_LABEL = Object.fromEntries(STATUTS);
const OP_LABEL: Record<string, string> = { card: "Carte", transfer: "Virement", income: "Encaissement", direct_debit: "Prélèvement", qonto_fee: "Frais Qonto" };

const cat = (t: QTx) => t.category || NON_CLASSE;
const subcat = (t: QTx) => t.subcategory || NON_CLASSE;

// Corrections manuelles de catégories, stockées dans un doc du drive
// (les données Qonto venant du Sheet sont en lecture seule).
type Override = { category?: string; subcategory?: string; contextNote?: string; project?: string };
const OVERRIDES_TITLE = "Qonto — Catégories corrigées";

export default function QontoView({ txs, error, subtitle = "compte Nouvo Media", balance = null }: { txs: QTx[] | null; error: string | null; subtitle?: string; balance?: number | null }) {
  const [year, setYear] = useState<string>("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  // Filtres : on stocke ce qui est DÉSACTIVÉ, pour que tout soit actif par
  // défaut (y compris les catégories découvertes plus tard) sans effet.
  const [offSides, setOffSides] = useState<Set<string>>(new Set());
  const [offStatuts, setOffStatuts] = useState<Set<string>>(new Set());
  const [offCats, setOffCats] = useState<Set<string>>(new Set());
  const [offSubcats, setOffSubcats] = useState<Set<string>>(new Set());
  const [offMois, setOffMois] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [ovDocId, setOvDocId] = useState<string | null>(null);
  const [rapports, setRapports] = useState<{ id: string; title: string }[]>([]);

  // Liste des rapports financiers (dossier Finances/Rapports du drive).
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: folder } = await supabase
        .from("MyDrive")
        .select("id")
        .eq("title", "Rapports")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!alive || !folder) return;
      const { data: docs } = await supabase
        .from("MyDrive")
        .select("id, title, created_at")
        .eq("parent_id", folder.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (alive && docs) setRapports(docs);
    })();
    return () => { alive = false; };
  }, []);

  // Charge les corrections de catégories depuis le drive.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("MyDrive")
        .select("id, content")
        .eq("title", OVERRIDES_TITLE)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!alive || !data) return;
      setOvDocId(data.id);
      try { setOverrides(JSON.parse(data.content || "{}")); } catch { /* contenu illisible : on repart de zéro */ }
    })();
    return () => { alive = false; };
  }, []);

  // Applique les corrections par-dessus les données du Sheet.
  const data = useMemo(() => {
    if (!txs) return null;
    return txs.map((t) => {
      const o = overrides[t.id];
      return o ? { ...t, category: o.category ?? t.category, subcategory: o.subcategory ?? t.subcategory } : t;
    });
  }, [txs, overrides]);

  const setOverride = useCallback(async (tx: QTx, patch: Partial<Override>) => {
    const next = { ...overrides, [tx.id]: { ...overrides[tx.id], ...patch } };
    setOverrides(next);
    const content = JSON.stringify(next);
    if (ovDocId) {
      await supabase.from("MyDrive").update({ content }).eq("id", ovDocId);
    } else {
      const { data: doc } = await supabase
        .from("MyDrive")
        .insert({ title: OVERRIDES_TITLE, content, observation: "Corrections manuelles des catégories Qonto (page Finances).", image_path: "", image_url: "", doc_type: "doc", parent_id: null })
        .select("id")
        .single();
      if (doc) setOvDocId(doc.id);
    }
  }, [overrides, ovDocId]);

  const years = useMemo(() => (data ? [...new Set(data.map((t) => t.date.slice(0, 4)))].sort() : []), [data]);
  // Tant que l'utilisateur n'a rien choisi, l'année la plus récente est active.
  const activeYear = year || years[years.length - 1] || "";

  // Transactions de l'année (refusées exclues des totaux, affichées barrées)
  const ofYear = useMemo(() => (data || []).filter((t) => t.date.startsWith(activeYear)), [data, activeYear]);
  const ok = useMemo(() => ofYear.filter((t) => t.status !== "declined"), [ofYear]);

  const totals = useMemo(() => {
    let credit = 0, debit = 0;
    for (const t of ok) { if (t.side === "credit") credit += t.amount; else debit += t.amount; }
    return { credit, debit, net: credit - debit };
  }, [ok]);

  const monthly = useMemo(() => {
    const m = new Map<number, { credit: number; debit: number; n: number }>();
    for (const t of ok) {
      const k = parseInt(t.date.slice(5, 7), 10) - 1;
      const v = m.get(k) || { credit: 0, debit: 0, n: 0 };
      if (t.side === "credit") v.credit += t.amount; else v.debit += t.amount;
      v.n++;
      m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [ok]);

  const cats = useMemo(() => facet(ofYear, cat), [ofYear]);
  const subcats = useMemo(() => facet(ofYear, subcat), [ofYear]);
  // Choix proposés dans la pop-up : toutes les catégories connues, toutes années.
  const allCats = useMemo(() => (data ? [...new Set(data.map(cat))].sort((a, b) => a.localeCompare(b, "fr")) : []), [data]);
  const allSubcats = useMemo(() => (data ? [...new Set(data.map(subcat))].sort((a, b) => a.localeCompare(b, "fr")) : []), [data]);
  // Mois présents dans l'année affichée ("01".."12") avec leur nombre
  // d'opérations, ordre calendaire.
  const moisDispo = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of ofYear) {
      const k = t.date.slice(5, 7);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ofYear]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ofYear
      .filter((t) =>
        !offMois.has(t.date.slice(5, 7)) &&
        !offSides.has(t.side) && !offStatuts.has(t.status) &&
        !offCats.has(cat(t)) && !offSubcats.has(subcat(t)) &&
        (!q || t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) ||
          t.reference.toLowerCase().includes(q) || t.note.toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [ofYear, query, offMois, offSides, offStatuts, offCats, offSubcats]);

  const move = useCallback((delta: number) => {
    setSelected((s) => {
      if (s === null) return s;
      const next = s + delta;
      return next >= 0 && next < filtered.length ? next : s;
    });
  }, [filtered.length]);

  // Navigation clavier dans la pop-up (← → et Échap).
  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") move(-1);
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, move]);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return <p className="text-neutral-500 text-sm">Chargement des données Qonto…</p>;

  const current = selected !== null ? filtered[selected] : null;

  return (
    <div className="flex flex-col xl:flex-row gap-6">
    <div className="flex-1 min-w-0 space-y-6">
      {/* Années */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden">
          {years.map((y) => (
            <button key={y} onClick={() => { setYear(y); setLimit(PAGE); setSelected(null); }}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${activeYear === y ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
              {y}
            </button>
          ))}
        </div>
        <span className="text-xs text-neutral-500">{ok.length} transactions · {subtitle}</span>
      </div>

      {/* Cartes synthèse */}
      <div className={`grid grid-cols-2 gap-3 ${balance !== null ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {balance !== null && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Solde actuel (tous comptes)</div>
            <div className="text-lg font-bold tabular-nums text-white">{eur(balance)}</div>
          </div>
        )}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Encaissements</div>
          <div className="text-lg font-bold tabular-nums text-green-400">{eur(totals.credit)}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Dépenses</div>
          <div className="text-lg font-bold tabular-nums text-red-400">{eur(totals.debit)}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Net {activeYear}</div>
          <div className={`text-lg font-bold tabular-nums ${totals.net >= 0 ? "text-white" : "text-red-400"}`}>{eur(totals.net)}</div>
        </div>
      </div>

      {/* Détail mensuel */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Détail mensuel</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm border-collapse min-w-[420px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                <th className="p-2.5">Mois</th>
                <th className="p-2.5 text-right">Encaissements</th>
                <th className="p-2.5 text-right">Dépenses</th>
                <th className="p-2.5 text-right">Net</th>
                <th className="p-2.5 text-right">Tx</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map(([m, v]) => (
                <tr key={m} className="border-b border-neutral-900">
                  <td className="p-2.5">{MOIS[m]}</td>
                  <td className="p-2.5 text-right tabular-nums text-green-400">{eur(v.credit)}</td>
                  <td className="p-2.5 text-right tabular-nums text-red-400">{eur(v.debit)}</td>
                  <td className={`p-2.5 text-right tabular-nums font-semibold ${v.credit - v.debit >= 0 ? "text-white" : "text-red-400"}`}>{eur(v.credit - v.debit)}</td>
                  <td className="p-2.5 text-right tabular-nums text-neutral-400">{v.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Transactions : barre de filtres à gauche + liste (largeur inchangée) */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Transactions {activeYear}</h2>
        {/* Sélection des mois affichés */}
        <div className="flex flex-wrap items-center gap-1 mb-3">
          {moisDispo.map(([m, n]) => {
            const active = !offMois.has(m);
            return (
              <button key={m} onClick={() => { setOffMois(toggle(offMois, m)); setLimit(PAGE); setSelected(null); }}
                className={`flex flex-col items-center px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${active ? "border-blue-500/50 bg-blue-500/10 text-blue-200" : "border-neutral-800 bg-neutral-900 text-neutral-500 hover:text-neutral-300"}`}>
                <span>{MOIS_COURT[parseInt(m, 10) - 1]}</span>
                <span className={`text-[10px] font-normal tabular-nums ${active ? "text-blue-300/60" : "text-neutral-600"}`}>{n} op.</span>
              </button>
            );
          })}
          <button onClick={() => {
              const allOff = moisDispo.every(([m]) => offMois.has(m));
              setOffMois(allOff ? new Set() : new Set(moisDispo.map(([m]) => m)));
              setLimit(PAGE); setSelected(null);
            }}
            className="ml-1 text-[10px] text-neutral-600 hover:text-neutral-300 underline underline-offset-2">
            {moisDispo.every(([m]) => offMois.has(m)) ? "Tout cocher" : "Tout décocher"}
          </button>
        </div>
        <div className="flex flex-col xl:flex-row gap-4">
          <aside className="shrink-0 xl:w-56 xl:-ml-60 space-y-4">
            <FilterGroup title="Sens"
              items={[["credit", "Encaissements"], ["debit", "Dépenses"]]}
              off={offSides} onToggle={(v) => setOffSides(toggle(offSides, v))} onSetAll={setOffSides} />
            <FilterGroup title="Opération"
              items={STATUTS}
              off={offStatuts} onToggle={(v) => setOffStatuts(toggle(offStatuts, v))} onSetAll={setOffStatuts} />
            <FilterGroup title="Catégories générales"
              items={cats.map(([k, n]) => [k, `${k} (${n})`])}
              off={offCats} onToggle={(v) => setOffCats(toggle(offCats, v))} onSetAll={setOffCats} />
            <FilterGroup title="Catégories comptables"
              items={subcats.map(([k, n]) => [k, `${k} (${n})`])}
              off={offSubcats} onToggle={(v) => setOffSubcats(toggle(offSubcats, v))} onSetAll={setOffSubcats} />
          </aside>

          <div className="flex-1 min-w-0">
            <div className="relative mb-3">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); setSelected(null); }} placeholder="Rechercher une contrepartie ou une catégorie…"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
            </div>
            <ul className="space-y-1">
              {filtered.length === 0 && <li className="text-sm text-neutral-600">Aucune transaction.</li>}
              {filtered.slice(0, limit).map((t, i) => (
                <li key={i}>
                  <button onClick={() => setSelected(i)}
                    className={`w-full text-left rounded-lg border border-neutral-800 bg-neutral-900/40 hover:border-neutral-600 px-2.5 py-2 ${t.status === "declined" ? "opacity-40" : ""}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-neutral-500 shrink-0 w-24">
                        {new Date(t.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                        <span className="text-neutral-600"> {new Date(t.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                      </span>
                      <span className={`flex-1 min-w-0 truncate text-sm text-neutral-200 ${t.status === "declined" ? "line-through" : ""}`}>
                        {t.label}
                        {t.category ? <span className="text-neutral-500"> · {t.category}</span> : null}
                      </span>
                      {t.status === "pending" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">En cours</span>}
                      {t.status === "declined" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 shrink-0">Refusée</span>}
                      <span className={`text-sm font-semibold tabular-nums shrink-0 ${t.side === "credit" ? "text-green-400" : "text-red-400"}`}>
                        {t.side === "credit" ? "+" : "−"}{eur(t.amount)}
                      </span>
                    </div>
                    {(t.reference || t.note || t.attachments) && (
                      <div className="mt-1 ml-[6.75rem] space-y-0.5 text-xs text-neutral-500">
                        {t.reference && <div className="truncate" title={t.reference}>Réf : {t.reference}</div>}
                        {t.note && <div className="truncate" title={t.note}>Note : {t.note}</div>}
                        {t.attachments && (
                          <div className="truncate flex items-center gap-1" title={t.attachments}>
                            <Paperclip size={11} className="shrink-0" />
                            <span className="truncate">{t.attachments}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {filtered.length > limit && (
              <button onClick={() => setLimit((l) => l + 200)}
                className="mt-3 w-full py-2 text-sm text-neutral-300 hover:text-white border border-neutral-700 rounded-lg">
                Voir plus ({filtered.length - limit} restantes)
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Pop-up détail d'une opération */}
      {current && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-white truncate">{current.label}</div>
                <div className="text-xs text-neutral-500">
                  {new Date(current.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  {" à "}{new Date(current.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-neutral-500 hover:text-white shrink-0"><X size={18} /></button>
            </div>
            <div className={`text-2xl font-bold tabular-nums mb-4 ${current.side === "credit" ? "text-green-400" : "text-red-400"}`}>
              {current.side === "credit" ? "+" : "−"}{eur(current.amount)}
            </div>
            <dl className="space-y-2 text-sm">
              <Row k="Statut" v={STATUT_LABEL[current.status] || current.status} />
              <Row k="Type" v={OP_LABEL[current.operationType] || current.operationType} />
              <Row k="Compte" v={current.account} />
            </dl>
            <div className="mt-3 space-y-3">
              <CatPicker label="Catégorie générale" value={cat(current)} options={allCats}
                onPick={(v) => setOverride(current, { category: v === NON_CLASSE ? "" : v })} />
              <CatPicker label="Catégorie comptable" value={subcat(current)} options={allSubcats}
                onPick={(v) => setOverride(current, { subcategory: v === NON_CLASSE ? "" : v })} />
              <NoteEditor key={current.id} value={overrides[current.id]?.contextNote || ""}
                onSave={(v) => setOverride(current, { contextNote: v })} />
              <div className="flex gap-3 items-baseline text-sm">
                <span className="w-40 shrink-0 text-neutral-500">Projet associé</span>
                <span className="text-neutral-400">{overrides[current.id]?.project || "—"}</span>
                <span className="text-[10px] text-neutral-600">(bientôt éditable)</span>
              </div>
            </div>
            <dl className="space-y-2 text-sm mt-3">
              {current.reference && <Row k="Référence" v={current.reference} />}
              {current.note && <Row k="Note interne" v={current.note} />}
              {current.attachments && <Row k="Justificatifs" v={current.attachments} />}
            </dl>
            <div className="flex items-center justify-between mt-5">
              <button onClick={() => move(-1)} disabled={selected === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-700 text-neutral-300 hover:text-white disabled:opacity-30">
                <ChevronLeft size={15} /> Précédente
              </button>
              <span className="text-xs text-neutral-500">{(selected ?? 0) + 1} / {filtered.length}</span>
              <button onClick={() => move(1)} disabled={selected === filtered.length - 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-neutral-700 text-neutral-300 hover:text-white disabled:opacity-30">
                Suivante <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Rapports financiers, à droite des infos */}
    <aside className="shrink-0 xl:w-56 xl:-mr-60">
      <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Rapports</h2>
      {rapports.length === 0 && <p className="text-xs text-neutral-600">Aucun rapport pour le moment.</p>}
      <ul className="space-y-1.5">
        {rapports.map((r) => (
          <li key={r.id}>
            <a href={`/editdoc/${r.id}`}
              className="block text-sm text-teal-400 hover:text-teal-300 rounded-lg border border-neutral-800 bg-neutral-900/40 hover:border-neutral-600 px-2.5 py-2">
              {r.title}
            </a>
          </li>
        ))}
      </ul>
    </aside>
    </div>
  );
}

function facet(list: QTx[], get: (t: QTx) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const t of list) m.set(get(t), (m.get(get(t)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function toggle(s: Set<string>, v: string): Set<string> {
  const next = new Set(s);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}

function FilterGroup({ title, items, off, onToggle, onSetAll }: {
  title: string;
  items: [string, string][];
  off: Set<string>;
  onToggle: (v: string) => void;
  onSetAll: (off: Set<string>) => void;
}) {
  const allOff = items.length > 0 && items.every(([v]) => off.has(v));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{title}</h3>
        <button onClick={() => onSetAll(allOff ? new Set() : new Set(items.map(([v]) => v)))}
          className="text-[10px] text-neutral-600 hover:text-neutral-300 underline underline-offset-2 shrink-0">
          {allOff ? "Tout cocher" : "Tout décocher"}
        </button>
      </div>
      <div className="flex flex-wrap xl:flex-col gap-1">
        {items.map(([v, label]) => {
          const active = !off.has(v);
          return (
            <button key={v} onClick={() => onToggle(v)}
              className={`text-left text-xs px-2 py-1 rounded-md border transition-colors ${active ? "border-blue-500/50 bg-blue-500/10 text-blue-200" : "border-neutral-800 bg-neutral-900 text-neutral-500 hover:text-neutral-300"}`}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CatPicker({ label, value, options, onPick }: {
  label: string;
  value: string;
  options: string[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm">
      <div className="flex gap-3 items-baseline">
        <span className="w-40 shrink-0 text-neutral-500">{label}</span>
        <button onClick={() => setOpen((o) => !o)}
          className="min-w-0 text-left px-2 py-0.5 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20">
          {value} <span className="text-blue-400/60 text-xs">{open ? "▴" : "▾"}</span>
        </button>
      </div>
      {open && (
        <div className="mt-2 ml-[10.75rem] flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
          {options.map((o) => (
            <button key={o} onClick={() => { onPick(o); setOpen(false); }}
              className={`text-xs px-2 py-1 rounded-md border transition-colors ${o === value ? "border-blue-500/50 bg-blue-500/10 text-blue-200" : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-500"}`}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NoteEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  const dirty = text !== value;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-40 shrink-0 text-neutral-500 pt-1">Notes de contexte</span>
      <div className="flex-1 min-w-0">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
          placeholder="Décrire à quoi correspond cette dépense…"
          className="w-full bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500 resize-y" />
        {dirty && (
          <button onClick={() => onSave(text)}
            className="mt-1 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md">
            Enregistrer
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-40 shrink-0 text-neutral-500">{k}</dt>
      <dd className="min-w-0 text-neutral-200 break-words">{v}</dd>
    </div>
  );
}
