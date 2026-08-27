"use client";

import { useState, useRef, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";

const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

type DictationState = "idle" | "connecting" | "recording" | "error";

export function useVoiceDictation(onTranscript: (text: string) => void) {
  const [state, setState] = useState<DictationState>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptBufferRef = useRef("");

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (wsRef.current && wsRef.current.readyState <= 1) {
      wsRef.current.close();
    }
    wsRef.current = null;
    // Flush remaining buffer
    if (transcriptBufferRef.current.trim()) {
      onTranscript(transcriptBufferRef.current.trim());
    }
    transcriptBufferRef.current = "";
    setState("idle");
  }, [onTranscript]);

  const start = useCallback(async () => {
    if (state === "recording" || state === "connecting") {
      stop();
      return;
    }

    setState("connecting");
    transcriptBufferRef.current = "";

    try {
      // Get API key from our backend
      const tokenRes = await authFetch("/api/voice-token");
      const tokenData = await tokenRes.json();
      if (!tokenData.apiKey) {
        setState("error");
        return;
      }

      // Connect to Gemini Live API WebSocket
      const ws = new WebSocket(`${WS_URL}?key=${tokenData.apiKey}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send setup message - we only want text transcription
        ws.send(
          JSON.stringify({
            setup: {
              model: "models/gemini-2.0-flash-live-001",
              generationConfig: {
                responseModalities: ["TEXT"],
              },
              systemInstruction: {
                parts: [
                  {
                    text: "Tu es un assistant de dictee vocale. Transcris exactement ce que l'utilisateur dit, mot pour mot, en respectant la ponctuation. Ne rajoute rien d'autre que la transcription. Si l'utilisateur parle en francais, transcris en francais. Si en anglais, transcris en anglais.",
                  },
                ],
              },
              inputAudioTranscription: {},
            },
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Handle setup complete
          if (msg.setupComplete) {
            setState("recording");
            startAudioCapture(ws);
            return;
          }

          // Handle input transcription (what the user said)
          if (msg.serverContent?.inputTranscription?.text) {
            const text = msg.serverContent.inputTranscription.text;
            transcriptBufferRef.current += text;
            onTranscript(transcriptBufferRef.current);
          }

          // Handle model text response
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.text) {
                transcriptBufferRef.current += part.text;
                onTranscript(transcriptBufferRef.current);
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        setState("error");
        stop();
      };

      ws.onclose = () => {
        if (state !== "idle") {
          stop();
        }
      };
    } catch {
      setState("error");
    }
  }, [state, stop, onTranscript]);

  const startAudioCapture = async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      ctxRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const float32 = event.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(
            -32768,
            Math.min(32767, Math.floor(float32[i] * 32768))
          );
        }

        // Convert to base64
        const bytes = new Uint8Array(int16.buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        ws.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks: [
                {
                  data: base64,
                  mimeType: "audio/pcm;rate=16000",
                },
              ],
            },
          })
        );
      };
    } catch {
      setState("error");
    }
  };

  const toggle = useCallback(() => {
    if (state === "recording" || state === "connecting") {
      stop();
    } else {
      start();
    }
  }, [state, start, stop]);

  return { state, toggle, stop };
}
