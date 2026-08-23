"use client";

import { useRef, useState } from "react";
import { Upload, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadToMyDrive } from "@/lib/uploadToMyDrive";
import { deleteDriveItemAction } from "@/features/mydrive/modify";
import type { MyDriveItem } from "@/features/mydrive/types";

interface Props {
  item: MyDriveItem;
  imageHeightClass: string;
}

export default function PendingCard({ item, imageHeightClass }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const { imagePath, publicUrl } = await uploadToMyDrive(file, setProgress);
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const { error } = await supabase
        .from("MyDrive")
        .update({
          image_path: imagePath,
          image_url: publicUrl,
          type: "file",
          doc_type: isPdf ? "scan" : null,
        })
        .eq("id", item.id);
      if (error) throw new Error(error.message);
      // Realtime dans FolderView rafraîchira automatiquement la page.
    } catch (err: any) {
      alert("Erreur upload : " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Supprimer le placeholder « ${item.title} » ?`)) return;
    try {
      await deleteDriveItemAction(item.id, "");
    } catch (err: any) {
      alert("Erreur : " + err.message);
    }
  }

  return (
    <div className="group relative flex flex-col bg-neutral-900 border border-amber-500/40 rounded-xl overflow-hidden hover:border-amber-400 transition-all">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,.heic,.heif"
        className="hidden"
        onChange={handleFile}
      />

      {/* Bouton supprimer */}
      <button
        onClick={handleDelete}
        className="absolute top-2 right-2 z-20 w-7 h-7 flex items-center justify-center rounded-lg bg-red-600/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        title="Supprimer"
      >
        <Trash2 size={13} />
      </button>

      {/* Zone de drop / clic pour uploader */}
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        disabled={uploading}
        className={`${imageHeightClass} w-full flex flex-col items-center justify-center gap-3 bg-neutral-950 border-b-2 border-dashed border-amber-500/40 hover:bg-amber-500/5 transition-colors cursor-pointer disabled:cursor-not-allowed`}
      >
        {uploading ? (
          <>
            <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono text-amber-400">{progress} %</span>
          </>
        ) : (
          <>
            <Upload size={40} className="text-amber-400/70" />
            <span className="text-xs text-amber-400/90 font-medium">Cliquer pour uploader</span>
          </>
        )}
      </button>

      <div className="p-3 flex flex-col gap-1">
        <h3 className="font-medium text-neutral-200 truncate text-sm">{item.title}</h3>
        <span className="text-[10px] text-amber-400 uppercase tracking-wide font-bold">En attente</span>
      </div>
    </div>
  );
}
