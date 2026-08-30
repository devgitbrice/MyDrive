"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Liste des dettes pro et perso, stockée en JSON dans un doc du drive.
export interface Dette {
  id: string;
  label: string;
  amount: number;
  scope: "pro" | "perso";
  soldee: boolean;
  createdAt: string;
  soldeeAt?: string;
}

export const DETTES_DOC_TITLE = "Dettes — Liste";
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

export default function DettesView() {
  const [dettes, setDettes] = useState<Dette[] | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [scope, setScope] = useState<"pro" | "perso">("pro");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("MyDrive")
        .select("id, content")
        .eq("title", DETTES_DOC_TITLE)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setDocId(data.id);
        try { setDettes(JSON.parse(data.content || "[]")); } catch { setDettes([]); }
      } else {
        setDettes([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  const persist = useCallback(async (next: Dette[]) => {
    setDettes(next);
    const content = JSON.stringify(next);
    if (docId) {
      await supabase.from("MyDrive").update({ content }).eq("id", docId);
    } else {
      const { data } = await supabase
        .from("MyDrive")
        .insert({ title: DETTES_DOC_TITLE, content, observation: "Liste des dettes pro et perso (page Finances).", image_path: "", image_url: "", doc_type: "doc", parent_id: null })
        .select("id")
        .single();
      if (data) setDocId(data.id);
    }
  }, [docId]);

  if (!dettes) return <p className="text-neutral-500 text-sm">Chargement…</p>;

  const add = () => {
    const a = parseFloat(amount.replace(",", "."));
    if (!label.trim() || isNaN(a)) return;
    persist([{ id: crypto.randomUUID(), label: label.trim(), amount: a, scope, soldee: false, createdAt: new Date().toISOString() }, ...dettes]);
    setLabel(""); setAmount("");
  };

  const toggle = (d: Dette) => {
    persist(dettes.map((x) => x.id === d.id
      ? { ...x, soldee: !x.soldee, soldeeAt: x.soldee ? undefined : new Date().toISOString() }
      : x));
  };

  const remove = (id: string) => persist(dettes.filter((x) => x.id !== id));

  const groupes: ["pro" | "perso", string][] = [["pro", "Dettes pro"], ["perso", "Dettes perso"]];

  return (
    <div className="space-y-6">
      {/* Ajout */}
      <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden">
            {(["pro", "perso"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)}
                className={`px-3 py-1.5 text-xs font-semibold ${scope === s ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>
                {s === "pro" ? "Pro" : "Perso"}
              </button>
            ))}
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Créancier / dette…"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="flex-1 min-w-[160px] bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant €" inputMode="decimal"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="w-28 bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
          <button onClick={add} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg">
            <Plus size={15} /> Ajouter
          </button>
        </div>
      </div>

      {/* Listes pro / perso */}
      {groupes.map(([s, titre]) => {
        const list = dettes.filter((d) => d.scope === s);
        const total = list.filter((d) => !d.soldee).reduce((sum, d) => sum + d.amount, 0);
        return (
          <section key={s}>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">{titre}</h2>
              <span className="text-sm font-bold tabular-nums text-red-400">{eur(total)}</span>
            </div>
            <ul className="space-y-1.5">
              {list.length === 0 && <li className="text-sm text-neutral-600">Aucune dette enregistrée.</li>}
              {list.map((d) => (
                <li key={d.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${d.soldee ? "border-neutral-800 bg-neutral-900/40 opacity-60" : "border-red-500/30 bg-red-500/5"}`}>
                  <button onClick={() => toggle(d)} title={d.soldee ? "Marquer non soldée" : "Marquer soldée"}
                    className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center ${d.soldee ? "bg-green-600 border-green-500 text-white" : "border-neutral-600 text-transparent hover:text-neutral-400"}`}>
                    <Check size={14} />
                  </button>
                  <span className={`flex-1 min-w-0 truncate text-sm text-neutral-200 ${d.soldee ? "line-through" : ""}`}>{d.label}</span>
                  {d.soldee && d.soldeeAt && (
                    <span className="text-xs text-neutral-500 shrink-0">soldée le {new Date(d.soldeeAt).toLocaleDateString("fr-FR")}</span>
                  )}
                  <span className="text-sm font-semibold tabular-nums shrink-0">{eur(d.amount)}</span>
                  <button onClick={() => remove(d.id)} className="text-neutral-600 hover:text-red-400 shrink-0"><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
