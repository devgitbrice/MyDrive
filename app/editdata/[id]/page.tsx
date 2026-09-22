"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Database, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type TableRow = { table_name: string; row_count: number };

const REFRESH_MS = 30_000;

/**
 * Document DATA : affiche des données de la base en temps réel.
 * Source « tables_overview » : toutes les tables du projet + nombre de lignes.
 */
export default function EditDataPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [title, setTitle] = useState("Document DATA");
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "count">("count");
  const loadingRef = useRef(false);

  // Titre du document
  useEffect(() => {
    if (!id) return;
    supabase.from("MyDrive").select("title").eq("id", id).single().then(({ data }) => {
      if (data?.title) setTitle(data.title);
    });
  }, [id]);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data, error } = await supabase.rpc("data_tables_overview");
      if (error) throw error;
      setRows((data || []) as TableRow[]);
      setError(null);
      setLastUpdate(new Date());
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les données.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Chargement initial + rafraîchissement périodique + au retour sur l'onglet
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let r = q ? rows.filter((x) => x.table_name.toLowerCase().includes(q)) : rows.slice();
    r.sort((a, b) =>
      sort === "count"
        ? b.row_count - a.row_count || a.table_name.localeCompare(b.table_name)
        : a.table_name.localeCompare(b.table_name)
    );
    return r;
  }, [rows, query, sort]);

  const totalRows = useMemo(() => rows.reduce((s, r) => s + Number(r.row_count), 0), [rows]);

  return (
    <main className="min-h-dvh bg-neutral-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
            aria-label="Retour"
          >
            <ArrowLeft size={16} />
          </button>
          <Database size={20} className="text-emerald-400" />
          <h1 className="text-xl md:text-2xl font-bold flex-1 min-w-0 truncate">{title}</h1>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-500">
          <span>{rows.length} tables · {totalRows.toLocaleString("fr-FR")} lignes au total</span>
          <span>·</span>
          <span suppressHydrationWarning>
            {lastUpdate ? `Actualisé à ${lastUpdate.toLocaleTimeString("fr-FR")}` : "Chargement…"}
          </span>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-emerald-500 transition-colors"
          >
            <RefreshCw size={12} /> Actualiser
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer les tables…"
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-8 pr-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "name" | "count")}
            className="bg-neutral-900 border border-neutral-800 rounded-xl px-2 py-2 text-sm text-neutral-300 outline-none focus:border-emerald-500"
          >
            <option value="count">Tri : nb de lignes</option>
            <option value="name">Tri : nom</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading ? (
          <p className="text-center text-neutral-500 py-10">Chargement des données…</p>
        ) : (
          <div className="border border-neutral-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Table</th>
                  <th className="text-right px-3 py-2 font-semibold w-32">Éléments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/70">
                {filtered.map((r) => (
                  <tr key={r.table_name} className="hover:bg-neutral-900/60">
                    <td className="px-3 py-2 font-mono text-[13px] text-neutral-200 break-all">{r.table_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-100">
                      {Number(r.row_count).toLocaleString("fr-FR")}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-6 text-center text-neutral-500">Aucune table ne correspond.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-neutral-600">
          Document DATA — les chiffres sont comptés dans la base de données à chaque affichage
          (rafraîchissement automatique toutes les 30 s). <Link href="/mydrive" className="underline hover:text-neutral-400">Retour à MyDrive</Link>
        </p>
      </div>
    </main>
  );
}
