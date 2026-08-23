"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { updateDriveItemAction } from "@/features/mydrive/modify";
import TagSelector from "@/features/mydrive/components/TagSelector";
import type { Tag } from "@/features/mydrive/types";
import DocHeader from "@/features/doc/components/DocHeader";
import DocRibbon from "@/features/doc/components/DocRibbon";
import BlockManager from "@/features/doc/components/BlockManager";
import FileSearchModal, { getEditUrl, type SearchResult } from "@/components/FileSearchModal";
import { useThemeStore } from "@/store/themeStore";

interface DocEditorProps {
  allTags: Tag[];
  initialData: {
    id: string; title: string; content: string; observation: string; tags: Tag[];
  };
}

export default function DocEditor({ allTags: initialAllTags, initialData }: DocEditorProps) {
  const [title, setTitle] = useState(initialData.title);
  const [observation, setObservation] = useState(initialData.observation);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedTags, setSelectedTags] = useState<Tag[]>(initialData.tags);
  const [allTags, setAllTags] = useState<Tag[]>(initialAllTags);
  const [tocOpen, setTocOpen] = useState(true);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [mobileTagsOpen, setMobileTagsOpen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const theme = useThemeStore((s) => s.theme);
  const light = theme === "light";

  const contentRef = useRef(initialData.content);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const autoSave = useCallback(async (t: string, c: string, o: string) => {
    if (!t.trim()) return;
    setStatus("saving");
    try {
      await updateDriveItemAction(initialData.id, { title: t.trim(), content: c, observation: o });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("idle");
    }
  }, [initialData.id]);

  const scheduleAutoSave = useCallback((t: string, c: string, o: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => autoSave(t, c, o), 1000);
  }, [autoSave]);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

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

  // Vue épurée : masque header/ribbon/tags après 3s d'inactivité
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const show = () => {
      setChromeVisible(true);
      if (t) clearTimeout(t);
      t = setTimeout(() => setChromeVisible(false), 3000);
    };
    show();
    window.addEventListener("mousemove", show);
    window.addEventListener("keydown", show);
    window.addEventListener("touchstart", show);
    window.addEventListener("scroll", show, true);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("keydown", show);
      window.removeEventListener("touchstart", show);
      window.removeEventListener("scroll", show, true);
    };
  }, []);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    scheduleAutoSave(val, contentRef.current, observation);
  };

  const handleObservationChange = (val: string) => {
    setObservation(val);
    scheduleAutoSave(title, contentRef.current, val);
  };

  const handleContentChange = (html: string) => {
    contentRef.current = html;
    scheduleAutoSave(title, html, observation);
  };

  const handleInsertDocLink = (item: SearchResult) => {
    window.dispatchEvent(new CustomEvent("doc-insert-link", { detail: item }));
  };

  const chromeClass = `transition-opacity duration-500 ${chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`;

  return (
    <div className={`flex flex-col h-dvh w-full overflow-hidden ${light ? "bg-white text-neutral-900" : "bg-neutral-950 text-white"} ${chromeVisible ? "" : "cursor-none"}`}>
      <FileSearchModal open={fileSearchOpen} onClose={() => setFileSearchOpen(false)} onInsert={handleInsertDocLink} />
      <div className={chromeClass}>
        <DocHeader title={title} observation={observation} status={status} onTitleChange={handleTitleChange} onObservationChange={handleObservationChange} getContent={() => contentRef.current} />
        <DocRibbon tocOpen={tocOpen} setTocOpen={setTocOpen} />
      </div>

      {/* Le composant est posé directement, la div buggée a disparu ! */}
      <BlockManager initialHtml={initialData.content} tocOpen={tocOpen} onChange={handleContentChange} chromeVisible={chromeVisible} />

      {/* Tags panel — always visible on desktop, toggle on mobile */}
      <div className={`${light ? "bg-neutral-100 border-neutral-300" : "bg-neutral-900 border-neutral-800"} border-t shrink-0 ${chromeClass}`}>
        {/* Desktop: always show tags */}
        <div className="hidden md:block p-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest shrink-0">Tags :</span>
            <div className="flex-1 overflow-x-auto">
              <TagSelector itemId={initialData.id} itemTags={selectedTags} allTags={allTags} onTagsChange={(_id, newTags) => setSelectedTags(newTags)} onNewTagCreated={(tag) => setAllTags((prev) => [...prev, tag])} />
            </div>
          </div>
        </div>
        {/* Mobile: toggle button + collapsible tags */}
        <div className="md:hidden">
          {mobileTagsOpen && (
            <div className="p-3 pb-2">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest shrink-0">Tags :</span>
                <div className="flex-1 overflow-x-auto">
                  <TagSelector itemId={initialData.id} itemTags={selectedTags} allTags={allTags} onTagsChange={(_id, newTags) => setSelectedTags(newTags)} onNewTagCreated={(tag) => setAllTags((prev) => [...prev, tag])} />
                </div>
              </div>
            </div>
          )}
          <button
            onClick={() => setMobileTagsOpen((v) => !v)}
            className={`w-full py-2.5 text-xs font-semibold tracking-wide ${light ? "text-blue-600 active:bg-neutral-200" : "text-blue-400 active:bg-neutral-800"}`}
          >
            {mobileTagsOpen ? "Cacher les tags" : "Tags"}
          </button>
        </div>
      </div>
    </div>
  );
}
