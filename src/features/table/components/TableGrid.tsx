"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { computeCell, isFormula, indexToCol } from "../engine/formula";
import {
  SheetModel, CellFormat, NumFormat, fmtKey, applyNumFormat,
  DEFAULT_COL_WIDTH, MIN_COL_WIDTH,
} from "../sheetModel";

function colLabel(index: number): string {
  return indexToCol(index);
}

/** URL absolue si la valeur ressemble à un lien / nom de domaine, sinon null. */
function normalizeUrl(value: string): string | null {
  const s = (value || "").trim();
  if (!s || /\s/.test(s)) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i.test(s)) {
    return "https://" + s.replace(/^\/+/, "");
  }
  return null;
}

interface TableGridProps {
  sheet: SheetModel;
  setSheet: (s: SheetModel | ((prev: SheetModel) => SheetModel)) => void;
}

interface CellPos { r: number; c: number; }

export default function TableGrid({ sheet, setSheet }: TableGridProps) {
  const data = sheet.cells;
  const rows = data.length;
  const cols = data[0]?.length || 10;

  const [activeCell, setActiveCell] = useState<CellPos | null>(null);
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selection, setSelection] = useState<{ start: CellPos; end: CellPos } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [formulaMode, setFormulaMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; r: number; c: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const formulaBarRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const formulaClickRef = useRef(false);

  // ─── Historique (undo / redo) ───
  const undoStack = useRef<SheetModel[]>([]);
  const redoStack = useRef<SheetModel[]>([]);
  const pushHistory = useCallback((prev: SheetModel) => {
    undoStack.current.push(prev);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  // Helper de mutation avec historique
  const mutate = useCallback((fn: (s: SheetModel) => SheetModel) => {
    setSheet((prev) => {
      pushHistory(prev);
      return fn(prev);
    });
  }, [setSheet, pushHistory]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    setSheet((prev) => {
      redoStack.current.push(prev);
      return undoStack.current.pop()!;
    });
  }, [setSheet]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    setSheet((prev) => {
      undoStack.current.push(prev);
      return redoStack.current.pop()!;
    });
  }, [setSheet]);

  // Écrit une valeur de cellule (avec historique)
  const setCellValue = useCallback((r: number, c: number, val: string) => {
    mutate((s) => {
      const cells = s.cells.map((row) => [...row]);
      cells[r][c] = val;
      return { ...s, cells };
    });
  }, [mutate]);

  const displayData = useMemo(
    () => data.map((row, r) => row.map((_, c) => computeCell(r, c, data))),
    [data]
  );

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus();
  }, [editingCell]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    setCellValue(editingCell.r, editingCell.c, editValue);
    setEditingCell(null);
    setFormulaMode(false);
  }, [editingCell, editValue, setCellValue]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
    setFormulaMode(false);
  }, []);

  // Events externes (Cmd+K insert link, dictée)
  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent).detail;
      if (!item?.title) return;
      const r = activeCell?.r ?? 0, c = activeCell?.c ?? 0;
      setCellValue(r, c, item.title);
      setActiveCell({ r, c });
    };
    window.addEventListener("table-insert-link", handler);
    return () => window.removeEventListener("table-insert-link", handler);
  }, [activeCell, setCellValue]);

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (!text) return;
      const r = activeCell?.r ?? 0, c = activeCell?.c ?? 0;
      setCellValue(r, c, text);
      setActiveCell({ r, c });
    };
    window.addEventListener("table-dictation", handler);
    return () => window.removeEventListener("table-dictation", handler);
  }, [activeCell, setCellValue]);

  const startEdit = useCallback((r: number, c: number, initialValue?: string) => {
    const val = initialValue !== undefined ? initialValue : data[r][c] || "";
    setActiveCell({ r, c });
    setEditingCell({ r, c });
    setEditValue(val);
    setFormulaMode(val.startsWith("="));
  }, [data]);

  const handleEditChange = useCallback((val: string) => {
    setEditValue(val);
    setFormulaMode(val.startsWith("="));
  }, []);

  const handleCellMouseDown = useCallback((r: number, c: number, e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu(null);

    if (editingCell && formulaMode) {
      formulaClickRef.current = true;
      const ref = colLabel(c) + (r + 1);
      setEditValue((prev) => prev + ref);
      setTimeout(() => { inputRef.current?.focus(); formulaClickRef.current = false; }, 0);
      return;
    }

    if (editingCell) {
      setCellValue(editingCell.r, editingCell.c, editValue);
      setEditingCell(null);
      setFormulaMode(false);
    }

    // Shift+clic : étendre la sélection
    if (e.shiftKey && activeCell) {
      setSelection({ start: activeCell, end: { r, c } });
      return;
    }

    setActiveCell({ r, c });
    setSelection({ start: { r, c }, end: { r, c } });
    setIsSelecting(true);
    // Simple clic → édition (sauf colonne statut, gérée séparément)
    const val = data[r][c] || "";
    setEditingCell({ r, c });
    setEditValue(val);
    setFormulaMode(val.startsWith("="));
  }, [editingCell, formulaMode, data, editValue, setCellValue, activeCell]);

  const handleMouseEnter = (r: number, c: number) => {
    if (isSelecting && selection && !formulaMode) {
      setSelection({ ...selection, end: { r, c } });
    }
  };

  const handleMouseUp = useCallback(() => setIsSelecting(false), []);
  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const selBounds = useMemo(() => {
    if (!selection) return null;
    return {
      minR: Math.min(selection.start.r, selection.end.r),
      maxR: Math.max(selection.start.r, selection.end.r),
      minC: Math.min(selection.start.c, selection.end.c),
      maxC: Math.max(selection.start.c, selection.end.c),
    };
  }, [selection]);

  const isInSelection = (r: number, c: number) => {
    if (!selBounds) return false;
    return r >= selBounds.minR && r <= selBounds.maxR && c >= selBounds.minC && c <= selBounds.maxC;
  };

  // ─── Insertion / suppression de lignes & colonnes ───
  const insertRow = useCallback((at: number) => {
    mutate((s) => {
      const width = s.cells[0]?.length || 10;
      const cells = s.cells.map((row) => [...row]);
      cells.splice(at, 0, Array(width).fill(""));
      // décaler les formats
      const formats: Record<string, CellFormat> = {};
      for (const k in s.formats) {
        const [r, c] = k.split(",").map(Number);
        formats[fmtKey(r >= at ? r + 1 : r, c)] = s.formats[k];
      }
      return { ...s, cells, formats };
    });
  }, [mutate]);

  const deleteRow = useCallback((at: number) => {
    mutate((s) => {
      if (s.cells.length <= 1) return s;
      const cells = s.cells.filter((_, i) => i !== at);
      const formats: Record<string, CellFormat> = {};
      for (const k in s.formats) {
        const [r, c] = k.split(",").map(Number);
        if (r === at) continue;
        formats[fmtKey(r > at ? r - 1 : r, c)] = s.formats[k];
      }
      return { ...s, cells, formats };
    });
  }, [mutate]);

  const insertCol = useCallback((at: number) => {
    mutate((s) => {
      const cells = s.cells.map((row) => { const r = [...row]; r.splice(at, 0, ""); return r; });
      const formats: Record<string, CellFormat> = {};
      for (const k in s.formats) {
        const [r, c] = k.split(",").map(Number);
        formats[fmtKey(r, c >= at ? c + 1 : c)] = s.formats[k];
      }
      const colWidths: Record<number, number> = {};
      for (const k in s.colWidths) { const c = Number(k); colWidths[c >= at ? c + 1 : c] = s.colWidths[k]; }
      return { ...s, cells, formats, colWidths };
    });
  }, [mutate]);

  const deleteCol = useCallback((at: number) => {
    mutate((s) => {
      if ((s.cells[0]?.length || 0) <= 1) return s;
      const cells = s.cells.map((row) => row.filter((_, i) => i !== at));
      const formats: Record<string, CellFormat> = {};
      for (const k in s.formats) {
        const [r, c] = k.split(",").map(Number);
        if (c === at) continue;
        formats[fmtKey(r, c > at ? c - 1 : c)] = s.formats[k];
      }
      const colWidths: Record<number, number> = {};
      for (const k in s.colWidths) { const c = Number(k); if (c === at) continue; colWidths[c > at ? c - 1 : c] = s.colWidths[k]; }
      return { ...s, cells, formats, colWidths };
    });
  }, [mutate]);

  // ─── Mise en forme sur la sélection ───
  const applyFormat = useCallback((patch: CellFormat, toggle?: keyof CellFormat) => {
    if (!selBounds) return;
    mutate((s) => {
      const formats = { ...s.formats };
      // Détecte si TOUTES les cellules ont déjà le style (pour le toggle)
      let allOn = true;
      if (toggle) {
        for (let r = selBounds.minR; r <= selBounds.maxR; r++)
          for (let c = selBounds.minC; c <= selBounds.maxC; c++)
            if (!formats[fmtKey(r, c)]?.[toggle]) allOn = false;
      }
      for (let r = selBounds.minR; r <= selBounds.maxR; r++) {
        for (let c = selBounds.minC; c <= selBounds.maxC; c++) {
          const k = fmtKey(r, c);
          const cur = { ...(formats[k] || {}) };
          if (toggle) {
            if (allOn) delete (cur as any)[toggle];
            else (cur as any)[toggle] = 1;
          } else {
            Object.assign(cur, patch);
            // valeur vide => on retire la clé
            for (const key in patch) if ((patch as any)[key] === "") delete (cur as any)[key];
          }
          if (Object.keys(cur).length === 0) delete formats[k];
          else formats[k] = cur;
        }
      }
      return { ...s, formats };
    });
  }, [selBounds, mutate]);

  // ─── Tri par colonne ───
  const sortByColumn = useCallback((col: number, dir: "asc" | "desc") => {
    mutate((s) => {
      const [header, ...body] = s.cells;
      const idx = body.map((row, i) => ({ row, i }));
      idx.sort((a, b) => {
        const va = a.row[col] ?? "", vb = b.row[col] ?? "";
        const na = Number(va), nb = Number(vb);
        let cmp;
        if (va !== "" && vb !== "" && !isNaN(na) && !isNaN(nb)) cmp = na - nb;
        else cmp = String(va).localeCompare(String(vb), "fr", { numeric: true, sensitivity: "base" });
        return dir === "asc" ? cmp : -cmp;
      });
      return { ...s, cells: [header, ...idx.map((x) => x.row)] };
    });
  }, [mutate]);

  // ─── Figer / libérer la ligne d'en-tête ───
  const toggleFreeze = useCallback(() => {
    mutate((s) => ({ ...s, freezeRows: s.freezeRows > 0 ? 0 : 1 }));
  }, [mutate]);

  // ─── Largeur de colonne (drag) ───
  const resizeRef = useRef<{ col: number; startX: number; startW: number } | null>(null);
  const onResizeStart = (col: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { col, startX: e.clientX, startW: sheet.colWidths[col] || DEFAULT_COL_WIDTH };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const w = Math.max(MIN_COL_WIDTH, resizeRef.current.startW + (ev.clientX - resizeRef.current.startX));
      setSheet((prev) => ({ ...prev, colWidths: { ...prev.colWidths, [resizeRef.current!.col]: w } }));
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ─── Poignée de recopie (fill handle) ───
  const fillRef = useRef<{ from: { minR: number; maxR: number; minC: number; maxC: number } } | null>(null);
  const [fillTarget, setFillTarget] = useState<CellPos | null>(null);
  const onFillStart = (e: React.MouseEvent) => {
    if (!selBounds) return;
    e.preventDefault(); e.stopPropagation();
    fillRef.current = { from: selBounds };
    const onMove = (ev: MouseEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const td = el?.closest("td[data-r]") as HTMLElement | null;
      if (td) setFillTarget({ r: Number(td.dataset.r), c: Number(td.dataset.c) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const f = fillRef.current; fillRef.current = null;
      setFillTarget((target) => {
        if (f && target) applyFill(f.from, target);
        return null;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const applyFill = useCallback((from: { minR: number; maxR: number; minC: number; maxC: number }, target: CellPos) => {
    mutate((s) => {
      const cells = s.cells.map((row) => [...row]);
      // recopie verticale si on tire vers le bas dans les mêmes colonnes
      if (target.r > from.maxR) {
        const h = from.maxR - from.minR + 1;
        for (let c = from.minC; c <= from.maxC; c++) {
          for (let r = from.maxR + 1; r <= target.r; r++) {
            const src = cells[from.minR + ((r - from.minR) % h)][c];
            cells[r][c] = src;
          }
        }
      } else if (target.c > from.maxC) {
        const w = from.maxC - from.minC + 1;
        for (let r = from.minR; r <= from.maxR; r++) {
          for (let c = from.maxC + 1; c <= target.c; c++) {
            const src = cells[r][from.minC + ((c - from.minC) % w)];
            cells[r][c] = src;
          }
        }
      }
      return { ...s, cells };
    });
  }, [mutate]);

  // ─── Ouvrir tous les liens de la sélection ───
  const openAllLinks = useCallback(() => {
    setContextMenu(null);
    if (!selBounds) return;
    for (let r = selBounds.minR; r <= selBounds.maxR; r++)
      for (let c = selBounds.minC; c <= selBounds.maxC; c++) {
        const url = normalizeUrl(displayData[r]?.[c] ?? "");
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }
  }, [selBounds, displayData]);

  const selectionUrlCount = useMemo(() => {
    if (!selBounds) return 0;
    let n = 0;
    for (let r = selBounds.minR; r <= selBounds.maxR; r++)
      for (let c = selBounds.minC; c <= selBounds.maxC; c++)
        if (normalizeUrl(displayData[r]?.[c] ?? "")) n++;
    return n;
  }, [selBounds, displayData]);

  const handleContextMenu = useCallback((r: number, c: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (!isInSelection(r, c)) {
      setActiveCell({ r, c });
      setSelection({ start: { r, c }, end: { r, c } });
    }
    setContextMenu({ x: e.clientX, y: e.clientY, r, c });
  }, [selBounds]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  // ─── Clavier ───
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Undo / Redo globaux
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    // Raccourcis mise en forme
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); applyFormat({}, "b"); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") { e.preventDefault(); applyFormat({}, "i"); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "u") { e.preventDefault(); applyFormat({}, "u"); return; }

    if (editingCell) {
      if (e.key === "Enter") {
        e.preventDefault(); commitEdit();
        const nextR = Math.min(editingCell.r + 1, rows - 1);
        setActiveCell({ r: nextR, c: editingCell.c });
        setSelection({ start: { r: nextR, c: editingCell.c }, end: { r: nextR, c: editingCell.c } });
      } else if (e.key === "Tab") {
        e.preventDefault(); commitEdit();
        const nextC = e.shiftKey ? Math.max(editingCell.c - 1, 0) : Math.min(editingCell.c + 1, cols - 1);
        setActiveCell({ r: editingCell.r, c: nextC });
        setSelection({ start: { r: editingCell.r, c: nextC }, end: { r: editingCell.r, c: nextC } });
      } else if (e.key === "Escape") {
        cancelEdit(); tableRef.current?.focus();
      }
      return;
    }

    if (!activeCell) return;
    const { r, c } = activeCell;

    if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); startEdit(r, c); return; }

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (selBounds) {
        mutate((s) => {
          const cells = s.cells.map((row) => [...row]);
          for (let ri = selBounds.minR; ri <= selBounds.maxR; ri++)
            for (let ci = selBounds.minC; ci <= selBounds.maxC; ci++) cells[ri][ci] = "";
          return { ...s, cells };
        });
      }
      return;
    }

    let newR = r, newC = c;
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); newR = Math.max(r - 1, 0); break;
      case "ArrowDown": e.preventDefault(); newR = Math.min(r + 1, rows - 1); break;
      case "ArrowLeft": e.preventDefault(); newC = Math.max(c - 1, 0); break;
      case "ArrowRight": e.preventDefault(); newC = Math.min(c + 1, cols - 1); break;
      case "Tab": e.preventDefault(); newC = e.shiftKey ? Math.max(c - 1, 0) : Math.min(c + 1, cols - 1); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); startEdit(r, c, e.key); return; }
        return;
    }
    setActiveCell({ r: newR, c: newC });
    if (e.shiftKey && (e.key.startsWith("Arrow") || e.key === "Tab")) {
      setSelection((prev) => prev ? { start: prev.start, end: { r: newR, c: newC } } : { start: { r: newR, c: newC }, end: { r: newR, c: newC } });
    } else {
      setSelection({ start: { r: newR, c: newC }, end: { r: newR, c: newC } });
    }
  }, [activeCell, editingCell, rows, cols, selBounds, commitEdit, cancelEdit, startEdit, undo, redo, applyFormat, mutate]);

  // ─── Copier / coller ───
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      if (!selBounds || editingCell) return;
      e.preventDefault();
      const text = displayData.slice(selBounds.minR, selBounds.maxR + 1)
        .map((row) => row.slice(selBounds.minC, selBounds.maxC + 1).join("\t")).join("\n");
      e.clipboardData?.setData("text/plain", text);
    };
    const handlePaste = (e: ClipboardEvent) => {
      if (!activeCell || editingCell) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") || "";
      const pastedRows = text.split("\n").map((line) => line.split("\t"));
      mutate((s) => {
        const cells = s.cells.map((row) => [...row]);
        for (let ri = 0; ri < pastedRows.length && activeCell.r + ri < cells.length; ri++)
          for (let ci = 0; ci < pastedRows[ri].length && activeCell.c + ci < (cells[0]?.length || 0); ci++)
            cells[activeCell.r + ri][activeCell.c + ci] = pastedRows[ri][ci];
        return { ...s, cells };
      });
    };
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    return () => { document.removeEventListener("copy", handleCopy); document.removeEventListener("paste", handlePaste); };
  }, [selBounds, activeCell, editingCell, displayData, mutate]);

  // ─── Auto-SUM ───
  const handleAutoSum = useCallback(() => {
    if (!activeCell) return;
    const col = activeCell.c;
    let startRow = activeCell.r - 1;
    while (startRow >= 0) {
      if (data[startRow][col] === "" && displayData[startRow][col] === "") break;
      startRow--;
    }
    startRow++;
    if (startRow >= activeCell.r) return;
    const rangeRef = `${colLabel(col)}${startRow + 1}:${colLabel(col)}${activeCell.r}`;
    setCellValue(activeCell.r, col, `=SUM(${rangeRef})`);
  }, [activeCell, data, displayData, setCellValue]);

  const activeCellLabel = activeCell ? colLabel(activeCell.c) + (activeCell.r + 1) : "";
  const activeCellRaw = activeCell ? data[activeCell.r]?.[activeCell.c] ?? "" : "";

  const selectionInfo = useMemo(() => {
    if (!selBounds) return null;
    const cellCount = (selBounds.maxR - selBounds.minR + 1) * (selBounds.maxC - selBounds.minC + 1);
    if (cellCount <= 1) return null;
    let sum = 0, count = 0, numCount = 0;
    for (let r = selBounds.minR; r <= selBounds.maxR; r++)
      for (let c = selBounds.minC; c <= selBounds.maxC; c++) {
        count++;
        const v = displayData[r]?.[c] ?? "";
        const n = Number(v);
        if (v !== "" && !isNaN(n)) { sum += n; numCount++; }
      }
    return { sum, avg: numCount > 0 ? sum / numCount : 0, count, numCount };
  }, [selBounds, displayData]);

  const colWidthOf = (c: number) => sheet.colWidths[c] || DEFAULT_COL_WIDTH;

  // ─── Export / Import CSV ───
  const csvEscape = (v: string) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const exportCsv = useCallback(() => {
    // n'exporte que la zone réellement remplie
    let maxR = 0, maxC = 0;
    displayData.forEach((row, r) => row.forEach((v, c) => { if (v !== "") { if (r > maxR) maxR = r; if (c > maxC) maxC = c; } }));
    const lines: string[] = [];
    for (let r = 0; r <= maxR; r++) lines.push(displayData[r].slice(0, maxC + 1).map(csvEscape).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tableau.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [displayData]);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const importCsv = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").replace(/^﻿/, "");
      // parseur CSV simple gérant les guillemets
      const rows: string[][] = [];
      let cur: string[] = [], field = "", inQ = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQ) {
          if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
          else field += ch;
        } else {
          if (ch === '"') inQ = true;
          else if (ch === ",") { cur.push(field); field = ""; }
          else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
          else if (ch === "\r") { /* ignore */ }
          else field += ch;
        }
      }
      if (field !== "" || cur.length) { cur.push(field); rows.push(cur); }
      if (rows.length === 0) return;
      const cols = Math.max(10, ...rows.map((r) => r.length));
      const cells = rows.map((r) => { const x = [...r]; while (x.length < cols) x.push(""); return x; });
      while (cells.length < 20) cells.push(Array(cols).fill(""));
      mutate((s) => ({ ...s, cells }));
    };
    reader.readAsText(file);
  }, [mutate]);

  const TB_BTN = "h-7 min-w-7 px-1.5 rounded text-neutral-300 hover:bg-neutral-700 hover:text-white text-sm flex items-center justify-center transition-colors";

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* ─── Barre d'outils mise en forme ─── */}
      <div className="flex items-center gap-1 bg-neutral-800 border-b border-neutral-700 h-9 px-2 flex-shrink-0 overflow-x-auto">
        <button className={TB_BTN} onClick={undo} title="Annuler (Cmd+Z)">↶</button>
        <button className={TB_BTN} onClick={redo} title="Rétablir (Cmd+Shift+Z)">↷</button>
        <span className="w-px h-5 bg-neutral-700 mx-1" />
        <button className={`${TB_BTN} font-bold`} onClick={() => applyFormat({}, "b")} title="Gras (Cmd+B)">G</button>
        <button className={`${TB_BTN} italic`} onClick={() => applyFormat({}, "i")} title="Italique (Cmd+I)">I</button>
        <button className={`${TB_BTN} underline`} onClick={() => applyFormat({}, "u")} title="Souligné (Cmd+U)">S</button>
        <span className="w-px h-5 bg-neutral-700 mx-1" />
        <button className={TB_BTN} onClick={() => applyFormat({ align: "left" })} title="Aligner à gauche">⇤</button>
        <button className={TB_BTN} onClick={() => applyFormat({ align: "center" })} title="Centrer">⇔</button>
        <button className={TB_BTN} onClick={() => applyFormat({ align: "right" })} title="Aligner à droite">⇥</button>
        <span className="w-px h-5 bg-neutral-700 mx-1" />
        {/* Couleur texte */}
        <label className={TB_BTN} title="Couleur du texte" style={{ position: "relative" }}>
          <span style={{ borderBottom: "3px solid #f87171" }}>A</span>
          <input type="color" onChange={(e) => applyFormat({ color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </label>
        {/* Couleur de fond */}
        <label className={TB_BTN} title="Couleur de fond" style={{ position: "relative" }}>
          <span style={{ background: "#334155", padding: "0 3px", borderRadius: 2 }}>▉</span>
          <input type="color" onChange={(e) => applyFormat({ bg: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </label>
        <button className={TB_BTN} onClick={() => applyFormat({ color: "", bg: "" })} title="Effacer les couleurs">⌫</button>
        <span className="w-px h-5 bg-neutral-700 mx-1" />
        {/* Formats de nombre */}
        <select
          className="h-7 bg-neutral-900 border border-neutral-700 rounded text-xs text-neutral-300 px-1 outline-none"
          value=""
          onChange={(e) => { if (e.target.value) applyFormat({ num: e.target.value as NumFormat }); e.currentTarget.value = ""; }}
          title="Format des nombres"
        >
          <option value="">123 Format</option>
          <option value="">Standard</option>
          <option value="int">Entier (1 234)</option>
          <option value="dec2">2 décimales</option>
          <option value="eur">Euro (€)</option>
          <option value="pct">Pourcentage (%)</option>
          <option value="date">Date</option>
        </select>
        <span className="w-px h-5 bg-neutral-700 mx-1" />
        <button className={TB_BTN} onClick={() => selBounds && sortByColumn(selBounds.minC, "asc")} title="Trier la colonne A→Z">A↓</button>
        <button className={TB_BTN} onClick={() => selBounds && sortByColumn(selBounds.minC, "desc")} title="Trier la colonne Z→A">Z↓</button>
        <button className={`${TB_BTN} ${sheet.freezeRows > 0 ? "bg-blue-600 text-white" : ""}`} onClick={toggleFreeze} title="Figer la ligne d'en-tête">❄</button>
        <span className="w-px h-5 bg-neutral-700 mx-1" />
        <button className={TB_BTN} onClick={exportCsv} title="Exporter en CSV">⬇ CSV</button>
        <button className={TB_BTN} onClick={() => csvInputRef.current?.click()} title="Importer un CSV">⬆ CSV</button>
        <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.currentTarget.value = ""; }} />
      </div>

      {/* ─── Formula bar ─── */}
      <div className="flex items-center bg-neutral-800 border-b border-neutral-700 h-8 flex-shrink-0">
        <div className="w-16 text-center text-xs font-bold text-neutral-300 border-r border-neutral-700 h-full flex items-center justify-center select-none">{activeCellLabel}</div>
        <div className="px-2 text-neutral-500 text-sm font-semibold italic select-none">fx</div>
        <input
          ref={formulaBarRef}
          className={`flex-1 text-sm px-2 h-full outline-none border-none ${editingCell && formulaMode ? "bg-blue-950/40 text-blue-200" : "bg-neutral-900 text-white"}`}
          value={editingCell ? editValue : activeCellRaw}
          onChange={(e) => {
            if (editingCell) handleEditChange(e.target.value);
            else if (activeCell) { setEditingCell(activeCell); setEditValue(e.target.value); setFormulaMode(e.target.value.startsWith("=")); }
          }}
          onFocus={() => { if (!editingCell && activeCell) { startEdit(activeCell.r, activeCell.c); setTimeout(() => formulaBarRef.current?.focus(), 0); } }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitEdit(); tableRef.current?.focus(); }
            else if (e.key === "Escape") { cancelEdit(); tableRef.current?.focus(); }
          }}
        />
        <button className="h-full px-3 bg-neutral-800 hover:bg-neutral-700 border-l border-neutral-700 text-neutral-300 hover:text-white text-lg font-bold select-none" onClick={handleAutoSum} title="Somme automatique">&Sigma;</button>
      </div>

      {/* ─── Grille ─── */}
      <div ref={tableRef} className="flex-1 overflow-auto focus:outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
        <table className="border-collapse" style={{ tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="bg-neutral-800 border border-neutral-600 w-12 min-w-12 text-xs text-neutral-400 sticky left-0 z-20" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="bg-neutral-800 border border-neutral-600 px-2 py-1 text-xs font-semibold text-neutral-400 text-center relative group" style={{ width: colWidthOf(c), minWidth: colWidthOf(c) }}>
                  {colLabel(c)}
                  {/* poignée de redimensionnement */}
                  <span onMouseDown={(e) => onResizeStart(c, e)} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, r) => {
              const frozen = sheet.freezeRows > 0 && r < sheet.freezeRows;
              return (
                <tr key={r}>
                  <th className={`bg-neutral-800 border border-neutral-600 px-2 py-1 text-xs font-semibold text-neutral-400 text-center w-12 min-w-12 sticky left-0 z-[5] ${frozen ? "sticky" : ""}`} style={frozen ? { top: 64 } : undefined}>{r + 1}</th>
                  {row.map((cell, c) => {
                    const isActive = activeCell?.r === r && activeCell?.c === c;
                    const isEditing = editingCell?.r === r && editingCell?.c === c;
                    const isSelected = isInSelection(r, c);
                    const rawDisplay = displayData[r][c];
                    const hasFormula = isFormula(cell);
                    const hasError = hasFormula && rawDisplay.startsWith("#");
                    const fmt = sheet.formats[fmtKey(r, c)];
                    const display = applyNumFormat(rawDisplay, fmt?.num);
                    const isNumeric = cell !== "" && !isNaN(Number(cell));
                    const cellUrl = !hasFormula ? normalizeUrl(rawDisplay) : null;
                    const headerLabel = (data[0]?.[c] || "").trim().toLowerCase();
                    const isStatusCell = r > 0 && headerLabel === "fonctionnel";
                    const isFillCorner = selBounds && r === selBounds.maxR && c === selBounds.maxC;
                    const inFillPreview = fillTarget && selBounds &&
                      ((fillTarget.r > selBounds.maxR && c >= selBounds.minC && c <= selBounds.maxC && r > selBounds.maxR && r <= fillTarget.r) ||
                       (fillTarget.c > selBounds.maxC && r >= selBounds.minR && r <= selBounds.maxR && c > selBounds.maxC && c <= fillTarget.c));

                    const textAlign = fmt?.align || (isNumeric || (hasFormula && !hasError) ? "right" : "left");
                    const style: React.CSSProperties = {
                      width: colWidthOf(c), minWidth: colWidthOf(c),
                      background: fmt?.bg,
                      color: fmt?.color,
                      fontWeight: fmt?.b ? 700 : undefined,
                      fontStyle: fmt?.i ? "italic" : undefined,
                      textDecoration: fmt?.u ? "underline" : undefined,
                      textAlign: textAlign as any,
                      position: frozen ? "sticky" : undefined,
                      top: frozen ? 64 : undefined,
                      zIndex: frozen ? 4 : undefined,
                    };

                    return (
                      <td
                        key={c}
                        data-r={r}
                        data-c={c}
                        className={`border border-neutral-700 px-1 py-0 text-sm h-7 relative cursor-cell
                          ${isActive ? "outline outline-2 outline-blue-500 z-[2]" : ""}
                          ${inFillPreview ? "outline outline-1 outline-blue-400/60" : ""}
                          ${isSelected && !isActive ? "bg-blue-500/15" : !fmt?.bg ? "bg-neutral-950" : ""}`}
                        style={style}
                        onMouseDown={(e) => { if (!isStatusCell) handleCellMouseDown(r, c, e); }}
                        onMouseEnter={() => handleMouseEnter(r, c)}
                        onContextMenu={(e) => handleContextMenu(r, c, e)}
                      >
                        {isStatusCell ? (
                          <select
                            value={cell}
                            onMouseDown={(e) => { e.stopPropagation(); setActiveCell({ r, c }); setSelection({ start: { r, c }, end: { r, c } }); }}
                            onChange={(e) => setCellValue(r, c, e.target.value)}
                            className={`w-full h-full bg-transparent outline-none text-center cursor-pointer appearance-none text-base ${cell === "✅" ? "text-green-400" : cell === "❌" ? "text-red-400" : "text-neutral-500"}`}
                          >
                            <option value="" style={{ background: "#171717", color: "#a3a3a3" }}>—</option>
                            <option value="✅" style={{ background: "#171717", color: "#4ade80" }}>✅ Fonctionne</option>
                            <option value="❌" style={{ background: "#171717", color: "#f87171" }}>❌ Ne fonctionne pas</option>
                          </select>
                        ) : isEditing ? (
                          <input
                            ref={inputRef}
                            className={`absolute inset-0 w-full h-full px-1 outline-none border-2 text-sm z-10 ${formulaMode ? "bg-blue-950/50 text-blue-200 border-blue-400" : "bg-neutral-900 text-white border-blue-500"}`}
                            value={editValue}
                            onChange={(e) => handleEditChange(e.target.value)}
                            onBlur={() => { if (formulaClickRef.current) return; commitEdit(); }}
                          />
                        ) : (
                          <>
                            <span className={`block truncate leading-7 ${hasError ? "text-red-400 text-xs font-semibold" : hasFormula ? "text-emerald-300" : cellUrl ? "text-blue-400 underline decoration-blue-400/40 pr-5" : ""}`}>
                              {display}
                            </span>
                            {cellUrl && (
                              <a href={cellUrl} target="_blank" rel="noopener noreferrer" title={`Ouvrir ${cellUrl}`}
                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onClick={(e) => e.stopPropagation()}
                                className="absolute right-0.5 top-1/2 -translate-y-1/2 z-[3] w-5 h-5 flex items-center justify-center rounded text-blue-400 hover:text-white hover:bg-blue-600">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-7 7M12 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-5" /></svg>
                              </a>
                            )}
                            {/* Poignée de recopie */}
                            {isFillCorner && !isStatusCell && (
                              <span onMouseDown={onFillStart} className="absolute -right-[3px] -bottom-[3px] w-2 h-2 bg-blue-500 border border-white rounded-sm cursor-crosshair z-[4]" />
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Menu contextuel ─── */}
      {contextMenu && (
        <div className="fixed z-50 min-w-[220px] bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl py-1 text-sm" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          {selectionUrlCount > 0 && (
            <>
              <button onClick={openAllLinks} className="w-full text-left px-4 py-2 flex items-center gap-2 text-neutral-200 hover:bg-neutral-800">
                <span className="text-blue-400">↗</span> Ouvrir tous les liens <span className="ml-auto text-xs text-neutral-500">({selectionUrlCount})</span>
              </button>
              <div className="h-px bg-neutral-800 my-1" />
            </>
          )}
          <button onClick={() => { insertRow(contextMenu.r); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-neutral-200 hover:bg-neutral-800">Insérer une ligne au-dessus</button>
          <button onClick={() => { insertRow(contextMenu.r + 1); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-neutral-200 hover:bg-neutral-800">Insérer une ligne en dessous</button>
          <button onClick={() => { deleteRow(contextMenu.r); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-red-400 hover:bg-neutral-800">Supprimer la ligne</button>
          <div className="h-px bg-neutral-800 my-1" />
          <button onClick={() => { insertCol(contextMenu.c); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-neutral-200 hover:bg-neutral-800">Insérer une colonne à gauche</button>
          <button onClick={() => { insertCol(contextMenu.c + 1); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-neutral-200 hover:bg-neutral-800">Insérer une colonne à droite</button>
          <button onClick={() => { deleteCol(contextMenu.c); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-red-400 hover:bg-neutral-800">Supprimer la colonne</button>
          <div className="h-px bg-neutral-800 my-1" />
          <button onClick={() => { sortByColumn(contextMenu.c, "asc"); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-neutral-200 hover:bg-neutral-800">Trier cette colonne A→Z</button>
          <button onClick={() => { sortByColumn(contextMenu.c, "desc"); setContextMenu(null); }} className="w-full text-left px-4 py-2 text-neutral-200 hover:bg-neutral-800">Trier cette colonne Z→A</button>
        </div>
      )}

      {/* ─── Status bar ─── */}
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
