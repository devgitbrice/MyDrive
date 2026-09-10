"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lecteur PDF (pdf.js) : rend la page courante sur un canvas,
 * navigation avec ← / → (clavier), boutons à l'écran et swipe.
 */
export default function PdfViewer({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Charge le document
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdf(null);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setPage(1);
      } catch (e) {
        console.error("PdfViewer:", e);
        if (!cancelled) setError("Impossible d'afficher ce PDF.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Rend la page courante, ajustée à l'espace disponible
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await pdf.getPage(page);
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const wrap = wrapperRef.current;
        const cw = (wrap?.clientWidth || 800) - 16;
        const ch = (wrap?.clientHeight || 600) - 64; // place pour la barre de pages
        const base = p.getViewport({ scale: 1 });
        const fit = Math.min(cw / base.width, ch / base.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale: fit * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        renderTaskRef.current?.cancel();
        const task = p.render({ canvasContext: canvas.getContext("2d")!, viewport });
        renderTaskRef.current = task;
        await task.promise.catch(() => {});
      } catch (e) {
        console.error("PdfViewer render:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, page]);

  const next = useCallback(() => setPage((p) => Math.min(numPages, p + 1)), [numPages]);
  const prev = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);

  // ← / → tournent les pages du PDF (l'overlay laisse la main quand un PDF est affiché)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, prev]);

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full flex flex-col items-center justify-center gap-2 select-none"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => { e.stopPropagation(); touchStartX.current = e.targetTouches[0].clientX; }}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => {
        e.stopPropagation();
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start === null) return;
        const dx = start - e.changedTouches[0].clientX;
        if (dx > 50) next();
        if (dx < -50) prev();
      }}
    >
      {error ? (
        <div className="text-neutral-400 text-sm text-center p-6">
          <p>{error}</p>
          <a href={url} target="_blank" rel="noreferrer" className="underline text-blue-400 mt-2 inline-block">Ouvrir le PDF dans un onglet</a>
        </div>
      ) : (
        <>
          <div className="relative flex items-center justify-center min-h-0">
            <canvas ref={canvasRef} className="rounded shadow-2xl bg-white max-w-full" />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">Chargement du PDF…</div>
            )}
          </div>
          {numPages > 0 && (
            <div className="flex items-center gap-3 text-white/80 text-sm bg-white/10 rounded-full px-3 py-1.5 backdrop-blur">
              <button onClick={prev} disabled={page <= 1} className="px-2 py-0.5 rounded-full hover:bg-white/20 disabled:opacity-30" aria-label="Page précédente">←</button>
              <span className="tabular-nums">Page {page} / {numPages}</span>
              <button onClick={next} disabled={page >= numPages} className="px-2 py-0.5 rounded-full hover:bg-white/20 disabled:opacity-30" aria-label="Page suivante">→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
