"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { MyDriveItem, MyDriveListProps, Tag } from "@/features/mydrive/types";
import SwipeableOverlay from "@/features/mydrive/components/SwipeableOverlay";
import { updateDriveItemAction, deleteDriveItemAction } from "@/features/mydrive/modify";
import { parseSlides } from "@/presentation/types";
import { downloadItemAsFile } from "@/features/mydrive/lib/downloadItem";

// --- Icônes et couleurs par type de fichier ---
const DOC_TYPE_CONFIG: Record<string, { icon: React.ReactNode; bg: string; text: string; border: string; label: string }> = {
  doc: {
    label: "Doc",
    bg: "bg-blue-500/20",
    text: "text-blue-400",
    border: "border-blue-500/40",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  python: {
    label: "Python",
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    border: "border-yellow-500/40",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 6 4.02 6 4.02V7h6v1H5S2 7.55 2 12.09c0 4.54 2.87 4.38 2.87 4.38H7v-2.15s-.12-2.87 2.77-2.87h4.46s2.72.04 2.72-2.66V4.72S17.36 2 12 2zm-1.52 1.6a.87.87 0 110 1.74.87.87 0 010-1.74z"/>
        <path d="M12 22c5.52 0 6-2.02 6-2.02V17h-6v-1h7s3 .45 3-4.09c0-4.54-2.87-4.38-2.87-4.38H17v2.15s.12 2.87-2.77 2.87H9.77s-2.72-.04-2.72 2.66v4.07S6.64 22 12 22zm1.52-1.6a.87.87 0 110-1.74.87.87 0 010 1.74z"/>
      </svg>
    ),
  },
  mindmap: {
    label: "Mindmap",
    bg: "bg-purple-500/20",
    text: "text-purple-400",
    border: "border-purple-500/40",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" /><path strokeLinecap="round" d="M12 9V4m0 16v-5m-3 .5L5 18m14-14l-4 2.5M15 14.5L19 18M5 6l4 2.5" />
      </svg>
    ),
  },
  table: {
    label: "Table",
    bg: "bg-green-500/20",
    text: "text-green-400",
    border: "border-green-500/40",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
  },
  presentation: {
    label: "Présentation",
    bg: "bg-orange-500/20",
    text: "text-orange-400",
    border: "border-orange-500/40",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="2" y="3" width="20" height="14" rx="2" /><path strokeLinecap="round" d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
  scan: {
    label: "PDF / Scan",
    bg: "bg-rose-500/20",
    text: "text-rose-400",
    border: "border-rose-500/40",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9l-5-5H7a2 2 0 00-2 2v13a2 2 0 002 2z" /><polyline points="14,4 14,9 19,9" fill="none" />
      </svg>
    ),
  },
  photo: {
    label: "Photo",
    bg: "bg-cyan-500/20",
    text: "text-cyan-400",
    border: "border-cyan-500/40",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  voyage: {
    label: "Voyage",
    bg: "bg-sky-500/20",
    text: "text-sky-400",
    border: "border-sky-500/40",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l-7-7 3-3 4 4 8-8 3 3-11 11z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10S2 17.52 2 12z" />
      </svg>
    ),
  },
};

// --- Mini-aperçu d'une slide de présentation ---
function MiniSlidePreview({ content, slideIndex }: { content: string; slideIndex: number }) {
  const slides = useMemo(() => {
    try {
      return parseSlides(content);
    } catch {
      return [];
    }
  }, [content]);

  const slide = slides[slideIndex];
  if (!slide) return null;

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{ backgroundColor: slide.backgroundColor || "#ffffff" }}
    >
      {slide.elements.map((el) => (
        <div
          key={el.id}
          className="absolute overflow-hidden"
          style={{
            left: `${el.x}%`,
            top: `${el.y}%`,
            width: `${el.width}%`,
            height: `${el.height}%`,
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            zIndex: el.zIndex,
          }}
        >
          {el.type === "text" && (
            <div
              className="w-full h-full overflow-hidden leading-tight"
              style={{
                fontSize: `${(el.style.fontSize || 16) * 0.25}px`,
                fontWeight: el.style.fontWeight || "normal",
                fontStyle: el.style.fontStyle || "normal",
                color: el.style.color || "#000",
                textAlign: (el.style.textAlign as any) || "left",
                fontFamily: el.style.fontFamily || "Arial",
              }}
            >
              {el.content}
            </div>
          )}
          {el.type === "image" && el.src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={el.src} alt="" className="w-full h-full object-cover" />
          )}
          {el.type === "shape" && (
            <div
              className="w-full h-full"
              style={{
                backgroundColor: el.style.fill || el.style.backgroundColor || "#ddd",
                borderRadius: el.shapeType === "circle" || el.shapeType === "ellipse" ? "50%" : el.shapeType === "rounded-rect" ? "8px" : undefined,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// --- Carte de présentation avec navigation ---
function PresentationCardWrapper({
  item,
  imageHeightClass,
  children,
}: {
  item: MyDriveItem;
  imageHeightClass: string;
  children: (slideIndex: number) => React.ReactNode;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const slideCount = useMemo(() => {
    try {
      return parseSlides(item.content || "").length;
    } catch {
      return 0;
    }
  }, [item.content]);

  const goPrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSlideIndex((i) => Math.max(0, i - 1));
  };
  const goNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSlideIndex((i) => Math.min(slideCount - 1, i + 1));
  };

  return (
    <div className={`${imageHeightClass} w-full bg-neutral-950 relative overflow-hidden flex items-center justify-center group/slides`}>
      {children(slideIndex)}
      {slideCount > 1 && (
        <>
          {slideIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-1 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover/slides:opacity-100 transition-opacity text-xs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
          )}
          {slideIndex < slideCount - 1 && (
            <button
              onClick={goNext}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover/slides:opacity-100 transition-opacity text-xs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          )}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-full opacity-0 group-hover/slides:opacity-100 transition-opacity">
            {slideIndex + 1} / {slideCount}
          </div>
        </>
      )}
    </div>
  );
}

export default function MyDriveGallery({ items: initialItems, allTags: initialTags }: MyDriveListProps) {
  const [items, setItems] = useState<MyDriveItem[]>(initialItems);
  const [allTags, setAllTags] = useState<Tag[]>(initialTags);
  const [size, setSize] = useState<number>(50);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const NO_TAGS = "__no_tags__";
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<MyDriveItem | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mydrive-view-mode");
      if (saved === "list" || saved === "grid") setViewMode(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("mydrive-view-mode", viewMode);
    } catch {}
  }, [viewMode]);

  // Mise à jour des props si elles changent
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    setAllTags(initialTags);
  }, [initialTags]);

  // --- CALCULS TAILLE & GRILLE ---
  const imageHeightClass = useMemo(() => {
    if (size <= 33) return "h-36 md:h-40";
    if (size <= 66) return "h-48 md:h-56";
    return "h-64 md:h-72";
  }, [size]);

  const gridClass = useMemo(() => {
    if (size <= 33) return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
    if (size <= 66) return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
    return "grid-cols-1 md:grid-cols-2";
  }, [size]);

  // --- TYPES DE CONTENU ---
  const contentTypes = [
    { key: "doc", label: "Doc", color: "blue" },
    { key: "python", label: "Python", color: "yellow" },
    { key: "mindmap", label: "Mindmap", color: "purple" },
    { key: "table", label: "Table", color: "green" },
    { key: "presentation", label: "Présentation", color: "orange" },
    { key: "scan", label: "PDF / Scan", color: "rose" },
    { key: "photo", label: "Photo", color: "cyan" },
    { key: "voyage", label: "Voyage", color: "sky" },
  ];

  const docTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      const itemData = item as any;
      const type = itemData.doc_type || (itemData.image_url ? "photo" : null);
      if (type) counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [items]);

  // --- FILTRAGE ---
  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedDocType) {
      result = result.filter((item) => {
        const itemData = item as any;
        if (selectedDocType === "photo") {
          return !itemData.doc_type && itemData.image_url;
        }
        return itemData.doc_type === selectedDocType;
      });
    }
    if (selectedTagId === NO_TAGS) {
      result = result.filter((item) => !item.tags || item.tags.length === 0);
    } else if (selectedTagId) {
      result = result.filter((item) =>
        item.tags?.some((t) => t.id === selectedTagId)
      );
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          (item.observation && item.observation.toLowerCase().includes(query))
      );
    }
    return result;
  }, [items, searchQuery, selectedTagId, selectedDocType]);









// --- STATISTIQUES TAGS CORRIGÉES ---
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    
    items.forEach((item) => {
      // On vérifie si item.tags existe et est un tableau
      if (Array.isArray(item.tags)) {
        item.tags.forEach((tag: any) => {
          // Supabase peut renvoyer soit {id: '...'} soit {tag_id: '...'}
          const tagId = tag.id || tag.tag_id;
          if (tagId) {
            counts[tagId] = (counts[tagId] || 0) + 1;
          }
        });
      }
    });

    return counts;
  }, [items]);

  const noTagsCount = useMemo(() => {
    return items.filter((item) => !item.tags || item.tags.length === 0).length;
  }, [items]);






  // --- NAVIGATION CLAVIER ---
  const tagIdList = useMemo<(string | null)[]>(
    () => [null, ...allTags.map((t) => t.id), NO_TAGS],
    [allTags]
  );

  const navigateTag = useCallback(
    (direction: "up" | "down") => {
      const currentIndex = tagIdList.indexOf(selectedTagId);
      const nextIndex =
        direction === "down"
          ? Math.min(currentIndex + 1, tagIdList.length - 1)
          : Math.max(currentIndex - 1, 0);
      setSelectedTagId(tagIdList[nextIndex]);
    },
    [tagIdList, selectedTagId]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex >= 0) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateTag("down");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateTag("up");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateTag, selectedIndex]);

  // --- ACTIONS ---
  const handleOpen = (item: MyDriveItem) => {
    const index = filteredItems.findIndex((i) => i.id === item.id);
    setSelectedIndex(index);
  };

  const handleUpdateItem = async (id: string, updates: Partial<MyDriveItem>) => {
    const previousItems = [...items];
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
    );
    try {
        const dbUpdates: Record<string, string> = {};
        if (updates.title) dbUpdates.title = updates.title;
        if (updates.observation) dbUpdates.observation = updates.observation;
        await updateDriveItemAction(id, dbUpdates);
    } catch (error) {
      console.error("Erreur sauvegarde", error);
      setItems(previousItems);
      alert("Erreur lors de la sauvegarde.");
    }
  };

  const handleTagsChange = (itemId: string, newTags: Tag[]) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === itemId ? { ...item, tags: newTags } : item
      )
    );
  };

  const handleNewTagCreated = (tag: Tag) => {
    setAllTags((prev) => {
      if (prev.some((t) => t.id === tag.id)) return prev;
      return [...prev, tag].sort((a, b) => a.name.localeCompare(b.name));
    });
  };

  const handleDeleteItem = async (id: string, imagePath: string) => {
    const previousItems = [...items];
    const deletedIndex = items.findIndex((item) => item.id === id);
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));

    if (selectedIndex >= 0) {
      if (items.length <= 1) {
        setSelectedIndex(-1);
      } else if (selectedIndex >= deletedIndex && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      }
    }
    try {
      await deleteDriveItemAction(id, imagePath);
    } catch (error) {
      console.error("Erreur suppression", error);
      setItems(previousItems);
      alert("Erreur lors de la suppression.");
    }
  };

  const myLinks = [
    { name: "Vercel", url: "https://vercel.com/bricems-projects/photo-app" },
    { name: "GitHub", url: "https://github.com/devgitbrice/photo-app" },
    { name: "Formation", url: "https://formations-seven.vercel.app" },
    { name: "Muxeo", url: "https://muxeo.vercel.app/" },
    { name: "Fullcrea", url: "https://fullcrea.vercel.app/" },
    { name: "BriceGPT", url: "https://bricegpt.vercel.app/" },
    { name: "ToutesMesApps", url: "https://toutes-mes-apps.vercel.app/" },
  ];

  // --- LOGIQUE DE ROUTAGE INTELLIGENTE (MODIF) ---
  const getLinkHref = (item: MyDriveItem) => {
    const itemData = item as any;
    if (itemData.type === 'folder') return `/mydrive/folder/${item.id}`;

    // On définit ici vers quel éditeur envoyer chaque doc_type
    switch (itemData.doc_type) {
      case "python": return `/editpython/${item.id}`;
      case "doc": return `/editdoc/${item.id}`;
      case "table": return `/edittable/${item.id}`;
      case "mindmap": return `/editmindmap/${item.id}`;
      case "presentation": return `/editpresentation/${item.id}`;
      case "voyage": return `/editvoyage/${item.id}`;
      default: return null; // Les scans photo/PDF retournent null pour ouvrir l'overlay
    }
  };

// --- RENDU CARTE (SÉCURISÉ) ---
  const renderCardContent = (item: MyDriveItem) => {
    const itemData = item as any;
    const rawUrl = itemData.image_url ? itemData.image_url.trim() : "";
    const validUrl = rawUrl.length > 0 ? rawUrl : null;
    const docType = itemData.doc_type || (validUrl ? "photo" : null);
    const typeConfig = docType ? DOC_TYPE_CONFIG[docType] : null;
    const isPresentation = itemData.doc_type === "presentation";

    // Bouton Supprimer (haut à droite)
    const deleteButton = (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDeleteConfirmItem(item);
        }}
        className="absolute top-2 right-2 z-20 w-7 h-7 flex items-center justify-center rounded-lg bg-red-600/80 hover:bg-red-600 text-white backdrop-blur-md border border-red-500/40 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
        title="Supprimer"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    );

    // Bouton Télécharger (bas à droite)
    const downloadButton = (
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          downloadItemAsFile(item);
        }}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-neutral-800 hover:bg-blue-600 text-neutral-400 hover:text-white transition-colors"
        title="Télécharger"
      >
        {docType === "scan" || (!itemData.doc_type && validUrl) ? (
          /* PDF / Photo / Scan → flèche téléchargement */
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
          </svg>
        ) : docType === "doc" ? (
          /* Doc → icône document W */
          <span className="text-[9px] font-bold leading-none">W</span>
        ) : docType === "presentation" ? (
          /* Présentation → icône présentation P */
          <span className="text-[9px] font-bold leading-none">P</span>
        ) : docType === "table" ? (
          /* Table → icône tableur X */
          <span className="text-[9px] font-bold leading-none">X</span>
        ) : (
          /* Défaut → flèche téléchargement */
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
          </svg>
        )}
      </button>
    );

    return (
      <>
        {isPresentation && item.content ? (
          <PresentationCardWrapper item={item} imageHeightClass={imageHeightClass}>
            {(slideIndex) => (
              <>
                <MiniSlidePreview content={item.content || ""} slideIndex={slideIndex} />
                {/* Badge type en haut à gauche */}
                {typeConfig && (
                  <div className={`absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border shadow-sm ${typeConfig.bg} ${typeConfig.text} ${typeConfig.border}`}>
                    {typeConfig.icon}
                    <span>{typeConfig.label}</span>
                  </div>
                )}
                {deleteButton}
              </>
            )}
          </PresentationCardWrapper>
        ) : (
          <div className={`${imageHeightClass} w-full bg-neutral-950 relative overflow-hidden flex items-center justify-center`}>
            {validUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={validUrl} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            ) : (
              <div className="flex flex-col items-center justify-center text-neutral-700 group-hover:text-blue-500 transition-colors">
                 {itemData.type === "folder" ? (
                    <svg className="w-16 h-16 opacity-80" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" /></svg>
                 ) : (
                    <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                 )}
              </div>
            )}

            {/* Badge type en haut à gauche avec icône colorée */}
            {itemData.type === 'folder' ? (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border shadow-sm bg-yellow-500/20 text-yellow-300 border-yellow-500/40">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" /></svg>
                <span>Dossier</span>
              </div>
            ) : typeConfig ? (
              <div className={`absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border shadow-sm ${typeConfig.bg} ${typeConfig.text} ${typeConfig.border}`}>
                {typeConfig.icon}
                <span>{typeConfig.label}</span>
              </div>
            ) : null}

            {/* Bouton Supprimer en haut à droite */}
            {deleteButton}
          </div>
        )}

        <div className="p-3 flex flex-col gap-1 bg-neutral-900 border-t border-neutral-800">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-neutral-200 truncate text-sm group-hover:text-blue-400 transition-colors flex-1 min-w-0">{item.title}</h3>
            {/* Bouton Télécharger en bas à droite */}
            {downloadButton}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-neutral-500 uppercase tracking-wide">
            <span suppressHydrationWarning className="shrink-0">
              {item.created_at ? format(new Date(item.created_at), "dd MMM", { locale: fr }) : "-"}
            </span>
            {item.tags && item.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap justify-end flex-1 min-w-0">
                {item.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedTagId(selectedTagId === tag.id ? null : tag.id);
                    }}
                    className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:bg-blue-600 hover:text-white cursor-pointer transition-colors normal-case tracking-normal text-[10px] leading-tight"
                  >
                    {(tag as any).name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <div className="flex gap-6">
        <aside className="hidden md:block w-48 shrink-0 space-y-6">
          {/* FILTRE PAR TYPE */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">Type</h3>
            <nav className="space-y-1">
              <button onClick={() => setSelectedDocType(null)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedDocType ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-800"}`}>
                Tous ({items.length})
              </button>
              {contentTypes.map((ct) => {
                const count = docTypeCounts[ct.key] || 0;
                if (count === 0) return null;
                return (
                  <button key={ct.key} onClick={() => setSelectedDocType(selectedDocType === ct.key ? null : ct.key)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between ${selectedDocType === ct.key ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-800"}`}>
                    <span>{ct.label}</span>
                    <span className="opacity-60 text-xs py-0.5">({count})</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* FILTRE PAR TAG */}
          {allTags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">Tags</h3>
              <nav className="space-y-1">
                <button onClick={() => setSelectedTagId(null)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedTagId ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-800"}`}>
                  Tous
                </button>
                {allTags.map((tag) => (
                  <button key={tag.id} onClick={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between ${selectedTagId === tag.id ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-800"}`}>
                    <span>{tag.name}</span>
                    <span className="opacity-60 text-xs py-0.5">({tagCounts[tag.id] || 0})</span>
                  </button>
                ))}
                {noTagsCount > 0 && (
                  <div className="border-t border-neutral-800 mt-2 pt-2">
                    <button onClick={() => setSelectedTagId(selectedTagId === NO_TAGS ? null : NO_TAGS)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex justify-between ${selectedTagId === NO_TAGS ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-800"}`}>
                      <span>Sans Tags</span>
                      <span className="opacity-60 text-xs py-0.5">({noTagsCount})</span>
                    </button>
                  </div>
                )}
              </nav>
            </div>
          )}
        </aside>

        <section className="space-y-4 min-h-[80vh] flex flex-col flex-1 min-w-0">
          <div className="flex flex-col gap-3">
            {/* Mobile: filtre par type */}
            <div className="md:hidden overflow-x-auto pb-1">
              <div className="flex gap-2 min-w-max">
                <button onClick={() => setSelectedDocType(null)} className={`px-3 py-1.5 rounded-full text-sm ${!selectedDocType ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400"}`}>Tous</button>
                {contentTypes.map((ct) => (
                  <button key={ct.key} onClick={() => setSelectedDocType(selectedDocType === ct.key ? null : ct.key)} className={`px-3 py-1.5 rounded-full text-sm ${selectedDocType === ct.key ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400"}`}>{ct.label}</button>
                ))}
              </div>
            </div>

            {/* Mobile: filtre par tag */}
            {allTags.length > 0 && (
              <div className="md:hidden overflow-x-auto pb-1">
                <div className="flex gap-2 min-w-max">
                  <button onClick={() => setSelectedTagId(null)} className={`px-3 py-1.5 rounded-full text-sm ${!selectedTagId ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400"}`}>Tags: Tous</button>
                  {allTags.map((tag) => (
                    <button key={tag.id} onClick={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)} className={`px-3 py-1.5 rounded-full text-sm ${selectedTagId === tag.id ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400"}`}>{tag.name}</button>
                  ))}
                  {noTagsCount > 0 && (
                    <button onClick={() => setSelectedTagId(selectedTagId === NO_TAGS ? null : NO_TAGS)} className={`px-3 py-1.5 rounded-full text-sm ${selectedTagId === NO_TAGS ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400"}`}>Sans Tags</button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm opacity-70">{filteredItems.length} élément{filteredItems.length > 1 ? "s" : ""}</div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="relative flex-1 sm:flex-none">
                  <input type="text" placeholder="Rechercher..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full sm:w-64 bg-neutral-800 text-white border border-neutral-700 rounded-lg px-4 py-1.5 pl-9 outline-none focus:border-blue-500 text-sm" />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">Taille</span>
                  <input type="range" min={0} max={100} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 cursor-pointer" disabled={viewMode === "list"} />
                </div>
                <div className="inline-flex rounded-lg border border-neutral-700 overflow-hidden">
                  <button
                    onClick={() => setViewMode("grid")}
                    title="Vue grille"
                    aria-pressed={viewMode === "grid"}
                    className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === "grid" ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    title="Vue liste"
                    aria-pressed={viewMode === "list"}
                    className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === "list" ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {viewMode === "list" ? (
            <div className="flex flex-col divide-y divide-neutral-800 border border-neutral-800 rounded-xl overflow-hidden flex-1">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  const itemData = item as any;
                  const type = itemData.doc_type || (itemData.image_url ? "photo" : "doc");
                  const cfg = DOC_TYPE_CONFIG[type] || DOC_TYPE_CONFIG.doc;
                  const href = getLinkHref(item);
                  const rowClass = "flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-800/50 transition-colors cursor-pointer";
                  const inner = (
                    <>
                      <span className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg ${cfg.bg} ${cfg.text}`}>
                        {cfg.icon}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-white truncate">{item.title || "(sans titre)"}</span>
                        {item.tags && item.tags.length > 0 && (
                          <span className="block text-[10px] text-neutral-500 truncate">{item.tags.map((t) => t.name).join(" · ")}</span>
                        )}
                      </span>
                      <span className={`hidden sm:inline text-[11px] px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.text}`}>{cfg.label}</span>
                      <span className="hidden md:inline text-xs text-neutral-500 w-28 text-right">
                        {item.created_at ? format(new Date(item.created_at), "d MMM yyyy", { locale: fr }) : ""}
                      </span>
                    </>
                  );
                  return href ? (
                    <Link key={item.id} href={href} className={rowClass}>{inner}</Link>
                  ) : (
                    <div key={item.id} onClick={() => handleOpen(item)} className={rowClass}>{inner}</div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
                  <p>Aucun document trouvé</p>
                </div>
              )}
            </div>
          ) : (
          <div className={`grid gap-4 ${gridClass} flex-1 content-start`}>
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const wrapperClass = "group relative flex flex-col bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-blue-500 transition-all hover:shadow-lg hover:shadow-blue-900/20 cursor-pointer";
                
                // MODIF LOGIQUE D'OUVERTURE ICI
                const href = getLinkHref(item);

                if (href) {
                  return (
                    <Link key={item.id} href={href} className={wrapperClass}>
                      {renderCardContent(item)}
                    </Link>
                  );
                }
                
                return (
                  <div key={item.id} onClick={() => handleOpen(item)} className={wrapperClass}>
                    {renderCardContent(item)}
                  </div>
                );
              })
            ) : (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-neutral-500">
                <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <p>Aucun document trouvé</p>
              </div>
            )}
          </div>
          )}

          <footer className="mt-12 pt-8 pb-4 border-t border-neutral-800">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
              {myLinks.map((link) => (
                <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-neutral-500 hover:text-white hover:underline underline-offset-4">{link.name}</a>
              ))}
            </div>
            <div className="text-center mt-4 text-xs text-neutral-700">&copy; {new Date().getFullYear()} MyDrive Ecosystem</div>
          </footer>
        </section>
      </div>

      {selectedIndex >= 0 && (
        <SwipeableOverlay
          items={filteredItems}
          selectedIndex={selectedIndex}
          onClose={() => setSelectedIndex(-1)}
          onNavigate={setSelectedIndex}
          onUpdate={handleUpdateItem}
          onDelete={handleDeleteItem}
          allTags={allTags}
          onTagsChange={handleTagsChange}
          onNewTagCreated={handleNewTagCreated}
        />
      )}

      {/* Modal de confirmation de suppression */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirmItem(null)}>
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-2">Supprimer ce fichier ?</h3>
            <p className="text-neutral-400 text-sm mb-6">
              Voulez-vous vraiment supprimer <span className="text-white font-medium">&quot;{deleteConfirmItem.title}&quot;</span> ? Cette action est irréversible.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 text-sm text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  handleDeleteItem(deleteConfirmItem.id, deleteConfirmItem.image_path || "");
                  setDeleteConfirmItem(null);
                }}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
