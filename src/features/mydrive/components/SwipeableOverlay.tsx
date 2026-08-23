"use client";

import { useEffect, useState, useCallback } from "react";
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

  // Orientation détectée de l'image affichée (null tant qu'elle n'est pas chargée)
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
      alert("Erreur : chemin de l'image manquant, impossible de sauvegarder");
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
        alert(`Erreur upload : ${uploadError.message}`);
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
      alert(`Erreur : ${error instanceof Error ? error.message : "erreur inconnue"}`);
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
  // - portrait (h > w) → split : image à gauche, infos à droite
  // - landscape (w >= h) ou docs → stacked : image en haut, infos en bas
  // Fallback : split (comme avant) tant que l'orientation n'est pas connue.
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

  // Bloc d'informations réutilisé dans les 2 layouts
  const infoBlock = (
    <div
      className="h-full flex flex-col p-6 md:p-8 overflow-y-auto bg-neutral-950/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-6">
        {isEditingTitle ? (
          <input type="text" value={titleValue} onChange={(e) => setTitleValue(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === "Enter" && saveTitle()} autoFocus className="w-full bg-neutral-900 text-white text-2xl font-bold border border-blue-500 rounded-lg px-4 py-3 outline-none" />
        ) : (
          <h2 onClick={() => setIsEditingTitle(true)} className="text-2xl font-bold text-white cursor-text hover:text-blue-400 transition-colors py-2" title="Cliquer pour modifier">{titleValue || <span className="italic opacity-50">Ajouter un titre...</span>}</h2>
        )}
      </div>

      <div className="mb-8 flex-1">
        <label className="block text-xs text-neutral-500 mb-2 uppercase tracking-wide font-bold">Description</label>
        {isEditingObs ? (
          <textarea value={obsValue} onChange={(e) => setObsValue(e.target.value)} onBlur={saveObs} autoFocus rows={6} className="w-full bg-neutral-900 text-gray-200 border border-blue-500 rounded-lg p-4 outline-none resize-none" />
        ) : (
          <p onClick={() => setIsEditingObs(true)} className="text-gray-300 cursor-text hover:text-white transition-colors min-h-[100px] whitespace-pre-wrap">{obsValue || <span className="italic opacity-50">Ajouter une description...</span>}</p>
        )}
      </div>

      {currentItem.doc_type === "doc" && (
        <div className="border-t border-neutral-800 pt-6 mb-6">
          <label className="block text-xs text-neutral-500 mb-3 uppercase tracking-wide font-bold">Contenu</label>
          {isEditingContent ? (
            <textarea value={contentValue} onChange={(e) => setContentValue(e.target.value)} onBlur={saveContent} autoFocus rows={12} className="w-full bg-neutral-900 text-gray-200 border border-blue-500 rounded-lg p-4 outline-none resize-y font-mono text-sm" />
          ) : (
            <div onClick={() => setIsEditingContent(true)} className="text-gray-300 cursor-text hover:text-white transition-colors min-h-[150px] whitespace-pre-wrap bg-neutral-900/50 rounded-lg p-4 border border-neutral-800">
              {contentValue || <span className="italic opacity-50">Cliquer pour rédiger...</span>}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-neutral-800 pt-6">
        <label className="block text-xs text-neutral-500 mb-3 uppercase tracking-wide font-bold">Mots-clés</label>
        <TagSelector itemId={currentItem.id} itemTags={currentItem.tags || []} allTags={allTags} onTagsChange={onTagsChange} onNewTagCreated={onNewTagCreated} />
      </div>

      <div className="mt-auto pt-6 border-t border-neutral-800 flex justify-between items-center">
        <div className="text-xs text-neutral-500">
          <p>ID: <span className="font-mono">{currentItem.id.slice(0, 8)}</span></p>
          <p>Type: <span className="uppercase">{currentItem.type}</span></p>
        </div>
        {validUrl && (
          <a href={validUrl} download={downloadName} className="rounded-lg bg-white text-black px-4 py-2 text-sm font-bold hover:bg-neutral-200 transition-colors">Télécharger</a>
        )}
      </div>
    </div>
  );

  const visualPane = (
    <div className="w-full h-full flex flex-col items-center justify-center relative p-4">
      {selectedIndex > 0 && (
        <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 p-3 rounded-full text-white z-10">←</button>
      )}

      {renderVisualContent(
        layoutMode === "stacked"
          ? "max-w-full max-h-[55vh] md:max-h-[60vh]"
          : "max-w-full max-h-[75vh] md:max-h-[85vh]"
      )}

      {isImage && (
        <div className="flex items-center gap-3 mt-4">
          <button onClick={(e) => { e.stopPropagation(); setEditorMode("crop"); }} className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm text-white backdrop-blur">Rogner</button>
          <button onClick={(e) => { e.stopPropagation(); setEditorMode("rotate"); }} className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm text-white backdrop-blur">Pivoter</button>
        </div>
      )}

      {selectedIndex < items.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 p-3 rounded-full text-white z-10">→</button>
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

      {/* --- Layout Mobile : toujours empilé --- */}
      <div className="md:hidden w-full h-full flex flex-col items-center justify-center p-2 pb-20">
        <div className="relative w-full flex-1 flex items-center justify-center">
          {renderVisualContent("max-w-full max-h-[70vh]")}
        </div>

        {!isDoc && (
          <div className="absolute bottom-8 left-0 right-0 text-white text-center px-4">
            <h2 className="text-lg font-semibold mb-3 truncate">{currentItem.title}</h2>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {isImage && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setEditorMode("crop"); }} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white backdrop-blur">Rogner</button>
                  <button onClick={(e) => { e.stopPropagation(); setEditorMode("rotate"); }} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white backdrop-blur">Pivoter</button>
                </>
              )}
              {validUrl && (
                <a href={validUrl} download={downloadName} onClick={(e) => e.stopPropagation()} className="rounded-lg bg-white text-black px-4 py-2 text-sm font-bold">Télécharger</a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- Layout Desktop : adaptatif selon orientation image --- */}
      {layoutMode === "split" ? (
        <div className="hidden md:flex flex-row w-full h-full">
          <div className="w-1/2 h-full">{visualPane}</div>
          <div className="w-1/2 h-full border-l border-white/5">{infoBlock}</div>
        </div>
      ) : (
        <div className="hidden md:flex flex-col w-full h-full">
          <div className="w-full h-3/5">{visualPane}</div>
          <div className="w-full h-2/5 border-t border-white/5">{infoBlock}</div>
        </div>
      )}
    </div>
  );
}
