"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Suivi Formation : pour l'instant un montant « paiement imminent
// attendu », modifiable, stocké en JSON dans un doc du drive.
const DOC_TITLE = "Formation — Suivi";

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

export default function FormationView({ imminent, onSaved }: { imminent: number | null; onSaved: (v: number) => void }) {
  const [docId, setDocId] = useState<string | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("MyDrive")
        .select("id")
        .eq("title", DOC_TITLE)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (alive && data) setDocId(data.id);
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    const v = parseFloat(text.replace(",", "."));
    if (isNaN(v)) return;
    const content = JSON.stringify({ imminent: v, updatedAt: new Date().toISOString() });
    if (docId) {
      await supabase.from("MyDrive").update({ content }).eq("id", docId);
    } else {
      const { data } = await supabase
        .from("MyDrive")
        .insert({ title: DOC_TITLE, content, observation: "Montants de l'onglet Formation (page Finances).", image_path: "", image_url: "", doc_type: "doc", parent_id: null })
        .select("id")
        .single();
      if (data) setDocId(data.id);
    }
    onSaved(v);
    setText("");
  };

  return (
    <div className="space-y-6">
      <div className="max-w-sm rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Paiement imminent attendu</div>
        <div className="text-2xl font-bold tabular-nums text-green-400 mb-3">
          {imminent != null ? eur(imminent) : "—"}
        </div>
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nouveau montant €" inputMode="decimal"
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            className="flex-1 min-w-0 bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
          <button onClick={save} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md">
            Enregistrer
          </button>
        </div>
      </div>
      <p className="text-xs text-neutral-600">Section à compléter — dites à Claude ce que vous voulez suivre ici (sessions, clients, factures émises…).</p>
    </div>
  );
}
