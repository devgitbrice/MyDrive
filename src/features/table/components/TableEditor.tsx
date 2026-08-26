"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createDocRow } from "@/lib/createDocRow";
import { addTagToItemAction, updateDriveItemAction } from "@/features/mydrive/modify";
import TableHeader from "./TableHeader";
import TableGrid from "./TableGrid";
import TableTags from "./TableTags";
import FileSearchModal, { type SearchResult } from "@/components/FileSearchModal";
import type { Tag } from "@/features/mydrive/types";

interface TableEditorProps {
  initialData?: {
    id: string;
    title: string;
    content: string;
    observation: string;
    tags: Tag[];
  };
}

export default function TableEditor({ initialData }: TableEditorProps) {
  const router = useRouter();
  const isEditMode = !!initialData?.id;

  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.observation || "");

  const [data, setData] = useState<any[]>(() => {
    if (initialData?.content) {
      try {
        return JSON.parse(initialData.content);
      } catch {
        return Array.from({ length: 20 }, () => Array(10).fill(""));
      }
    }
    return Array.from({ length: 20 }, () => Array(10).fill(""));
  });

  const [selectedTags, setSelectedTags] = useState<Tag[]>(initialData?.tags || []);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Empêche l'auto-save au montage : on ne sauve qu'après une vraie édition.
  const userEditedRef = useRef(false);

  // --- AUTO-SAVE (edit mode only, debounce 1.5s) ---
  const autoSave = useCallback(async () => {
    if (!isEditMode || !title.trim()) return;
    setStatus("saving");
    try {
      await updateDriveItemAction(initialData!.id, {
        title: title.trim(),
        content: JSON.stringify(data),
        observation: description,
      });
    } catch (e) {
      console.error("Auto-save error:", e);
    } finally {
      setStatus("idle");
    }
  }, [isEditMode, initialData, title, data, description]);

  const scheduleAutoSave = useCallback(() => {
    if (!isEditMode) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => autoSave(), 1500);
  }, [isEditMode, autoSave]);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  const handleInsertDocLink = useCallback((item: SearchResult) => {
    window.dispatchEvent(new CustomEvent("table-insert-link", { detail: item }));
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

  // Watch for data changes to trigger auto-save in edit mode.
  // On ignore le tout premier passage (montage) pour ne pas réécrire le
  // contenu initial par-dessus une éventuelle modification externe.
  useEffect(() => {
    if (!isEditMode) return;
    if (!userEditedRef.current) { userEditedRef.current = true; return; }
    scheduleAutoSave();
  }, [data, title, description, isEditMode, scheduleAutoSave]);

  const handleSave = async () => {
    if (!title.trim()) return alert("Le titre est obligatoire");
    setStatus("saving");

    try {
      if (isEditMode) {
        await updateDriveItemAction(initialData!.id, {
          title: title.trim(),
          content: JSON.stringify(data),
          observation: description,
        });
        setStatus("idle");
      } else {
        const docId = await createDocRow({
          title: title.trim(),
          content: JSON.stringify(data),
          doc_type: "table",
          // @ts-ignore
          observation: description,
        });

        for (const tag of selectedTags) {
          await addTagToItemAction(docId, tag.id);
        }

        router.push("/mydrive");
      }
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      setStatus("idle");
      alert("Erreur lors de la sauvegarde");
    }
  };

  return (
    <div className="flex flex-col h-dvh w-full bg-neutral-900 text-white overflow-hidden">
      <FileSearchModal open={fileSearchOpen} onClose={() => setFileSearchOpen(false)} onInsert={handleInsertDocLink} />
      <TableHeader
        id={initialData?.id}
        title={title} setTitle={setTitle}
        description={description} setDescription={setDescription}
        onSave={handleSave} status={status}
        onDictationText={(text) => {
          // Insert dictated text into the active cell via custom event
          window.dispatchEvent(new CustomEvent("table-dictation", { detail: { text } }));
        }}
      />

      <div className="flex-1 relative bg-black min-h-0">
        <TableGrid data={data} setData={setData} />
      </div>

      <div className="bg-neutral-900 border-t border-neutral-800 p-4">
        <TableTags selectedTags={selectedTags} setSelectedTags={setSelectedTags} />
      </div>
    </div>
  );
}
