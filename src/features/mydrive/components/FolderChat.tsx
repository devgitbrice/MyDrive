"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, X, Send, Bot, Mic, Ear } from "lucide-react";
import type { MyDriveItem } from "@/features/mydrive/types";
import { authFetch } from "@/lib/authFetch";
import { createFolder } from "@/features/mydrive/lib/folders";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useVoiceDictation } from "@/hooks/useVoiceDictation";
import { emitDriveChange } from "@/lib/driveEvents";

// Mêmes modèles que le chat de l'éditeur de documents (API OpenAI disponible)
const MODELS = [
  { id: "gpt-5.6-luna",  label: "GPT-5.6 Luna — éco ($0.20 · $1.20)" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra — équilibré ($2 · $12)" },
  { id: "gpt-5.6-sol",   label: "GPT-5.6 Sol — flagship ($4 · $20)" },
  { id: "gpt-6-astra",   label: "GPT-6 Astra — max ($10 · $50)" },
];
const DEFAULT_MODEL = "gpt-5.6-terra";

type Msg = { role: "user" | "assistant"; text: string };

// Largeur du panneau bornée : minimum lisible, maximum 70 % de l'écran.
function clampWidth(w: number): number {
  const max = Math.round(window.innerWidth * 0.7);
  return Math.min(Math.max(w, 280), Math.max(max, 280));
}

interface PanelProps {
  open: boolean;
  onClose: () => void;
  /** Titre affiché (nom du dossier ou du document). */
  title: string;
  /** Documents servant de source aux réponses (1 seul = chat de document). */
  docs: MyDriveItem[];
  /** Dossier où l'IA peut créer des dossiers (null = racine ; undefined = actions désactivées). */
  createInFolderId?: string | null;
}

/**
 * Panneau de chat IA à droite. Les réponses s'appuient uniquement sur les
 * documents fournis : tout un dossier, ou un document unique (icône robot).
 */
export function DocAiPanel({ open, onClose, title, docs, createInFolderId }: PanelProps) {
  const router = useRouter();
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<Msg[]>([]);
  // Vue scindée : largeur du panneau (1/3 de l'écran par défaut), réglable
  // en glissant le bord gauche. Mémorisée entre les sessions.
  const [width, setWidth] = useState(420);
  const widthRef = useRef(420);
  const draggingRef = useRef(false);

  // ---- Micro : dictée vocale (remplit le champ) ----
  const inputBaseRef = useRef("");
  const dictation = useVoiceDictation((text) => {
    setInput(inputBaseRef.current + text);
  });
  const toggleMic = () => {
    if (earState !== "off") return; // l'oreille utilise déjà le micro
    if (dictation.state === "recording" || dictation.state === "connecting") {
      dictation.stop();
    } else {
      inputBaseRef.current = input ? input.replace(/\s+$/, "") + " " : "";
      dictation.toggle();
    }
  };

  // ---- Oreille : conversation vocale temps réel (OpenAI Realtime, WebRTC) ----
  // Speech-to-speech direct : tu parles, l'IA répond en audio et agit via outils.
  const [earState, setEarState] = useState<"off" | "connecting" | "live">("off");
  const rtcRef = useRef<{ pc: RTCPeerConnection; dc: RTCDataChannel; mic: MediaStream; audioEl: HTMLAudioElement } | null>(null);

  const stopEar = () => {
    const r = rtcRef.current;
    rtcRef.current = null;
    if (r) {
      try { r.dc.close(); } catch {}
      try { r.pc.close(); } catch {}
      r.mic.getTracks().forEach((t) => t.stop());
      r.audioEl.pause();
      r.audioEl.srcObject = null;
    }
    setEarState("off");
  };

  async function applyRealtimeTool(name: string, argsJson: string): Promise<string> {
    let args: any = {};
    try { args = JSON.parse(argsJson || "{}"); } catch {}
    return applyAction({ type: name, ...args });
  }

  const onRealtimeEvent = async (e: MessageEvent) => {
    let ev: any;
    try { ev = JSON.parse(e.data); } catch { return; }
    // Transcriptions affichées dans le fil du chat
    if (ev.type === "conversation.item.input_audio_transcription.completed" && ev.transcript) {
      const t = String(ev.transcript).trim();
      if (t) setMessages((prev) => [...prev, { role: "user", text: t }]);
    }
    if (ev.type === "response.output_audio_transcript.done" && ev.transcript) {
      const t = String(ev.transcript).trim();
      if (t) setMessages((prev) => [...prev, { role: "assistant", text: t }]);
    }
    // Appels d'outils : exécution immédiate puis retour du résultat au modèle
    if (ev.type === "response.done") {
      const items = ev.response?.output || [];
      let acted = false;
      for (const item of items) {
        if (item?.type !== "function_call" || !item.call_id) continue;
        acted = true;
        const output = await applyRealtimeTool(String(item.name || ""), String(item.arguments || "{}"));
        setMessages((prev) => [...prev, { role: "assistant", text: output }]);
        const dc = rtcRef.current?.dc;
        if (dc && dc.readyState === "open") {
          dc.send(JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: item.call_id, output },
          }));
        }
      }
      if (acted) {
        const dc = rtcRef.current?.dc;
        if (dc && dc.readyState === "open") dc.send(JSON.stringify({ type: "response.create" }));
      }
    }
  };

  const startEar = async () => {
    if (dictation.state !== "idle") dictation.stop();
    setEarState("connecting");
    try {
      const tk = await authFetch("/api/realtime-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docIds: docs.slice(0, 15).map((d) => d.id), folderTitle: title }),
      });
      const td = await tk.json().catch(() => ({}));
      if (!tk.ok || !td.token) throw new Error(td?.error || "Jeton vocal indisponible");

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pc = new RTCPeerConnection();
      const audioEl = new Audio();
      audioEl.autoplay = true;
      pc.ontrack = (ev) => { audioEl.srcObject = ev.streams[0]; };
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));
      const dc = pc.createDataChannel("oai-events");
      dc.onmessage = onRealtimeEvent;
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState) && rtcRef.current?.pc === pc) stopEar();
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const resp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: { Authorization: `Bearer ${td.token}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!resp.ok) throw new Error(`Connexion vocale refusée (${resp.status})`);
      await pc.setRemoteDescription({ type: "answer", sdp: await resp.text() });

      rtcRef.current = { pc, dc, mic, audioEl };
      setEarState("live");
    } catch (e: any) {
      stopEar();
      setMessages((prev) => [...prev, { role: "assistant", text: "⚠️ Voix : " + (e?.message || "connexion impossible") }]);
    }
  };

  const toggleEar = () => { earState === "off" ? startEar() : stopEar(); };

  // Fermeture / démontage : tout couper.
  useEffect(() => {
    return () => {
      dictation.stop();
      stopEar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const single = docs.length === 1;

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mydrive-chat-model");
      if (saved && MODELS.some((m) => m.id === saved)) setModel(saved);
    } catch {}
    try {
      const w = parseInt(localStorage.getItem("mydrive-chat-width") || "", 10);
      const fallback = Math.round(window.innerWidth / 3);
      const initial = Number.isFinite(w) && w >= 280 ? w : fallback;
      setWidth(clampWidth(initial));
    } catch {
      setWidth(clampWidth(Math.round(window.innerWidth / 3)));
    }
  }, []);

  useEffect(() => { widthRef.current = width; }, [width]);

  // Scinde la fenêtre : le contenu de gauche est repoussé de la largeur du panneau.
  useEffect(() => {
    if (!open) return;
    const isDesktop = () => window.matchMedia("(min-width: 640px)").matches;
    const apply = () => {
      document.body.style.paddingRight = isDesktop() ? `${widthRef.current}px` : "";
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.body.style.paddingRight = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (window.matchMedia("(min-width: 640px)").matches) {
      document.body.style.paddingRight = `${width}px`;
    }
  }, [width, open]);

  // Glisser-déposer de la limite gauche du panneau.
  useEffect(() => {
    const move = (clientX: number) => {
      if (!draggingRef.current) return;
      setWidth(clampWidth(window.innerWidth - clientX));
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX);
    const onTouchMove = (e: TouchEvent) => move(e.touches[0]?.clientX ?? 0);
    const stop = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try { localStorage.setItem("mydrive-chat-width", String(widthRef.current)); } catch {}
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stop);
    };
  }, []);

  const startDrag = () => {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Changement de source (autre dossier/document) : conversation vierge.
  const sourceKey = single ? docs[0]?.id : title;
  useEffect(() => {
    setMessages([]);
    historyRef.current = [];
  }, [sourceKey]);

  // Exécute une action (chat texte ou outil vocal) et renvoie la confirmation.
  // Les vues ouvertes (liste, aperçu) sont prévenues aussitôt pour s'afficher à jour.
  async function applyAction(a: any): Promise<string> {
    const changed: string[] = [];
    const result = await runAction(a, changed);
    if (changed.length > 0) {
      emitDriveChange(changed);
      router.refresh();
    }
    return result;
  }

  async function runAction(a: any, changed: string[]): Promise<string> {
    const parentId = createInFolderId === undefined ? null : createInFolderId;
    const docIdSet = new Set(docs.map((d) => d.id));
    try {
      if (a.type === "create_folder" && a.name) {
        const f = await createFolder(String(a.name).slice(0, 120), parentId);
        changed.push(f.id);
        return `📁 Dossier **« ${a.name} »** créé.`;
      }
      if (a.type === "create_task_doc" && a.title) {
        const tasks = (Array.isArray(a.tasks) ? a.tasks : []).filter((t: any) => t?.title).slice(0, 100);
        const { data, error } = await supabase.from("MyDrive").insert({
          title: String(a.title).slice(0, 150),
          content: JSON.stringify({ tasks: tasks.map((t: any, i: number) => ({ id: `t${Date.now().toString(36)}${i}`, title: String(t.title).slice(0, 300), deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(t.deadline || "")) ? t.deadline : null, done: t.done === true })) }),
          observation: "", image_path: "", image_url: "",
          doc_type: "tasks", parent_id: parentId,
        }).select("id").single();
        if (error) throw error;
        changed.push(data.id);
        return `✅ Document de tâches **« ${a.title} »** créé (${tasks.length} tâche${tasks.length > 1 ? "s" : ""}).`;
      }
      if (a.type === "update_tasks" && a.id && docIdSet.has(a.id)) {
        const tasks = (Array.isArray(a.tasks) ? a.tasks : []).filter((t: any) => t?.title).slice(0, 100);
        const { error } = await supabase.from("MyDrive").update({
          content: JSON.stringify({ tasks: tasks.map((t: any, i: number) => ({ id: `t${Date.now().toString(36)}${i}`, title: String(t.title).slice(0, 300), deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(t.deadline || "")) ? t.deadline : null, done: t.done === true })) }),
        }).eq("id", a.id);
        if (error) throw error;
        changed.push(a.id);
        return "✅ Tâches mises à jour.";
      }
      if (a.type === "create_table" && a.title && Array.isArray(a.cells)) {
        const cells = a.cells.slice(0, 300).map((r: any) => (Array.isArray(r) ? r : [r]).slice(0, 40).map((c: any) => String(c ?? "").slice(0, 2000)));
        const { data, error } = await supabase.from("MyDrive").insert({
          title: String(a.title).slice(0, 150),
          content: JSON.stringify(cells),
          observation: "", image_path: "", image_url: "",
          doc_type: "table", parent_id: parentId,
        }).select("id").single();
        if (error) throw error;
        changed.push(data.id);
        return `📊 Tableau **« ${a.title} »** créé (${cells.length} ligne${cells.length > 1 ? "s" : ""}).`;
      }
      if (a.type === "update_table" && a.id && docIdSet.has(a.id) && Array.isArray(a.cells)) {
        const cells = a.cells.slice(0, 300).map((r: any) => (Array.isArray(r) ? r : [r]).slice(0, 40).map((c: any) => String(c ?? "").slice(0, 2000)));
        const { error } = await supabase.from("MyDrive").update({ content: JSON.stringify(cells) }).eq("id", a.id);
        if (error) throw error;
        changed.push(a.id);
        return "📊 Tableau mis à jour.";
      }
      return "⚠️ Action inconnue ou document hors du dossier.";
    } catch (err: any) {
      return `⚠️ Action impossible : ${err?.message || "erreur"}`;
    }
  }

  async function send(textOverride?: string) {
    const q = (textOverride ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await authFetch("/api/folder-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          history: historyRef.current.slice(-10),
          model,
          folderTitle: title,
          // Le serveur recharge les documents (avec leur contenu complet) à partir des ids.
          docIds: docs.slice(0, 15).map((d) => d.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
      let reply = String(data.reply || "");

      // Actions renvoyées par l'IA, exécutées ici (création/modification).
      const actions: any[] = Array.isArray(data.actions) ? data.actions : [];
      for (const a of actions) {
        reply += "\n\n" + (await applyAction(a));
      }
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      const exchange: Msg[] = [{ role: "user", text: q }, { role: "assistant", text: reply }];
      historyRef.current = [...historyRef.current, ...exchange].slice(-20);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", text: "⚠️ " + (e?.message || "Erreur inconnue") }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] pointer-events-none" role="dialog" aria-label="Assistant IA">
      {/* Mobile : fond cliquable pour fermer. Desktop : la page reste utilisable (vue scindée). */}
      <div className="absolute inset-0 bg-black/50 sm:hidden pointer-events-auto" onClick={onClose} />
      <div
        className="pointer-events-auto absolute right-0 top-0 h-full bg-neutral-950 border-l border-neutral-800 shadow-2xl flex flex-col max-sm:!w-full"
        style={{ width }}
      >
        {/* Poignée : glisser pour déplacer la limite gauche/droite */}
        <div
          onMouseDown={(e) => { e.preventDefault(); startDrag(); }}
          onTouchStart={() => startDrag()}
          className="hidden sm:flex absolute left-0 top-0 h-full w-2 -ml-1 cursor-col-resize items-center justify-center group/handle z-10"
          title="Glisser pour redimensionner"
        >
          <div className="h-16 w-1 rounded-full bg-neutral-700 group-hover/handle:bg-purple-500 transition-colors" />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800">
          {single ? <Bot size={16} className="text-purple-400 shrink-0" /> : <Sparkles size={16} className="text-purple-400 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{single ? "Chat du document" : "Demander à l'IA"}</p>
            <p className="text-[11px] text-neutral-500 truncate">
              {title} · {docs.length} document{docs.length > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-neutral-800">
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              try { localStorage.setItem("mydrive-chat-model", e.target.value); } catch {}
            }}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-neutral-300 outline-none focus:border-purple-500"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="text-sm text-neutral-500 space-y-2 pt-4">
              <p>{single ? "Pose une question sur ce document." : "Pose une question sur les documents de ce dossier."}</p>
              <p className="text-xs">Exemples : « Résume-le », « Quels sont les montants et les dates ? », « Que dois-je faire ? »</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm break-words ${
                m.role === "user"
                  ? "ml-auto bg-purple-600 text-white whitespace-pre-wrap"
                  : "mr-auto bg-neutral-900 border border-neutral-800 text-neutral-100 prose prose-invert prose-sm prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5 prose-headings:text-sm prose-table:my-1 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-pre:my-1 max-w-[90%]"
              }`}
            >
              {m.role === "user" ? m.text : <ReactMarkdown>{m.text}</ReactMarkdown>}
            </div>
          ))}
          {loading && (
            <div className="mr-auto bg-neutral-900 border border-neutral-800 rounded-2xl px-3 py-2 text-sm text-neutral-400">
              {single ? "Lecture du document…" : "Lecture des documents…"}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-neutral-800 flex items-end gap-2">
          <button
            onClick={toggleMic}
            disabled={earState !== "off"}
            className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center border transition-colors disabled:opacity-40 ${
              earState === "off" && (dictation.state === "recording" || dictation.state === "connecting")
                ? "bg-red-600 border-red-500 text-white animate-pulse"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-purple-500"
            }`}
            title="Dicter (la transcription remplit le champ)"
            aria-label="Micro : dictée vocale"
          >
            <Mic size={16} />
          </button>
          <button
            onClick={toggleEar}
            className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center border transition-colors ${
              earState === "live"
                ? "bg-purple-600 border-purple-500 text-white animate-pulse"
                : earState === "connecting"
                ? "bg-amber-500 border-amber-400 text-black animate-pulse"
                : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-purple-500"
            }`}
            title="Discussion live : parle, l'IA répond à voix haute et agit immédiatement"
            aria-label="Oreille : discussion vocale live"
          >
            <Ear size={16} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={2}
            placeholder={
              earState === "live"
                ? "🎙️ Conversation vocale en cours — parle, je réponds et j'agis."
                : earState === "connecting"
                ? "Connexion vocale…"
                : single ? "Ta question sur ce document…" : "Ta question sur ce dossier…"
            }
            className="flex-1 resize-none bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="w-10 h-10 shrink-0 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white flex items-center justify-center"
            aria-label="Envoyer"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  folderTitle: string;
  docs: MyDriveItem[];
  /** Dossier courant (null = racine/sans dossier) où l'IA peut créer des dossiers. */
  folderId?: string | null;
}

/** Bouton « Demander à l'IA » d'un dossier + panneau de chat. */
export default function FolderChat({ folderTitle, docs, folderId }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-purple-500 text-purple-300 hover:bg-purple-600 hover:text-white transition-colors"
      >
        <Sparkles size={16} /> Demander à l&apos;IA
      </button>
      <DocAiPanel open={open} onClose={() => setOpen(false)} title={folderTitle} docs={docs} createInFolderId={folderId} />
    </>
  );
}
