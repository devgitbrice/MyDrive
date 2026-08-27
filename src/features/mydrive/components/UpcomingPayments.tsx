"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface Row { montant: string; creancier: string; echeance: string; }

const PAY_DOC_ID = "f530ad97-d4c7-4ceb-90a7-d2e5a215c499"; // « Trucs à payer »

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// Extrait les lignes du 1er <table> : colonnes Montant / Créancier / … / Échéance
function parseRows(html: string): Row[] {
  if (typeof document === "undefined") return [];
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const table = tmp.querySelector("table");
  if (!table) return [];
  const out: Row[] = [];
  table.querySelectorAll("tbody tr, tr").forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("td"));
    if (cells.length < 2) return; // ignore l'en-tête (th)
    const montant = stripTags(cells[0].innerHTML);
    const creancier = stripTags(cells[1].innerHTML).split("  ")[0];
    // cherche une cellule qui ressemble à une échéance (date)
    let echeance = "";
    for (const c of cells) {
      const t = stripTags(c.innerHTML);
      if (/\d{1,2}\/\d{1,2}|janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc|mercredi|lundi|mardi|jeudi|vendredi/i.test(t)) { echeance = t; break; }
    }
    if (montant) out.push({ montant, creancier, echeance });
  });
  return out;
}

export default function UpcomingPayments() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.from("MyDrive").select("content").eq("id", PAY_DOC_ID).single()
      .then(({ data }) => { if (alive && data?.content) setRows(parseRows(data.content)); });
    return () => { alive = false; };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <Link
      href={`/editdoc/${PAY_DOC_ID}`}
      className="block rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 hover:border-amber-500/60 transition-colors"
    >
      <div className="flex items-center gap-2 mb-3 text-amber-400">
        <CalendarClock size={16} />
        <span className="text-xs font-bold uppercase tracking-wider">Prochaines échéances</span>
      </div>
      <div className="space-y-1.5">
        {rows.slice(0, 5).map((r, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-white tabular-nums shrink-0 w-20">{r.montant}</span>
            <span className="flex-1 min-w-0 truncate text-neutral-300">{r.creancier}</span>
            {r.echeance && <span className="text-xs text-neutral-500 shrink-0">{r.echeance}</span>}
          </div>
        ))}
      </div>
    </Link>
  );
}
