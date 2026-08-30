// Accès à l'export Qonto publié en Google Sheets (CSV).
// Partagé entre /api/qonto (onglet Qonto de la page Finances) et
// /api/qonto-sync (docs annuels du drive).

export const QONTO_SHEET_ID =
  process.env.QONTO_SHEET_ID || "1zxnoWSHpdlEJBFA2iIV63iJ83jMrPBc_xBCF8fZA_IA";
export const QONTO_CSV_URL = `https://docs.google.com/spreadsheets/d/${QONTO_SHEET_ID}/export?format=csv`;

// Comptes Qonto disponibles : Nouvo Media (historique) et Gennn.
// Pour Gennn, renseigner QONTO_GENNN_SHEET_ID (ou remplacer la valeur ici)
// avec l'identifiant du Google Sheet contenant son export, partagé par lien.
export const QONTO_SOURCES: Record<string, { sheetId: string; ownName: string; label: string }> = {
  nouvo: { sheetId: QONTO_SHEET_ID, ownName: "nouvo media", label: "compte Nouvo Media" },
  gennn: { sheetId: process.env.QONTO_GENNN_SHEET_ID || "", ownName: "gennn conseil et formation", label: "compte Gennn" },
};

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

// Mouvement entre les propres comptes Qonto (Compte principal ↔ Coffre) :
// ni une vraie recette ni une vraie dépense. Côté départ, un « transfer »
// vers l'autre compte ; côté arrivée, un « income » dont la contrepartie
// est le titulaire lui-même (NOUVO MEDIA).
export function isInternalTransfer(r: QontoRow, ownName = "nouvo media"): boolean {
  const cp = (r["counterparty name"] || "").trim().toLowerCase();
  const op = r["operation type"];
  if (op === "transfer") return cp === "compte principal" || cp === "coffre";
  if (op === "income") return cp === ownName;
  return false;
}

export async function fetchQontoRows(sheetId = QONTO_SHEET_ID): Promise<QontoRow[]> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed (${res.status})`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error("Sheet not shared publicly");
  return parseCsv(text);
}
