"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { X, ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";

const GAP = 40; // écart entre pages (px)

export default function BookReader({
  html,
  title,
  onClose,
}: {
  html: string;
  title: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [fontPx, setFontPx] = useState(19);
  const [viewW, setViewW] = useState(0);
  const viewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const recalc = useCallback(() => {
    const view = viewRef.current, content = contentRef.current;
    if (!view || !content) return;
    const W = view.clientWidth;
    setViewW(W);
    const total = Math.max(1, Math.round(content.scrollWidth / (W + GAP)));
    setPages(total);
    setPage((p) => Math.min(p, total - 1));
  }, []);

  const stride = viewW + GAP;

  // Recalcule après rendu, changement de taille de police et redimensionnement.
  useLayoutEffect(() => {
    const t = setTimeout(recalc, 60);
    return () => clearTimeout(t);
  }, [fontPx, html, recalc]);

  useEffect(() => {
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [recalc]);

  const go = useCallback((dir: number) => {
    setPage((p) => Math.min(Math.max(p + dir, 0), pages - 1));
  }, [pages]);

  // Clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Swipe
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    go(dx < 0 ? 1 : -1);
  };

  // Tap : tiers gauche = précédent, reste = suivant
  const onTap = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    go(x < rect.width * 0.33 ? -1 : 1);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#f6f1e7] text-neutral-900 flex flex-col select-none">
      {/* Barre haut */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-black/10 shrink-0">
        <button onClick={onClose} aria-label="Fermer" className="p-1.5 rounded-lg hover:bg-black/5"><X size={20} /></button>
        <span className="flex-1 min-w-0 truncate text-sm font-semibold">{title}</span>
        <button onClick={() => setFontPx((f) => Math.max(14, f - 2))} aria-label="Réduire le texte" className="p-1.5 rounded-lg hover:bg-black/5"><Minus size={18} /></button>
        <span className="text-xs tabular-nums w-8 text-center">{fontPx}</span>
        <button onClick={() => setFontPx((f) => Math.min(34, f + 2))} aria-label="Agrandir le texte" className="p-1.5 rounded-lg hover:bg-black/5"><Plus size={18} /></button>
      </div>

      {/* Zone de lecture paginée */}
      <div
        ref={viewRef}
        onClick={onTap}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative flex-1 overflow-hidden px-6 py-5"
      >
        <div
          ref={contentRef}
          className="book-content h-full [&_img]:max-w-full [&_h1]:text-[1.6em] [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-[1.3em] [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:pl-5 [&_li]:mb-1 [&_a]:underline"
          style={{
            columnWidth: viewW ? `${viewW}px` : undefined,
            columnGap: `${GAP}px`,
            fontSize: `${fontPx}px`,
            lineHeight: 1.6,
            transform: `translateX(-${page * stride}px)`,
            transition: "transform 0.25s ease",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      {/* Barre bas : navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-black/10 shrink-0">
        <button onClick={() => go(-1)} disabled={page <= 0} className="p-2 rounded-lg hover:bg-black/5 disabled:opacity-30"><ChevronLeft size={22} /></button>
        <span className="text-sm tabular-nums text-neutral-600">{page + 1} / {pages}</span>
        <button onClick={() => go(1)} disabled={page >= pages - 1} className="p-2 rounded-lg hover:bg-black/5 disabled:opacity-30"><ChevronRight size={22} /></button>
      </div>
    </div>
  );
}
