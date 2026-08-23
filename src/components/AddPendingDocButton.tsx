"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function getParentFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )mydrive-parent=([^;]*)/);
  const v = m ? decodeURIComponent(m[1]) : "";
  return v && v !== "__unfiled__" ? v : null;
}

export default function AddPendingDocButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    const t = title.trim();
    if (!t) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("MyDrive").insert({
        title: t,
        type: "pending",
        doc_type: null,
        image_path: "",
        image_url: "",
        observation: "",
        content: "",
        parent_id: getParentFromCookie(),
      });
      if (error) throw new Error(error.message);
      setTitle("");
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      alert("Erreur : " + e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-amber-500 text-amber-400 hover:bg-amber-500 hover:text-black transition-colors"
      >
        <Clock size={16} /> En attente
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-5 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">Nouveau doc en attente</h3>
            <p className="text-xs text-neutral-500 mb-4">Un placeholder sera créé dans le dossier courant. Clique dessus plus tard pour uploader le fichier.</p>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Titre du document (ex. Relévé bancaire 2024)"
              className="w-full bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-amber-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-neutral-400 hover:text-white">Annuler</button>
              <button
                onClick={handleCreate}
                disabled={!title.trim() || creating}
                className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg disabled:opacity-50"
              >
                {creating ? "…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
