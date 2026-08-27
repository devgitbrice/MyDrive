"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Folder as FolderIcon, FolderPlus, ChevronRight, Home, Trash2, Pencil, Link2, Search, Clock, RotateCcw } from "lucide-react";
import type { MyDriveItem, Tag } from "@/features/mydrive/types";
import { createFolder, moveItem, deleteFolder, renameFolder } from "@/features/mydrive/lib/folders";
import { createMirror, mirrorBlocker } from "@/features/mydrive/lib/mirror";
import { supabase } from "@/lib/supabaseClient";
import MyDriveGallery from "./MyDriveGallery";
import PendingCard from "./PendingCard";
import ItemCodeBadge from "./ItemCodeBadge";
import { useItemCodes } from "./ItemCodeProvider";
import { codeFromId } from "@/features/mydrive/lib/itemCode";
import { playClick } from "@/lib/clickSound";

const UNFILED = "__unfiled__";
const TRASH = "__trash__";

// Couleur de dossier stable, dérivée de l'id (#8)
const FOLDER_COLORS = [
  "text-yellow-400", "text-blue-400", "text-green-400", "text-purple-400",
  "text-pink-400", "text-orange-400", "text-cyan-400", "text-rose-400",
];
function folderColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FOLDER_COLORS[h % FOLDER_COLORS.length];
}

// Lien d'ouverture d'un élément (éditeur si dispo, sinon son dossier parent)
function hrefFor(item: MyDriveItem): string {
  const d = item as any;
  if (d.type === "folder") return `/mydrive?folder=${item.id}`;
  switch (d.doc_type) {
    case "python": return `/editpython/${item.id}`;
    case "doc": return `/editdoc/${item.id}`;
    case "table": return `/edittable/${item.id}`;
    case "mindmap": return `/editmindmap/${item.id}`;
    case "presentation": return `/editpresentation/${item.id}`;
    case "voyage": return `/editvoyage/${item.id}`;
    case "draw": return `/editdraw/${item.id}`;
    default: return `/mydrive?folder=${d.parent_id ?? UNFILED}`;
  }
}

// Comparateur ascendant par titre, tolérant les numéros ("01" < "02" < "10")
const byTitleAsc = (a: MyDriveItem, b: MyDriveItem) =>
  (a.title || "").localeCompare(b.title || "", "fr", { numeric: true, sensitivity: "base" });

interface Props {
  items: MyDriveItem[];
  allTags: Tag[];
}

export default function FolderView({ items: rawItems, allTags }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderIdParam = searchParams.get("folder");
  const folderId: string | null = folderIdParam ?? null;

  // Corbeille (#14) : les éléments soft-deleted sortent de toutes les vues
  const items = useMemo(
    () => rawItems.filter((i: any) => !i.deleted_at),
    [rawItems]
  );
  const trashedItems = useMemo(
    () => rawItems.filter((i: any) => i.deleted_at && i.type !== "folder")
      .sort((a: any, b: any) => (b.deleted_at || "").localeCompare(a.deleted_at || "")),
    [rawItems]
  );

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  // Recherche globale (#1)
  const [globalQuery, setGlobalQuery] = useState("");
  const itemCodes = useItemCodes();
  const [dragOverId, setDragOverId] = useState<string | null | "__ROOT__">(null);
  // Selecteur de dossier, partage entre « Deplacer vers », « Creer un miroir dans » et le lot (#5).
  const [picker, setPicker] = useState<
    | { mode: "move" | "mirror"; item: MyDriveItem }
    | { mode: "move-batch"; ids: string[] }
    | null
  >(null);

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

  // Purge automatique de la corbeille : suppression définitive après 30 jours (#10)
  useEffect(() => {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    supabase
      .from("MyDrive")
      .delete()
      .lt("deleted_at", cutoff)
      .then(({ error }) => { if (error && error.code !== "42703") console.warn("purge corbeille:", error.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NB : plus de refetch complet au focus/visibilitychange — le Realtime
  // ci-dessus couvre déjà les mises à jour live, et recharger toute la table
  // à chaque retour sur l'app rendait la navigation lente sur mobile.

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
    // Deplacement en lot (#5) : liste d'ids d'emplacement.
    const onMoveBatch = (e: Event) => {
      const { ids } = (e as CustomEvent).detail as { ids: string[] };
      if (ids?.length) setPicker({ mode: "move-batch", ids });
    };
    window.addEventListener("mydrive-request-move", onMove);
    window.addEventListener("mydrive-request-mirror", onMirror);
    window.addEventListener("mydrive-request-move-batch", onMoveBatch);
    return () => {
      window.removeEventListener("mydrive-request-move", onMove);
      window.removeEventListener("mydrive-request-mirror", onMirror);
      window.removeEventListener("mydrive-request-move-batch", onMoveBatch);
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

  // Recherche globale (#1) : titre, observation ou code, sur TOUTE la base
  const globalResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const codeOf = (id: string) => (itemCodes?.[id] ?? codeFromId(id)).toLowerCase();
    return items
      .filter((i: any) =>
        (i.title || "").toLowerCase().includes(q) ||
        (i.observation || "").toLowerCase().includes(q) ||
        codeOf(i.id) === q
      )
      .slice(0, 20);
  }, [globalQuery, items, itemCodes]);

  // Documents récents à la racine (#2)
  const recentDocs = useMemo(() => {
    if (folderId !== null) return [];
    return items
      .filter((i: any) => i.type !== "folder" && i.type !== "pending")
      .slice()
      .sort((a: any, b: any) => {
        const ta = a.updated_at || a.created_at || "";
        const tb = b.updated_at || b.created_at || "";
        return tb.localeCompare(ta);
      })
      .slice(0, 8);
  }, [items, folderId]);

  const parentFolderName = (i: any): string => {
    const pid = i.parent_id ?? null;
    if (!pid) return "Sans dossier";
    return foldersById.get(pid)?.title ?? "?";
  };

  // Mode d'affichage courant de la galerie, pour les pending en liste (#19)
  const [galleryViewMode, setGalleryViewMode] = useState<"grid" | "list">("grid");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mydrive-view-mode");
      if (saved === "list" || saved === "grid") setGalleryViewMode(saved);
    } catch {}
  }, [folderId]);

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
    try {
      if (picker.mode === "move-batch") {
        for (const pid of picker.ids) {
          await moveItem(pid, destParent);
        }
      } else if (picker.mode === "mirror") {
        const blocage = mirrorBlocker(picker.item, destParent, items);
        if (blocage) { alert(blocage); return; }
        await createMirror(picker.item, destParent);
      } else {
        // Deplacer un miroir deplace le miroir, pas l'original.
        await moveItem(picker.item.alias_id ?? picker.item.id, destParent);
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
        {folderId === TRASH && (
          <>
            <ChevronRight size={14} />
            <span className="text-neutral-200">Corbeille</span>
          </>
        )}
        {/* Fil d'Ariane tronqué au-delà de 2 niveaux (#11) */}
        {(breadcrumb.length <= 2 ? breadcrumb : [breadcrumb[breadcrumb.length - 2], breadcrumb[breadcrumb.length - 1]]).map((f, i, arr) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight size={14} />
            {breadcrumb.length > 2 && i === 0 && (
              <>
                <span className="text-neutral-500" title={breadcrumb.slice(0, -2).map((b) => b.title).join(" › ")}>…</span>
                <ChevronRight size={14} />
              </>
            )}
            {i === arr.length - 1 ? (
              <span className="text-neutral-200">{f.title}</span>
            ) : (
              <Link href={`/mydrive?folder=${f.id}`} scroll={false} className="hover:text-blue-400">{f.title}</Link>
            )}
          </span>
        ))}
      </nav>

      {/* Recherche globale (#1) */}
      {folderId !== TRASH && (
        <div className="relative max-w-xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
          <input
            type="text"
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setGlobalQuery(""); }}
            placeholder="Rechercher partout (titre, description, code)…"
            className="w-full bg-neutral-900 text-white border border-neutral-800 rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none focus:border-blue-500 transition-colors"
          />
          {globalQuery && (
            <button
              onClick={() => setGlobalQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white"
            >✕</button>
          )}
          {globalQuery.trim().length >= 2 && (
            <div className="absolute z-40 mt-1 w-full bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
              {globalResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-neutral-500">Aucun résultat.</p>
              ) : globalResults.map((r: any) => (
                <Link
                  key={r.alias_id ?? r.id}
                  href={hrefFor(r)}
                  onClick={() => setGlobalQuery("")}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 border-b border-neutral-800/60 last:border-0"
                >
                  {r.type === "folder"
                    ? <FolderIcon size={16} className={folderColor(r.id)} />
                    : <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase">{r.doc_type || "img"}</span>}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-white truncate">{r.title || "(sans titre)"}</span>
                    <span className="block text-[11px] text-neutral-500 truncate">{r.type === "folder" ? "Dossier" : parentFolderName(r)}</span>
                  </span>
                  <ItemCodeBadge id={r.id} variant="inline" editable={false} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {folderId && folderId !== UNFILED && breadcrumb.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            {breadcrumb[breadcrumb.length - 1].title}
          </h1>
          <ItemCodeBadge id={folderId} variant="inline" />
        </div>
      )}

      {folderId !== UNFILED && folderId !== TRASH && (
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
              onClick={() => playClick()}
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
            const children = items.filter((i: any) => (i.parent_id ?? null) === f.id);
            const nFolders = children.filter((i: any) => i.type === "folder").length;
            const nDocs = children.length - nFolders;
            const countLabel = children.length === 0
              ? "vide"
              : [
                  nFolders > 0 ? `${nFolders} dossier${nFolders > 1 ? "s" : ""}` : null,
                  nDocs > 0 ? `${nDocs} doc${nDocs > 1 ? "s" : ""}` : null,
                ].filter(Boolean).join(" · ");
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
                  onClick={() => playClick()}
                  className={`flex flex-col items-center justify-center bg-neutral-900 border rounded-xl aspect-square p-4 transition ${isOver ? "border-blue-500 bg-blue-500/10" : "border-neutral-800 hover:border-blue-500"}`}
                >
                  <FolderIcon size={48} className={`${folderColor(f.id)} mb-2`} />
                  <span className="text-sm text-white truncate w-full text-center">{f.title}</span>
                  <span className="text-xs text-neutral-500 mt-0.5">{countLabel}</span>
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
          {folderId === null && trashedItems.length > 0 && (
            <Link
              href={`/mydrive?folder=${TRASH}`}
              scroll={false}
              onClick={() => playClick()}
              className="group flex flex-col items-center justify-center bg-neutral-900 border border-neutral-800 rounded-xl aspect-square p-4 hover:border-red-500 transition"
            >
              <Trash2 size={44} className="text-neutral-500 group-hover:text-red-400 mb-2 transition" />
              <span className="text-sm text-white">Corbeille</span>
              <span className="text-xs text-neutral-500 mt-0.5">{trashedItems.length} élément{trashedItems.length > 1 ? "s" : ""}</span>
            </Link>
          )}
        </div>
      )}

      {/* Documents récents à la racine (#2) */}
      {folderId === null && recentDocs.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider font-bold text-neutral-500 flex items-center gap-1.5">
            <Clock size={12} /> Documents récents
          </h2>
          <div className="flex flex-col divide-y divide-neutral-800/70 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900">
            {recentDocs.map((r: any) => (
              <Link
                key={r.alias_id ?? r.id}
                href={hrefFor(r)}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-800/60 transition-colors"
              >
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase shrink-0 w-14 text-center">{r.doc_type || "img"}</span>
                <span className="flex-1 min-w-0 text-sm text-neutral-100 truncate">{r.title || "(sans titre)"}</span>
                <span className="hidden sm:inline text-[11px] text-neutral-500 truncate max-w-[140px]">{parentFolderName(r)}</span>
                <span suppressHydrationWarning className="text-[11px] text-neutral-600 shrink-0 tabular-nums">
                  {(r.updated_at || r.created_at || "").slice(0, 10)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Corbeille (#14) */}
      {folderId === TRASH && (
        <div className="space-y-2">
          {trashedItems.length === 0 ? (
            <p className="text-center text-neutral-500 py-8">La corbeille est vide.</p>
          ) : (
            <div className="flex flex-col divide-y divide-neutral-800/70 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900">
              {trashedItems.map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase shrink-0 w-14 text-center">{t.doc_type || "img"}</span>
                  <span className="flex-1 min-w-0 text-sm text-neutral-300 truncate">{t.title || "(sans titre)"}</span>
                  <span className="text-[11px] text-neutral-600 shrink-0">suppr. {(t.deleted_at || "").slice(0, 10)}</span>
                  <button
                    onClick={async () => {
                      const { error } = await supabase.from("MyDrive").update({ deleted_at: null }).eq("id", t.id);
                      if (error) alert("Erreur : " + error.message); else router.refresh();
                    }}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-neutral-800 hover:bg-green-600 text-neutral-300 hover:text-white transition-colors"
                    title="Restaurer"
                  >
                    <RotateCcw size={12} /> Restaurer
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Supprimer définitivement « ${t.title} » ?`)) return;
                      if (t.image_path) await supabase.storage.from("MyDrive").remove([t.image_path]);
                      const { error } = await supabase.from("MyDrive").delete().eq("id", t.id);
                      if (error) alert("Erreur : " + error.message); else router.refresh();
                    }}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-neutral-800 hover:bg-red-600 text-neutral-300 hover:text-white transition-colors"
                    title="Supprimer définitivement"
                  >
                    <Trash2 size={12} /> Définitif
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {folderId !== null && folderId !== TRASH && currentPendingDocs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider font-bold text-amber-400/80">
            En attente ({currentPendingDocs.length})
          </h2>
          {galleryViewMode === "list" ? (
            /* Pending en mode liste : rangée compacte avec badge (#19) */
            <div className="flex flex-col divide-y divide-neutral-800/70 border border-amber-500/30 rounded-xl overflow-hidden bg-neutral-900">
              {currentPendingDocs.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 uppercase tracking-wide">En attente</span>
                  <span className="flex-1 min-w-0 text-sm text-neutral-100 truncate">{p.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentPendingDocs.map((p) => (
                <PendingCard key={p.id} item={p} imageHeightClass="h-48 md:h-56" />
              ))}
            </div>
          )}
        </div>
      )}

      {folderId !== null && folderId !== TRASH && currentNormalDocs.length > 0 && (
        <MyDriveGallery items={currentNormalDocs} allTags={allTags} />
      )}

      {folderId !== null && folderId !== TRASH && currentNormalDocs.length === 0 && currentPendingDocs.length === 0 && (
        <p className="text-center text-neutral-500 py-8">Aucun document dans ce dossier.</p>
      )}

      {folderId === null && currentSubfolders.length === 0 && !showUnfiledTile && (
        <p className="text-center text-neutral-500 py-8">Aucun dossier pour le moment. Crée-en un !</p>
      )}

      {picker && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPicker(null)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-5 max-w-md w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">
              {picker.mode === "move-batch"
                ? `Déplacer ${picker.ids.length} élément${picker.ids.length > 1 ? "s" : ""}`
                : `${picker.mode === "mirror" ? "Créer un miroir de" : "Déplacer"} « ${picker.item.title} »`}
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
                  disabled={picker.mode !== "move-batch" && f.id === picker.item.id}
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
