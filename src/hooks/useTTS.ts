"use client";

import { useState, useRef, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";
import { useTTSSettingsStore } from "@/store/ttsSettingsStore";

type TTSState = "idle" | "loading" | "playing";

export function useTTS() {
  const [state, setState] = useState<TTSState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopPlayback = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    setState("idle");
  }, []);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return;

      // Stop any current playback
      stopPlayback();
      setState("loading");

      const { voice, model, speed, responseFormat, instructions } =
        useTTSSettingsStore.getState();

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await authFetch("/api/tts-openai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voice,
            model,
            speed,
            response_format: responseFormat,
            instructions: instructions || undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          setState("idle");
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const audio = new Audio(url);
        audioRef.current = audio;

        setState("playing");

        return new Promise<void>((resolve) => {
          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            setState("idle");
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            setState("idle");
            resolve();
          };
          audio.play().catch(() => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            setState("idle");
            resolve();
          });
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          // Cancelled by user
          return;
        }
        console.error("TTS error:", e);
        setState("idle");
      }
    },
    [stopPlayback]
  );

  return { state, speak, stopPlayback };
}
