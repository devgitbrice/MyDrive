"use client";

import { useEffect, useMemo, useState } from "react";
import FinancesView from "./FinancesView";
import QontoView, { type QTx } from "./QontoView";
import ShopView from "./ShopView";

// Onglets de la page Finances : suivi manuel (Supabase) et données Qonto
// (export Google Sheets servi par /api/qonto). Le chargement Qonto vit ici
// pour alimenter à la fois la barre de fraîcheur et l'onglet Qonto.
export default function FinancesTabs() {
  const [tab, setTab] = useState<"suivi" | "qonto" | "nm" | "gennn" | "perso" | "shop">("suivi");
  const [txs, setTxs] = useState<QTx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bunqTxs, setBunqTxs] = useState<QTx[] | null>(null);
  const [bunqError, setBunqError] = useState<string | null>(null);
  const [gennnTxs, setGennnTxs] = useState<QTx[] | null>(null);
  const [gennnError, setGennnError] = useState<string | null>(null);
  const [nmTxs, setNmTxs] = useState<QTx[] | null>(null);
  const [nmError, setNmError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/qonto");
        const data = await res.json();
        if (!alive) return;
        if (!data.ok) { setError(data.error || "Erreur de chargement"); return; }
        setTxs(data.transactions);
        setFetchedAt(data.fetchedAt || null);
      } catch {
        if (alive) setError("Impossible de charger les données Qonto.");
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/qonto?src=gennn");
        const data = await res.json();
        if (!alive) return;
        if (!data.ok) { setGennnError(data.error || "Erreur de chargement"); return; }
        setGennnTxs(data.transactions);
      } catch {
        if (alive) setGennnError("Impossible de charger les données Qonto Gennn.");
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/qonto?src=nm");
        const data = await res.json();
        if (!alive) return;
        if (!data.ok) { setNmError(data.error || "Erreur de chargement"); return; }
        setNmTxs(data.transactions);
      } catch {
        if (alive) setNmError("Impossible de charger les données Qonto Nouvo Media (new).");
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/bunq");
        const data = await res.json();
        if (!alive) return;
        if (!data.ok) { setBunqError(data.error || "Erreur de chargement bunq"); return; }
        setBunqTxs(data.transactions);
      } catch {
        if (alive) setBunqError("Impossible de charger les données bunq.");
      }
    })();
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => { alive = false; clearInterval(tick); };
  }, []);

  // Net bunq de l'année en cours, affiché sur l'onglet Suivi.
  const bunqNet = useMemo(() => {
    if (!bunqTxs) return null;
    const year = String(new Date().getFullYear());
    return bunqTxs
      .filter((t) => t.date.startsWith(year))
      .reduce((s, t) => s + (t.side === "credit" ? t.amount : -t.amount), 0);
  }, [bunqTxs]);

  const maj = fetchedAt ? new Date(fetchedAt) : null;
  const minutes = maj ? Math.max(0, Math.floor((now - maj.getTime()) / 60_000)) : null;

  return (
    <div className="space-y-5">
      {maj && (
        <p className="text-xs text-neutral-500">
          Dernière mise à jour : {maj.toLocaleDateString("fr-FR")} {maj.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          {minutes !== null && <> — il y a {minutes} min</>}
          <span className="text-neutral-700"> | </span>
          {new Date(now).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden">
        <button onClick={() => setTab("suivi")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${tab === "suivi" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
          Suivi
        </button>
        <button onClick={() => setTab("qonto")}
          className={`px-4 py-2 text-sm font-semibold transition-colors flex flex-col items-center leading-tight ${tab === "qonto" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
          <span>Qonto</span>
          <span className={`text-[10px] font-normal ${tab === "qonto" ? "text-neutral-300" : "text-neutral-500"}`}>Nouvo Media</span>
        </button>
        <button onClick={() => setTab("nm")}
          className={`px-4 py-2 text-sm font-semibold transition-colors flex flex-col items-center leading-tight ${tab === "nm" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
          <span>Qonto</span>
          <span className={`text-[10px] font-normal ${tab === "nm" ? "text-neutral-300" : "text-neutral-500"}`}>Nouvo Media (new)</span>
        </button>
        <button onClick={() => setTab("gennn")}
          className={`px-4 py-2 text-sm font-semibold transition-colors flex flex-col items-center leading-tight ${tab === "gennn" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
          <span>Qonto</span>
          <span className={`text-[10px] font-normal ${tab === "gennn" ? "text-neutral-300" : "text-neutral-500"}`}>Gennn</span>
        </button>
        <button onClick={() => setTab("perso")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${tab === "perso" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
          Perso
        </button>
        <button onClick={() => setTab("shop")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${tab === "shop" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
          Shop
        </button>
      </div>
      {tab === "suivi" ? <FinancesView bunqNet={bunqNet} bunqError={bunqError} />
        : tab === "qonto" ? <QontoView txs={txs} error={error} />
        : tab === "nm" ? <QontoView txs={nmTxs} error={nmError} subtitle="compte Nouvo Media (API directe)" />
        : tab === "gennn" ? <QontoView txs={gennnTxs} error={gennnError} subtitle="compte Gennn" />
        : tab === "perso" ? <QontoView txs={bunqTxs} error={bunqError} subtitle="compte bunq perso" />
        : <ShopView />}
    </div>
  );
}
