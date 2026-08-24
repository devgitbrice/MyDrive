"use client";

import { useEffect, useRef, useState } from "react";
import { useItemCode } from "@/features/mydrive/components/ItemCodeProvider";
import { copyTextForCode } from "@/features/mydrive/lib/itemCode";

type Props = {
  id: string;
  /** Style d'affichage : pastille sur vignette, ou texte inline. */
  variant?: "badge" | "inline";
  className?: string;
};

/**
 * Affiche le code 3 lettres d'un élément. Un clic copie dans le presse-papier
 * la phrase prête à coller (Dans le code "ABC" fais ça : ) et affiche
 * « Copié » en vert pendant 2 secondes, sans déclencher la navigation.
 */
export default function ItemCodeBadge({ id, variant = "badge", className = "" }: Props) {
  const code = useItemCode(id);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  const base =
    variant === "badge"
      ? "px-1.5 py-0.5 rounded-md bg-black/60 border border-neutral-600/60 backdrop-blur-md shadow-sm"
      : "px-1 rounded bg-neutral-800";

  const tone = copied
    ? "text-green-400 border-green-500/60"
    : "text-neutral-300 hover:text-white hover:border-blue-500/60";

  return (
    <span
      onClick={handleCopy}
      title={copied ? "Copié" : `Cliquer pour copier : ${copyTextForCode(code)}`}
      className={`font-mono text-[10px] font-bold tracking-widest leading-none select-none cursor-pointer transition-colors ${base} ${tone} ${className}`}
    >
      {copied ? "Copié" : code}
    </span>
  );
}
