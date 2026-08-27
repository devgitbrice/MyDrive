"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "@/components/Toaster";
import { createDocRow } from "@/lib/createDocRow";
import { addTagToItemAction, updateDriveItemAction } from "@/features/mydrive/modify";
import PresentationHeader from "./PresentationHeader";
import PresentationSidebar from "./PresentationSidebar";
import PresentationToolbar from "./PresentationToolbar";
import SlideCanvas from "./SlideCanvas";
import PresentationTags from "./PresentationTags";
import BroadcastMode from "./BroadcastMode";
import NanoBananaPanel from "./NanoBananaPanel";
import FileSearchModal, { getEditUrl, type SearchResult } from "@/components/FileSearchModal";
import type { Tag } from "@/features/mydrive/types";
import type { Slide, SlideElement, PresentationStyles, SlideCategory } from "../types";
import { parsePresentationData, createDefaultSlide, DEFAULT_PRESENTATION_STYLES } from "../types";

interface PresentationEditorProps {
  initialData?: {
    id: string;
    title: string;
    content: string;
    observation: string;
    tags: Tag[];
  };
}

export default function PresentationEditor({ initialData }: PresentationEditorProps) {
  const initialPData = initialData?.content ? parsePresentationData(initialData.content) : null;

  const [docId, setDocId] = useState(initialData?.id || "");
  const [docTitle, setDocTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.observation || "");

  const [slides, setSlides] = useState<Slide[]>(
    initialPData?.slides || [createDefaultSlide()]
  );
  const [presentationStyles, setPresentationStyles] = useState<PresentationStyles>(
    initialPData?.styles || DEFAULT_PRESENTATION_STYLES
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [copiedSlide, setCopiedSlide] = useState<Slide | null>(null);

  const [broadcasting, setBroadcasting] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [nanoBananaOpen, setNanoBananaOpen] = useState(false);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);

  const [slideCategories, setSlideCategories] = useState<SlideCategory[]>(
    initialPData?.slideCategories || []
  );
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const [selectedTags, setSelectedTags] = useState<Tag[]>(initialData?.tags || []);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  // Clear selection when changing slides
  useEffect(() => {
    setSelectedElementId(null);
    setEditingElementId(null);
  }, [currentIndex]);

  // Cmd+K : ouvrir la recherche de fichiers
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setFileSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─── Slide-level keyboard shortcuts ────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle when no element is selected/edited
      if (selectedElementId || editingElementId) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;

      // Cmd+C: Copy current slide
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        e.preventDefault();
        setCopiedSlide(structuredClone(slides[currentIndex]));
      }
      // Cmd+V: Paste copied slide
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (!copiedSlide) return;
        e.preventDefault();
        const dup: Slide = {
          ...copiedSlide,
          id: crypto.randomUUID(),
          elements: copiedSlide.elements.map((el) => ({ ...el, id: crypto.randomUUID() })),
        };
        const newSlides = [...slides];
        newSlides.splice(currentIndex + 1, 0, dup);
        setSlides(newSlides);
        setCurrentIndex(currentIndex + 1);
      }
      // Cmd+D: Duplicate current slide
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        const dup: Slide = {
          ...slides[currentIndex],
          id: crypto.randomUUID(),
          elements: slides[currentIndex].elements.map((el) => ({ ...el, id: crypto.randomUUID() })),
        };
        const newSlides = [...slides];
        newSlides.splice(currentIndex + 1, 0, dup);
        setSlides(newSlides);
        setCurrentIndex(currentIndex + 1);
      }
      // Cmd+N: Add new slide
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        const newSlides = [...slides];
        newSlides.splice(currentIndex + 1, 0, createDefaultSlide());
        setSlides(newSlides);
        setCurrentIndex(currentIndex + 1);
      }
      // Backspace / Delete: Delete current slide
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (slides.length <= 1) return;
        const newSlides = slides.filter((_, i) => i !== currentIndex);
        setSlides(newSlides);
        if (currentIndex >= newSlides.length) setCurrentIndex(newSlides.length - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedElementId, editingElementId, slides, currentIndex, copiedSlide]);

  // Listen for chatbot insert events — add text element to current slide
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (!text) return;
      const maxZ = slides[currentIndex]?.elements.length > 0
        ? Math.max(...slides[currentIndex].elements.map((el) => el.zIndex))
        : 0;
      const newEl: SlideElement = {
        id: crypto.randomUUID(),
        type: "text",
        x: 10, y: 30, width: 80, height: 50,
        rotation: 0, zIndex: maxZ + 1,
        content: text,
        style: { fontSize: 18, color: "#333333", textAlign: "left" },
      };
      const newSlides = [...slides];
      newSlides[currentIndex] = {
        ...newSlides[currentIndex],
        elements: [...newSlides[currentIndex].elements, newEl],
      };
      setSlides(newSlides);
      setSelectedElementId(newEl.id);
    };
    window.addEventListener("chatbot-insert", handler);
    return () => window.removeEventListener("chatbot-insert", handler);
  }, [slides, currentIndex]);

  // ─── Auto-save (debounce 1.5s) ─────────────────────────────
  const autoSave = useCallback(async () => {
    if (!docTitle.trim() || savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    try {
      const content = JSON.stringify({ slides, styles: presentationStyles, slideCategories });
      if (docId) {
        await updateDriveItemAction(docId, { title: docTitle.trim(), content, observation: description });
      } else {
        const newId = await createDocRow({
          title: docTitle.trim(), content, doc_type: "presentation", observation: description,
        });
        setDocId(newId);
        for (const tag of selectedTags) await addTagToItemAction(newId, tag.id);
        window.history.replaceState(null, "", `/editpresentation/${newId}`);
      }
    } catch (e) {
      console.error("Auto-save error:", e);
    } finally {
      savingRef.current = false;
      setStatus("idle");
    }
  }, [docId, docTitle, slides, presentationStyles, slideCategories, description, selectedTags]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => autoSave(), 1500);
  }, [autoSave]);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  useEffect(() => {
    if (docTitle.trim()) scheduleAutoSave();
  }, [slides, docTitle, description, presentationStyles, slideCategories, scheduleAutoSave]);

  const handleSave = async () => {
    if (!docTitle.trim()) return toast("Le titre est requis");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setStatus("saving");
    try {
      const content = JSON.stringify({ slides, styles: presentationStyles, slideCategories });
      if (docId) {
        await updateDriveItemAction(docId, { title: docTitle.trim(), content, observation: description });
      } else {
        const newId = await createDocRow({
          title: docTitle.trim(), content, doc_type: "presentation", observation: description,
        });
        setDocId(newId);
        for (const tag of selectedTags) await addTagToItemAction(newId, tag.id);
        window.history.replaceState(null, "", `/editpresentation/${newId}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setStatus("idle");
    }
  };

  const currentSlide = slides[currentIndex];
  const updateCurrentSlide = (s: Slide) => {
    const newSlides = [...slides];
    newSlides[currentIndex] = s;
    setSlides(newSlides);
  };

  const handleInsertDocLink = useCallback((item: SearchResult) => {
    const typeLabels: Record<string, string> = {
      doc: "Doc", python: "Python", mindmap: "Mindmap",
      table: "Table", presentation: "Présentation",
    };
    const label = item.doc_type ? typeLabels[item.doc_type] || "" : "";
    const prefix = label ? `[${label}] ` : "";

    const maxZ = slides[currentIndex]?.elements.length > 0
      ? Math.max(...slides[currentIndex].elements.map((el) => el.zIndex))
      : 0;
    const newEl: SlideElement = {
      id: crypto.randomUUID(),
      type: "text",
      x: 15, y: 40, width: 70, height: 10,
      rotation: 0, zIndex: maxZ + 1,
      content: `${prefix}${item.title}`,
      style: {
        fontSize: 18,
        fontWeight: "500",
        color: "#3b82f6",
        backgroundColor: "#1e293b",
        textAlign: "center",
        borderRadius: 8,
        border: "1px solid #334155",
        padding: 10,
        textDecoration: "underline",
      },
    };
    const newSlides = [...slides];
    newSlides[currentIndex] = {
      ...newSlides[currentIndex],
      elements: [...newSlides[currentIndex].elements, newEl],
    };
    setSlides(newSlides);
    setSelectedElementId(newEl.id);
  }, [slides, currentIndex]);

  const addImageToSlide = (imageDataUrl: string) => {
    const maxZ = currentSlide.elements.length > 0
      ? Math.max(...currentSlide.elements.map((e) => e.zIndex))
      : 0;
    const newEl: SlideElement = {
      id: crypto.randomUUID(),
      type: "image",
      x: 20, y: 15, width: 60, height: 60,
      rotation: 0, zIndex: maxZ + 1,
      src: imageDataUrl,
      objectFit: "contain",
      style: {},
    };
    updateCurrentSlide({
      ...currentSlide,
      elements: [...currentSlide.elements, newEl],
    });
    setSelectedElementId(newEl.id);
  };

  return (
    <div className="flex flex-col h-full w-full bg-neutral-900 text-white">
      {broadcasting && (
        <BroadcastMode
          slides={slides}
          initialIndex={currentIndex}
          onClose={() => setBroadcasting(false)}
          onSlidesChange={setSlides}
          nightMode={nightMode}
        />
      )}

      <FileSearchModal open={fileSearchOpen} onClose={() => setFileSearchOpen(false)} onInsert={handleInsertDocLink} />

      {nanoBananaOpen && (
        <NanoBananaPanel
          onClose={() => setNanoBananaOpen(false)}
          onAddToSlide={addImageToSlide}
        />
      )}

      <PresentationHeader
        title={docTitle} setTitle={setDocTitle}
        description={description} setDescription={setDescription}
        onSave={handleSave} status={status}
        slides={slides}
        presentationTitle={docTitle}
        onBroadcast={() => setBroadcasting(true)}
        nightMode={nightMode}
        setNightMode={setNightMode}
      />

      <PresentationToolbar
        slide={currentSlide}
        updateSlide={updateCurrentSlide}
        selectedId={selectedElementId}
        setSelectedId={setSelectedElementId}
        onNanoBanana={() => setNanoBananaOpen(true)}
        slides={slides}
        setSlides={setSlides}
        presentationStyles={presentationStyles}
        setPresentationStyles={setPresentationStyles}
      />

      <div className="flex-1 flex overflow-hidden">
        <PresentationSidebar
          slides={slides} setSlides={setSlides}
          currentIndex={currentIndex} setCurrentIndex={setCurrentIndex}
          nightMode={nightMode}
          slideCategories={slideCategories}
          setSlideCategories={setSlideCategories}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
        />
        <SlideCanvas
          slide={currentSlide}
          updateSlide={updateCurrentSlide}
          selectedId={selectedElementId}
          setSelectedId={setSelectedElementId}
          editingId={editingElementId}
          setEditingId={setEditingElementId}
          nightMode={nightMode}
        />
      </div>

      <div className="bg-neutral-900 border-t border-neutral-800 p-4">
        <PresentationTags selectedTags={selectedTags} setSelectedTags={setSelectedTags} />
      </div>
    </div>
  );
}
