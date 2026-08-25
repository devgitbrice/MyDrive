"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  initialData: { id: string; title: string; content: string };
}

const PALETTE = [
  "#ffffff", "#000000", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#78716c", "#a3a3a3",
];

export default function DrawEditor({ initialData }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number; pressure: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [title, setTitle] = useState(initialData.title);
  const [color, setColor] = useState<string>("#ffffff");
  const [size, setSize] = useState<number>(4);
  const [eraser, setEraser] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  // Rejet de paume iPad : n'accepte que le stylet quand actif (#17)
  const [penOnly, setPenOnly] = useState(false);
  useEffect(() => { try { setPenOnly(localStorage.getItem("draw-pen-only") === "1"); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("draw-pen-only", penOnly ? "1" : "0"); } catch {} }, [penOnly]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setStatus("saving");
      try {
        const dataUrl = canvas.toDataURL("image/png");
        await supabase.from("MyDrive").update({ content: dataUrl, title }).eq("id", initialData.id);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1200);
      } catch {
        setStatus("idle");
      }
    }, 800);
  }, [initialData.id, title]);

  // Resize + restore
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = wrap.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Fond noir uniforme (thème dark)
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (initialData.content && initialData.content.startsWith("data:image")) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        pushHistory();
      };
      img.src = initialData.content;
    } else {
      pushHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushHistory() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // Truncate future then push
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snap);
    if (historyRef.current.length > 30) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
  }

  function restoreHistory(idx: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const snap = historyRef.current[idx];
    if (!snap) return;
    ctx.putImageData(snap, 0, 0);
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    restoreHistory(historyIndexRef.current);
    scheduleSave();
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    restoreHistory(historyIndexRef.current);
    scheduleSave();
  }

  function clearAll() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    pushHistory();
    scheduleSave();
  }

  function getPos(e: PointerEvent | React.PointerEvent): { x: number; y: number; pressure: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const p = (e as any).pressure;
    return {
      x: (e as any).clientX - rect.left,
      y: (e as any).clientY - rect.top,
      pressure: typeof p === "number" && p > 0 ? p : 0.5,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    // Mode « Pencil seul » : le doigt (et la paume) sont ignorés (#17)
    if (penOnly && e.pointerType === "touch") return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = getPos(e);
    lastPointRef.current = p;
    drawStroke(p, p);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = getPos(e);
    const last = lastPointRef.current;
    if (last) drawStroke(last, p);
    lastPointRef.current = p;
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch {}
    pushHistory();
    scheduleSave();
  }

  function drawStroke(from: { x: number; y: number; pressure: number }, to: { x: number; y: number; pressure: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = size * (0.6 + to.pressure * 0.8);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    if (eraser) {
      ctx.strokeStyle = "#0a0a0a";
      ctx.lineWidth = width * 3;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
    }
    ctx.stroke();
  }

  return (
    <div className="flex flex-col h-dvh w-full overflow-hidden bg-neutral-950">
      {/* Top bar */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur">
        <Link href="/mydrive" className="text-neutral-400 hover:text-white text-sm">← MyDrive</Link>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); scheduleSave(); }}
          className="flex-1 bg-transparent text-white text-lg font-semibold outline-none"
          placeholder="Titre du dessin"
        />
        <span className="text-xs text-neutral-500 min-w-[52px] text-right">
          {status === "saving" ? "…" : status === "saved" ? "✓" : ""}
        </span>
      </header>

      {/* Toolbar */}
      <div className="shrink-0 flex items-center flex-wrap gap-3 px-4 py-2 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); setEraser(false); }}
              aria-label={`Couleur ${c}`}
              style={{ background: c }}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${color === c && !eraser ? "border-white scale-110" : "border-neutral-700"}`}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => { setColor(e.target.value); setEraser(false); }}
            className="w-8 h-8 rounded cursor-pointer bg-transparent border border-neutral-700"
            title="Couleur libre"
          />
        </div>

        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-neutral-500">Épaisseur</span>
          <input
            type="range"
            min={1}
            max={40}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-28"
          />
          <span className="text-xs text-neutral-400 w-6 text-right">{size}</span>
        </div>

        <button
          onClick={() => setEraser((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${eraser ? "bg-pink-500 border-pink-400 text-white" : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"}`}
        >
          🧽 Gomme
        </button>
        <button
          onClick={() => setPenOnly((v) => !v)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${penOnly ? "bg-blue-600 border-blue-500 text-white" : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"}`}
          title="N'accepter que l'Apple Pencil (ignore le doigt et la paume)"
        >
          ✍️ Pencil seul
        </button>
        <button onClick={undo} className="px-3 py-1.5 rounded-lg text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800">↶ Undo</button>
        <button onClick={redo} className="px-3 py-1.5 rounded-lg text-sm border border-neutral-700 text-neutral-300 hover:bg-neutral-800">↷ Redo</button>
        <button onClick={clearAll} className="px-3 py-1.5 rounded-lg text-sm border border-red-700 text-red-400 hover:bg-red-600 hover:text-white">Effacer tout</button>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} className="flex-1 relative overflow-hidden" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          className="block w-full h-full cursor-crosshair"
          style={{ touchAction: "none" }}
        />
      </div>
    </div>
  );
}
