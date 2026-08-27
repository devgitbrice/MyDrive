"use client";

import { useState, useRef } from "react";
import { authFetch } from "@/lib/authFetch";
import { Banana, Send, X, Plus, Loader2 } from "lucide-react";

type Props = {
  onClose: () => void;
  onAddToSlide: (imageDataUrl: string) => void;
};

export default function NanoBananaPanel({ onClose, onAddToSlide }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setResultImage(null);
    setResultText(null);
    setAdded(false);

    try {
      const res = await authFetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const data = await res.json();

      if (data.image) {
        setResultImage(data.image);
        setResultText(data.text || null);
      } else {
        setError(data.error || "Impossible de générer l'image");
      }
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!resultImage) return;
    onAddToSlide(resultImage);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banana size={20} className="text-white" />
            <div>
              <h3 className="text-white font-semibold text-sm">
                Nano Banana
              </h3>
              <p className="text-yellow-100 text-xs">
                Gemini 3 Pro Image Preview
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Prompt input */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="Décrivez l'image souhaitée..."
              disabled={loading}
              className="flex-1 bg-neutral-800 text-white rounded-xl px-3 py-2.5 text-sm outline-none border border-neutral-700 focus:border-yellow-500 transition-colors disabled:opacity-50"
            />
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || loading}
              className="px-4 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black font-medium rounded-xl transition-colors flex items-center gap-1.5"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="relative">
                <Banana
                  size={40}
                  className="text-yellow-500 animate-bounce"
                />
              </div>
              <p className="text-neutral-400 text-sm animate-pulse">
                Génération en cours...
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Result */}
          {resultImage && (
            <div className="space-y-3">
              <div className="rounded-xl overflow-hidden border border-neutral-700 bg-neutral-800">
                <img
                  src={resultImage}
                  alt="Image générée"
                  className="w-full h-auto"
                />
              </div>

              {resultText && (
                <p className="text-xs text-neutral-400">{resultText}</p>
              )}

              <button
                onClick={handleAdd}
                className={`w-full py-2.5 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                  added
                    ? "bg-green-600 text-white"
                    : "bg-yellow-500 hover:bg-yellow-400 text-black"
                }`}
              >
                {added ? (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Ajouté !
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Ajouter à la diapositive
                  </>
                )}
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !resultImage && !error && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-neutral-500">
              <Banana size={48} className="opacity-30" />
              <p className="text-sm text-center">
                Décrivez l&apos;image que vous souhaitez générer
                <br />
                <span className="text-xs text-neutral-600">
                  Ex: &quot;Un coucher de soleil sur la mer&quot;
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
