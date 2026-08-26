"use client";

import Link from "next/link";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";
import ItemCodeBadge from "@/features/mydrive/components/ItemCodeBadge";

type TableHeaderProps = {
  id?: string;
  title: string;
  setTitle: (t: string) => void;
  description: string;
  setDescription: (d: string) => void;
  onSave: () => void;
  status: "idle" | "saving";
  onDictationText?: (text: string) => void;
};

export default function TableHeader({
  id,
  title,
  setTitle,
  description,
  setDescription,
  onSave,
  status,
  onDictationText,
}: TableHeaderProps) {
  const { state: dictState, toggle: toggleDictation } = useVoiceDictation(
    (text) => {
      if (onDictationText) onDictationText(text);
    }
  );

  return (
    <header className="border-b border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre du tableau..."
              className="flex-1 bg-transparent text-2xl font-bold text-white placeholder-neutral-600 outline-none"
            />
            {id && <ItemCodeBadge id={id} variant="inline" />}
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description optionnelle..."
            className="w-full bg-transparent text-sm text-neutral-400 placeholder-neutral-700 outline-none focus:text-white"
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Voice dictation button */}
          <button
            onClick={toggleDictation}
            title={
              dictState === "recording"
                ? "Arreter la dictee"
                : "Dictee vocale - ecrit dans la cellule active"
            }
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
              dictState === "recording"
                ? "bg-red-600 text-white animate-pulse"
                : dictState === "connecting"
                ? "bg-yellow-600 text-white"
                : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
            }`}
          >
            {dictState === "connecting" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : dictState === "recording" ? (
              <MicOff size={14} />
            ) : (
              <Mic size={14} />
            )}
            {dictState === "recording" ? "Arreter" : "Dicter"}
          </button>

          <Link
            href="/mydrive"
            className="rounded-xl px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            Annuler
          </Link>
          <button
            onClick={onSave}
            disabled={!title.trim() || status === "saving"}
            className="rounded-xl bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {status === "saving" ? "Sauvegarde..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </header>
  );
}
