"use client";

import { useEffect, useState } from "react";
import FinancesView from "./FinancesView";
import FormationView from "./FormationView";
import QontoView, { type QTx } from "./QontoView";
import ShopView from "./ShopView";
import { supabase } from "@/lib/supabaseClient";

// Onglets de la page Finances : suivi manuel (Supabase) et données Qonto
// (export Google Sheets servi par /api/qonto). Le chargement Qonto vit ici
// pour alimenter à la fois la barre de fraîcheur et l'onglet Qonto.
export default function FinancesTabs() {
  const [tab, setTab] = useState<"suivi" | "qonto" | "nm" | "gennn" | "perso" | "shop" | "formation">("suivi");
  const [txs, setTxs] = useState<QTx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bunqTxs, setBunqTxs] = useState<QTx[] | null>(null);
  const [bunqError, setBunqError] = useState<string | null>(null);
  const [bunqBalance, setBunqBalance] = useState<number | null>(null);
  const [gennnTxs, setGennnTxs] = useState<QTx[] | null>(null);
  const [gennnError, setGennnError] = useState<string | null>(null);
  const [nmTxs, setNmTxs] = useState<QTx[] | null>(null);
  const [nmError, setNmError] = useState<string | null>(null);
  const [nmBalance, setNmBalance] = useState<number | null>(null);
  const [gennnBalance, setGennnBalance] = useState<number | null>(null);
  const [nmAccounts, setNmAccounts] = useState<{ name: string; balance: number }[]>([]);
  const [gennnAccounts, setGennnAccounts] = useState<{ name: string; balance: number }[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [shopVendu, setShopVendu] = useState<number | null>(null);
  const [formationImminent, setFormationImminent] = useState<number | null>(null);

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
        if (typeof data.balance === "number") setGennnBalance(data.balance);
        if (Array.isArray(data.accounts)) setGennnAccounts(data.accounts);
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
        if (typeof data.balance === "number") setNmBalance(data.balance);
        if (Array.isArray(data.accounts)) setNmAccounts(data.accounts);
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
        if (typeof data.balance === "number") setBunqBalance(data.balance);
      } catch {
        if (alive) setBunqError("Impossible de charger les données bunq.");
      }
    })();
    // Montants Shop (articles vendus, en attente de paiement) et
    // Formation (paiement imminent), stockés dans le drive.
    (async () => {
      const { data } = await supabase
        .from("MyDrive")
        .select("title, content")
        .in("title", ["Shop — Articles", "Formation — Suivi"])
        .is("deleted_at", null);
      if (!alive || !data) return;
      for (const row of data) {
        try {
          const parsed = JSON.parse(row.content || "null");
          if (row.title === "Shop — Articles" && Array.isArray(parsed)) {
            setShopVendu(parsed.filter((i) => i.status === "vendu").reduce((s, i) => s + (Number(i.price) || 0), 0));
          }
          if (row.title === "Formation — Suivi" && parsed && typeof parsed.imminent === "number") {
            setFormationImminent(parsed.imminent);
          }
        } catch { /* contenu illisible : on ignore */ }
      }
      if (alive) setShopVendu((v) => v ?? 0);
    })();
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => { alive = false; clearInterval(tick); };
  }, []);

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
        <button onClick={() => setTab("formation")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${tab === "formation" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
          Formation
        </button>
      </div>
      {tab === "suivi" ? (
        <FinancesView
          liquidites={[
            { label: "Solde actuel compte Nouvo Media", value: nmBalance, error: nmError },
            { label: "Solde actuel compte Gennn", value: gennnBalance, error: gennnError },
            { label: "Solde actuel Perso (banque bunq)", value: bunqBalance, error: bunqError },
          ]}
          attendus={[
            { label: "Shop — en attente de paiement (vendus)", value: shopVendu },
            { label: "Formation — paiement imminent attendu", value: formationImminent },
          ]} />
      )
        : tab === "qonto" ? <QontoView txs={txs} error={error} />
        : tab === "nm" ? <QontoView txs={nmTxs} error={nmError} subtitle="compte Nouvo Media (API directe)" balance={nmBalance} accounts={nmAccounts} />
        : tab === "gennn" ? <QontoView txs={gennnTxs} error={gennnError} subtitle="compte Gennn" balance={gennnBalance} accounts={gennnAccounts} />
        : tab === "perso" ? <QontoView txs={bunqTxs} error={bunqError} subtitle="compte bunq perso" />
        : tab === "formation" ? <FormationView imminent={formationImminent} onSaved={setFormationImminent} />
        : <ShopView />}
    </div>
  );
}
