// Modèle de feuille de calcul enrichi (v2), rétro-compatible avec l'ancien
// format (un simple string[][]).

export type NumFormat = "" | "int" | "dec1" | "dec2" | "eur" | "pct" | "date";

export interface CellFormat {
  b?: 1;          // gras
  i?: 1;          // italique
  u?: 1;          // souligné
  align?: "left" | "center" | "right";
  color?: string; // couleur texte
  bg?: string;    // couleur de fond
  num?: NumFormat;
}

export interface SheetModel {
  version: 2;
  cells: string[][];
  formats: Record<string, CellFormat>; // clé "r,c"
  colWidths: Record<number, number>;   // largeur px par colonne
  freezeRows: number;                  // nb de lignes figées en haut
}

export const DEFAULT_COL_WIDTH = 120;
export const MIN_COL_WIDTH = 48;

export function emptyGrid(rows = 20, cols = 10): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(""));
}

export function newSheet(): SheetModel {
  return { version: 2, cells: emptyGrid(), formats: {}, colWidths: {}, freezeRows: 0 };
}

/** Charge le contenu stocké : accepte l'ancien format (array) ou le nouveau (objet). */
export function loadSheet(content: string | null | undefined): SheetModel {
  if (!content) return newSheet();
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      // Ancien format : simple grille de valeurs.
      return { version: 2, cells: normalizeGrid(parsed), formats: {}, colWidths: {}, freezeRows: 0 };
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.cells)) {
      return {
        version: 2,
        cells: normalizeGrid(parsed.cells),
        formats: parsed.formats || {},
        colWidths: parsed.colWidths || {},
        freezeRows: parsed.freezeRows || 0,
      };
    }
  } catch {}
  return newSheet();
}

/** Garantit une grille rectangulaire (toutes les lignes de même longueur). */
export function normalizeGrid(grid: any[][]): string[][] {
  const rows = grid.length || 20;
  let cols = 0;
  for (const r of grid) if (Array.isArray(r) && r.length > cols) cols = r.length;
  cols = Math.max(cols, 10);
  return Array.from({ length: rows }, (_, r) => {
    const row = grid[r] || [];
    return Array.from({ length: cols }, (_, c) => (row[c] == null ? "" : String(row[c])));
  });
}

export const fmtKey = (r: number, c: number) => `${r},${c}`;

/** Applique un format de nombre à une valeur affichée. */
export function applyNumFormat(display: string, num?: NumFormat): string {
  if (!num) return display;
  const n = Number(String(display).replace(/\s/g, "").replace(",", "."));
  if (display === "" || isNaN(n)) return display;
  switch (num) {
    case "int": return Math.round(n).toLocaleString("fr-FR");
    case "dec1": return n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case "dec2": return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "eur": return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
    case "pct": return (n * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " %";
    case "date": {
      const d = new Date(n);
      return isNaN(d.getTime()) ? display : d.toLocaleDateString("fr-FR");
    }
    default: return display;
  }
}
