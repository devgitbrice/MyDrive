"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Folder as FolderIcon, FolderPlus, ChevronRight, Home, Trash2, Pencil, Link2 } from "lucide-react";
import type { MyDriveItem, Tag } from "@/features/mydrive/types";
import { createFolder, moveItem, deleteFolder, renameFolder } from "@/features/mydrive/lib/folders";
import { createMirror, mirrorBlocker } from "@/features/mydrive/lib/mirror";
import { supabase } from "@/lib/supabaseClient";
import MyDriveGallery from "./MyDriveGallery";
import PendingCard from "./PendingCard";
import ItemCodeBadge from "./ItemCodeBadge";

const UNFILED = "__unfiled__";

// Comparateur ascendant par titre, tolérant les numéros ("01" < "02" < "10")
const byTitleAsc = (a: MyDriveItem, b: MyDriveItem) =>
  (a.title || "").localeCompare(b.title || "", "fr", { numeric: true, sensitivity: "base" });

interface Props {
  items: MyDriveItem[];
  allTags: Tag[];
}

export default function FolderView({ items, allTags }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderIdParam = searchParams.get("folder");
  const folderId: string | null = folderIdParam ?? null;

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null | "__ROOT__">(null);
  // Selecteur de dossier, partage entre « Deplacer vers » et « Creer un miroir dans ».
  const [picker, setPicker] = useState<{ mode: "move" | "mirror"; item: MyDriveItem } | null>(null);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
  };

  useEffect(() => {
    const channel = supabase
      .channel("mydrive-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "MyDrive" },
        () => scheduleRefresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    const onFocus = () => scheduleRefresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = (folderId && folderId !== UNFILED) ? folderId : "";
    document.cookie = `mydrive-parent=${encodeURIComponent(v)}; path=/; max-age=86400; SameSite=Lax`;
  }, [folderId]);

  useEffect(() => {
    // Deplacer : l'id recu est celui de l'emplacement (ligne alias pour un miroir).
    const onMove = (e: Event) => {
      const { id } = (e as CustomEvent).detail as { id: string };
      const it = items.find((i) => i.id === id || i.alias_id === id);
      if (it) setPicker({ mode: "move", item: it });
    };
    // Miroir : l'id recu est celui de l'element reel.
    const onMirror = (e: Event) => {
      const { id } = (e as CustomEvent).detail as { id: string };
      const it = items.find((i) => i.id === id);
      if (it) setPicker({ mode: "mirror", item: it });
    };
    window.addEventListener("mydrive-request-move", onMove);
    window.addEventListener("mydrive-request-mirror", onMirror);
    return () => {
      window.removeEventListener("mydrive-request-move", onMove);
      window.removeEventListener("mydrive-request-mirror", onMirror);
    };
  }, [items]);

  const allFolders = useMemo(
    () => items.filter((i: any) => i.type === "folder").slice().sort(byTitleAsc),
    [items]
  );
  const foldersById = useMemo(() => {
    const m = new Map<string, MyDriveItem>();
    allFolders.forEach((f) => m.set(f.id, f));
    return m;
  }, [allFolders]);

  const breadcrumb = useMemo<MyDriveItem[]>(() => {
    if (!folderId || folderId === UNFILED) return [];
    const chain: MyDriveItem[] = [];
    let curId: string | null | undefined = folderId;
    let guard = 0;
    while (curId && guard < 100) {
      const f = foldersById.get(curId);
      if (!f) break;
      chain.unshift(f);
      curId = (f as any).parent_id ?? null;
      guard += 1;
    }
    return chain;
  }, [folderId, foldersById]);

  const currentSubfolders = useMemo<MyDriveItem[]>(() => {
    if (folderId === UNFILED) return [];
    return items
      .filter((i: any) => i.type === "folder" && (i.parent_id ?? null) === (folderId ?? null))
      .sort(byTitleAsc);
  }, [items, folderId]);

  const { currentPendingDocs, currentNormalDocs } = useMemo(() => {
    if (folderId === null) return { currentPendingDocs: [], currentNormalDocs: [] };
    const target = folderId === UNFILED ? null : folderId;
    const pending: MyDriveItem[] = [];
    const normal: MyDriveItem[] = [];
    items.forEach((i: any) => {
      if (i.type === "folder") return;
      if ((i.parent_id ?? null) !== target) return;
      if (i.type === "pending") pending.push(i);
      else normal.push(i);
    });
    return {
      currentPendingDocs: pending.sort(byTitleAsc),
      currentNormalDocs: normal.sort(byTitleAsc),
    };
  }, [items, folderId]);

  const unfiledCount = useMemo(
    () => items.filter((i: any) => i.type !== "folder" && (i.parent_id ?? null) === null).length,
    [items]
  );

  const showUnfiledTile = folderId === null && unfiledCount > 0;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createFolder(name, folderId === UNFILED || folderId === null ? null : folderId);
      setNewName("");
      setCreating(false);
      router.refresh();
    } catch (e: any) {
      alert("Erreur : " + e.message);
    }
  }

  async function handleDrop(e: React.DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    setDragOverId(null);
    const itemId = e.dataTransfer.getData("text/mydrive-item");
    if (!itemId) return;
    if (itemId === targetFolderId) return;
    try {
      await moveItem(itemId, targetFolderId);
      router.refresh();
    } catch (er: any) {
      alert("Erreur déplacement : " + er.message);
    }
  }

  async function handleDeleteFolder(f: MyDriveItem) {
    const childrenCount = items.filter((i: any) => (i.parent_id ?? null) === f.id).length;
    const msg = childrenCount > 0
      ? `Le dossier "${f.title}" contient ${childrenCount} élément(s). Les éléments seront déplacés hors du dossier. Supprimer ?`
      : `Supprimer le dossier vide "${f.title}" ?`;
    if (!confirm(msg)) return;
    try {
      await deleteFolder(f.id);
      router.refresh();
    } catch (e: any) {
      alert("Erreur : " + e.message);
    }
  }

  async function handleRenameFolder(f: MyDriveItem) {
    const newN = prompt("Nouveau nom du dossier :", f.title);
    if (!newN || !newN.trim() || newN.trim() === f.title) return;
    try {
      await renameFolder(f.id, newN.trim());
      router.refresh();
    } catch (e: any) {
      alert("Erreur : " + e.message);
    }
  }

  async function handlePick(destParent: string | null) {
    if (!picker) return;
    const { mode, item } = picker;
    try {
      if (mode === "mirror") {
        const blocage = mirrorBlocker(item, destParent, items);
        if (blocage) { alert(blocage); return; }
        await createMirror(item, destParent);
      } else {
        // Deplacer un miroir deplace le miroir, pas l'original.
        await moveItem(item.alias_id ?? item.id, destParent);
      }
      setPicker(null);
      router.refresh();
    } catch (e: any) {
      alert("Erreur : " + e.message);
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1 text-sm text-neutral-400 flex-wrap">
        <Link href="/mydrive" scroll={false} className="hover:text-blue-400 flex items-center gap-1">
          <Home size={14} /> Accueil
        </Link>
        {folderId === UNFILED && (
          <>
            <ChevronRight size={14} />
            <span className="text-neutral-200">Sans dossier</span>
          </>
        )}
        {breadcrumb.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight size={14} />
            {i === breadcrumb.length - 1 ? (
              <span className="text-neutral-200">{f.title}</span>
            ) : (
              <Link href={`/mydrive?folder=${f.id}`} scroll={false} className="hover:text-blue-400">{f.title}</Link>
            )}
          </span>
        ))}
      </nav>

      {folderId && folderId !== UNFILED && breadcrumb.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            {breadcrumb[breadcrumb.length - 1].title}
          </h1>
          <ItemCodeBadge id={folderId} variant="inline" />
        </div>
      )}

      {folderId !== UNFILED && (
        <div className="flex items-center gap-2 flex-wrap">
          {creating ? (
            <>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
                }}
                placeholder="Nom du dossier"
                className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-blue-500"
              />
              <button onClick={handleCreate} className="rounded-lg px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white">Créer</button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="text-sm text-neutral-400 hover:text-white">Annuler</button>
            </>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-yellow-500 text-yellow-400 hover:bg-yellow-500 hover:text-black transition-colors"
            >
              <FolderPlus size={16} /> Nouveau dossier
            </button>
          )}
        </div>
      )}

      {(currentSubfolders.length > 0 || showUnfiledTile) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {showUnfiledTile && (
            <Link
              href={`/mydrive?folder=${UNFILED}`}
              scroll={false}
              onDragOver={(e) => { e.preventDefault(); setDragOverId("__ROOT__"); }}
              onDragLeave={() => setDragOverId((v) => v === "__ROOT__" ? null : v)}
              onDrop={(e) => handleDrop(e, null)}
              className={`group flex flex-col items-center justify-center bg-neutral-900 border-2 border-dashed rounded-xl aspect-square p-4 transition ${dragOverId === "__ROOT__" ? "border-blue-500 bg-blue-500/10" : "border-neutral-700 hover:border-blue-500"}`}
            >
              <FolderIcon size={48} className="text-neutral-400 mb-2 group-hover:text-blue-400 transition" />
              <span className="text-sm text-white truncate w-full text-center">Sans dossier</span>
              <span className="text-xs text-neutral-500 mt-0.5">{unfiledCount} doc{unfiledCount > 1 ? "s" : ""}</span>
            </Link>
          )}
          {currentSubfolders.map((f) => {
            const count = items.filter((i: any) => (i.parent_id ?? null) === f.id).length;
            const isOver = dragOverId === f.id;
            return (
              <div
                key={f.id}
                className="relative group"
                onDragOver={(e) => { e.preventDefault(); setDragOverId(f.id); }}
                onDragLeave={() => setDragOverId((v) => v === f.id ? null : v)}
                onDrop={(e) => handleDrop(e, f.id)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/mydrive-item", f.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <Link
                  href={`/mydrive?folder=${f.id}`}
                  scroll={false}
                  className={`flex flex-col items-center justify-center bg-neutral-900 border rounded-xl aspect-square p-4 transition ${isOver ? "border-blue-500 bg-blue-500/10" : "border-neutral-800 hover:border-blue-500"}`}
                >
                  <FolderIcon size={48} className="text-yellow-400 mb-2" />
                  <span className="text-sm text-white truncate w-full text-center">{f.title}</span>
                  <span className="text-xs text-neutral-500 mt-0.5">{count} élément{count > 1 ? "s" : ""}</span>
                  {f.is_mirror && (
                    <span className="mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">Miroir</span>
                  )}
                </Link>
                <div className="absolute top-2 left-2">
                  <ItemCodeBadge id={f.id} />
                </div>
                <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                  <button
                    onClick={(e) => { e.preventDefault(); setPicker({ mode: "mirror", item: f }); }}
                    className="w-7 h-7 rounded bg-neutral-800/90 hover:bg-purple-600 text-neutral-300 hover:text-white flex items-center justify-center"
                    title="Créer un miroir dans…"
                  >
                    <Link2 size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); handleRenameFolder(f); }}
                    className="w-7 h-7 rounded bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center"
                    title="Renommer"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDeleteFolder(f); }}
                    className="w-7 h-7 rounded bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center"
                    title="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {folderId !== null && currentPendingDocs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider font-bold text-amber-400/80">
            En attente ({currentPendingDocs.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentPendingDocs.map((p) => (
              <PendingCard key={p.id} item={p} imageHeightClass="h-48 md:h-56" />
            ))}
          </div>
        </div>
      )}

      {folderId !== null && currentNormalDocs.length > 0 && (
        <MyDriveGallery items={currentNormalDocs} allTags={allTags} />
      )}

      {folderId !== null && currentNormalDocs.length === 0 && currentPendingDocs.length === 0 && (
        <p className="text-center text-neutral-500 py-8">Aucun document dans ce dossier.</p>
      )}

      {folderId === null && currentSubfolders.length === 0 && !showUnfiledTile && (
        <p className="text-center text-neutral-500 py-8">Aucun dossier pour le moment. Crée-en un !</p>
      )}

      {picker && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPicker(null)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-5 max-w-md w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">
              {picker.mode === "mirror" ? "Créer un miroir de" : "Déplacer"} « {picker.item.title} »
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              {picker.mode === "mirror"
                ? "L'élément restera aussi à sa place actuelle. Les deux emplacements montrent le même contenu : une modification faite d'un côté est visible de l'autre."
                : "Choisis un dossier de destination :"}
            </p>
            <div className="overflow-y-auto flex-1 space-y-1">
              <button
                onClick={() => handlePick(null)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-neutral-200 hover:bg-neutral-800 flex items-center gap-2"
              >
                <Home size={14} /> Racine (Sans dossier)
              </button>
              {allFolders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handlePick(f.id)}
                  disabled={f.id === picker.item.id}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-neutral-200 hover:bg-neutral-800 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FolderIcon size={14} className="text-yellow-400" /> {f.title}
                </button>
              ))}
              {allFolders.length === 0 && (
                <p className="text-sm text-neutral-500 text-center py-4">Aucun dossier existant.</p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setPicker(null)} className="px-4 py-2 text-sm text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
