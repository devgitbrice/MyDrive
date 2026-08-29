"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

interface QTx {
  date: string;
  label: string;
  amount: number;
  side: "credit" | "debit";
  status: string;
  category: string;
  account: string;
}

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const PAGE = 50;

export default function QontoView() {
  const [txs, setTxs] = useState<QTx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<string>("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/qonto");
        const data = await res.json();
        if (!alive) return;
        if (!data.ok) { setError(data.error || "Erreur de chargement"); return; }
        const list: QTx[] = data.transactions;
        setTxs(list);
        const years = [...new Set(list.map((t) => t.date.slice(0, 4)))].sort();
        setYear(years[years.length - 1] || "");
      } catch {
        if (alive) setError("Impossible de charger les données Qonto.");
      }
    })();
    return () => { alive = false; };
  }, []);

  const years = useMemo(() => (txs ? [...new Set(txs.map((t) => t.date.slice(0, 4)))].sort() : []), [txs]);

  // Transactions de l'année (refusées exclues des totaux, affichées barrées)
  const ofYear = useMemo(() => (txs || []).filter((t) => t.date.startsWith(year)), [txs, year]);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? ofYear.filter((t) => t.label.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) : ofYear;
    return [...base].sort((a, b) => b.date.localeCompare(a.date));
  }, [ofYear, query]);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!txs) return <p className="text-neutral-500 text-sm">Chargement des données Qonto…</p>;

  return (
    <div className="space-y-6">
      {/* Années */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden">
          {years.map((y) => (
            <button key={y} onClick={() => { setYear(y); setLimit(PAGE); }}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${year === y ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
              {y}
            </button>
          ))}
        </div>
        <span className="text-xs text-neutral-500">{ok.length} transactions · compte Nouvo Media</span>
      </div>

      {/* Cartes synthèse */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Encaissements</div>
          <div className="text-lg font-bold tabular-nums text-green-400">{eur(totals.credit)}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Dépenses</div>
          <div className="text-lg font-bold tabular-nums text-red-400">{eur(totals.debit)}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Net {year}</div>
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

      {/* Liste des transactions */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Transactions {year}</h2>
        <div className="relative mb-3">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Rechercher une contrepartie ou une catégorie…"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
        </div>
        <ul className="space-y-1">
          {filtered.length === 0 && <li className="text-sm text-neutral-600">Aucune transaction.</li>}
          {filtered.slice(0, limit).map((t, i) => (
            <li key={i} className={`flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-2.5 py-2 ${t.status === "declined" ? "opacity-40" : ""}`}>
              <span className="text-xs text-neutral-500 shrink-0 w-16">{new Date(t.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
              <span className={`flex-1 min-w-0 truncate text-sm text-neutral-200 ${t.status === "declined" ? "line-through" : ""}`}>
                {t.label}
                {t.category ? <span className="text-neutral-500"> · {t.category}</span> : null}
              </span>
              {t.status === "pending" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">En cours</span>}
              {t.status === "declined" && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 shrink-0">Refusée</span>}
              <span className={`text-sm font-semibold tabular-nums shrink-0 ${t.side === "credit" ? "text-green-400" : "text-red-400"}`}>
                {t.side === "credit" ? "+" : "−"}{eur(t.amount)}
              </span>
            </li>
          ))}
        </ul>
        {filtered.length > limit && (
          <button onClick={() => setLimit((l) => l + 200)}
            className="mt-3 w-full py-2 text-sm text-neutral-300 hover:text-white border border-neutral-700 rounded-lg">
            Voir plus ({filtered.length - limit} restantes)
          </button>
        )}
      </section>
    </div>
  );
}
