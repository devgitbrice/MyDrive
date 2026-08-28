"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

interface FicheRow {
  id: string;
  title: string;
  parentTitle: string;
  fiche: any;
}

// Somme d'abonnés à partir d'une chaîne « ~3000 », « 2 000 », etc.
function num(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function statutDot(v: string) {
  if (v === "oui") return "🟢";
  if (v === "non") return "🔴";
  if (v === "so") return "⚪";
  return "·";
}

export default function PortefeuilleView() {
  const [rows, setRows] = useState<FicheRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("MyDrive")
        .select("id, title, content, parent_id")
        .eq("doc_type", "fiche")
        .is("deleted_at", null);
      if (!alive || !data) return;
      const parents = Array.from(new Set(data.map((d: any) => d.parent_id).filter(Boolean)));
      const names: Record<string, string> = {};
      if (parents.length) {
        const { data: fdata } = await supabase.from("MyDrive").select("id, title").in("id", parents);
        (fdata || []).forEach((f: any) => { names[f.id] = f.title; });
      }
      const parsed = data.map((d: any) => {
        let fiche: any = {};
        try { fiche = JSON.parse(d.content || "{}"); } catch { fiche = {}; }
        return { id: d.id, title: d.title, parentTitle: names[d.parent_id] || d.title, fiche };
      });
      setRows(parsed);
    })();
    return () => { alive = false; };
  }, []);

  const enriched = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => {
      const f = r.fiche || {};
      const pres = f.presence || {};
      const nets = ["linkedin", "youtube", "instagram", "telegram", "whatsapp", "newsletter"];
      const presItems = ["site", "appIos", "ga4", "linkedin", "youtube", "instagram", "telegram", "whatsapp", "newsletter", "podcast", "pubMeta", "pubGoogle"];
      const presOui = presItems.filter((k) => pres[k]?.statut === "oui").length;
      const com = f.commercial || {};
      const comItems = ["cibles", "contactPerso", "phoning", "mailing"];
      const comOui = comItems.filter((k) => com[k]?.statut === "oui").length;
      const abonnes = nets.reduce((s, k) => s + num(pres[k]?.abonnes), 0);
      return {
        ...r,
        priorite: f.priorite || "",
        site: pres.site?.statut || "",
        ga4: pres.ga4?.statut || "",
        abonnes,
        ca: f.kpis?.ca || "",
        presOui, presTot: presItems.length,
        comOui, comTot: comItems.length,
        action: f.kpis?.prochaineAction || "",
      };
    }).sort((a, b) => {
      // Prioritaires en haut, puis alpha
      const w = (x: any) => (x.priorite === "prioritaire" ? 0 : x.priorite === "veille" ? 2 : 1);
      if (w(a) !== w(b)) return w(a) - w(b);
      return a.parentTitle.localeCompare(b.parentTitle, "fr");
    });
  }, [rows]);

  if (rows === null) return <p className="text-neutral-500 text-sm">Chargement…</p>;
  if (rows.length === 0) return <p className="text-neutral-500 text-sm">Aucune fiche projet pour le moment.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full text-sm border-collapse min-w-[820px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
            <th className="p-3">Projet</th>
            <th className="p-3">Priorité</th>
            <th className="p-3 text-center">Site</th>
            <th className="p-3 text-center">GA4</th>
            <th className="p-3 text-right">Abonnés</th>
            <th className="p-3 text-right">CA/mois</th>
            <th className="p-3 text-center">Présence</th>
            <th className="p-3 text-center">Commercial</th>
            <th className="p-3">Prochaine action</th>
          </tr>
        </thead>
        <tbody>
          {enriched.map((r) => (
            <tr key={r.id} className="border-b border-neutral-900 hover:bg-neutral-900/40">
              <td className="p-3">
                <Link href={`/editfiche/${r.id}`} className="text-teal-400 hover:text-teal-300 font-medium">{r.parentTitle}</Link>
              </td>
              <td className="p-3">{r.priorite === "prioritaire" ? "🎯" : r.priorite === "veille" ? "💤" : "—"}</td>
              <td className="p-3 text-center">{statutDot(r.site)}</td>
              <td className="p-3 text-center">{statutDot(r.ga4)}</td>
              <td className="p-3 text-right tabular-nums">{r.abonnes ? r.abonnes.toLocaleString("fr-FR") : "—"}</td>
              <td className="p-3 text-right text-neutral-300">{r.ca || "—"}</td>
              <td className="p-3 text-center text-neutral-300">{r.presOui}/{r.presTot}</td>
              <td className="p-3 text-center text-neutral-300">{r.comOui}/{r.comTot}</td>
              <td className="p-3 text-neutral-400 max-w-[220px] truncate" title={r.action}>{r.action || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
