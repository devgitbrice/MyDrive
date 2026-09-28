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

function StatutBadge({ statut }: { statut: string | null }) {
  const s = STATUTS.find((x) => x.key === statut);
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${s ? s.badge : "bg-neutral-500/15 text-neutral-400 border-neutral-500/30"}`}>
      {s ? s.label : statut || "—"}
    </span>
  );
}

export default function PrevisionnelView() {
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtres (panneau de gauche)
  const [mois, setMois] = useState<number | "tous">("tous");
  const [statuts, setStatuts] = useState<Set<string>>(new Set());
  const [nature, setNature] = useState<"toutes" | "pro" | "perso">("toutes");
  const [q, setQ] = useState("");

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
      if (mois !== "tous") {
        if (!l.date_echeance) return false;
        if (new Date(l.date_echeance + "T00:00:00").getMonth() !== mois) return false;
      }
      if (statuts.size > 0 && !statuts.has(l.statut || "")) return false;
      if (nature !== "toutes" && l.nature !== nature) return false;
      if (needle && !`${l.titre} ${l.destinataire || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [lignes, mois, statuts, nature, q]);

  const total = filtrees.reduce((s, l) => s + l.montant, 0);
  const totalRetard = filtrees.filter((l) => l.statut === "retard").reduce((s, l) => s + l.montant, 0);

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
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Mois</label>
          <select
            value={mois === "tous" ? "tous" : String(mois)}
            onChange={(e) => setMois(e.target.value === "tous" ? "tous" : Number(e.target.value))}
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500"
          >
            <option value="tous">Tous les mois</option>
            {MOIS.map((m, i) => <option key={m} value={i}>{m} 2026</option>)}
          </select>
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
      <div className="flex-1 w-full overflow-x-auto rounded-xl border border-neutral-800">
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
                <td className="px-3 py-2"><StatutBadge statut={l.statut} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
