"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, Sparkles, Paperclip } from "lucide-react";
import { toast } from "@/components/Toaster";
import { authFetch } from "@/lib/authFetch";
import { computeLineMap } from "./LineNumbers";

interface Msg { role: "user" | "assistant"; text: string }
interface Attachment { name: string; type: string; data: string; size: number }

const MAX_TOTAL_BYTES = 3 * 1024 * 1024; // limite Vercel (~4.5 Mo de body)

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

// Compresse une image (max 1600 px, JPEG) pour tenir dans la limite d'envoi.
async function compressImage(file: File): Promise<Attachment> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const max = 1600;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const data = dataUrl.split(",")[1];
    return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg", data, size: Math.round(data.length * 0.75) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith("image/") && file.type !== "image/gif") {
    return compressImage(file);
  }
  const buf = await file.arrayBuffer();
  return { name: file.name, type: file.type, data: bufToBase64(buf), size: file.size };
}

// Modèles OpenAI proposés, avec tarification ($ / million de tokens entrée · sortie)
const MODELS = [
  { id: "gpt-5.6-luna",  label: "GPT-5.6 Luna — éco ($0.20 · $1.20)" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra — équilibré ($2 · $12)" },
  { id: "gpt-5.6-sol",   label: "GPT-5.6 Sol — flagship ($4 · $20)" },
  { id: "gpt-6-astra",   label: "GPT-6 Astra — max ($10 · $50)" },
];
const DEFAULT_MODEL = "gpt-5.6-terra";

export default function DocChat({
  open,
  onClose,
  title,
  description,
  getHtml,
  onApply,
  onTitle,
  onDesc,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  getHtml: () => string;
  onApply: (html: string) => void;
  onTitle?: (t: string) => void;
  onDesc?: (d: string) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reading, setReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setReading(true);
    try {
      const next = [...attachments];
      for (const file of Array.from(list)) {
        const att = await fileToAttachment(file);
        const total = next.reduce((s, a) => s + a.size, 0) + att.size;
        if (total > MAX_TOTAL_BYTES) {
          toast(`« ${file.name} » dépasse la limite d'envoi (3 Mo au total). Retire une pièce ou choisis un fichier plus léger.`);
          continue;
        }
        next.push(att);
      }
      setAttachments(next.slice(0, 6));
    } catch {
      toast("Impossible de lire un des fichiers.");
    } finally {
      setReading(false);
    }
  }

  // Modèle mémorisé entre les sessions
  useEffect(() => {
    try {
      const saved = localStorage.getItem("docchat-model");
      if (saved && MODELS.some((m) => m.id === saved)) setModel(saved);
    } catch {}
  }, []);
  const changeModel = (id: string) => {
    setModel(id);
    try { localStorage.setItem("docchat-model", id); } catch {}
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Clic sur un numéro de ligne → ajoute un gabarit dans le prompt (nouvelle ligne si déjà rempli)
  useEffect(() => {
    const handler = (e: Event) => {
      const n = (e as CustomEvent).detail?.n;
      if (!n) return;
      setInput((prev) => {
        const line = `Ligne ${n} : modification attendue : `;
        return prev.trim() ? prev.replace(/\s*$/, "") + "\n" + line : line;
      });
    };
    window.addEventListener("doc-line-click", handler);
    return () => window.removeEventListener("doc-line-click", handler);
  }, []);

  async function send() {
    const instruction = input.trim();
    if (!instruction || loading) return;
    setInput("");
    const sentFiles = attachments;
    setAttachments([]);
    const shown = sentFiles.length ? instruction + "\n" + sentFiles.map((a) => `📎 ${a.name}`).join("\n") : instruction;
    const nextMsgs: Msg[] = [...messages, { role: "user", text: shown }];
    setMessages(nextMsgs);
    setLoading(true);
    try {
      const res = await authFetch("/api/doc-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          html: getHtml(),
          title,
          description,
          model,
          lineMap: /ligne\s+\d+/i.test(instruction) ? computeLineMap() : undefined,
          files: sentFiles.map(({ name, type, data }) => ({ name, type, data })),
          history: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur assistant");
      if (data.html) onApply(data.html);
      if (data.title && onTitle) onTitle(data.title);
      if (data.desc && onDesc) onDesc(data.desc);
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply || "Fait." }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", text: "⚠️ " + (e?.message || "Erreur") }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 left-0 z-[9990] w-full sm:w-96 bg-neutral-950 border-r border-neutral-800 flex flex-col shadow-2xl">
      {/* En-tête */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 shrink-0">
        <Sparkles size={16} className="text-teal-400" />
        <span className="flex-1 text-sm font-semibold text-white">Éditer avec l’IA</span>
        <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-neutral-500 space-y-2">
            <p>Demande-moi de rédiger ou modifier ce document. Exemples :</p>
            <ul className="list-disc pl-5 space-y-1 text-neutral-600">
              <li>« Rédige une introduction sur… »</li>
              <li>« Ajoute une section Budget avec un tableau »</li>
              <li>« Corrige l'orthographe et raccourcis de 30% »</li>
              <li>« Transforme ces notes en plan structuré »</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm rounded-xl px-3 py-2 whitespace-pre-wrap ${
            m.role === "user"
              ? "bg-blue-600/20 text-blue-100 ml-6"
              : "bg-neutral-800/70 text-neutral-200 mr-6"
          }`}>
            {m.text}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 size={14} className="animate-spin" /> L’IA travaille sur le document…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Saisie */}
      <div className="p-3 border-t border-neutral-800 shrink-0 space-y-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-[11px] text-neutral-300 max-w-full">
                <Paperclip size={11} className="shrink-0" />
                <span className="truncate max-w-[160px]">{a.name}</span>
                <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-red-400 shrink-0"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.txt,.md,image/*"
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }}
        />
        <select
          value={model}
          onChange={(e) => changeModel(e.target.value)}
          title="Modèle utilisé (prix par million de tokens : entrée · sortie)"
          className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-neutral-300 outline-none focus:border-teal-500"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={2}
            placeholder="Que faire sur ce document ?"
            className="flex-1 resize-none bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-500 placeholder:text-neutral-600"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={reading}
            title="Joindre des fichiers (PDF, Word, PowerPoint, images…)"
            className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 disabled:opacity-40 transition-colors shrink-0"
          >
            {reading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
          </button>
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40 transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
