"use client";

import { useState } from "react";
import FinancesView from "./FinancesView";
import QontoView from "./QontoView";

// Onglets de la page Finances : suivi manuel (Supabase) et données Qonto
// (export Google Sheets servi par /api/qonto).
export default function FinancesTabs() {
  const [tab, setTab] = useState<"suivi" | "qonto">("suivi");

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden">
        <button onClick={() => setTab("suivi")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${tab === "suivi" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
          Suivi
        </button>
        <button onClick={() => setTab("qonto")}
          className={`px-4 py-2 text-sm font-semibold transition-colors ${tab === "qonto" ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
          Qonto
        </button>
      </div>
      {tab === "suivi" ? <FinancesView /> : <QontoView />}
    </div>
  );
}
