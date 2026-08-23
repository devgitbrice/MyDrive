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
import { supabase } from "@/lib/supabaseClient";

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
  // Contenu courant (mis à jour à chaque frappe ET à chaque event Realtime externe)
  const [contentSnapshot, setContentSnapshot] = useState(initialData.content);
  // Clé de re-mount du BlockManager pour appliquer un contenu externe
  const [contentKey, setContentKey] = useState(0);
  const theme = useThemeStore((s) => s.theme);
  const light = theme === "light";

  const contentRef = useRef(initialData.content);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Empreinte du dernier envoi local pour ignorer l'écho de nos propres saves
  const lastLocalSaveHashRef = useRef<string>("");

  const hashStr = (s: string) => `${s.length}:${s.slice(0, 200)}`;

  const autoSave = useCallback(async (t: string, c: string, o: string) => {
    if (!t.trim()) return;
    setStatus("saving");
    try {
      lastLocalSaveHashRef.current = hashStr(t + "|" + c + "|" + o);
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

  // Toggle body class so global CSS can hide floating widgets in zen mode
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (chromeVisible) {
      document.body.classList.remove("doc-zen-active");
    } else {
      document.body.classList.add("doc-zen-active");
    }
    return () => {
      document.body.classList.remove("doc-zen-active");
    };
  }, [chromeVisible]);

  // Supabase Realtime : suit les modifs de CE doc et met à jour l'UI en direct
  useEffect(() => {
    const channel = supabase
      .channel(`doc-editor-${initialData.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "MyDrive",
          filter: `id=eq.${initialData.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          const nextTitle = row.title ?? "";
          const nextObs = row.observation ?? "";
          const nextContent = row.content ?? "";
          const incomingHash = hashStr(nextTitle + "|" + nextContent + "|" + nextObs);
          // Ignore l'écho de notre propre save
          if (incomingHash === lastLocalSaveHashRef.current) return;
          // Met à jour les champs simples
          if (nextTitle !== title) setTitle(nextTitle);
          if (nextObs !== observation) setObservation(nextObs);
          // Contenu : ne remonte le BlockManager que si le contenu diffère vraiment
          if (nextContent !== contentRef.current) {
            contentRef.current = nextContent;
            setContentSnapshot(nextContent);
            setContentKey((k) => k + 1);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData.id]);

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

      {/* key={contentKey} force le re-mount du BlockManager quand un changement Realtime arrive */}
      <BlockManager key={contentKey} initialHtml={contentSnapshot} tocOpen={tocOpen} onChange={handleContentChange} chromeVisible={chromeVisible} docTitle={title} />

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
