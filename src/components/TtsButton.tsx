"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Square, Loader2 } from "lucide-react";

interface Props {
  getContent: () => string;
  title?: string;
}

const MAX_CHUNK_CHARS = 3500;

function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const blocks = tmp.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,tr,td,th,br,div");
  blocks.forEach((b) => { b.appendChild(document.createTextNode(" ")); });
  return (tmp.textContent || "").replace(/\s+/g, " ").trim();
}

/** Split text into chunks <= MAX_CHUNK_CHARS at sentence boundaries. */
function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + " " + s).length > MAX_CHUNK_CHARS) {
      if (current) chunks.push(current.trim());
      if (s.length > MAX_CHUNK_CHARS) {
        // Very long sentence — hard split
        for (let i = 0; i < s.length; i += MAX_CHUNK_CHARS) {
          chunks.push(s.slice(i, i + MAX_CHUNK_CHARS));
        }
        current = "";
      } else {
        current = s;
      }
    } else {
      current = current ? current + " " + s : s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

async function fetchAudioBlob(text: string): Promise<Blob> {
  const r = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: "alloy", model: "gpt-4o-mini-tts", speed: 1 }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`TTS ${r.status}: ${err}`);
  }
  return await r.blob();
}

export default function TtsButton({ getContent, title }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [progress, setProgress] = useState(0); // 0..1
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chunksRef = useRef<string[]>([]);
  const chunkIdxRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    for (const u of objectUrlsRef.current) URL.revokeObjectURL(u);
    objectUrlsRef.current = [];
  }, []);

  const stopAll = useCallback(() => {
    cancelledRef.current = true;
    cleanup();
    setState("idle");
    setProgress(0);
    chunksRef.current = [];
    chunkIdxRef.current = 0;
    setErrorMsg(null);
  }, [cleanup]);

  const playChunkAt = useCallback(async (idx: number) => {
    if (cancelledRef.current) return;
    const chunks = chunksRef.current;
    if (idx >= chunks.length) {
      setProgress(1);
      setState("idle");
      cleanup();
      chunkIdxRef.current = 0;
      return;
    }
    chunkIdxRef.current = idx;
    try {
      const blob = await fetchAudioBlob(chunks[idx]);
      if (cancelledRef.current) return;
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.push(url);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (!audio.duration || isNaN(audio.duration)) return;
        const local = audio.currentTime / audio.duration;
        setProgress(Math.min(1, (idx + local) / chunks.length));
      };
      audio.onended = () => {
        if (cancelledRef.current) return;
        playChunkAt(idx + 1);
      };
      audio.onerror = () => {
        setErrorMsg("Erreur lecture audio");
        setState("idle");
        cleanup();
      };
      await audio.play();
      setState("playing");
    } catch (e: any) {
      setErrorMsg(e?.message || "Erreur TTS");
      setState("idle");
      cleanup();
    }
  }, [cleanup]);

  const play = useCallback(async () => {
    if (typeof window === "undefined") return;
    setErrorMsg(null);
    const raw = (title ? title + ". " : "") + getContent();
    const text = htmlToPlainText(raw);
    if (!text) return;
    stopAll();
    cancelledRef.current = false;
    chunksRef.current = chunkText(text);
    chunkIdxRef.current = 0;
    setState("loading");
    setProgress(0);
    await playChunkAt(0);
  }, [getContent, title, playChunkAt, stopAll]);

  const togglePauseResume = useCallback(() => {
    if (!audioRef.current) return;
    if (state === "playing") {
      audioRef.current.pause();
      setState("paused");
    } else if (state === "paused") {
      audioRef.current.play().catch(() => {});
      setState("playing");
    }
  }, [state]);

  // Space bar toggle (only when TTS active AND focus is not on editable target)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state === "idle" || state === "loading") return;
      if (e.key !== " " && e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (t.isContentEditable) return;
      }
      e.preventDefault();
      togglePauseResume();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, togglePauseResume]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  const percent = Math.round(progress * 100);
  const chunkInfo = chunksRef.current.length > 1
    ? ` · ${chunkIdxRef.current + 1}/${chunksRef.current.length}`
    : "";

  return (
    <div className="flex items-center gap-2 shrink-0">
      {state === "idle" ? (
        <button
          onClick={play}
          title="Lire à voix haute (ChatGPT TTS)"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-blue-600 text-neutral-200 hover:text-white border border-neutral-700 transition-colors"
        >
          <Play size={16} />
        </button>
      ) : state === "loading" ? (
        <button
          disabled
          title="Chargement de la voix ChatGPT..."
          className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600/40 text-white"
        >
          <Loader2 size={16} className="animate-spin" />
        </button>
      ) : (
        <>
          <button
            onClick={togglePauseResume}
            title={state === "playing" ? "Pause (barre d'espace)" : "Reprendre (barre d'espace)"}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            {state === "playing" ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            onClick={stopAll}
            title="Arrêter"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-red-600 text-neutral-300 hover:text-white border border-neutral-700 transition-colors"
          >
            <Square size={14} />
          </button>
          <div className="hidden sm:flex items-center gap-2 min-w-[140px]">
            <div className="w-28 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-[width] duration-200 ease-linear"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-neutral-400 w-14 text-right">
              {percent}%{chunkInfo}
            </span>
          </div>
        </>
      )}
      {errorMsg && (
        <span className="text-xs text-red-400 truncate max-w-[220px]" title={errorMsg}>
          {errorMsg}
        </span>
      )}
    </div>
  );
}
