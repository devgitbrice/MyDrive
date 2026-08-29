"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Articles à vendre, stockés en JSON dans un doc du drive.
interface ShopItem {
  id: string;
  label: string;
  price: number;
  status: "a_vendre" | "vendu";
  createdAt: string;
  soldAt?: string;
}

const DOC_TITLE = "Shop — Articles";
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

export default function ShopView() {
  const [items, setItems] = useState<ShopItem[] | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("MyDrive")
        .select("id, content")
        .eq("title", DOC_TITLE)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setDocId(data.id);
        try { setItems(JSON.parse(data.content || "[]")); } catch { setItems([]); }
      } else {
        setItems([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  const persist = useCallback(async (next: ShopItem[]) => {
    setItems(next);
    const content = JSON.stringify(next);
    if (docId) {
      await supabase.from("MyDrive").update({ content }).eq("id", docId);
    } else {
      const { data } = await supabase
        .from("MyDrive")
        .insert({ title: DOC_TITLE, content, observation: "Articles à vendre (section Shop de la page Finances).", image_path: "", image_url: "", doc_type: "doc", parent_id: null })
        .select("id")
        .single();
      if (data) setDocId(data.id);
    }
  }, [docId]);

  if (!items) return <p className="text-neutral-500 text-sm">Chargement…</p>;

  const aVendre = items.filter((i) => i.status === "a_vendre");
  const vendus = items.filter((i) => i.status === "vendu");

  const add = () => {
    const p = parseFloat(price.replace(",", "."));
    if (!label.trim() || isNaN(p)) return;
    persist([{ id: crypto.randomUUID(), label: label.trim(), price: p, status: "a_vendre", createdAt: new Date().toISOString() }, ...items]);
    setLabel(""); setPrice("");
  };

  const toggle = (it: ShopItem) => {
    persist(items.map((i) => i.id === it.id
      ? { ...i, status: i.status === "vendu" ? "a_vendre" as const : "vendu" as const, soldAt: i.status === "vendu" ? undefined : new Date().toISOString() }
      : i));
  };

  const remove = (id: string) => persist(items.filter((i) => i.id !== id));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">À vendre ({aVendre.length})</div>
          <div className="text-lg font-bold tabular-nums text-amber-400">{eur(aVendre.reduce((s, i) => s + i.price, 0))}</div>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Vendus ({vendus.length})</div>
          <div className="text-lg font-bold tabular-nums text-green-400">{eur(vendus.reduce((s, i) => s + i.price, 0))}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Article à vendre…"
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          className="flex-1 min-w-[180px] bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Prix €" inputMode="decimal"
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          className="w-24 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
        <button onClick={add} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg">
          <Plus size={15} /> Ajouter
        </button>
      </div>

      <ul className="space-y-1.5">
        {items.length === 0 && <li className="text-sm text-neutral-600">Aucun article pour le moment.</li>}
        {items.map((it) => (
          <li key={it.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${it.status === "vendu" ? "border-neutral-800 bg-neutral-900/40 opacity-60" : "border-amber-500/30 bg-amber-500/5"}`}>
            <button onClick={() => toggle(it)} title={it.status === "vendu" ? "Remettre en vente" : "Marquer vendu"}
              className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center ${it.status === "vendu" ? "bg-green-600 border-green-500 text-white" : "border-neutral-600 text-transparent hover:text-neutral-400"}`}>
              <Check size={14} />
            </button>
            <span className={`flex-1 min-w-0 truncate text-sm text-neutral-200 ${it.status === "vendu" ? "line-through" : ""}`}>{it.label}</span>
            {it.status === "vendu" && it.soldAt && (
              <span className="text-xs text-neutral-500 shrink-0">vendu le {new Date(it.soldAt).toLocaleDateString("fr-FR")}</span>
            )}
            <span className="text-sm font-semibold tabular-nums shrink-0">{eur(it.price)}</span>
            <button onClick={() => remove(it.id)} className="text-neutral-600 hover:text-red-400 shrink-0"><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
