import React, { useState, useRef, useCallback, useEffect } from "react";
import { Plus } from "lucide-react";
import { TocEntry } from "../types";
import { SingleBlock } from "./SingleBlock";
import FocusModal from "./FocusModal";
import TocSidebar from "./TocSidebar";
import { useBlocks, SEPARATOR } from "../hooks/useBlocks";
import { useThemeStore } from "@/store/themeStore";

interface BlockManagerProps {
  initialHtml: string;
  tocOpen: boolean;
  onChange: (html: string) => void;
  chromeVisible?: boolean;
  docTitle?: string;
}

export default function BlockManager({ initialHtml, tocOpen, onChange, chromeVisible = true, docTitle }: BlockManagerProps) {
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const tocTimeout = useRef<NodeJS.Timeout | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const light = useThemeStore((s) => s.theme) === "light";

  const {
    blocks, focusedBlockId, setFocusedBlockId, htmlRefs,
    handleHtmlChange, handleFocusChange, handleAddBelow, handleAddBelowAndFocus,
    handleAddAtEnd, handleMoveUp, handleMoveDown, handleMoveToTop, handleMoveToBottom, handleSplit,
    handleDelete, handleFocusNext, handleFocusPrev
  } = useBlocks(initialHtml, () => saveRef.current());

  const updateTocAndSave = useCallback(() => {
    const headings = document.querySelectorAll('.block-editor-content h1, .block-editor-content h2, .block-editor-content h3');
    const entries: TocEntry[] = [];
    headings.forEach((el, i) => {
      const id = `toc-${i}`;
      el.id = id;
      if (el.textContent?.trim()) entries.push({ id, text: el.textContent.trim(), level: parseInt(el.tagName[1]) });
    });
    setTocEntries(entries);

    const blockDivs = document.querySelectorAll('.block-editor-content');
    const updatedHtmls: string[] = [];
    // On récupère le contenu qui peut désormais contenir des balises <a>
    blockDivs.forEach(div => updatedHtmls.push(div.innerHTML));

    const finalHtmls = updatedHtmls.length === blocks.length ? updatedHtmls : blocks.map(b => htmlRefs.current[b.id] || "");
    onChange(finalHtmls.join(SEPARATOR));
  }, [blocks.length, htmlRefs, onChange]);

  useEffect(() => {
    saveRef.current = () => {
      if (tocTimeout.current) clearTimeout(tocTimeout.current);
      tocTimeout.current = setTimeout(updateTocAndSave, 500);
    };
  }, [updateTocAndSave]);

  // Listen for doc-insert-link events (Cmd+K → Ajouter)
  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent).detail;
      if (!item?.id || !item?.title) return;

      const typeLabels: Record<string, { label: string; bg: string; color: string }> = {
        doc: { label: "Doc", bg: "#1e3a5f", color: "#60a5fa" },
        python: { label: "Python", bg: "#3b3510", color: "#facc15" },
        mindmap: { label: "Mindmap", bg: "#3b1f5e", color: "#c084fc" },
        table: { label: "Table", bg: "#14432a", color: "#4ade80" },
        presentation: { label: "Présentation", bg: "#4a2c17", color: "#fb923c" },
      };
      const info = item.doc_type ? typeLabels[item.doc_type] : null;
      const badgeHtml = info
        ? `<span style="font-size:11px;font-weight:600;color:${info.color};margin-right:4px;">${info.label}</span>`
        : "";

      let href = "/mydrive";
      switch (item.doc_type) {
        case "python": href = `/editpython/${item.id}`; break;
        case "doc": href = `/editdoc/${item.id}`; break;
        case "table": href = `/edittable/${item.id}`; break;
        case "mindmap": href = `/editmindmap/${item.id}`; break;
        case "presentation": href = `/editpresentation/${item.id}`; break;
      }

      const bgColor = info?.bg || "#1e293b";
      const linkHtml = `<p><a href="${href}" target="_blank" rel="noopener noreferrer" contenteditable="false" style="display:inline-flex;align-items:center;gap:6px;background:${bgColor};border:1px solid #334155;border-radius:8px;padding:8px 14px;color:#60a5fa;text-decoration:none;font-size:14px;font-weight:500;cursor:pointer;">${badgeHtml}${item.title}</a></p>`;

      handleAddAtEnd();
      setTimeout(() => {
        const allBlocks = document.querySelectorAll('.block-editor-content');
        const lastBlock = allBlocks[allBlocks.length - 1];
        if (lastBlock) {
          lastBlock.innerHTML = linkHtml;
          saveRef.current();
        }
      }, 100);
    };
    window.addEventListener("doc-insert-link", handler);
    return () => window.removeEventListener("doc-insert-link", handler);
  }, [handleAddAtEnd]);

  // Listen for chatbot insert events
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (!text) return;
      // Convert plain text to HTML paragraphs
      const html = text.split("\n").map((line: string) =>
        line.trim() ? `<p>${line}</p>` : "<p><br></p>"
      ).join("");
      // Add as a new block at the end
      handleAddAtEnd();
      // Set the content of the last block after a tick
      setTimeout(() => {
        const allBlocks = document.querySelectorAll('.block-editor-content');
        const lastBlock = allBlocks[allBlocks.length - 1];
        if (lastBlock) {
          lastBlock.innerHTML = html;
          // Trigger save
          saveRef.current();
        }
      }, 100);
    };
    window.addEventListener("chatbot-insert", handler);
    return () => window.removeEventListener("chatbot-insert", handler);
  }, [handleAddAtEnd]);

  const focusedBlock = focusedBlockId ? { id: focusedBlockId, html: htmlRefs.current[focusedBlockId] || "" } : null;
  const focusedIdx = focusedBlockId ? blocks.findIndex(b => b.id === focusedBlockId) : -1;

  return (
    <div className={`flex-1 overflow-hidden flex w-full min-w-0 ${light ? "bg-white" : "bg-neutral-950"}`}>
      <TocSidebar entries={tocEntries} tocOpen={tocOpen} />
      <div className="flex-1 overflow-y-auto w-full min-w-0">
        <div className="max-w-4xl mx-auto p-6 pb-32 w-full">
          {docTitle && docTitle.trim() && (
            <h1 className={`text-3xl md:text-4xl font-bold mb-6 ${light ? "text-neutral-900" : "text-white"}`}>
              {docTitle}
            </h1>
          )}
          {blocks.map((block) => (
            <SingleBlock
              key={block.id}
              block={block}
              onHtmlChange={handleHtmlChange}
              onAddBelow={handleAddBelow}
              onFocusBlock={setFocusedBlockId}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              onMoveToTop={handleMoveToTop}
              onMoveToBottom={handleMoveToBottom}
              onSplit={handleSplit}
              onDelete={handleDelete}
            />
          ))}
          <div className={`mt-8 flex justify-center opacity-50 hover:opacity-100 transition-opacity duration-500 ${chromeVisible ? "" : "!opacity-0 pointer-events-none"}`}>
            <button onClick={handleAddAtEnd} className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors border ${light ? "bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 border-neutral-300" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border-neutral-700"}`}>
              <Plus size={20} />
              <span className="text-sm font-medium">Ajouter un bloc</span>
            </button>
          </div>
          {focusedBlock && (
            <FocusModal
              block={focusedBlock}
              onChange={handleFocusChange}
              onClose={() => setFocusedBlockId(null)}
              onPrev={handleFocusPrev}
              onNext={handleFocusNext}
              onAddBelow={() => focusedBlockId && handleAddBelowAndFocus(focusedBlockId)}
              hasPrev={focusedIdx > 0}
              hasNext={focusedIdx < blocks.length - 1}
            />
          )}
        </div>
      </div>
    </div>
  );
}
