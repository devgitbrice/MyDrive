"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "@/components/Toaster";
import type { MyDriveItem, Tag } from "@/features/mydrive/types";
import ImageEditor from "./ImageEditor";
import TagSelector from "./TagSelector";
import { updateDriveItemAction, updateDriveContentAction } from "@/features/mydrive/modify";
import { supabase } from "@/lib/supabaseClient";

function filenameFromUrl(url: string | null | undefined, fallbackId: string) {
  if (!url) return `${fallbackId}.jpg`;
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop();
    return last && last.length > 0 ? last : `${fallbackId}.jpg`;
  } catch {
    return `${fallbackId}.jpg`;
  }
}

function isPdf(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.toLowerCase().endsWith('.pdf');
}

type Props = {
  items: MyDriveItem[];
  selectedIndex: number;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
  onUpdate?: (id: string, updates: Partial<MyDriveItem>) => void;
  onDelete?: (id: string, imagePath: string) => void;
  allTags: Tag[];
  onTagsChange: (itemId: string, newTags: Tag[]) => void;
  onNewTagCreated: (tag: Tag) => void;
};

export default function SwipeableOverlay({
  items,
  selectedIndex,
  onClose,
  onNavigate,
  onUpdate,
  onDelete,
  allTags,
  onTagsChange,
  onNewTagCreated,
}: Props) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const currentItem = items[selectedIndex];

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");

  const [isEditingObs, setIsEditingObs] = useState(false);
  const [obsValue, setObsValue] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [isEditingContent, setIsEditingContent] = useState(false);
  const [contentValue, setContentValue] = useState("");

  const [editorMode, setEditorMode] = useState<"crop" | "rotate" | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [imageOrientation, setImageOrientation] = useState<"landscape" | "portrait" | null>(null);

  useEffect(() => {
    if (currentItem) {
      setTitleValue(currentItem.title);
      setObsValue(currentItem.observation || "");
      setContentValue(currentItem.content || "");
      setIsEditingTitle(false);
      setIsEditingObs(false);
      setIsEditingContent(false);
      setShowDeleteConfirm(false);
      setImageOrientation(null);
    }
  }, [currentItem]);

  const goNext = useCallback(() => {
    if (selectedIndex < items.length - 1) {
      onNavigate(selectedIndex + 1);
    }
  }, [selectedIndex, items.length, onNavigate]);

  const goPrev = useCallback(() => {
    if (selectedIndex > 0) {
      onNavigate(selectedIndex - 1);
    }
  }, [selectedIndex, onNavigate]);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) goNext();
    if (isRightSwipe) goPrev();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingTitle || isEditingObs || isEditingContent) {
        if (e.key === "Escape") {
          setIsEditingTitle(false);
          setIsEditingObs(false);
          setIsEditingContent(false);
        }
        return;
      }
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, onClose, isEditingTitle, isEditingObs, isEditingContent]);

  const saveTitle = () => {
    setIsEditingTitle(false);
    if (titleValue.trim() !== currentItem?.title && onUpdate && currentItem) {
      onUpdate(currentItem.id, { title: titleValue.trim() });
    }
  };

  const saveObs = () => {
    setIsEditingObs(false);
    if (obsValue?.trim() !== currentItem?.observation && onUpdate && currentItem) {
      onUpdate(currentItem.id, { observation: obsValue.trim() });
    }
  };

  const saveContent = async () => {
    setIsEditingContent(false);
    if (contentValue !== currentItem?.content && currentItem) {
      try {
        await updateDriveContentAction(currentItem.id, contentValue);
        if (onUpdate) {
          onUpdate(currentItem.id, { content: contentValue });
        }
      } catch (error) {
        console.error("Erreur sauvegarde contenu:", error);
      }
    }
  };

  const handleDelete = () => {
    if (onDelete && currentItem) {
      onDelete(currentItem.id, currentItem.image_path || "");
    }
  };

  const handleSaveEditedImage = async (blob: Blob) => {
    if (!currentItem) return;
    if (!currentItem.image_path) {
      toast("Erreur : chemin de l'image manquant, impossible de sauvegarder");
      return;
    }
    setIsSaving(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from("MyDrive")
        .upload(currentItem.image_path, blob, {
          upsert: true,
          contentType: "image/jpeg",
          cacheControl: "3600",
        });

      if (uploadError) {
        console.error("Erreur upload Supabase:", uploadError);
        toast(`Erreur upload : ${uploadError.message}`);
        return;
      }

      const { data } = supabase.storage.from("MyDrive").getPublicUrl(currentItem.image_path);
      const newUrl = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;

      if (newUrl) {
        await updateDriveItemAction(currentItem.id, { image_url: newUrl });
        if (onUpdate) {
          onUpdate(currentItem.id, { image_url: newUrl } as Partial<MyDriveItem>);
        }
      }

      setEditorMode(null);
      window.location.reload();
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      toast(`Erreur : ${error instanceof Error ? error.message : "erreur inconnue"}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentItem) return null;

  const rawUrl = currentItem.image_url ? currentItem.image_url.trim() : "";
  const validUrl = rawUrl.length > 0 ? rawUrl : null;

  const isDoc = currentItem.doc_type === "doc" || currentItem.doc_type === "table" || currentItem.doc_type === "mindmap";
  const isImage = !isDoc && validUrl && !isPdf(validUrl);
  const downloadName = filenameFromUrl(validUrl, currentItem.id);

  // Layout décidé par l'orientation de l'image :
  // - landscape (w >= h) → stacked : image en haut, infos en bas (mobile + desktop)
  // - portrait (h > w) → split desktop / centré-overlay mobile
  const layoutMode: "split" | "stacked" =
    imageOrientation === "landscape" || (isDoc && imageOrientation === null)
      ? "stacked"
      : imageOrientation === "portrait"
      ? "split"
      : "split";

  const renderVisualContent = (contentMaxClass = "max-w-full max-h-[75vh] md:max-h-[85vh]") => {
    if (currentItem.doc_type === "doc") {
      return (
        <div
          className="w-full max-w-lg bg-neutral-900 rounded-xl p-6 max-h-[75vh] overflow-y-auto border border-neutral-800 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center mb-4">
            <svg className="w-12 h-12 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div className="text-gray-300 whitespace-pre-wrap text-sm leading-relaxed font-mono">
            {currentItem.content || <span className="italic opacity-50">Aucun contenu</span>}
          </div>
        </div>
      );
    }

    if (validUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={validUrl}
          alt={currentItem.title}
          className={`${contentMaxClass} object-contain rounded shadow-2xl select-none ${isPdf(validUrl) ? 'bg-white p-4' : ''}`}
          onClick={(e) => e.stopPropagation()}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setImageOrientation(img.naturalWidth >= img.naturalHeight ? "landscape" : "portrait");
            }
          }}
          draggable={false}
        />
      );
    }

    return (
      <div className="flex flex-col items-center justify-center text-neutral-600">
        {currentItem.type === 'folder' ? (
          <svg className="w-48 h-48 opacity-60" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" /></svg>
        ) : (
          <svg className="w-48 h-48 opacity-40" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        )}
        <p className="mt-4 text-xl font-medium text-neutral-500">{currentItem.title}</p>
      </div>
    );
  };

  if (editorMode && isImage && validUrl) {
    return (
      <ImageEditor
        imageUrl={validUrl}
        mode={editorMode}
        onSave={handleSaveEditedImage}
        onCancel={() => setEditorMode(null)}
      />
    );
  }

  // Bloc d'infos réutilisable
  const infoBlock = (
    <div
      className="h-full flex flex-col p-4 md:p-8 overflow-y-auto bg-neutral-950/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-4">
        {isEditingTitle ? (
          <input type="text" value={titleValue} onChange={(e) => setTitleValue(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === "Enter" && saveTitle()} autoFocus className="w-full bg-neutral-900 text-white text-xl md:text-2xl font-bold border border-blue-500 rounded-lg px-3 py-2 md:px-4 md:py-3 outline-none" />
        ) : (
          <h2 onClick={() => setIsEditingTitle(true)} className="text-xl md:text-2xl font-bold text-white cursor-text hover:text-blue-400 transition-colors py-1" title="Cliquer pour modifier">{titleValue || <span className="italic opacity-50">Ajouter un titre...</span>}</h2>
        )}
      </div>

      <div className="mb-6 flex-1">
        <label className="block text-xs text-neutral-500 mb-2 uppercase tracking-wide font-bold">Description</label>
        {isEditingObs ? (
          <textarea value={obsValue} onChange={(e) => setObsValue(e.target.value)} onBlur={saveObs} autoFocus rows={5} className="w-full bg-neutral-900 text-gray-200 border border-blue-500 rounded-lg p-3 outline-none resize-none" />
        ) : (
          <p onClick={() => setIsEditingObs(true)} className="text-sm md:text-base text-gray-300 cursor-text hover:text-white transition-colors min-h-[60px] whitespace-pre-wrap">{obsValue || <span className="italic opacity-50">Ajouter une description...</span>}</p>
        )}
      </div>

      {currentItem.doc_type === "doc" && (
        <div className="border-t border-neutral-800 pt-4 mb-4">
          <label className="block text-xs text-neutral-500 mb-2 uppercase tracking-wide font-bold">Contenu</label>
          {isEditingContent ? (
            <textarea value={contentValue} onChange={(e) => setContentValue(e.target.value)} onBlur={saveContent} autoFocus rows={10} className="w-full bg-neutral-900 text-gray-200 border border-blue-500 rounded-lg p-3 outline-none resize-y font-mono text-sm" />
          ) : (
            <div onClick={() => setIsEditingContent(true)} className="text-gray-300 cursor-text hover:text-white transition-colors min-h-[80px] whitespace-pre-wrap bg-neutral-900/50 rounded-lg p-3 border border-neutral-800 text-sm">
              {contentValue || <span className="italic opacity-50">Cliquer pour rédiger...</span>}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-neutral-800 pt-4">
        <label className="block text-xs text-neutral-500 mb-2 uppercase tracking-wide font-bold">Mots-clés</label>
        <TagSelector itemId={currentItem.id} itemTags={currentItem.tags || []} allTags={allTags} onTagsChange={onTagsChange} onNewTagCreated={onNewTagCreated} />
      </div>

      <div className="mt-4 pt-4 border-t border-neutral-800 flex justify-between items-center gap-3">
        <div className="text-xs text-neutral-500">
          <p>ID: <span className="font-mono">{currentItem.id.slice(0, 8)}</span></p>
          <p>Type: <span className="uppercase">{currentItem.type}</span></p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isImage && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setEditorMode("crop"); }} className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 text-xs text-white backdrop-blur">Rogner</button>
              <button onClick={(e) => { e.stopPropagation(); setEditorMode("rotate"); }} className="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-2 text-xs text-white backdrop-blur">Pivoter</button>
            </>
          )}
          {validUrl && (
            <a href={validUrl} download={downloadName} className="rounded-lg bg-white text-black px-3 py-2 text-xs font-bold hover:bg-neutral-200 transition-colors">Télécharger</a>
          )}
        </div>
      </div>
    </div>
  );

  const visualPane = (
    <div className="w-full h-full flex flex-col items-center justify-center relative p-4">
      {selectedIndex > 0 && (
        <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 p-2 md:p-3 rounded-full text-white z-10">←</button>
      )}

      {renderVisualContent(
        layoutMode === "stacked"
          ? "max-w-full max-h-[55vh] md:max-h-[60vh]"
          : "max-w-full max-h-[75vh] md:max-h-[85vh]"
      )}

      {selectedIndex < items.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 p-2 md:p-3 rounded-full text-white z-10">→</button>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/50 text-sm pointer-events-none z-20">
        {selectedIndex + 1} / {items.length}
      </div>

      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/20 text-sm px-3 py-2 rounded-lg transition-colors"
          >
            Supprimer
          </button>
        )}
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white text-2xl p-2"
        >
          ✕
        </button>
      </div>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
        >
          <div className="bg-neutral-900 rounded-xl p-6 max-w-sm mx-4 shadow-2xl border border-neutral-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-2">Supprimer ce document ?</h3>
            <p className="text-neutral-400 text-sm mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm text-neutral-300 hover:text-white">Annuler</button>
              <button onClick={() => { handleDelete(); setShowDeleteConfirm(false); }} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* --- LAYOUT ADAPTATIF (mobile + desktop) --- */}
      {layoutMode === "split" ? (
        // Portrait image : côte à côte sur desktop, empilé (image centrée) sur mobile
        <>
          {/* Desktop côte à côte */}
          <div className="hidden md:flex flex-row w-full h-full pt-12">
            <div className="w-1/2 h-full">{visualPane}</div>
            <div className="w-1/2 h-full border-l border-white/5">{infoBlock}</div>
          </div>
          {/* Mobile : image en haut, infos en bas (les 2 en flux) */}
          <div className="md:hidden flex flex-col w-full h-full pt-12">
            <div className="w-full flex-1 min-h-0">{visualPane}</div>
            <div className="w-full h-[45vh] border-t border-white/5">{infoBlock}</div>
          </div>
        </>
      ) : (
        // Landscape image : image en haut, infos en bas (mobile + desktop)
        <div className="flex flex-col w-full h-full pt-12">
          <div className="w-full h-3/5 min-h-0">{visualPane}</div>
          <div className="w-full h-2/5 border-t border-white/5">{infoBlock}</div>
        </div>
      )}
    </div>
  );
}
