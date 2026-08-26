"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { computeCell, isFormula, indexToCol } from "../engine/formula";

function colLabel(index: number): string {
  return indexToCol(index);
}

/** Renvoie une URL absolue si la valeur ressemble à un lien / nom de domaine, sinon null. */
function normalizeUrl(value: string): string | null {
  const s = (value || "").trim();
  if (!s || /\s/.test(s)) return null;
  if (/^https?:\/\//i.test(s)) return s;
  // nom de domaine type "www.exemple.fr" ou "sous.exemple.com/chemin"
  if (/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i.test(s)) {
    return "https://" + s.replace(/^\/+/, "");
  }
  return null;
}

interface TableGridProps {
  data: string[][];
  setData: (d: string[][]) => void;
}

export default function TableGrid({ data, setData }: TableGridProps) {
  const rows = data.length;
  const cols = data[0]?.length || 10;

  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selection, setSelection] = useState<{
    start: { r: number; c: number };
    end: { r: number; c: number };
  } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [formulaMode, setFormulaMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const formulaBarRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  // Guard to prevent onBlur from committing when we're handling a formula click
  const formulaClickRef = useRef(false);

  // Compute display values (memoized)
  const displayData = useMemo(() => {
    return data.map((row, r) => row.map((_, c) => computeCell(r, c, data)));
  }, [data]);

  // Focus input when editing
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const newData = data.map((row) => [...row]);
    newData[editingCell.r][editingCell.c] = editValue;
    setData(newData);
    setEditingCell(null);
    setFormulaMode(false);
  }, [editingCell, editValue, data, setData]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
    setFormulaMode(false);
  }, []);

  // Listen for table-insert-link events (Cmd+K → Ajouter)
  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent).detail;
      if (!item?.title) return;
      const r = activeCell?.r ?? 0;
      const c = activeCell?.c ?? 0;
      const newData = data.map((row) => [...row]);
      newData[r][c] = item.title;
      setData(newData);
      setActiveCell({ r, c });
    };
    window.addEventListener("table-insert-link", handler);
    return () => window.removeEventListener("table-insert-link", handler);
  }, [activeCell, data, setData]);

  // Listen for voice dictation events
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (!text) return;
      const r = activeCell?.r ?? 0;
      const c = activeCell?.c ?? 0;
      const newData = data.map((row) => [...row]);
      newData[r][c] = text;
      setData(newData);
      setActiveCell({ r, c });
    };
    window.addEventListener("table-dictation", handler);
    return () => window.removeEventListener("table-dictation", handler);
  }, [activeCell, data, setData]);

  const startEdit = useCallback(
    (r: number, c: number, initialValue?: string) => {
      const val = initialValue !== undefined ? initialValue : data[r][c] || "";
      setActiveCell({ r, c });
      setEditingCell({ r, c });
      setEditValue(val);
      setFormulaMode(val.startsWith("="));
    },
    [data]
  );

  const handleEditChange = useCallback((val: string) => {
    setEditValue(val);
    setFormulaMode(val.startsWith("="));
  }, []);

  // ─── Cell click: single click = select + edit, formula mode = insert ref ───
  const handleCellMouseDown = useCallback(
    (r: number, c: number, e: React.MouseEvent) => {
      e.preventDefault();

      // Formula mode: insert cell reference
      if (editingCell && formulaMode) {
        formulaClickRef.current = true;
        const ref = colLabel(c) + (r + 1);
        setEditValue((prev) => prev + ref);
        // Re-focus the cell input after a tick
        setTimeout(() => {
          inputRef.current?.focus();
          formulaClickRef.current = false;
        }, 0);
        return;
      }

      // Commit previous edit if any
      if (editingCell) {
        const newData = data.map((row) => [...row]);
        newData[editingCell.r][editingCell.c] = editValue;
        setData(newData);
        setEditingCell(null);
        setFormulaMode(false);
      }

      // Shift+clic : étendre la sélection depuis la cellule active, sans éditer
      if (e.shiftKey && activeCell) {
        setSelection({ start: activeCell, end: { r, c } });
        setContextMenu(null);
        return;
      }

      // Select + enter edit on this cell
      setActiveCell({ r, c });
      setSelection({ start: { r, c }, end: { r, c } });
      setIsSelecting(true);

      // Single click → edit immediately
      const val = data[r][c] || "";
      setEditingCell({ r, c });
      setEditValue(val);
      setFormulaMode(val.startsWith("="));
    },
    [editingCell, formulaMode, data, editValue, setData, activeCell]
  );

  // ─── Liens : ouvrir toutes les URL de la sélection ───
  const openAllLinks = useCallback(() => {
    setContextMenu(null);
    if (!selection) return;
    const minR = Math.min(selection.start.r, selection.end.r);
    const maxR = Math.max(selection.start.r, selection.end.r);
    const minC = Math.min(selection.start.c, selection.end.c);
    const maxC = Math.max(selection.start.c, selection.end.c);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const url = normalizeUrl(displayData[r]?.[c] ?? "");
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  }, [selection, displayData]);

  const selectionUrlCount = useMemo(() => {
    if (!selection) return 0;
    const minR = Math.min(selection.start.r, selection.end.r);
    const maxR = Math.max(selection.start.r, selection.end.r);
    const minC = Math.min(selection.start.c, selection.end.c);
    const maxC = Math.max(selection.start.c, selection.end.c);
    let n = 0;
    for (let r = minR; r <= maxR; r++)
      for (let c = minC; c <= maxC; c++)
        if (normalizeUrl(displayData[r]?.[c] ?? "")) n++;
    return n;
  }, [selection, displayData]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!selection) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, [selection]);

  // Fermer le menu contextuel sur clic ailleurs / Échap
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onEsc);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onEsc); };
  }, [contextMenu]);

  const handleMouseEnter = (r: number, c: number) => {
    if (isSelecting && selection && !formulaMode) {
      setSelection({ ...selection, end: { r, c } });
    }
  };

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const isInSelection = (r: number, c: number) => {
    if (!selection) return false;
    const minR = Math.min(selection.start.r, selection.end.r);
    const maxR = Math.max(selection.start.r, selection.end.r);
    const minC = Math.min(selection.start.c, selection.end.c);
    const maxC = Math.max(selection.start.c, selection.end.c);
    return r >= minR && r <= maxR && c >= minC && c <= maxC;
  };

  // ─── Keyboard navigation ───
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingCell) {
        if (e.key === "Enter") {
          e.preventDefault();
          commitEdit();
          const nextR = Math.min(editingCell.r + 1, rows - 1);
          setActiveCell({ r: nextR, c: editingCell.c });
          setSelection({ start: { r: nextR, c: editingCell.c }, end: { r: nextR, c: editingCell.c } });
          // Start editing next cell
          const val = data[nextR]?.[editingCell.c] || "";
          setEditingCell({ r: nextR, c: editingCell.c });
          setEditValue(val);
          setFormulaMode(val.startsWith("="));
        } else if (e.key === "Tab") {
          e.preventDefault();
          commitEdit();
          const nextC = e.shiftKey ? Math.max(editingCell.c - 1, 0) : Math.min(editingCell.c + 1, cols - 1);
          setActiveCell({ r: editingCell.r, c: nextC });
          setSelection({ start: { r: editingCell.r, c: nextC }, end: { r: editingCell.r, c: nextC } });
          const val = data[editingCell.r]?.[nextC] || "";
          setEditingCell({ r: editingCell.r, c: nextC });
          setEditValue(val);
          setFormulaMode(val.startsWith("="));
        } else if (e.key === "Escape") {
          cancelEdit();
          tableRef.current?.focus();
        }
        return;
      }

      if (!activeCell) return;
      const { r, c } = activeCell;

      // Enter → edit
      if (e.key === "Enter") {
        e.preventDefault();
        startEdit(r, c);
        return;
      }

      // F2 → edit
      if (e.key === "F2") {
        e.preventDefault();
        startEdit(r, c);
        return;
      }

      // Delete / Backspace → clear selection
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selection) {
          const minR = Math.min(selection.start.r, selection.end.r);
          const maxR = Math.max(selection.start.r, selection.end.r);
          const minC = Math.min(selection.start.c, selection.end.c);
          const maxC = Math.max(selection.start.c, selection.end.c);
          const newData = data.map((row) => [...row]);
          for (let ri = minR; ri <= maxR; ri++) {
            for (let ci = minC; ci <= maxC; ci++) {
              newData[ri][ci] = "";
            }
          }
          setData(newData);
        }
        return;
      }

      // Arrow navigation (only when NOT editing)
      let newR = r;
      let newC = c;

      switch (e.key) {
        case "ArrowUp": e.preventDefault(); newR = Math.max(r - 1, 0); break;
        case "ArrowDown": e.preventDefault(); newR = Math.min(r + 1, rows - 1); break;
        case "ArrowLeft": e.preventDefault(); newC = Math.max(c - 1, 0); break;
        case "ArrowRight": e.preventDefault(); newC = Math.min(c + 1, cols - 1); break;
        case "Tab": e.preventDefault(); newC = e.shiftKey ? Math.max(c - 1, 0) : Math.min(c + 1, cols - 1); break;
        default:
          // Start typing → enter edit mode (overwrite)
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            startEdit(r, c, e.key);
            return;
          }
          return;
      }

      setActiveCell({ r: newR, c: newC });
      if (e.shiftKey && (e.key.startsWith("Arrow") || e.key === "Tab")) {
        setSelection((prev) =>
          prev ? { start: prev.start, end: { r: newR, c: newC } } : { start: { r: newR, c: newC }, end: { r: newR, c: newC } }
        );
      } else {
        setSelection({ start: { r: newR, c: newC }, end: { r: newR, c: newC } });
      }
    },
    [activeCell, editingCell, data, rows, cols, selection, commitEdit, cancelEdit, startEdit, setData]
  );

  // ─── Copy/Paste ───
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      if (!selection || editingCell) return;
      e.preventDefault();
      const minR = Math.min(selection.start.r, selection.end.r);
      const maxR = Math.max(selection.start.r, selection.end.r);
      const minC = Math.min(selection.start.c, selection.end.c);
      const maxC = Math.max(selection.start.c, selection.end.c);
      const text = displayData
        .slice(minR, maxR + 1)
        .map((row) => row.slice(minC, maxC + 1).join("\t"))
        .join("\n");
      e.clipboardData?.setData("text/plain", text);
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (!activeCell || editingCell) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") || "";
      const pastedRows = text.split("\n").map((line) => line.split("\t"));
      const newData = data.map((row) => [...row]);
      for (let ri = 0; ri < pastedRows.length && activeCell.r + ri < rows; ri++) {
        for (let ci = 0; ci < pastedRows[ri].length && activeCell.c + ci < cols; ci++) {
          newData[activeCell.r + ri][activeCell.c + ci] = pastedRows[ri][ci];
        }
      }
      setData(newData);
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
    };
  }, [selection, activeCell, editingCell, data, displayData, rows, cols, setData]);

  // ─── Auto-SUM ───
  const handleAutoSum = useCallback(() => {
    if (!activeCell) return;

    // Find the column of cells with values above activeCell
    const col = activeCell.c;
    let startRow = activeCell.r - 1;

    // Walk upward to find contiguous numeric cells
    while (startRow >= 0) {
      const raw = data[startRow][col];
      const display = displayData[startRow][col];
      if (raw === "" && display === "") break;
      startRow--;
    }
    startRow++; // first non-empty row

    if (startRow >= activeCell.r) {
      // No values above — check if we have a selection instead
      if (selection) {
        const minR = Math.min(selection.start.r, selection.end.r);
        const maxR = Math.max(selection.start.r, selection.end.r);
        const minC = Math.min(selection.start.c, selection.end.c);
        const maxC = Math.max(selection.start.c, selection.end.c);

        // Place SUM below the selection for each column
        const targetR = maxR + 1;
        if (targetR < rows) {
          const newData = data.map((row) => [...row]);
          for (let ci = minC; ci <= maxC; ci++) {
            const rangeRef = `${colLabel(ci)}${minR + 1}:${colLabel(ci)}${maxR + 1}`;
            newData[targetR][ci] = `=SUM(${rangeRef})`;
          }
          setData(newData);
          setActiveCell({ r: targetR, c: minC });
          setSelection({ start: { r: targetR, c: minC }, end: { r: targetR, c: maxC } });
          setEditingCell(null);
          setFormulaMode(false);
        }
      }
      return;
    }

    // Insert SUM formula at active cell
    const rangeRef = `${colLabel(col)}${startRow + 1}:${colLabel(col)}${activeCell.r}`;
    const formula = `=SUM(${rangeRef})`;
    const newData = data.map((row) => [...row]);
    newData[activeCell.r][col] = formula;
    setData(newData);
    setEditingCell(null);
    setFormulaMode(false);
  }, [activeCell, selection, data, displayData, rows, setData]);

  // ─── Active cell info ───
  const activeCellLabel = activeCell ? colLabel(activeCell.c) + (activeCell.r + 1) : "";
  const activeCellRaw = activeCell ? data[activeCell.r]?.[activeCell.c] ?? "" : "";

  // ─── Selection sum preview (like Excel status bar) ───
  const selectionInfo = useMemo(() => {
    if (!selection) return null;
    const minR = Math.min(selection.start.r, selection.end.r);
    const maxR = Math.max(selection.start.r, selection.end.r);
    const minC = Math.min(selection.start.c, selection.end.c);
    const maxC = Math.max(selection.start.c, selection.end.c);
    const cellCount = (maxR - minR + 1) * (maxC - minC + 1);
    if (cellCount <= 1) return null;

    let sum = 0;
    let count = 0;
    let numCount = 0;
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        count++;
        const v = displayData[r]?.[c] ?? "";
        const n = Number(v);
        if (v !== "" && !isNaN(n)) {
          sum += n;
          numCount++;
        }
      }
    }
    const avg = numCount > 0 ? sum / numCount : 0;
    return { sum, avg, count, numCount };
  }, [selection, displayData]);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* ─── Formula bar ─── */}
      <div className="flex items-center bg-neutral-800 border-b border-neutral-700 h-8 flex-shrink-0">
        {/* Cell name */}
        <div className="w-20 text-center text-xs font-bold text-neutral-300 border-r border-neutral-700 h-full flex items-center justify-center select-none">
          {activeCellLabel}
        </div>
        {/* fx label */}
        <div className="px-2 text-neutral-500 text-sm font-semibold italic select-none">
          fx
        </div>
        {/* Formula / value input — always editable */}
        <input
          ref={formulaBarRef}
          className={`flex-1 text-sm px-2 h-full outline-none border-none ${
            editingCell && formulaMode
              ? "bg-blue-950/40 text-blue-200"
              : "bg-neutral-900 text-white"
          }`}
          value={editingCell ? editValue : activeCellRaw}
          onChange={(e) => {
            if (editingCell) {
              handleEditChange(e.target.value);
            } else if (activeCell) {
              // Start editing from formula bar
              setEditingCell({ r: activeCell.r, c: activeCell.c });
              setEditValue(e.target.value);
              setFormulaMode(e.target.value.startsWith("="));
            }
          }}
          onFocus={() => {
            if (!editingCell && activeCell) {
              startEdit(activeCell.r, activeCell.c);
              // Keep focus on formula bar
              setTimeout(() => formulaBarRef.current?.focus(), 0);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
              tableRef.current?.focus();
            } else if (e.key === "Escape") {
              cancelEdit();
              tableRef.current?.focus();
            }
          }}
        />
        {/* ─── Auto-SUM button ─── */}
        <button
          className="h-full px-3 bg-neutral-800 hover:bg-neutral-700 border-l border-neutral-700 text-neutral-300 hover:text-white text-lg font-bold select-none transition-colors"
          onClick={handleAutoSum}
          title="Somme automatique (Auto-SUM)"
        >
          &Sigma;
        </button>
      </div>

      {/* ─── Grid ─── */}
      <div
        ref={tableRef}
        className="flex-1 overflow-auto focus:outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
      >
        <table className="border-collapse w-full" style={{ minWidth: cols * 100 }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="bg-neutral-800 border border-neutral-600 w-12 min-w-12 text-xs text-neutral-400 text-center sticky left-0 z-20" />
              {Array.from({ length: cols }, (_, c) => (
                <th
                  key={c}
                  className="bg-neutral-800 border border-neutral-600 px-2 py-1 text-xs font-semibold text-neutral-400 text-center min-w-[100px]"
                >
                  {colLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, r) => (
              <tr key={r}>
                <th className="bg-neutral-800 border border-neutral-600 px-2 py-1 text-xs font-semibold text-neutral-400 text-center w-12 min-w-12 sticky left-0 z-[5]">
                  {r + 1}
                </th>
                {row.map((cell, c) => {
                  const isActive = activeCell?.r === r && activeCell?.c === c;
                  const isEditing = editingCell?.r === r && editingCell?.c === c;
                  const isSelected = isInSelection(r, c);
                  const display = displayData[r][c];
                  const hasFormula = isFormula(cell);
                  const hasError = hasFormula && display.startsWith("#");
                  const isNumeric = cell !== "" && !isNaN(Number(cell));
                  const cellUrl = !hasFormula ? normalizeUrl(display) : null;
                  // Colonne "Fonctionnel" (d'après l'en-tête ligne 1) → menu déroulant ✅/❌
                  const headerLabel = (data[0]?.[c] || "").trim().toLowerCase();
                  const isStatusCell = r > 0 && (headerLabel === "fonctionnel" || headerLabel === "fonctionnel ?");

                  return (
                    <td
                      key={c}
                      className={`border border-neutral-700 px-1 py-0 text-sm h-7 relative cursor-cell
                        ${isActive ? "outline outline-2 outline-blue-500 z-[2]" : ""}
                        ${isSelected && !isActive ? "bg-blue-500/15" : "bg-neutral-950"}
                      `}
                      onMouseDown={(e) => { if (!isStatusCell) handleCellMouseDown(r, c, e); }}
                      onMouseEnter={() => handleMouseEnter(r, c)}
                    >
                      {isStatusCell ? (
                        <select
                          value={cell}
                          onMouseDown={(e) => { e.stopPropagation(); setActiveCell({ r, c }); setSelection({ start: { r, c }, end: { r, c } }); }}
                          onChange={(e) => {
                            const nd = data.map((row) => [...row]);
                            nd[r][c] = e.target.value;
                            setData(nd);
                          }}
                          className={`w-full h-full bg-transparent outline-none text-center cursor-pointer appearance-none text-base ${cell === "✅" ? "text-green-400" : cell === "❌" ? "text-red-400" : "text-neutral-500"}`}
                        >
                          <option value="" style={{ background: "#171717", color: "#a3a3a3" }}>—</option>
                          <option value="✅" style={{ background: "#171717", color: "#4ade80" }}>✅ Fonctionne</option>
                          <option value="❌" style={{ background: "#171717", color: "#f87171" }}>❌ Ne fonctionne pas</option>
                        </select>
                      ) : isEditing ? (
                        <input
                          ref={inputRef}
                          className={`absolute inset-0 w-full h-full px-1 outline-none border-2 text-sm z-10 ${
                            formulaMode
                              ? "bg-blue-950/50 text-blue-200 border-blue-400"
                              : "bg-neutral-900 text-white border-blue-500"
                          }`}
                          value={editValue}
                          onChange={(e) => handleEditChange(e.target.value)}
                          onBlur={() => {
                            // Don't commit if we just clicked another cell for formula ref
                            if (formulaClickRef.current) return;
                            commitEdit();
                          }}
                        />
                      ) : (
                        <>
                          <span
                            className={`block truncate leading-7 ${
                              hasError
                                ? "text-red-400 text-xs font-semibold"
                                : hasFormula
                                  ? "text-emerald-300"
                                  : cellUrl
                                    ? "text-blue-400 underline decoration-blue-400/40 pr-5"
                                    : "text-white"
                            }`}
                            style={isNumeric || (hasFormula && !hasError) ? { textAlign: "right" } : undefined}
                          >
                            {display}
                          </span>
                          {cellUrl && (
                            <a
                              href={cellUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Ouvrir ${cellUrl}`}
                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0.5 top-1/2 -translate-y-1/2 z-[3] w-5 h-5 flex items-center justify-center rounded text-blue-400 hover:text-white hover:bg-blue-600"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-7 7M12 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-5" /></svg>
                            </a>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Menu contextuel (clic droit) ─── */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[220px] bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl py-1 text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={openAllLinks}
            disabled={selectionUrlCount === 0}
            className="w-full text-left px-4 py-2 flex items-center gap-2 text-neutral-200 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-7 7M12 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-5" /></svg>
            Ouvrir tous les liens
            {selectionUrlCount > 0 && <span className="ml-auto text-xs text-neutral-500">({selectionUrlCount})</span>}
          </button>
        </div>
      )}

      {/* ─── Status bar (selection info like Excel) ─── */}
      {selectionInfo && (
        <div className="flex items-center justify-end gap-6 bg-neutral-800 border-t border-neutral-700 h-6 px-4 flex-shrink-0 text-xs text-neutral-400">
          <span>Nombre : <span className="text-neutral-200">{selectionInfo.count}</span></span>
          {selectionInfo.numCount > 0 && (
            <>
              <span>Somme : <span className="text-neutral-200">{Math.round(selectionInfo.sum * 1e6) / 1e6}</span></span>
              <span>Moyenne : <span className="text-neutral-200">{Math.round(selectionInfo.avg * 1e6) / 1e6}</span></span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
