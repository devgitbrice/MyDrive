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

// Transaction au format compact servi aux onglets Qonto.
export interface CompactTx {
  id: string;
  date: string;
  label: string;
  amount: number;
  side: string;
  status: string;
  category: string;
  subcategory: string;
  operationType: string;
  account: string;
  reference: string;
  note: string;
  attachments: string;
}

interface QontoApiTx {
  transaction_id: string;
  emitted_at: string;
  label?: string;
  amount: number;
  side: string;
  status: string;
  operation_type?: string;
  reference?: string;
  note?: string;
  cashflow_category?: { name?: string } | null;
  cashflow_subcategory?: { name?: string } | null;
  transfer?: { counterparty_account_number?: string } | null;
  income?: { counterparty_account_number?: string } | null;
}

// Lecture directe (temps réel) de l'API Qonto avec une clé
// login:secret (Réglages Qonto → Intégrations → Clé API).
export async function fetchQontoApiTxs(login: string, secret: string): Promise<{ txs: CompactTx[]; balance: number; accounts: { name: string; balance: number }[] }> {
  const H = { Authorization: `${login}:${secret}` };
  const orgRes = await fetch("https://thirdparty.qonto.com/v2/organization", { headers: H });
  if (!orgRes.ok) throw new Error(`Qonto API organization → ${orgRes.status}`);
  const org = await orgRes.json();
  const accounts: { id: string; name?: string; iban?: string; balance?: number }[] = org.organization?.bank_accounts || [];
  // Les virements entre nos propres comptes (Compte principal ↔ Coffre)
  // sont repérés par l'IBAN de la contrepartie et écartés.
  const ownIbans = new Set(accounts.map((a) => a.iban).filter(Boolean));

  const all: CompactTx[] = [];
  for (const acc of accounts) {
    let page: number | null = 1;
    while (page) {
      const res: Response = await fetch(
        `https://thirdparty.qonto.com/v2/transactions?bank_account_id=${acc.id}&per_page=100&current_page=${page}&status[]=completed&status[]=pending&status[]=declined`,
        { headers: H }
      );
      if (!res.ok) throw new Error(`Qonto API transactions → ${res.status}`);
      const j: { transactions?: QontoApiTx[]; meta?: { next_page?: number | null } } = await res.json();
      for (const t of (j.transactions || []) as QontoApiTx[]) {
        const cpIban = t.transfer?.counterparty_account_number || t.income?.counterparty_account_number;
        if (cpIban && ownIbans.has(cpIban)) continue;
        all.push({
          id: t.transaction_id,
          date: t.emitted_at,
          label: (t.label || "(sans nom)").trim(),
          amount: Math.abs(t.amount || 0),
          side: t.side === "credit" ? "credit" : "debit",
          status: t.status,
          category: t.cashflow_category?.name || "",
          subcategory: t.cashflow_subcategory?.name || "",
          operationType: t.operation_type || "",
          account: acc.name || "Compte principal",
          reference: (t.reference || "").trim(),
          note: (t.note || "").trim(),
          attachments: "",
        });
      }
      page = j.meta?.next_page ?? null;
    }
  }
  const balance = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  return { txs: all, balance, accounts: accounts.map((a) => ({ name: a.name || "Compte", balance: Number(a.balance) || 0 })) };
}

export async function fetchQontoRows(sheetId = QONTO_SHEET_ID): Promise<QontoRow[]> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed (${res.status})`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error("Sheet not shared publicly");
  return parseCsv(text);
}
