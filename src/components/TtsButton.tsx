"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Square } from "lucide-react";

interface Props {
  getContent: () => string;
  title?: string;
}

function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  // Insert spaces around block elements for cleaner separation
  const blocks = tmp.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,tr,td,th,br,div");
  blocks.forEach((b) => { b.appendChild(document.createTextNode(" ")); });
  return (tmp.textContent || "").replace(/\s+/g, " ").trim();
}

export default function TtsButton({ getContent, title }: Props) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [progress, setProgress] = useState(0); // 0..1
  const textRef = useRef<string>("");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const startedAtCharRef = useRef<number>(0);
  const resumeFromCharRef = useRef<number>(0);

  const stopAll = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setState("idle");
    setProgress(0);
    startedAtCharRef.current = 0;
    resumeFromCharRef.current = 0;
  }, []);

  const speakFrom = useCallback((fromChar: number) => {
    if (typeof window === "undefined") return;
    const text = textRef.current;
    if (!text) return;
    const slice = text.slice(fromChar);
    if (!slice) return;
    const u = new SpeechSynthesisUtterance(slice);
    u.lang = "fr-FR";
    // Try to pick a French voice (best quality if available)
    const voices = window.speechSynthesis.getVoices();
    const fr = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("fr"))
             || voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("fr-fr"))
             || null;
    if (fr) u.voice = fr;
    u.rate = 1;
    u.pitch = 1;

    startedAtCharRef.current = fromChar;

    u.onboundary = (e) => {
      const abs = startedAtCharRef.current + (e.charIndex || 0);
      setProgress(Math.min(1, abs / text.length));
    };
    u.onend = () => {
      setProgress(1);
      setState("idle");
      utteranceRef.current = null;
      startedAtCharRef.current = 0;
      resumeFromCharRef.current = 0;
    };
    u.onerror = () => {
      setState("idle");
      utteranceRef.current = null;
    };

    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
    setState("playing");
  }, []);

  const play = useCallback(() => {
    if (typeof window === "undefined") return;
    // Text is refreshed each play
    textRef.current = htmlToPlainText((title ? title + ". " : "") + getContent());
    if (!textRef.current) return;
    window.speechSynthesis.cancel();
    speakFrom(0);
  }, [getContent, speakFrom, title]);

  const togglePauseResume = useCallback(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (state === "playing") {
      // On iOS pause() can be flaky - fallback: cancel and remember position
      try { synth.pause(); } catch {}
      if (synth.paused) {
        setState("paused");
        return;
      }
      // Fallback: cancel + remember approx position from progress
      const approxChar = Math.floor(progress * textRef.current.length);
      resumeFromCharRef.current = approxChar;
      synth.cancel();
      setState("paused");
    } else if (state === "paused") {
      try { synth.resume(); } catch {}
      // If resume didn't take effect (iOS), speak from remembered position
      setTimeout(() => {
        if (!synth.speaking) {
          speakFrom(resumeFromCharRef.current);
        } else {
          setState("playing");
        }
      }, 50);
    }
  }, [state, progress, speakFrom]);

  // Space bar toggle (only when TTS active AND focus is not on editable target)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state === "idle") return;
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

  // Cleanup on unmount
  useEffect(() => () => { try { window.speechSynthesis.cancel(); } catch {} }, []);

  // Ensure voices are loaded (Chrome loads them async)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = window.speechSynthesis;
    if (s.getVoices().length === 0 && "onvoiceschanged" in s) {
      const h = () => { /* trigger reload */ };
      s.addEventListener("voiceschanged", h);
      return () => s.removeEventListener("voiceschanged", h);
    }
  }, []);

  const percent = Math.round(progress * 100);

  return (
    <div className="flex items-center gap-2 shrink-0">
      {state === "idle" ? (
        <button
          onClick={play}
          title="Lire à voix haute (TTS)"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-blue-600 text-neutral-200 hover:text-white border border-neutral-700 transition-colors"
        >
          <Play size={16} />
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
            <span className="text-xs tabular-nums text-neutral-400 w-8 text-right">{percent}%</span>
          </div>
        </>
      )}
    </div>
  );
}
