"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useItemCode } from "@/features/mydrive/components/ItemCodeProvider";
import { copyTextForCode } from "@/features/mydrive/lib/itemCode";
import { setItemCodeAction } from "@/features/mydrive/modify";

type Props = {
  id: string;
  /** Style d'affichage : pastille sur vignette, ou texte inline. */
  variant?: "badge" | "inline";
  /** Double-clic pour modifier le code (activé par défaut). */
  editable?: boolean;
  className?: string;
};

/**
 * Affiche le code 3 lettres d'un élément.
 *  - clic       : copie « Dans le code "ABC" fais ça : » et affiche « Copié »
 *                 en vert pendant 2 secondes
 *  - double-clic: modifie le code (vide = retour au code automatique)
 * Dans les deux cas la navigation de la carte n'est pas déclenchée.
 */
export default function ItemCodeBadge({ id, variant = "badge", editable = true, className = "" }: Props) {
  const code = useItemCode(id);
  const router = useRouter();

  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(code);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    if (clickTimer.current) clearTimeout(clickTimer.current);
  }, []);

  const copy = async () => {
    const text = copyTextForCode(code);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Presse-papier indisponible (http, permission refusee) : repli execCommand
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        return;
      }
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  // Le clic est differe pour ne pas copier quand l'utilisateur double-clique.
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editable) { copy(); return; }
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { copy(); }, 220);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editable) return;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    setError(null);
    setDraft(code);
    setEditing(true);
  };

  const save = async () => {
    const next = draft.trim().toUpperCase();
    if (next === code) { setEditing(false); return; }
    setSaving(true);
    setError(null);
    const result = await setItemCodeAction(id, next);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    setEditing(false);
    router.refresh();
  };

  if (editing) {
    return (
      <span className="relative inline-flex" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
        <input
          autoFocus
          value={draft}
          maxLength={3}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          onBlur={save}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setEditing(false); setError(null); }
          }}
          placeholder="ABC"
          title="3 lettres — vide = code automatique. Entrée pour valider, Échap pour annuler."
          className="w-12 font-mono text-[10px] font-bold tracking-widest uppercase text-center bg-neutral-950 text-white border border-blue-500 rounded px-1 py-0.5 outline-none disabled:opacity-50"
        />
        {error && (
          <span className="absolute top-full left-0 mt-1 z-50 whitespace-nowrap rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white shadow-lg normal-case tracking-normal">
            {error}
          </span>
        )}
      </span>
    );
  }

  const base =
    variant === "badge"
      ? "px-1.5 py-0.5 rounded-md bg-black/60 border border-neutral-600/60 backdrop-blur-md shadow-sm"
      : "px-1 rounded bg-neutral-800";

  const tone = copied
    ? "text-green-400 border-green-500/60"
    : "text-neutral-300 hover:text-white hover:border-blue-500/60";

  return (
    <span
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={
        copied
          ? "Copié"
          : `Cliquer pour copier : ${copyTextForCode(code)}${editable ? "\nDouble-clic pour modifier le code" : ""}`
      }
      className={`font-mono text-[10px] font-bold tracking-widest leading-none select-none cursor-pointer transition-colors ${base} ${tone} ${className}`}
    >
      {copied ? "Copié" : code}
    </span>
  );
}
