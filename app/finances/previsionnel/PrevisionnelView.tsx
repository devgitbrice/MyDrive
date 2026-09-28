"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Prévisionnel 2026 : lignes de la table Supabase mydrive_finance_previsionnel,
// avec un panneau de filtres à gauche (mois, statut, nature, recherche).
interface Ligne {
  id: string;
  titre: string;
  nature: string | null;
  destinataire: string | null;
  montant: number;
  date_echeance: string | null;
  date_paiement: string | null;
  statut: string | null;
}

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const STATUTS: { key: string; label: string; badge: string }[] = [
  { key: "paye", label: "Payé", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { key: "retard", label: "En retard", badge: "bg-red-500/15 text-red-400 border-red-500/30" },
  { key: "a_payer", label: "À payer", badge: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { key: "pas_encore_echu", label: "Pas encore échu", badge: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30" },
];

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);
const fdate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR") : "—");

// Statut modifiable directement dans le tableau : le badge est un <select>
// stylé comme un badge, la sauvegarde part vers Supabase à chaque changement.
function StatutSelect({ statut, onChange, saving }: { statut: string | null; onChange: (s: string) => void; saving: boolean }) {
  const s = STATUTS.find((x) => x.key === statut);
  return (
    <select
      value={s ? s.key : ""}
      disabled={saving}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className={`appearance-none cursor-pointer px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-sky-500 ${saving ? "opacity-50" : ""} ${s ? s.badge : "bg-neutral-500/15 text-neutral-400 border-neutral-500/30"}`}
    >
      {!s && <option value="">—</option>}
      {STATUTS.map((x) => (
        <option key={x.key} value={x.key} className="bg-neutral-900 text-neutral-100">{x.label}</option>
      ))}
    </select>
  );
}

export default function PrevisionnelView() {
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtres (panneau de gauche)
  const [mois, setMois] = useState<Set<number>>(new Set());
  const [statuts, setStatuts] = useState<Set<string>>(new Set());
  const [nature, setNature] = useState<"toutes" | "pro" | "perso">("toutes");
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("mydrive_finance_previsionnel")
        .select("id, titre, nature, destinataire, montant, date_echeance, date_paiement, statut")
        .order("date_echeance", { ascending: true })
        .order("montant", { ascending: false });
      if (!alive) return;
      if (error) { setError("Impossible de charger le prévisionnel."); return; }
      setLignes((data || []).map((r: any) => ({ ...r, montant: Number(r.montant) || 0 })));
    })();
    return () => { alive = false; };
  }, []);

  const filtrees = useMemo(() => {
    if (!lignes) return [];
    const needle = q.trim().toLowerCase();
    return lignes.filter((l) => {
      if (mois.size > 0) {
        if (!l.date_echeance) return false;
        if (!mois.has(new Date(l.date_echeance + "T00:00:00").getMonth())) return false;
      }
      if (statuts.size > 0 && !statuts.has(l.statut || "")) return false;
      if (nature !== "toutes" && l.nature !== nature) return false;
      if (needle && !`${l.titre} ${l.destinataire || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [lignes, mois, statuts, nature, q]);

  const total = filtrees.reduce((s, l) => s + l.montant, 0);
  const totalRetard = filtrees.filter((l) => l.statut === "retard").reduce((s, l) => s + l.montant, 0);

  // Changement manuel du statut d'une ligne : mise à jour optimiste puis
  // sauvegarde Supabase. Passer en « payé » renseigne la date de paiement
  // (aujourd'hui) si elle est vide ; en sortir la remet à vide.
  const changeStatut = async (l: Ligne, statut: string) => {
    const date_paiement = statut === "paye" ? (l.date_paiement || new Date().toISOString().slice(0, 10)) : null;
    const prev = lignes;
    setSaveError(null);
    setSavingId(l.id);
    setLignes((cur) => (cur || []).map((x) => (x.id === l.id ? { ...x, statut, date_paiement } : x)));
    const { error } = await supabase
      .from("mydrive_finance_previsionnel")
      .update({ statut, date_paiement })
      .eq("id", l.id);
    setSavingId(null);
    if (error) {
      setLignes(prev);
      setSaveError("Impossible d'enregistrer le statut (droits ou connexion).");
    }
  };

  const toggleStatut = (key: string) => {
    setStatuts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!lignes) return <p className="text-neutral-500 text-sm">Chargement…</p>;

  return (
    <div className="flex flex-col md:flex-row gap-5 items-start">
      {/* ---- Panneau de filtres (gauche) ---- */}
      <aside className="w-full md:w-60 shrink-0 md:sticky md:top-4 space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Recherche</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Titre, destinataire…"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 pl-8 pr-3 py-1.5 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Mois</label>
            {mois.size > 0 && (
              <button onClick={() => setMois(new Set())} className="text-[11px] text-sky-400 hover:text-sky-300">
                Tout effacer
              </button>
            )}
          </div>
          {/* Sélection multiple : chaque mois est une pastille cliquable. */}
          <div className="grid grid-cols-3 gap-1.5">
            {MOIS.map((m, i) => {
              const on = mois.has(i);
              return (
                <button
                  key={m}
                  onClick={() => setMois((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })}
                  className={`px-1 py-1 rounded-md border text-[11px] font-medium transition-colors ${on
                    ? "bg-sky-500/20 border-sky-500/50 text-sky-300"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white"}`}
                >
                  {m.slice(0, 4)}{m.length > 4 ? "." : ""}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-500">
            {mois.size === 0 ? "Tous les mois 2026" : [...mois].sort((a, b) => a - b).map((i) => MOIS[i]).join(", ")}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Statut</label>
          <div className="space-y-1.5">
            {STATUTS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={statuts.has(s.key)}
                  onChange={() => toggleStatut(s.key)}
                  className="accent-sky-500"
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Nature</label>
          <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden text-sm">
            {(["toutes", "pro", "perso"] as const).map((n) => (
              <button
                key={n}
                onClick={() => setNature(n)}
                className={`px-3 py-1.5 capitalize transition-colors ${nature === n ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-3 space-y-1 text-sm">
          <p className="text-neutral-400">{filtrees.length} ligne{filtrees.length > 1 ? "s" : ""}</p>
          <p className="text-neutral-200 font-semibold">Total : {eur(total)}</p>
          {totalRetard > 0 && <p className="text-red-400">dont en retard : {eur(totalRetard)}</p>}
        </div>
      </aside>

      {/* ---- Tableau (droite) ---- */}
      <div className="flex-1 w-full space-y-2">
        {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-900 text-neutral-400 text-left">
              <th className="px-3 py-2 font-medium">Titre</th>
              <th className="px-3 py-2 font-medium">Destinataire</th>
              <th className="px-3 py-2 font-medium">Nature</th>
              <th className="px-3 py-2 font-medium text-right">Montant</th>
              <th className="px-3 py-2 font-medium">Échéance</th>
              <th className="px-3 py-2 font-medium">Payé le</th>
              <th className="px-3 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {filtrees.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-neutral-500">Aucune ligne ne correspond aux filtres.</td></tr>
            )}
            {filtrees.map((l) => (
              <tr key={l.id} className="border-t border-neutral-800/70 hover:bg-neutral-900/50">
                <td className="px-3 py-2 text-neutral-100">{l.titre}</td>
                <td className="px-3 py-2 text-neutral-400">{l.destinataire || "—"}</td>
                <td className="px-3 py-2">
                  <span className={`text-[11px] font-medium uppercase ${l.nature === "pro" ? "text-sky-400" : "text-violet-400"}`}>{l.nature || "—"}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-100">{eur(l.montant)}</td>
                <td className="px-3 py-2 text-neutral-300 whitespace-nowrap">{fdate(l.date_echeance)}</td>
                <td className="px-3 py-2 text-neutral-400 whitespace-nowrap">{fdate(l.date_paiement)}</td>
                <td className="px-3 py-2"><StatutSelect statut={l.statut} saving={savingId === l.id} onChange={(s) => changeStatut(l, s)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
