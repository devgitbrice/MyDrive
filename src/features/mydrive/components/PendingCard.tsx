"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { uploadToMyDrive } from "@/lib/uploadToMyDrive";
import { deleteDriveItemAction } from "@/features/mydrive/modify";
import type { MyDriveItem } from "@/features/mydrive/types";

interface Props {
  item: MyDriveItem;
  imageHeightClass: string;
}

export default function PendingCard({ item, imageHeightClass }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPickerOpen(false);
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
    } catch (err: any) {
      alert("Erreur upload : " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
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
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <input ref={filesRef} type="file" accept="image/*,.pdf,.heic,.heif,.png,.jpg,.jpeg,.webp,.gif" className="hidden" onChange={handleFile} />

      <button
        onClick={handleDelete}
        className="absolute top-2 right-2 z-20 w-7 h-7 flex items-center justify-center rounded-lg bg-red-600/80 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        title="Supprimer"
      >
        <Trash2 size={13} />
      </button>

      <button
        type="button"
        onClick={() => !uploading && setPickerOpen(true)}
        disabled={uploading}
        className={`${imageHeightClass} w-full flex flex-col items-center justify-center gap-3 bg-neutral-950 border-b-2 border-dashed border-amber-500/40 hover:bg-amber-500/5 transition-colors cursor-pointer disabled:cursor-not-allowed`}
      >
        {uploading ? (
          <>
            <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono text-amber-400">{progress} %</span>
          </>
        ) : (
          <span className="text-base font-bold text-red-500 uppercase tracking-wide text-center px-4">
            En attente de chargement
          </span>
        )}
      </button>

      <div className="p-3 flex flex-col gap-1">
        <h3 className="font-medium text-neutral-200 truncate text-sm">{item.title}</h3>
        <span className="text-[10px] text-amber-400 uppercase tracking-wide font-bold">En attente</span>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setPickerOpen(false)}>
          <div className="bg-neutral-900 border border-neutral-700 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-8 sm:pb-4 space-y-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-sm text-neutral-400 mb-4">Choisir une source pour <span className="text-amber-400 font-semibold">{item.title}</span></div>

            <button type="button" onClick={() => cameraRef.current?.click()} className="w-full rounded-xl px-4 py-4 text-left font-medium bg-neutral-800 hover:bg-neutral-700 text-white flex items-center gap-3">
              <span className="text-2xl">📷</span>
              <div>
                <div>Appareil photo</div>
                <div className="text-sm text-neutral-400">Prendre une nouvelle photo</div>
              </div>
            </button>

            <button type="button" onClick={() => photoRef.current?.click()} className="w-full rounded-xl px-4 py-4 text-left font-medium bg-neutral-800 hover:bg-neutral-700 text-white flex items-center gap-3">
              <span className="text-2xl">🖼️</span>
              <div>
                <div>Photothèque</div>
                <div className="text-sm text-neutral-400">Choisir une photo existante</div>
              </div>
            </button>

            <button type="button" onClick={() => filesRef.current?.click()} className="w-full rounded-xl px-4 py-4 text-left font-medium bg-neutral-800 hover:bg-neutral-700 text-white flex items-center gap-3">
              <span className="text-2xl">📁</span>
              <div>
                <div>Fichiers</div>
                <div className="text-sm text-neutral-400">Parcourir vos fichiers (PDF, images…)</div>
              </div>
            </button>

            <button type="button" onClick={() => setPickerOpen(false)} className="w-full rounded-xl px-4 py-3 text-center font-medium text-neutral-400 mt-2">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
