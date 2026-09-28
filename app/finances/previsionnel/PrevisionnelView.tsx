"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Copy, Check, ExternalLink, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// Prévisionnel 2026 : lignes de la table Supabase mydrive_finance_previsionnel,
// avec un panneau de filtres à gauche (mois, statut, nature, recherche).
interface Ligne {
  id: string;
  titre: string;
  nature: string | null;
  destinataire: string | null;
  montant: number;
  date_echeance: string | null;
  date_paiement: string | null;
  statut: string | null;
}

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const STATUTS: { key: string; label: string; badge: string }[] = [
  { key: "paye", label: "Payé", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { key: "retard", label: "En retard", badge: "bg-red-500/15 text-red-400 border-red-500/30" },
  { key: "a_payer", label: "À payer", badge: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { key: "pas_encore_echu", label: "Pas encore échu", badge: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30" },
];

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n || 0);
const fdate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR") : "—");

// Statut modifiable directement dans le tableau : le badge est un <select>
// stylé comme un badge, la sauvegarde part vers Supabase à chaque changement.
function StatutSelect({ statut, onChange, saving }: { statut: string | null; onChange: (s: string) => void; saving: boolean }) {
  const s = STATUTS.find((x) => x.key === statut);
  return (
    <select
      value={s ? s.key : ""}
      disabled={saving}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className={`appearance-none cursor-pointer px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-sky-500 ${saving ? "opacity-50" : ""} ${s ? s.badge : "bg-neutral-500/15 text-neutral-400 border-neutral-500/30"}`}
    >
      {!s && <option value="">—</option>}
      {STATUTS.map((x) => (
        <option key={x.key} value={x.key} className="bg-neutral-900 text-neutral-100">{x.label}</option>
      ))}
    </select>
  );
}

// Montant modifiable : le montant affiché devient un champ au clic,
// validé avec Entrée ou en sortant du champ, annulé avec Échap.
function MontantCell({ value, onCommit, saving }: { value: number; onCommit: (n: number) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft.replace(/\s/g, "").replace(",", "."));
    if (!isNaN(n) && n !== value) onCommit(n);
  };

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(value).replace(".", ",")); setEditing(true); }}
        disabled={saving}
        title="Cliquer pour modifier le montant"
        className={`tabular-nums text-neutral-100 hover:text-sky-300 hover:underline decoration-dotted underline-offset-2 ${saving ? "opacity-50" : ""}`}
      >
        {eur(value)}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      inputMode="decimal"
      className="w-24 text-right tabular-nums rounded-md bg-neutral-800 border border-sky-500 px-2 py-0.5 text-sm text-neutral-100 focus:outline-none"
    />
  );
}

// Couleurs des barres du graphique par statut (mêmes teintes que les badges).
const CHART_COLORS: Record<string, { bg: string; label: string }> = {
  paye: { bg: "bg-emerald-500", label: "Payé" },
  retard: { bg: "bg-red-500", label: "En retard" },
  a_payer: { bg: "bg-amber-500", label: "À payer" },
  pas_encore_echu: { bg: "bg-neutral-500", label: "Pas encore échu" },
};
const CHART_ORDER = ["paye", "retard", "a_payer", "pas_encore_echu"];

// Vue annuelle d'un destinataire : total, répartition par statut et
// graphique à barres empilées mois par mois (vert payé / rouge retard /
// gris pas encore échu, ambre pour l'éventuel « à payer »).
function DestHeader({ lignes }: { lignes: Ligne[] }) {
  const totalAnnuel = lignes.reduce((s, l) => s + l.montant, 0);
  const parStatut = CHART_ORDER
    .map((k) => ({
      key: k,
      ...CHART_COLORS[k],
      total: lignes.filter((l) => l.statut === k).reduce((s, l) => s + l.montant, 0),
      n: lignes.filter((l) => l.statut === k).length,
    }))
    .filter((s) => s.n > 0);

  // Sommes par mois et par statut pour les barres empilées.
  const parMois = MOIS.map((_, i) => {
    const rows = lignes.filter((l) => l.date_echeance && new Date(l.date_echeance + "T00:00:00").getMonth() === i);
    const seg: Record<string, number> = {};
    for (const k of CHART_ORDER) seg[k] = rows.filter((l) => l.statut === k).reduce((s, l) => s + l.montant, 0);
    return { seg, total: rows.reduce((s, l) => s + l.montant, 0) };
  });
  const maxMois = Math.max(1, ...parMois.map((m) => m.total));
  const H = 140; // hauteur utile des barres en px

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-neutral-500 uppercase tracking-wide">Montant total annuel</p>
          <p className="text-2xl font-semibold text-neutral-100 tabular-nums">{eur(totalAnnuel)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {parStatut.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-800/70 px-2.5 py-1 text-xs text-neutral-200">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm ${s.bg}`} />
              {s.label} : <span className="font-semibold tabular-nums">{eur(s.total)}</span>
              <span className="text-neutral-500">({s.n})</span>
            </span>
          ))}
        </div>
      </div>

      {/* Graphique : une barre par mois, segments empilés par statut. */}
      <div className="overflow-x-auto">
        <div className="flex items-end gap-2 min-w-[560px]" style={{ height: H + 34 }}>
          {parMois.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
              <span className="text-[10px] text-neutral-400 tabular-nums">{m.total > 0 ? eur(m.total) : ""}</span>
              <div className="w-full max-w-[34px] flex flex-col-reverse rounded-t-[4px] overflow-hidden">
                {CHART_ORDER.map((k) => m.seg[k] > 0 && (
                  <div
                    key={k}
                    title={`${MOIS[i]} — ${CHART_COLORS[k].label} : ${eur(m.seg[k])}`}
                    className={`${CHART_COLORS[k].bg} w-full border-t-2 border-neutral-950 first:border-t-0`}
                    style={{ height: Math.max(3, Math.round((m.seg[k] / maxMois) * H)) }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-neutral-500">{MOIS[i].slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Bouton copier avec retour visuel (coche pendant 1,5 s).
function CopyBtn({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        if (!value) return;
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch { /* clipboard indisponible */ }
      }}
      disabled={!value}
      title="Copier"
      className={`p-1.5 rounded-md border transition-colors ${ok
        ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
        : "border-neutral-700 text-neutral-400 hover:text-white bg-neutral-800 disabled:opacity-40"}`}
    >
      {ok ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

// Infos de paiement du destinataire (table mydrive_finance_destinataires) :
// lien de paiement, IBAN, identifiant, mot de passe — complétables sur place,
// sauvegardés en quittant le champ, avec bouton copier (et ouvrir pour le lien).
interface DestInfos {
  lien_paiement: string;
  iban: string;
  identifiant: string;
  mot_de_passe: string;
}
const INFOS_VIDES: DestInfos = { lien_paiement: "", iban: "", identifiant: "", mot_de_passe: "" };

function DestInfosPanel({ dest }: { dest: string }) {
  const [infos, setInfos] = useState<DestInfos | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("mydrive_finance_destinataires")
        .select("lien_paiement, iban, identifiant, mot_de_passe")
        .eq("destinataire", dest)
        .maybeSingle();
      if (!alive) return;
      setInfos({
        lien_paiement: data?.lien_paiement || "",
        iban: data?.iban || "",
        identifiant: data?.identifiant || "",
        mot_de_passe: data?.mot_de_passe || "",
      });
    })();
    return () => { alive = false; };
  }, [dest]);

  const save = async (field: keyof DestInfos, value: string) => {
    if (!infos) return;
    setErr(null);
    const { error } = await supabase
      .from("mydrive_finance_destinataires")
      .upsert({ destinataire: dest, [field]: value.trim() }, { onConflict: "destinataire" });
    if (error) setErr("Impossible d'enregistrer les infos de paiement.");
  };

  const inputCls = "flex-1 min-w-0 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-sky-500";
  const labelCls = "w-28 shrink-0 text-xs font-semibold text-neutral-400 uppercase tracking-wide";

  if (!infos) return <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-sm text-neutral-500">Chargement des infos de paiement…</section>;

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-2.5">
      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Paiement — {dest}</p>
      {err && <p className="text-red-400 text-sm">{err}</p>}

      <div className="flex items-center gap-2">
        <span className={labelCls}>Lien pour payer</span>
        <input
          value={infos.lien_paiement}
          onChange={(e) => setInfos({ ...infos, lien_paiement: e.target.value })}
          onBlur={(e) => save("lien_paiement", e.target.value)}
          placeholder="https://…"
          className={inputCls}
        />
        <a
          href={infos.lien_paiement.trim() || undefined}
          target="_blank"
          rel="noopener noreferrer"
          title="Ouvrir dans un nouvel onglet"
          aria-disabled={!infos.lien_paiement.trim()}
          className={`p-1.5 rounded-md border border-neutral-700 bg-neutral-800 transition-colors ${infos.lien_paiement.trim() ? "text-sky-400 hover:text-sky-300" : "text-neutral-600 pointer-events-none"}`}
        >
          <ExternalLink size={14} />
        </a>
        <CopyBtn value={infos.lien_paiement.trim()} />
      </div>

      <div className="flex items-center gap-2">
        <span className={labelCls}>IBAN si paiement</span>
        <input
          value={infos.iban}
          onChange={(e) => setInfos({ ...infos, iban: e.target.value })}
          onBlur={(e) => save("iban", e.target.value)}
          placeholder="FR76 …"
          className={`${inputCls} tabular-nums`}
        />
        <CopyBtn value={infos.iban.trim()} />
      </div>

      <div className="flex items-center gap-2">
        <span className={labelCls}>ID</span>
        <input
          value={infos.identifiant}
          onChange={(e) => setInfos({ ...infos, identifiant: e.target.value })}
          onBlur={(e) => save("identifiant", e.target.value)}
          placeholder="Identifiant de connexion"
          className={inputCls}
        />
        <CopyBtn value={infos.identifiant.trim()} />
      </div>

      <div className="flex items-center gap-2">
        <span className={labelCls}>PWD</span>
        <input
          type={showPwd ? "text" : "password"}
          value={infos.mot_de_passe}
          onChange={(e) => setInfos({ ...infos, mot_de_passe: e.target.value })}
          onBlur={(e) => save("mot_de_passe", e.target.value)}
          placeholder="Mot de passe"
          className={inputCls}
        />
        <button
          onClick={() => setShowPwd((v) => !v)}
          title={showPwd ? "Masquer" : "Afficher"}
          className="p-1.5 rounded-md border border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
        >
          {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <CopyBtn value={infos.mot_de_passe} />
      </div>
    </section>
  );
}

export default function PrevisionnelView({ dest }: { dest?: string }) {
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filtres (panneau de gauche)
  const [mois, setMois] = useState<Set<number>>(new Set());
  const [statuts, setStatuts] = useState<Set<string>>(new Set());
  const [nature, setNature] = useState<"toutes" | "pro" | "perso">("toutes");
  const [dests, setDests] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let query = supabase
        .from("mydrive_finance_previsionnel")
        .select("id, titre, nature, destinataire, montant, date_echeance, date_paiement, statut")
        .order("date_echeance", { ascending: true })
        .order("montant", { ascending: false });
      if (dest) query = query.eq("destinataire", dest);
      const { data, error } = await query;
      if (!alive) return;
      if (error) { setError("Impossible de charger le prévisionnel."); return; }
      setLignes((data || []).map((r: any) => ({ ...r, montant: Number(r.montant) || 0 })));
    })();
    return () => { alive = false; };
  }, [dest]);

  const filtrees = useMemo(() => {
    if (!lignes) return [];
    const needle = q.trim().toLowerCase();
    return lignes.filter((l) => {
      if (mois.size > 0) {
        if (!l.date_echeance) return false;
        if (!mois.has(new Date(l.date_echeance + "T00:00:00").getMonth())) return false;
      }
      if (statuts.size > 0 && !statuts.has(l.statut || "")) return false;
      if (nature !== "toutes" && l.nature !== nature) return false;
      if (dests.size > 0 && !dests.has(l.destinataire || "")) return false;
      if (needle && !`${l.titre} ${l.destinataire || ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [lignes, mois, statuts, nature, dests, q]);

  // Destinataires distincts présents dans les données (pour le filtre).
  const tousDests = useMemo(() => {
    const set = new Set<string>();
    let sans = false;
    for (const l of lignes || []) {
      if (l.destinataire) set.add(l.destinataire); else sans = true;
    }
    const list = [...set].sort((a, b) => a.localeCompare(b, "fr"));
    return { list, sans };
  }, [lignes]);

  const total = filtrees.reduce((s, l) => s + l.montant, 0);
  const totalRetard = filtrees.filter((l) => l.statut === "retard").reduce((s, l) => s + l.montant, 0);

  // Changement manuel du statut d'une ligne : mise à jour optimiste puis
  // sauvegarde Supabase. Passer en « payé » renseigne la date de paiement
  // (aujourd'hui) si elle est vide ; en sortir la remet à vide.
  const changeStatut = async (l: Ligne, statut: string) => {
    const date_paiement = statut === "paye" ? (l.date_paiement || new Date().toISOString().slice(0, 10)) : null;
    const prev = lignes;
    setSaveError(null);
    setSavingId(l.id);
    setLignes((cur) => (cur || []).map((x) => (x.id === l.id ? { ...x, statut, date_paiement } : x)));
    const { error } = await supabase
      .from("mydrive_finance_previsionnel")
      .update({ statut, date_paiement })
      .eq("id", l.id);
    setSavingId(null);
    if (error) {
      setLignes(prev);
      setSaveError("Impossible d'enregistrer le statut (droits ou connexion).");
    }
  };

  // Modification manuelle du montant, même mécanique optimiste que le statut.
  const changeMontant = async (l: Ligne, montant: number) => {
    const prev = lignes;
    setSaveError(null);
    setSavingId(l.id);
    setLignes((cur) => (cur || []).map((x) => (x.id === l.id ? { ...x, montant } : x)));
    const { error } = await supabase
      .from("mydrive_finance_previsionnel")
      .update({ montant })
      .eq("id", l.id);
    setSavingId(null);
    if (error) {
      setLignes(prev);
      setSaveError("Impossible d'enregistrer le montant (droits ou connexion).");
    }
  };

  const toggleStatut = (key: string) => {
    setStatuts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!lignes) return <p className="text-neutral-500 text-sm">Chargement…</p>;

  return (
    <div className="space-y-5">
      {/* Vue destinataire : stats annuelles + graphique au-dessus du tableau. */}
      {dest && <DestHeader lignes={lignes} />}
      {/* Infos de paiement du destinataire, au-dessus des filtres. */}
      {dest && <DestInfosPanel dest={dest} />}

    <div className="flex flex-col md:flex-row gap-5 items-start">
      {/* ---- Panneau de filtres (gauche) ---- */}
      <aside className="w-full md:w-60 shrink-0 md:sticky md:top-4 space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        {!dest && (
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Recherche</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Titre, destinataire…"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 pl-8 pr-3 py-1.5 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Mois</label>
            {mois.size > 0 && (
              <button onClick={() => setMois(new Set())} className="text-[11px] text-sky-400 hover:text-sky-300">
                Tout effacer
              </button>
            )}
          </div>
          {/* Sélection multiple : chaque mois est une pastille cliquable. */}
          <div className="grid grid-cols-3 gap-1.5">
            {MOIS.map((m, i) => {
              const on = mois.has(i);
              return (
                <button
                  key={m}
                  onClick={() => setMois((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })}
                  className={`px-1 py-1 rounded-md border text-[11px] font-medium transition-colors ${on
                    ? "bg-sky-500/20 border-sky-500/50 text-sky-300"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white"}`}
                >
                  {m.slice(0, 4)}{m.length > 4 ? "." : ""}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-500">
            {mois.size === 0 ? "Tous les mois 2026" : [...mois].sort((a, b) => a - b).map((i) => MOIS[i]).join(", ")}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Statut</label>
          <div className="space-y-1.5">
            {STATUTS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={statuts.has(s.key)}
                  onChange={() => toggleStatut(s.key)}
                  className="accent-sky-500"
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        {!dest && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Destinataire</label>
            {dests.size > 0 && (
              <button onClick={() => setDests(new Set())} className="text-[11px] text-sky-400 hover:text-sky-300">
                Tout effacer
              </button>
            )}
          </div>
          {/* Liste verticale à cocher des destinataires présents dans les données. */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {tousDests.list.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dests.has(d)}
                  onChange={() => setDests((prev) => {
                    const next = new Set(prev);
                    if (next.has(d)) next.delete(d); else next.add(d);
                    return next;
                  })}
                  className="accent-sky-500 shrink-0"
                />
                <span className="truncate" title={d}>{d}</span>
              </label>
            ))}
            {tousDests.sans && (
              <label className="flex items-center gap-2 text-sm text-neutral-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dests.has("")}
                  onChange={() => setDests((prev) => {
                    const next = new Set(prev);
                    if (next.has("")) next.delete(""); else next.add("");
                    return next;
                  })}
                  className="accent-sky-500 shrink-0"
                />
                (sans destinataire)
              </label>
            )}
          </div>
        </div>
        )}

        {!dest && (
        <div>
          <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Nature</label>
          <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden text-sm">
            {(["toutes", "pro", "perso"] as const).map((n) => (
              <button
                key={n}
                onClick={() => setNature(n)}
                className={`px-3 py-1.5 capitalize transition-colors ${nature === n ? "bg-neutral-700 text-white" : "bg-neutral-900 text-neutral-400 hover:text-white"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        )}

        <div className="border-t border-neutral-800 pt-3 space-y-1 text-sm">
          <p className="text-neutral-400">{filtrees.length} ligne{filtrees.length > 1 ? "s" : ""}</p>
          <p className="text-neutral-200 font-semibold">Total : {eur(total)}</p>
          {totalRetard > 0 && <p className="text-red-400">dont en retard : {eur(totalRetard)}</p>}
        </div>
      </aside>

      {/* ---- Tableau (droite) ---- */}
      <div className="flex-1 w-full space-y-2">
        {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
        {/* overflow-auto + max-h : le tableau scrolle dans son cadre et
            l'en-tête (th sticky) reste visible en haut. */}
        <div className="overflow-auto max-h-[calc(100dvh-9rem)] rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-900 text-neutral-400 text-left">
              <th className="sticky top-0 z-10 bg-neutral-900 px-3 py-2 font-medium">Titre</th>
              <th className="sticky top-0 z-10 bg-neutral-900 px-3 py-2 font-medium">Destinataire</th>
              <th className="sticky top-0 z-10 bg-neutral-900 px-3 py-2 font-medium">Nature</th>
              <th className="sticky top-0 z-10 bg-neutral-900 px-3 py-2 font-medium text-right">Montant</th>
              <th className="sticky top-0 z-10 bg-neutral-900 px-3 py-2 font-medium">Échéance</th>
              <th className="sticky top-0 z-10 bg-neutral-900 px-3 py-2 font-medium">Payé le</th>
              <th className="sticky top-0 z-10 bg-neutral-900 px-3 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {filtrees.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-neutral-500">Aucune ligne ne correspond aux filtres.</td></tr>
            )}
            {filtrees.map((l) => (
              <tr key={l.id} className="border-t border-neutral-800/70 hover:bg-neutral-900/50">
                <td className="px-3 py-2 text-neutral-100">{l.titre}</td>
                <td className="px-3 py-2 text-neutral-400">
                  {l.destinataire && !dest ? (
                    // Ouvre la vue annuelle du destinataire dans un nouvel onglet.
                    <a
                      href={`/finances/previsionnel/d/${encodeURIComponent(l.destinataire)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:text-sky-300 hover:underline underline-offset-2"
                    >
                      {l.destinataire}
                    </a>
                  ) : (l.destinataire || "—")}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-[11px] font-medium uppercase ${l.nature === "pro" ? "text-sky-400" : "text-violet-400"}`}>{l.nature || "—"}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <MontantCell value={l.montant} saving={savingId === l.id} onCommit={(n) => changeMontant(l, n)} />
                </td>
                <td className="px-3 py-2 text-neutral-300 whitespace-nowrap">{fdate(l.date_echeance)}</td>
                <td className="px-3 py-2 text-neutral-400 whitespace-nowrap">{fdate(l.date_paiement)}</td>
                <td className="px-3 py-2"><StatutSelect statut={l.statut} saving={savingId === l.id} onChange={(s) => changeStatut(l, s)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
    </div>
  );
}
