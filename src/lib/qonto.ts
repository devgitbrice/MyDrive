// Accès à l'export Qonto publié en Google Sheets (CSV).
// Partagé entre /api/qonto (onglet Qonto de la page Finances) et
// /api/qonto-sync (docs annuels du drive).

export const QONTO_SHEET_ID =
  process.env.QONTO_SHEET_ID || "1zxnoWSHpdlEJBFA2iIV63iJ83jMrPBc_xBCF8fZA_IA";
export const QONTO_CSV_URL = `https://docs.google.com/spreadsheets/d/${QONTO_SHEET_ID}/export?format=csv`;

export type QontoRow = Record<string, string>;

// Parseur CSV minimal gérant les champs entre guillemets (virgules et
// retours à la ligne inclus) — le format exact produit par Google Sheets.
export function parseCsv(text: string): QontoRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift() || [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] || ""])));
}

// Virement entre les propres comptes Qonto (Compte principal ↔ Coffre) :
// un mouvement interne, pas une vraie recette ni une vraie dépense.
export function isInternalTransfer(r: QontoRow): boolean {
  if (r["operation type"] !== "transfer") return false;
  const cp = (r["counterparty name"] || "").trim().toLowerCase();
  return cp === "compte principal" || cp === "coffre";
}

export async function fetchQontoRows(): Promise<QontoRow[]> {
  const res = await fetch(QONTO_CSV_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed (${res.status})`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error("Sheet not shared publicly");
  return parseCsv(text);
}
