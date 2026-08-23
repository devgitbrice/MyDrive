"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useNewItemStore } from "@/store/newItemStore";

export default function AddFileButton() {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const photoLibraryRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const setPhoto = useNewItemStore((s) => s.setPhoto);

  const hiddenInputStyle: React.CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  };

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setPhoto(file);
    e.currentTarget.value = "";
    setOpen(false);
    router.push("/add");
  }

  return (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={hiddenInputStyle} onChange={handleFileChange} />
      <input ref={photoLibraryRef} type="file" accept="image/*" style={hiddenInputStyle} onChange={handleFileChange} />
      <input ref={filesRef} type="file" accept="image/*,.pdf,.heic,.heif,.png,.jpg,.jpeg,.webp,.gif" style={hiddenInputStyle} onChange={handleFileChange} />

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <Plus size={16} /> Fichier
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="bg-neutral-900 border border-neutral-700 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 pb-8 sm:pb-4 space-y-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center text-sm text-neutral-400 mb-4">Choisir une source</div>

            <button type="button" onClick={() => cameraRef.current?.click()} className="w-full rounded-xl px-4 py-4 text-left font-medium bg-neutral-800 hover:bg-neutral-700 text-white flex items-center gap-3">
              <span className="text-2xl">📷</span>
              <div>
                <div>Appareil photo</div>
                <div className="text-sm text-neutral-400">Prendre une nouvelle photo</div>
              </div>
            </button>

            <button type="button" onClick={() => photoLibraryRef.current?.click()} className="w-full rounded-xl px-4 py-4 text-left font-medium bg-neutral-800 hover:bg-neutral-700 text-white flex items-center gap-3">
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

            <button type="button" onClick={() => setOpen(false)} className="w-full rounded-xl px-4 py-3 text-center font-medium text-neutral-400 mt-2">
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  );
}
