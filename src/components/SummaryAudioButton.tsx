"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { FileAudio, Loader2, Square } from "lucide-react";
import { toast } from "@/components/Toaster";

interface Props {
  getContent: () => string;
  title?: string;
}

// WAV silencieux pour débloquer l'audio dans le geste de clic (iOS).
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  tmp.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,br,div,td,th").forEach((b) => b.appendChild(document.createTextNode(" ")));
  return (tmp.textContent || "").replace(/\s+/g, " ").trim();
}

export default function SummaryAudioButton({ getContent, title }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const summaryRef = useRef<string>(""); // cache du résumé pour re-lecture rapide

  const stop = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    setState("idle");
  }, []);

  const run = useCallback(async () => {
    if (state === "playing" || state === "loading") { stop(); return; }

    // 1) Débloque l'audio dans le geste (iOS).
    let audio = audioRef.current;
    if (!audio) { audio = new Audio(); audioRef.current = audio; }
    try { audio.src = SILENT; audio.play().catch(() => {}); } catch {}

    setState("loading");
    try {
      // 2) Résumé (réutilise le cache si le doc n'a pas changé)
      let summary = summaryRef.current;
      const text = htmlToPlainText(getContent());
      if (!text) { toast("Document vide"); setState("idle"); return; }
      if (!summary) {
        const r = await authFetch("/api/summarize-doc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, title }),
        });
        const data = await r.json();
        if (!r.ok || !data.summary) throw new Error(data.error || "Résumé indisponible");
        summary = data.summary;
        summaryRef.current = summary;
      }
      // 3) TTS
      const tr = await authFetch("/api/tts-openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summary, voice: "alloy" }),
      });
      if (!tr.ok) throw new Error("TTS indisponible");
      const blob = await tr.blob();
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audio.onended = () => { setState("idle"); URL.revokeObjectURL(url); };
      audio.onerror = () => { setState("idle"); URL.revokeObjectURL(url); };
      await audio.play();
      setState("playing");
    } catch (e: any) {
      toast("Erreur résumé audio : " + (e?.message || ""));
      setState("idle");
    }
  }, [state, stop, getContent, title]);

  useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  return (
    <button
      onClick={run}
      title="Résumé audio (~200 mots)"
      className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors shrink-0 ${
        state === "playing" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-neutral-800 hover:bg-emerald-600 text-neutral-200 hover:text-white border-neutral-700"
      }`}
    >
      {state === "loading" ? <Loader2 size={16} className="animate-spin" /> : state === "playing" ? <Square size={14} /> : <FileAudio size={16} />}
    </button>
  );
}
