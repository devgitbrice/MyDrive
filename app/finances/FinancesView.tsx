"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Trash2, Check, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "@/components/Toaster";

type Kind = "revenu" | "depense";
type Scope = "pro" | "perso";
type EchType = "tva" | "urssaf" | "impot" | "autre";

interface Tx { id: string; date: string; label: string; amount: number; kind: Kind; scope: Scope; category: string; }
interface Ech { id: string; label: string; type: EchType; amount: number; due_date: string | null; scope: Scope; paid: boolean; }

const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const ECH_LABEL: Record<EchType, string> = { tva: "TVA", urssaf: "URSSAF", impot: "Impôt", autre: "Autre" };

async function uid(): Promise<string | null> {
  try { const { data } = await supabase.auth.getUser(); return data.user?.id ?? null; } catch { return null; }
}

type Liquidite = { label: string; value: number | null; error?: string | null };

export default function FinancesView({ liquidites = [], attendus = [], dettes }: { liquidites?: Liquidite[]; attendus?: Liquidite[]; dettes?: { pro: number | null; perso: number | null } } = {}) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [echs, setEchs] = useState<Ech[]>([]);
  const [scope, setScope] = useState<"tout" | Scope>("tout");
  const [periode, setPeriode] = useState<"mois" | "annee" | "tout">("mois");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [{ data: t }, { data: e }] = await Promise.all([
      supabase.from("mydrive_finance_transactions").select("id,date,label,amount,kind,scope,category").order("date", { ascending: false }),
      supabase.from("mydrive_finance_echeances").select("id,label,type,amount,due_date,scope,paid").order("due_date", { ascending: true }),
    ]);
    setTxs((t as Tx[]) || []);
    setEchs((e as Ech[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const ch = supabase.channel("finances-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "mydrive_finance_transactions" }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "mydrive_finance_echeances" }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);

  // Filtrage période + scope
  const inPeriode = useCallback((d: string) => {
    if (periode === "tout") return true;
    const dt = new Date(d); const now = new Date();
    if (periode === "annee") return dt.getFullYear() === now.getFullYear();
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  }, [periode]);

  const filtered = useMemo(() => txs.filter((t) => (scope === "tout" || t.scope === scope) && inPeriode(t.date)), [txs, scope, inPeriode]);

  const totals = useMemo(() => {
    let rev = 0, dep = 0;
    for (const t of filtered) { if (t.kind === "revenu") rev += Number(t.amount); else dep += Number(t.amount); }
    return { rev, dep, solde: rev - dep };
  }, [filtered]);

  const echScoped = useMemo(() => echs.filter((e) => scope === "tout" || e.scope === scope), [echs, scope]);
  const echDue = useMemo(() => echScoped.filter((e) => !e.paid).reduce((s, e) => s + Number(e.amount), 0), [echScoped]);

  // --- Mutations ---
  async function addTx(tx: Omit<Tx, "id">) {
    const { error } = await supabase.from("mydrive_finance_transactions").insert({ ...tx, user_id: await uid() });
    if (error) toast("Erreur : " + error.message);
  }
  async function delTx(id: string) {
    const { error } = await supabase.from("mydrive_finance_transactions").delete().eq("id", id);
    if (error) toast("Erreur : " + error.message);
  }
  async function addEch(e: Omit<Ech, "id" | "paid">) {
    const { error } = await supabase.from("mydrive_finance_echeances").insert({ ...e, paid: false, user_id: await uid() });
    if (error) toast("Erreur : " + error.message);
  }
  async function togglePaid(e: Ech) {
    const { error } = await supabase.from("mydrive_finance_echeances").update({ paid: !e.paid, paid_at: !e.paid ? new Date().toISOString() : null }).eq("id", e.id);
    if (error) toast("Erreur : " + error.message);
  }
  async function delEch(id: string) {
    const { error } = await supabase.from("mydrive_finance_echeances").delete().eq("id", id);
    if (error) toast("Erreur : " + error.message);
  }

  if (loading) return <p className="text-neutral-500 text-sm">Chargement…</p>;

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <Seg options={[["tout", "Tout"], ["pro", "Pro"], ["perso", "Perso"]]} value={scope} onChange={(v) => setScope(v as any)} />
        <Seg options={[["mois", "Ce mois"], ["annee", "Année"], ["tout", "Tout"]]} value={periode} onChange={(v) => setPeriode(v as any)} />
      </div>

      {/* Cartes synthèse */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Revenus" value={eur(totals.rev)} color="text-green-400" />
        <Card label="Dépenses" value={eur(totals.dep)} color="text-red-400" />
        <Card label="Solde" value={eur(totals.solde)} color={totals.solde >= 0 ? "text-white" : "text-red-400"} />
        <Card label="À provisionner (échéances)" value={eur(echDue)} color="text-amber-400" />
      </div>

      {/* Liquidités : soldes réels des comptes, en direct */}
      {liquidites.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Liquidités</h2>
          <ul className="rounded-xl border border-neutral-800 bg-neutral-900/50 divide-y divide-neutral-800">
            {liquidites.map((l) => (
              <li key={l.label} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                <span className="text-sm text-neutral-300">{l.label}</span>
                <span className={`text-sm font-bold tabular-nums ${l.value != null ? "text-white" : "text-neutral-500"}`}>
                  {l.value != null ? eur(l.value) : l.error ? "indisponible" : "…"}
                </span>
              </li>
            ))}
            {liquidites.some((l) => l.value != null) && (
              <li className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                <span className="text-sm font-semibold text-neutral-400">Total liquidités</span>
                <span className="text-sm font-bold tabular-nums text-green-400">
                  {eur(liquidites.reduce((s, l) => s + (l.value || 0), 0))}
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Entrées attendues : ventes Shop en attente, paiements formation imminents */}
      {attendus.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Entrées attendues</h2>
          <ul className="rounded-xl border border-neutral-800 bg-neutral-900/50 divide-y divide-neutral-800">
            {attendus.map((l) => (
              <li key={l.label} className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                <span className="text-sm text-neutral-300">{l.label}</span>
                <span className={`text-sm font-bold tabular-nums ${l.value != null ? "text-blue-300" : "text-neutral-500"}`}>
                  {l.value != null ? eur(l.value) : "—"}
                </span>
              </li>
            ))}
            {attendus.some((l) => l.value != null) && (
              <li className="flex items-baseline justify-between gap-3 px-3 py-2.5">
                <span className="text-sm font-semibold text-neutral-400">Total attendu</span>
                <span className="text-sm font-bold tabular-nums text-blue-300">
                  {eur(attendus.reduce((s, l) => s + (l.value || 0), 0))}
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Dettes : totaux cliquables vers la page de gestion */}
      {dettes && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Dettes</h2>
          <ul className="rounded-xl border border-neutral-800 bg-neutral-900/50 divide-y divide-neutral-800">
            <li>
              <a href="/finances/dettes" className="flex items-baseline justify-between gap-3 px-3 py-2.5 hover:bg-neutral-800/50 rounded-t-xl">
                <span className="text-sm text-teal-400 hover:text-teal-300">Total Dette Pro →</span>
                <span className={`text-sm font-bold tabular-nums ${dettes.pro != null ? "text-red-400" : "text-neutral-500"}`}>
                  {dettes.pro != null ? eur(dettes.pro) : "…"}
                </span>
              </a>
            </li>
            <li>
              <a href="/finances/dettes" className="flex items-baseline justify-between gap-3 px-3 py-2.5 hover:bg-neutral-800/50 rounded-b-xl">
                <span className="text-sm text-teal-400 hover:text-teal-300">Total Dette Perso →</span>
                <span className={`text-sm font-bold tabular-nums ${dettes.perso != null ? "text-red-400" : "text-neutral-500"}`}>
                  {dettes.perso != null ? eur(dettes.perso) : "…"}
                </span>
              </a>
            </li>
          </ul>
        </section>
      )}

      {/* Échéances */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Échéances (TVA · URSSAF · Impôts)</h2>
        <EcheanceForm onAdd={addEch} />
        <ul className="mt-3 space-y-1.5">
          {echScoped.length === 0 && <li className="text-sm text-neutral-600">Aucune échéance.</li>}
          {echScoped.map((e) => (
            <li key={e.id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${e.paid ? "border-neutral-800 bg-neutral-900/40 opacity-60" : "border-amber-500/30 bg-amber-500/5"}`}>
              <button onClick={() => togglePaid(e)} title={e.paid ? "Marquer non payé" : "Marquer payé"}
                className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center ${e.paid ? "bg-green-600 border-green-500 text-white" : "border-neutral-600 text-transparent hover:text-neutral-400"}`}>
                <Check size={14} />
              </button>
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 shrink-0">{ECH_LABEL[e.type]}</span>
              <span className="flex-1 min-w-0 truncate text-sm text-neutral-200">{e.label || ECH_LABEL[e.type]}</span>
              {e.due_date && <span className="text-xs text-neutral-500 shrink-0 flex items-center gap-1"><Clock size={12} />{new Date(e.due_date).toLocaleDateString("fr-FR")}</span>}
              <span className="text-sm font-semibold tabular-nums shrink-0">{eur(Number(e.amount))}</span>
              <button onClick={() => delEch(e.id)} className="text-neutral-600 hover:text-red-400 shrink-0"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
        {echScoped.some((e) => !e.paid) && (
          <div className="mt-2 flex items-baseline justify-end gap-2 px-2.5 text-sm">
            <span className="text-neutral-500">Total à payer{scope !== "tout" ? ` (${scope})` : ""} :</span>
            <span className="font-bold tabular-nums text-amber-400">{eur(echDue)}</span>
          </div>
        )}
      </section>

      {/* Transactions */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Mouvements</h2>
        <TxForm onAdd={addTx} />
        <ul className="mt-3 space-y-1.5">
          {filtered.length === 0 && <li className="text-sm text-neutral-600">Aucun mouvement sur la période.</li>}
          {filtered.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-2.5">
              <span className="text-xs text-neutral-500 shrink-0 w-16">{new Date(t.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 ${t.scope === "pro" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300"}`}>{t.scope}</span>
              <span className="flex-1 min-w-0 truncate text-sm text-neutral-200">{t.label}{t.category ? ` · ${t.category}` : ""}</span>
              <span className={`text-sm font-semibold tabular-nums shrink-0 ${t.kind === "revenu" ? "text-green-400" : "text-red-400"}`}>{t.kind === "revenu" ? "+" : "−"}{eur(Number(t.amount))}</span>
              <button onClick={() => delTx(t.id)} className="text-neutral-600 hover:text-red-400 shrink-0"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Seg({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${value === v ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}>{l}</button>
      ))}
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function TxForm({ onAdd }: { onAdd: (t: Omit<Tx, "id">) => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<Kind>("revenu");
  const [scope, setScope] = useState<Scope>("pro");
  const [category, setCategory] = useState("");

  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-neutral-300 hover:text-white border border-neutral-700 rounded-lg px-3 py-1.5"><Plus size={15} /> Ajouter un mouvement</button>;

  const submit = () => {
    const a = parseFloat(amount.replace(",", "."));
    if (!label.trim() || isNaN(a)) { toast("Libellé et montant requis"); return; }
    onAdd({ date, label: label.trim(), amount: a, kind, scope, category: category.trim() });
    setLabel(""); setAmount(""); setCategory("");
  };

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-sm text-white" />
        <Seg options={[["revenu", "Revenu"], ["depense", "Dépense"]]} value={kind} onChange={(v) => setKind(v as Kind)} />
        <Seg options={[["pro", "Pro"], ["perso", "Perso"]]} value={scope} onChange={(v) => setScope(v as Scope)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé" className="flex-1 min-w-[140px] bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Catégorie" className="w-32 bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant €" inputMode="decimal" className="w-28 bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white">Fermer</button>
        <button onClick={submit} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg">Ajouter</button>
      </div>
    </div>
  );
}

function EcheanceForm({ onAdd }: { onAdd: (e: Omit<Ech, "id" | "paid">) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<EchType>("tva");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [scope, setScope] = useState<Scope>("pro");

  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-neutral-300 hover:text-white border border-neutral-700 rounded-lg px-3 py-1.5"><Plus size={15} /> Ajouter une échéance</button>;

  const submit = () => {
    const a = parseFloat(amount.replace(",", "."));
    if (isNaN(a)) { toast("Montant requis"); return; }
    onAdd({ label: label.trim(), type, amount: a, due_date: due || null, scope });
    setLabel(""); setAmount(""); setDue("");
  };

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Seg options={[["tva", "TVA"], ["urssaf", "URSSAF"], ["impot", "Impôt"], ["autre", "Autre"]]} value={type} onChange={(v) => setType(v as EchType)} />
        <Seg options={[["pro", "Pro"], ["perso", "Perso"]]} value={scope} onChange={(v) => setScope(v as Scope)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Libellé (optionnel)" className="flex-1 min-w-[140px] bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1.5 text-sm text-white" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant €" inputMode="decimal" className="w-28 bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1.5 text-sm text-white outline-none focus:border-blue-500" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-neutral-400 hover:text-white">Fermer</button>
        <button onClick={submit} className="px-4 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg">Ajouter</button>
      </div>
    </div>
  );
}
