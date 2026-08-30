"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { X, ChevronLeft, ChevronRight, Minus, Plus, Moon, Sun } from "lucide-react";

const GAP = 40; // écart entre pages (px)

export default function BookReader({
  html,
  title,
  onClose,
  onNextDoc,
  nextTitle,
  siblings,
  currentId,
  onOpenDoc,
}: {
  html: string;
  title: string;
  onClose: () => void;
  /** Appelé quand on avance depuis la dernière page : ouvre le doc suivant en mode livre. */
  onNextDoc?: () => void;
  nextTitle?: string;
  /** Documents du même dossier (page « Sommaire » en fin de lecture). */
  siblings?: { id: string; title: string }[];
  currentId?: string;
  onOpenDoc?: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [fontPx, setFontPx] = useState(19);
  const [viewW, setViewW] = useState(0);
  const [night, setNight] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Préférence jour/nuit mémorisée par lecteur.
  useEffect(() => {
    try { setNight(localStorage.getItem("book-night") === "1"); } catch {}
  }, []);
  const toggleNight = () => setNight((n) => { try { localStorage.setItem("book-night", n ? "0" : "1"); } catch {} return !n; });

  // 1) Mesure la largeur réelle du conteneur multicol (hors padding).
  const measure = useCallback(() => {
    const c = contentRef.current;
    if (c && c.clientWidth) setViewW(c.clientWidth);
  }, []);

  // 2) Compte les pages APRÈS que les colonnes se soient appliquées.
  const countPages = useCallback(() => {
    const c = contentRef.current;
    if (!c || !viewW) return;
    const total = Math.max(1, Math.round(c.scrollWidth / (viewW + GAP)));
    setPages(total);
    // total = dernière page de contenu ; total (index) reste permis pour le Sommaire.
    setPage((p) => Math.min(p, total));
  }, [viewW]);

  const stride = viewW + GAP;

  useLayoutEffect(() => {
    const t = setTimeout(measure, 50);
    return () => clearTimeout(t);
  }, [fontPx, html, measure]);

  // Une fois la largeur connue (colonnes posées), on compte les pages.
  useEffect(() => {
    const id = requestAnimationFrame(() => countPages());
    return () => cancelAnimationFrame(id);
  }, [viewW, fontPx, html, countPages]);

  useEffect(() => {
    const onResize = () => { measure(); countPages(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure, countPages]);

  // Page « Sommaire » virtuelle après la dernière page de contenu.
  const hasIndex = !!(siblings && siblings.length > 0 && onOpenDoc);
  const onIndex = hasIndex && page >= pages;

  const go = useCallback((dir: number) => {
    if (dir > 0) {
      if (page < pages - 1) { setPage(page + 1); return; }
      // Dernière page de contenu → page Sommaire (si dispo), sinon doc suivant.
      if (page === pages - 1) {
        if (hasIndex) { setPage(pages); return; }
        if (onNextDoc) { onNextDoc(); return; }
        return;
      }
      // Depuis le Sommaire, avancer encore → document suivant.
      if (onNextDoc) onNextDoc();
      return;
    }
    setPage((p) => Math.max(p - 1, 0));
  }, [page, pages, hasIndex, onNextDoc]);

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

  const bg = night ? "#1c1b19" : "#f6f1e7";
  const fg = night ? "text-neutral-200" : "text-neutral-900";
  const hover = night ? "hover:bg-white/10" : "hover:bg-black/5";
  const border = night ? "border-white/10" : "border-black/10";
  const muted = night ? "text-neutral-400" : "text-neutral-600";

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col select-none ${fg}`} style={{ backgroundColor: bg }}>
      {/* Barre haut */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${border} shrink-0`}>
        <button onClick={onClose} aria-label="Fermer" className={`p-1.5 rounded-lg ${hover}`}><X size={20} /></button>
        <span className="flex-1 min-w-0 truncate text-sm font-semibold">{title}</span>
        <button onClick={toggleNight} aria-label="Mode nuit" className={`p-1.5 rounded-lg ${hover}`}>{night ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button onClick={() => setFontPx((f) => Math.max(14, f - 2))} aria-label="Réduire le texte" className={`p-1.5 rounded-lg ${hover}`}><Minus size={18} /></button>
        <span className="text-xs tabular-nums w-6 text-center">{fontPx}</span>
        <button onClick={() => setFontPx((f) => Math.min(34, f + 2))} aria-label="Agrandir le texte" className={`p-1.5 rounded-lg ${hover}`}><Plus size={18} /></button>
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

        {/* Page Sommaire : liste des documents du dossier, cliquables en mode lecture */}
        {onIndex && (
          <div
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="absolute inset-0 overflow-y-auto px-6 py-6"
            style={{ backgroundColor: bg, fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            <h2 className="text-[1.4em] font-bold mb-1">Sommaire du dossier</h2>
            <p className={`text-sm mb-5 ${muted}`}>{siblings!.length} document{siblings!.length > 1 ? "s" : ""} — touche un titre pour l ouvrir en mode lecture.</p>
            <ol className="space-y-1">
              {siblings!.map((s, i) => {
                const isCurrent = s.id === currentId;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => !isCurrent && onOpenDoc && onOpenDoc(s.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                        isCurrent
                          ? (night ? "bg-white/10 font-bold" : "bg-black/10 font-bold")
                          : (night ? "hover:bg-white/5" : "hover:bg-black/5")
                      }`}
                      style={{ fontSize: `${Math.min(fontPx, 20)}px` }}
                    >
                      <span className={`tabular-nums mr-2 ${muted}`}>{i + 1}.</span>
                      {s.title}
                      {isCurrent && <span className={`ml-2 text-xs ${muted}`}>(en cours)</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {/* Barre bas : navigation */}
      <div className={`flex items-center justify-between px-4 py-3 border-t ${border} shrink-0`}>
        <button onClick={() => go(-1)} disabled={page <= 0} className={`p-2 rounded-lg ${hover} disabled:opacity-30`}><ChevronLeft size={22} /></button>
        <span className={`text-sm tabular-nums ${muted}`}>
          {onIndex ? "Sommaire" : `${page + 1} / ${pages}`}
          {!onIndex && page >= pages - 1 && hasIndex && <span className="ml-2">→ Sommaire</span>}
          {onIndex && onNextDoc && nextTitle && <span className="ml-2">→ <em>{nextTitle}</em></span>}
        </span>
        <button onClick={() => go(1)} disabled={page >= pages - 1 && !hasIndex && !onNextDoc || (onIndex && !onNextDoc)} className={`p-2 rounded-lg ${hover} disabled:opacity-30`}><ChevronRight size={22} /></button>
      </div>
    </div>
  );
}
