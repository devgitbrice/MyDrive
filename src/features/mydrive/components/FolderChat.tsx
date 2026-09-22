"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, X, Send } from "lucide-react";
import type { MyDriveItem } from "@/features/mydrive/types";
import { authFetch } from "@/lib/authFetch";

// Mêmes modèles que le chat de l'éditeur de documents (API OpenAI disponible)
const MODELS = [
  { id: "gpt-5.6-luna",  label: "GPT-5.6 Luna — éco ($0.20 · $1.20)" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra — équilibré ($2 · $12)" },
  { id: "gpt-5.6-sol",   label: "GPT-5.6 Sol — flagship ($4 · $20)" },
  { id: "gpt-6-astra",   label: "GPT-6 Astra — max ($10 · $50)" },
];
const DEFAULT_MODEL = "gpt-5.6-terra";

type Msg = { role: "user" | "assistant"; text: string };

interface Props {
  folderTitle: string;
  docs: MyDriveItem[];
}

/**
 * Bouton « Demander à l'IA » + panneau de chat à droite.
 * Les réponses s'appuient sur les documents du dossier ouvert.
 */
export default function FolderChat({ folderTitle, docs }: Props) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<Msg[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("mydrive-chat-model");
      if (saved && MODELS.some((m) => m.id === saved)) setModel(saved);
    } catch {}
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Le panneau change de dossier : on repart d'une conversation vierge.
  useEffect(() => {
    setMessages([]);
    historyRef.current = [];
  }, [folderTitle]);

  async function send() {
    const q = input.trim();
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
          folderTitle,
          // Le serveur recharge les documents (avec leur contenu complet) à partir des ids.
          docIds: docs.slice(0, 15).map((d) => d.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
      const reply = String(data.reply || "");
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
      const exchange: Msg[] = [{ role: "user", text: q }, { role: "assistant", text: reply }];
      historyRef.current = [...historyRef.current, ...exchange].slice(-20);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", text: "⚠️ " + (e?.message || "Erreur inconnue") }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-purple-500 text-purple-300 hover:bg-purple-600 hover:text-white transition-colors"
      >
        <Sparkles size={16} /> Demander à l&apos;IA
      </button>

      {open && (
        <div className="fixed inset-0 z-[9998]" role="dialog" aria-label="Assistant IA du dossier">
          {/* Fond cliquable pour fermer (mobile surtout) */}
          <div className="absolute inset-0 bg-black/50 md:bg-transparent" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-neutral-950 border-l border-neutral-800 shadow-2xl flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800">
              <Sparkles size={16} className="text-purple-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">Demander à l&apos;IA</p>
                <p className="text-[11px] text-neutral-500 truncate">
                  {folderTitle} · {docs.length} document{docs.length > 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
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
                  <p>Pose une question sur les documents de ce dossier.</p>
                  <p className="text-xs">Exemples : « Quel est le montant total ? », « Résume ces documents », « Quelle est la prochaine échéance ? »</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm break-words ${
                    m.role === "user"
                      ? "ml-auto bg-purple-600 text-white whitespace-pre-wrap"
                      : "mr-auto bg-neutral-900 border border-neutral-800 text-neutral-100 prose prose-invert prose-sm prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5 prose-headings:text-sm prose-table:my-1 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-pre:my-1 prose-code:text-purple-300 prose-strong:text-white max-w-[90%]"
                  }`}
                >
                  {m.role === "user" ? m.text : <ReactMarkdown>{m.text}</ReactMarkdown>}
                </div>
              ))}
              {loading && (
                <div className="mr-auto bg-neutral-900 border border-neutral-800 rounded-2xl px-3 py-2 text-sm text-neutral-400">
                  Lecture des documents…
                </div>
              )}
            </div>

            <div className="p-3 border-t border-neutral-800 flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={2}
                placeholder="Ta question sur ce dossier…"
                className="flex-1 resize-none bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="w-10 h-10 shrink-0 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white flex items-center justify-center"
                aria-label="Envoyer"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
