"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchDriveItemsAction } from "@/features/mydrive/modify";

export interface SearchResult {
  id: string;
  title: string;
  doc_type: string | null;
  type: string;
}

const DOC_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  doc: { label: "Doc", color: "text-blue-400" },
  python: { label: "Python", color: "text-yellow-400" },
  mindmap: { label: "Mindmap", color: "text-purple-400" },
  table: { label: "Table", color: "text-green-400" },
  presentation: { label: "Présentation", color: "text-orange-400" },
  voyage: { label: "Voyage", color: "text-sky-400" },
  fiche: { label: "Fiche", color: "text-teal-400" },
};

export function getEditUrl(item: SearchResult): string {
  switch (item.doc_type) {
    case "python": return `/editpython/${item.id}`;
    case "doc": return `/editdoc/${item.id}`;
    case "table": return `/edittable/${item.id}`;
    case "mindmap": return `/editmindmap/${item.id}`;
    case "presentation": return `/editpresentation/${item.id}`;
    case "voyage": return `/editvoyage/${item.id}`;
    case "draw": return `/editdraw/${item.id}`;
    case "fiche": return `/editfiche/${item.id}`;
    default: return `/mydrive`;
  }
}

interface FileSearchModalProps {
  open: boolean;
  onClose: () => void;
  onInsert?: (item: SearchResult) => void;
}

export default function FileSearchModal({ open, onClose, onInsert }: FileSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setSelectedItem(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search with debounce
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await searchDriveItemsAction(q);
      setResults(data);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    setSelectedItem(null);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (val.trim().length >= 3) {
      setLoading(true);
      searchTimeoutRef.current = setTimeout(() => doSearch(val), 300);
    } else {
      setResults([]);
      setLoading(false);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedItem) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedItem(null);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      setSelectedItem(results[selectedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!open) return null;

  const typeInfo = selectedItem?.doc_type ? DOC_TYPE_LABELS[selectedItem.doc_type] : null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh] bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800">
          <svg className="w-5 h-5 text-neutral-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher un fichier..."
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-neutral-500"
          />
          <kbd className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">
            ESC
          </kbd>
        </div>

        {/* Selected item view */}
        {selectedItem && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {typeInfo && (
                <span className={`text-xs font-medium ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
              )}
              <span className="text-white font-medium text-sm">{selectedItem.title}</span>
            </div>
            <div className="flex flex-col gap-2">
              {onInsert && (
                <button
                  onClick={() => { onInsert(selectedItem); onClose(); }}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Ajouter dans le document
                </button>
              )}
              <a
                href={getEditUrl(selectedItem)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm underline underline-offset-2 transition-colors"
                onClick={() => onClose()}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Ouvrir dans un nouvel onglet
              </a>
            </div>
            <button
              onClick={() => setSelectedItem(null)}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              &larr; Retour aux résultats
            </button>
          </div>
        )}

        {/* Results list */}
        {!selectedItem && (
          <div className="max-h-64 overflow-y-auto">
            {loading && (
              <div className="px-4 py-6 text-center text-neutral-500 text-sm">
                Recherche...
              </div>
            )}

            {!loading && query.trim().length >= 3 && results.length === 0 && (
              <div className="px-4 py-6 text-center text-neutral-500 text-sm">
                Aucun fichier trouvé
              </div>
            )}

            {!loading && query.trim().length > 0 && query.trim().length < 3 && (
              <div className="px-4 py-6 text-center text-neutral-500 text-sm">
                Tapez au moins 3 caractères
              </div>
            )}

            {!loading && results.length > 0 && results.map((item, i) => {
              const info = item.doc_type ? DOC_TYPE_LABELS[item.doc_type] : null;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    i === selectedIndex
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-300 hover:bg-neutral-800/60"
                  }`}
                >
                  {info && (
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${info.color} shrink-0 w-16`}>
                      {info.label}
                    </span>
                  )}
                  {!info && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 shrink-0 w-16">
                      Fichier
                    </span>
                  )}
                  <span className="truncate text-sm">{item.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
