"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "@/components/Toaster";
import type { Slide, SlideCategory } from "../types";
import { createDefaultSlide } from "../types";

type Props = {
  slides: Slide[];
  setSlides: (s: Slide[]) => void;
  currentIndex: number;
  setCurrentIndex: (i: number) => void;
  nightMode?: boolean;
  slideCategories: SlideCategory[];
  setSlideCategories: (c: SlideCategory[]) => void;
  filterCategory: string;
  setFilterCategory: (c: string) => void;
};

export default function PresentationSidebar({
  slides, setSlides, currentIndex, setCurrentIndex, nightMode,
  slideCategories, setSlideCategories, filterCategory, setFilterCategory,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  // "+" new category input state — tracks which slide's "+" was clicked
  const [addingCategoryForSlide, setAddingCategoryForSlide] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const newCatInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the input when it appears
  useEffect(() => {
    if (addingCategoryForSlide !== null && newCatInputRef.current) {
      newCatInputRef.current.focus();
    }
  }, [addingCategoryForSlide]);

  // Filter slides by category
  const filteredEntries: { slide: Slide; realIndex: number }[] = slides
    .map((slide, i) => ({ slide, realIndex: i }))
    .filter(({ slide }) => {
      if (filterCategory === "all") return true;
      return slide.categoryIds?.includes(filterCategory);
    });

  const addSlide = () => {
    const newSlide = createDefaultSlide();
    if (filterCategory !== "all") {
      newSlide.categoryIds = [filterCategory];
    }
    setSlides([...slides, newSlide]);
    setCurrentIndex(slides.length);
  };

  const deleteSlide = (e: React.MouseEvent, realIndex: number) => {
    e.stopPropagation();
    if (slides.length <= 1) return toast("Il faut au moins une diapositive.");
    const newSlides = slides.filter((_, i) => i !== realIndex);
    setSlides(newSlides);
    if (currentIndex >= newSlides.length) setCurrentIndex(newSlides.length - 1);
    else if (currentIndex === realIndex) setCurrentIndex(Math.max(0, realIndex - 1));
    else if (realIndex < currentIndex) setCurrentIndex(currentIndex - 1);
  };

  const duplicateSlide = (e: React.MouseEvent, realIndex: number) => {
    e.stopPropagation();
    const dup: Slide = {
      ...slides[realIndex],
      id: crypto.randomUUID(),
      elements: slides[realIndex].elements.map((el) => ({ ...el, id: crypto.randomUUID() })),
    };
    const newSlides = [...slides];
    newSlides.splice(realIndex + 1, 0, dup);
    setSlides(newSlides);
    setCurrentIndex(realIndex + 1);
  };

  // ─── Category management ──────────────────────────────────
  const toggleSlideCategory = (slideIndex: number, categoryId: string) => {
    const newSlides = [...slides];
    const slide = { ...newSlides[slideIndex] };
    const ids = slide.categoryIds ? [...slide.categoryIds] : [];
    const idx = ids.indexOf(categoryId);
    if (idx >= 0) {
      ids.splice(idx, 1);
    } else {
      ids.push(categoryId);
    }
    slide.categoryIds = ids;
    newSlides[slideIndex] = slide;
    setSlides(newSlides);
  };

  const addCategory = (forSlideIndex: number) => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (slideCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    const newCat: SlideCategory = { id: crypto.randomUUID(), name };
    setSlideCategories([...slideCategories, newCat]);
    // Auto-assign to the slide
    toggleSlideCategory(forSlideIndex, newCat.id);
    setNewCategoryName("");
    setAddingCategoryForSlide(null);
  };

  const deleteCategory = (categoryId: string) => {
    setSlideCategories(slideCategories.filter((c) => c.id !== categoryId));
    const newSlides = slides.map((s) => ({
      ...s,
      categoryIds: s.categoryIds?.filter((id) => id !== categoryId),
    }));
    setSlides(newSlides);
    if (filterCategory === categoryId) setFilterCategory("all");
  };

  // ─── Drag & Drop ───────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, realIndex: number) => {
    setDragIndex(realIndex);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(realIndex));
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = "0.5";
    }
  };

  const handleDragOver = (e: React.DragEvent, realIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(realIndex);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      setDropTarget(null);
      return;
    }

    const newSlides = [...slides];
    const [moved] = newSlides.splice(dragIndex, 1);
    newSlides.splice(toIndex, 0, moved);
    setSlides(newSlides);

    if (currentIndex === dragIndex) {
      setCurrentIndex(toIndex);
    } else if (dragIndex < currentIndex && toIndex >= currentIndex) {
      setCurrentIndex(currentIndex - 1);
    } else if (dragIndex > currentIndex && toIndex <= currentIndex) {
      setCurrentIndex(currentIndex + 1);
    }

    setDragIndex(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDropTarget(null);
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = "1";
    }
  };

  return (
    <aside className="w-56 bg-neutral-900 border-r border-neutral-800 flex flex-col">
      {/* ─── Category filter dropdown ─────────────────────────── */}
      <div className="p-3 border-b border-neutral-800">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="w-full rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-white px-2.5 py-1.5 outline-none focus:border-orange-500 transition-colors cursor-pointer"
        >
          <option value="all">Tous ({slides.length})</option>
          {slideCategories.map((cat) => {
            const count = slides.filter((s) => s.categoryIds?.includes(cat.id)).length;
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({count})
              </option>
            );
          })}
        </select>
      </div>

      {/* ─── Slide thumbnails ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredEntries.map(({ slide, realIndex }) => (
          <div key={slide.id} className="space-y-1">
            {/* Drop indicator line */}
            {dropTarget === realIndex && dragIndex !== null && dragIndex !== realIndex && (
              <div className="h-0.5 bg-orange-500 rounded-full mx-2 my-0.5" />
            )}

            {/* Slide thumbnail */}
            <div
              ref={dragIndex === realIndex ? dragNodeRef : undefined}
              draggable
              onClick={() => setCurrentIndex(realIndex)}
              onDragStart={(e) => handleDragStart(e, realIndex)}
              onDragOver={(e) => handleDragOver(e, realIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, realIndex)}
              onDragEnd={handleDragEnd}
              className={`cursor-pointer group relative aspect-video w-full rounded-lg border-2 transition-all overflow-hidden ${
                dragIndex === realIndex ? "opacity-50" : ""
              } ${
                realIndex === currentIndex
                  ? "border-orange-500 bg-neutral-800"
                  : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-500"
              }`}
            >
              {/* Slide number */}
              <span className="absolute left-1 top-1 text-[10px] font-bold text-neutral-500 z-10">{realIndex + 1}</span>

              {/* Drag handle indicator */}
              <div className="absolute right-1 top-1 z-10 hidden group-hover:flex flex-col gap-px cursor-grab">
                <div className="flex gap-px">
                  <div className="w-1 h-1 rounded-full bg-neutral-500" />
                  <div className="w-1 h-1 rounded-full bg-neutral-500" />
                </div>
                <div className="flex gap-px">
                  <div className="w-1 h-1 rounded-full bg-neutral-500" />
                  <div className="w-1 h-1 rounded-full bg-neutral-500" />
                </div>
                <div className="flex gap-px">
                  <div className="w-1 h-1 rounded-full bg-neutral-500" />
                  <div className="w-1 h-1 rounded-full bg-neutral-500" />
                </div>
              </div>

              {/* Mini preview of elements */}
              <div
                className="w-full h-full relative"
                style={{
                  backgroundColor: slide.backgroundColor || "#ffffff",
                  filter: nightMode ? "invert(1)" : "none",
                }}
              >
                {slide.elements
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((el) => (
                    <div
                      key={el.id}
                      className="absolute overflow-hidden"
                      style={{
                        left: `${el.x}%`,
                        top: `${el.y}%`,
                        width: `${el.width}%`,
                        height: `${el.height}%`,
                      }}
                    >
                      {el.type === "text" && (
                        <div
                          className="w-full h-full overflow-hidden"
                          style={{
                            fontSize: Math.max(3, (el.style.fontSize || 18) * 0.12),
                            fontWeight: el.style.fontWeight || "normal",
                            color: el.style.color || "#333",
                            textAlign: el.style.textAlign || "left",
                            lineHeight: 1.2,
                          }}
                        >
                          {el.content?.substring(0, 50)}
                        </div>
                      )}
                      {el.type === "image" && (
                        <img src={el.src} alt="" className="w-full h-full object-contain" draggable={false}
                          style={{ filter: nightMode ? "invert(1)" : "none" }} />
                      )}
                      {el.type === "shape" && (
                        <div className="w-full h-full" style={{ backgroundColor: el.style.fill || "#3b82f6", borderRadius: el.shapeType === "circle" ? "50%" : 0 }} />
                      )}
                      {el.type === "icon" && (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: el.style.color || "#333" }} />
                        </div>
                      )}
                      {el.type === "table" && (
                        <div className="w-full h-full border border-gray-300" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 30%, #ddd 30%, #ddd 31%)" }} />
                      )}
                      {el.type === "mindmap" && (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-3 h-3 rounded-full bg-orange-500" />
                          <div className="w-2 h-px bg-orange-400" />
                          <div className="flex flex-col gap-0.5">
                            <div className="w-2 h-1 rounded-sm bg-blue-400" />
                            <div className="w-2 h-1 rounded-sm bg-green-400" />
                          </div>
                        </div>
                      )}
                      {el.type === "code" && (
                        <div className="w-full h-full rounded-sm" style={{ backgroundColor: "#1e1e1e" }}>
                          <div className="p-0.5">
                            <div className="h-0.5 w-3/4 rounded bg-blue-400 mb-0.5" />
                            <div className="h-0.5 w-1/2 rounded bg-green-400 mb-0.5" />
                            <div className="h-0.5 w-2/3 rounded bg-orange-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => deleteSlide(e, realIndex)}
                className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white group-hover:flex hover:bg-red-500 z-20"
              >
                ×
              </button>

              {/* Duplicate button */}
              <button
                onClick={(e) => duplicateSlide(e, realIndex)}
                className="absolute -left-1 -bottom-1 hidden h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white group-hover:flex hover:bg-blue-500 z-20"
                title="Dupliquer"
              >
                ⧉
              </button>
            </div>

            {/* ─── Category badges below the slide ────────────── */}
            <div className="flex flex-wrap gap-1 px-0.5">
              {slideCategories.map((cat) => {
                const isActive = slide.categoryIds?.includes(cat.id) ?? false;
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleSlideCategory(realIndex, cat.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (confirm(`Supprimer la catégorie "${cat.name}" ?`)) {
                        deleteCategory(cat.id);
                      }
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors truncate max-w-[70px] ${
                      isActive
                        ? "bg-orange-600 text-white"
                        : "bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                    }`}
                    title={isActive ? `Retirer "${cat.name}"` : `Ajouter "${cat.name}"`}
                  >
                    {cat.name}
                  </button>
                );
              })}

              {/* "+" button to add new category */}
              {addingCategoryForSlide === realIndex ? (
                <input
                  ref={newCatInputRef}
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory(realIndex);
                    }
                    if (e.key === "Escape") {
                      setAddingCategoryForSlide(null);
                      setNewCategoryName("");
                    }
                  }}
                  onBlur={() => {
                    if (newCategoryName.trim()) {
                      addCategory(realIndex);
                    } else {
                      setAddingCategoryForSlide(null);
                      setNewCategoryName("");
                    }
                  }}
                  placeholder="Nom..."
                  className="w-16 px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 border border-orange-500 text-white outline-none placeholder:text-neutral-600"
                />
              ) : (
                <button
                  onClick={() => {
                    setAddingCategoryForSlide(realIndex);
                    setNewCategoryName("");
                  }}
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-orange-400 transition-colors"
                  title="Nouvelle catégorie"
                >
                  +
                </button>
              )}
            </div>
          </div>
        ))}

        {filteredEntries.length === 0 && filterCategory !== "all" && (
          <div className="text-center text-xs text-neutral-500 py-4">
            Aucune diapositive dans cette catégorie
          </div>
        )}
      </div>

      <div className="p-3 border-t border-neutral-800">
        <button
          onClick={addSlide}
          className="w-full rounded-xl bg-neutral-800 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 transition-colors"
        >
          + Nouvelle diapositive
        </button>
      </div>
    </aside>
  );
}
