import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Share2, BookOpen } from "lucide-react";
import DocExportMenu from "@/components/DocExportMenu";
import TtsButton from "@/components/TtsButton";
import { useThemeStore } from "@/store/themeStore";
import ItemCodeBadge from "@/features/mydrive/components/ItemCodeBadge";

interface DocHeaderProps {
  id?: string;
  /** Retour vers le dossier contenant le doc (#4). Repli : /mydrive. */
  backHref?: string;
  title: string;
  observation: string;
  status: "idle" | "saving" | "saved";
  onTitleChange: (val: string) => void;
  onObservationChange: (val: string) => void;
  getContent?: () => string;
  onOpenBook?: () => void;
}

export default function DocHeader({
  id,
  backHref,
  title,
  observation,
  status,
  onTitleChange,
  onObservationChange,
  getContent,
  onOpenBook,
}: DocHeaderProps) {
  const light = useThemeStore((s) => s.theme) === "light";
  const [shareCopied, setShareCopied] = useState(false);

  const copyShareLink = async () => {
    if (!id) return;
    const url = `${window.location.origin}/view/${id}`;
    // Marque le doc comme partagé (ignoré si la colonne is_public n'existe pas encore)
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      await supabase.from("MyDrive").update({ is_public: true }).eq("id", id);
    } catch {}
    try { await navigator.clipboard.writeText(url); } catch {
      const ta = document.createElement("textarea");
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  return (
    <div className="flex flex-col shrink-0">
      <div className={`${light ? "bg-neutral-100 border-neutral-300" : "bg-neutral-900 border-neutral-800"} border-b p-3 flex items-center gap-3`}>
        <Link href={backHref || "/mydrive"} className={`transition-colors p-2 rounded-lg shrink-0 ${light ? "text-neutral-500 hover:text-neutral-900 bg-neutral-200" : "text-neutral-400 hover:text-white bg-neutral-800"}`}>
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Titre du document..."
          className={`flex-1 bg-transparent text-xl font-bold outline-none ${light ? "text-neutral-900 placeholder-neutral-400" : "text-white placeholder-neutral-600"}`}
        />

        {onOpenBook && (
          <button
            onClick={onOpenBook}
            title="Mode lecture (Book)"
            className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors shrink-0 ${light ? "bg-neutral-200 border-neutral-300 text-neutral-600 hover:bg-neutral-300" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"}`}
          >
            <BookOpen size={16} />
          </button>
        )}

        {getContent && <TtsButton getContent={getContent} title={title} />}

        {id && (
          <button
            onClick={copyShareLink}
            title="Copier le lien de partage (lecture seule)"
            className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors shrink-0 ${shareCopied ? "bg-green-600 border-green-500 text-white" : light ? "bg-neutral-200 border-neutral-300 text-neutral-600 hover:bg-neutral-300" : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"}`}
          >
            {shareCopied ? "✓" : <Share2 size={15} />}
          </button>
        )}

        {id && <ItemCodeBadge id={id} variant="inline" />}

        <span className={`text-xs px-2 py-1 rounded-full transition-all shrink-0 ${
          status === "saving" ? "bg-yellow-600/20 text-yellow-400" :
          status === "saved" ? "bg-green-600/20 text-green-400" :
          light ? "bg-neutral-200 text-neutral-500" : "bg-neutral-800 text-neutral-500"
        }`}>
          {status === "saving" ? "Sauvegarde..." : status === "saved" ? "Enregistré" : "Auto-save"}
        </span>

        {getContent && (
          <DocExportMenu title={title} getContent={getContent} />
        )}
      </div>

      <div className={`${light ? "bg-neutral-50 border-neutral-300" : "bg-neutral-900/50 border-neutral-800"} border-b px-4 py-2`}>
        <input
          type="text"
          value={observation}
          onChange={(e) => onObservationChange(e.target.value)}
          placeholder="Description / observation..."
          className={`w-full bg-transparent text-sm outline-none ${light ? "text-neutral-600 placeholder-neutral-400" : "text-neutral-400 placeholder-neutral-700"}`}
        />
      </div>
    </div>
  );
}
