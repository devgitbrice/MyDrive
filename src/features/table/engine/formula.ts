// ─── Excel-like formula engine ───
// Supports: cell refs (A1, B2), ranges (A1:B3), operators (+,-,*,/,^,%,&),
// comparisons (=,<>,<,>,<=,>=), nested functions, and 30+ Excel functions.

// ─── Helpers ───

/** Column label → 0-based index: A→0, B→1, Z→25, AA→26 */
function colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/** 0-based index → column label */
export function indexToCol(idx: number): string {
  let label = "";
  let i = idx;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
}

/** Parse "A1" ou "$A$1" → {r:0, c:0} (les $ des références absolues sont ignorés au calcul) */
function parseRef(ref: string): { r: number; c: number } {
  const m = ref.replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/);
  if (!m) throw new Error(`Invalid ref: ${ref}`);
  return { r: parseInt(m[2], 10) - 1, c: colToIndex(m[1]) };
}

/** Convertit un index de colonne en lettres (0 → A). */
function idxToCol(idx: number): string {
  let s = "";
  idx++;
  while (idx > 0) { const m = (idx - 1) % 26; s = String.fromCharCode(65 + m) + s; idx = Math.floor((idx - 1) / 26); }
  return s;
}

/**
 * Décale les références d'une formule pour la recopie (fill / copier-coller).
 * Les parties précédées de $ (colonne ou ligne absolue) ne bougent pas.
 * Ex : shiftFormula("=A1+$B$2", 1, 0) → "=A2+$B$2"
 */
export function shiftFormula(formula: string, dr: number, dc: number): string {
  if (!formula.startsWith("=")) return formula;
  return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_m, ac, col, ar, row) => {
    let c = colToIndex(col);
    let r = parseInt(row, 10) - 1;
    if (!ac) c = Math.max(0, c + dc);
    if (!ar) r = Math.max(0, r + dr);
    return `${ac}${idxToCol(c)}${ar}${r + 1}`;
  });
}

/** Expand "A1:C3" into flat array of cell values */
function expandRange(
  rangeStr: string,
  data: string[][],
  visited: Set<string>,
  evalCell: (r: number, c: number, data: string[][], visited: Set<string>) => number | string
): (number | string)[] {
  const [startRef, endRef] = rangeStr.split(":");
  const start = parseRef(startRef);
  const end = parseRef(endRef);
  const minR = Math.min(start.r, end.r);
  const maxR = Math.max(start.r, end.r);
  const minC = Math.min(start.c, end.c);
  const maxC = Math.max(start.c, end.c);
  const values: (number | string)[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      values.push(evalCell(r, c, data, visited));
    }
  }
  return values;
}

function toNum(v: number | string): number {
  if (typeof v === "number") return v;
  if (v === "" || v === undefined || v === null) return 0;
  const n = Number(v);
  if (isNaN(n)) throw new Error(`#VALUE!`);
  return n;
}

function nums(arr: (number | string)[]): number[] {
  return arr.filter((v) => v !== "" && v !== undefined && v !== null).map(toNum);
}

// ─── Tokenizer ───

type Token =
  | { type: "NUMBER"; value: number }
  | { type: "STRING"; value: string }
  | { type: "CELL"; value: string }
  | { type: "RANGE"; value: string }
  | { type: "FUNC"; value: string }
  | { type: "OP"; value: string }
  | { type: "PAREN"; value: "(" | ")" }
  | { type: "COMMA" }
  | { type: "BOOL"; value: boolean };

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = formula;

  while (i < s.length) {
    // Skip whitespace
    if (s[i] === " " || s[i] === "\t") { i++; continue; }

    // String literal
    if (s[i] === '"') {
      let str = "";
      i++;
      while (i < s.length && s[i] !== '"') {
        str += s[i++];
      }
      i++; // closing quote
      tokens.push({ type: "STRING", value: str });
      continue;
    }

    // Comparison operators (must check before single < > =)
    if (s[i] === "<" && s[i + 1] === ">") { tokens.push({ type: "OP", value: "<>" }); i += 2; continue; }
    if (s[i] === "<" && s[i + 1] === "=") { tokens.push({ type: "OP", value: "<=" }); i += 2; continue; }
    if (s[i] === ">" && s[i + 1] === "=") { tokens.push({ type: "OP", value: ">=" }); i += 2; continue; }

    // Single operators
    if ("+-*/^%&=<>".includes(s[i])) {
      tokens.push({ type: "OP", value: s[i] }); i++; continue;
    }

    // Parens
    if (s[i] === "(" || s[i] === ")") {
      tokens.push({ type: "PAREN", value: s[i] as "(" | ")" }); i++; continue;
    }

    // Comma
    if (s[i] === ",") { tokens.push({ type: "COMMA" }); i++; continue; }
    if (s[i] === ";") { tokens.push({ type: "COMMA" }); i++; continue; } // European separator

    // Number (including decimals)
    if (/[0-9.]/.test(s[i])) {
      let num = "";
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i++]; }
      tokens.push({ type: "NUMBER", value: parseFloat(num) });
      continue;
    }

    // Identifier: could be CELL, RANGE, FUNC, or BOOL
    if (/[A-Za-z_$]/.test(s[i])) {
      let id = "";
      while (i < s.length && /[A-Za-z0-9_$]/.test(s[i])) { id += s[i++]; }
      const upper = id.toUpperCase();

      // Boolean
      if (upper === "TRUE") { tokens.push({ type: "BOOL", value: true }); continue; }
      if (upper === "FALSE") { tokens.push({ type: "BOOL", value: false }); continue; }

      // Range: A1:B3
      if (s[i] === ":" && /^\$?[A-Z]+\$?\d+$/i.test(id)) {
        i++; // skip ':'
        let id2 = "";
        while (i < s.length && /[A-Za-z0-9$]/.test(s[i])) { id2 += s[i++]; }
        tokens.push({ type: "RANGE", value: upper + ":" + id2.toUpperCase() });
        continue;
      }

      // Function: identifier followed by '('
      if (s[i] === "(") {
        tokens.push({ type: "FUNC", value: upper });
        continue;
      }

      // Cell reference: e.g. A1, BC23
      if (/^\$?[A-Z]+\$?\d+$/.test(upper)) {
        tokens.push({ type: "CELL", value: upper });
        continue;
      }

      // Unknown identifier → treat as string
      tokens.push({ type: "STRING", value: id });
      continue;
    }

    // Skip unknown
    i++;
  }

  return tokens;
}

// ─── Recursive descent parser + evaluator ───

type EvalCtx = {
  data: string[][];
  visited: Set<string>;
  evalCell: (r: number, c: number, data: string[][], visited: Set<string>) => number | string;
};

class Parser {
  tokens: Token[];
  pos: number;
  ctx: EvalCtx;

  constructor(tokens: Token[], ctx: EvalCtx) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx;
  }

  peek(): Token | null { return this.tokens[this.pos] ?? null; }
  next(): Token { return this.tokens[this.pos++]; }

  expect(type: string, value?: string) {
    const t = this.next();
    if (!t || t.type !== type || (value !== undefined && (t as any).value !== value))
      throw new Error(`Expected ${type} ${value ?? ""}`);
    return t;
  }

  parse(): number | string {
    const result = this.exprCompare();
    return result;
  }

  // Comparison: =, <>, <, >, <=, >=
  exprCompare(): number | string {
    let left = this.exprConcat();
    while (this.peek()?.type === "OP" && ["=", "<>", "<", ">", "<=", ">="].includes((this.peek() as any).value)) {
      const op = (this.next() as any).value;
      const right = this.exprConcat();
      const l = typeof left === "string" ? left : left;
      const r = typeof right === "string" ? right : right;
      switch (op) {
        case "=": left = (l === r) ? 1 : 0; break;
        case "<>": left = (l !== r) ? 1 : 0; break;
        case "<": left = (toNum(l) < toNum(r)) ? 1 : 0; break;
        case ">": left = (toNum(l) > toNum(r)) ? 1 : 0; break;
        case "<=": left = (toNum(l) <= toNum(r)) ? 1 : 0; break;
        case ">=": left = (toNum(l) >= toNum(r)) ? 1 : 0; break;
      }
    }
    return left;
  }

  // Concatenation: &
  exprConcat(): number | string {
    let left = this.exprAdd();
    while (this.peek()?.type === "OP" && (this.peek() as any).value === "&") {
      this.next();
      const right = this.exprAdd();
      left = String(left) + String(right);
    }
    return left;
  }

  // Addition / Subtraction
  exprAdd(): number | string {
    let left = this.exprMul();
    while (this.peek()?.type === "OP" && ["+", "-"].includes((this.peek() as any).value)) {
      const op = (this.next() as any).value;
      const right = this.exprMul();
      if (op === "+") left = toNum(left) + toNum(right);
      else left = toNum(left) - toNum(right);
    }
    return left;
  }

  // Multiplication / Division / Modulo
  exprMul(): number | string {
    let left = this.exprPow();
    while (this.peek()?.type === "OP" && ["*", "/", "%"].includes((this.peek() as any).value)) {
      const op = (this.next() as any).value;
      const right = this.exprPow();
      if (op === "*") left = toNum(left) * toNum(right);
      else if (op === "/") {
        const d = toNum(right);
        if (d === 0) throw new Error("#DIV/0!");
        left = toNum(left) / d;
      } else left = toNum(left) % toNum(right);
    }
    return left;
  }

  // Power: ^
  exprPow(): number | string {
    let left = this.exprUnary();
    while (this.peek()?.type === "OP" && (this.peek() as any).value === "^") {
      this.next();
      const right = this.exprUnary();
      left = Math.pow(toNum(left), toNum(right));
    }
    return left;
  }

  // Unary minus
  exprUnary(): number | string {
    if (this.peek()?.type === "OP" && (this.peek() as any).value === "-") {
      this.next();
      return -toNum(this.exprPrimary());
    }
    if (this.peek()?.type === "OP" && (this.peek() as any).value === "+") {
      this.next();
      return toNum(this.exprPrimary());
    }
    return this.exprPrimary();
  }

  // Primary: number, string, bool, cell, range, function, parens
  exprPrimary(): number | string {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end");

    if (t.type === "NUMBER") { this.next(); return t.value; }
    if (t.type === "STRING") { this.next(); return t.value; }
    if (t.type === "BOOL") { this.next(); return t.value ? 1 : 0; }

    if (t.type === "CELL") {
      this.next();
      const ref = parseRef(t.value);
      return this.ctx.evalCell(ref.r, ref.c, this.ctx.data, this.ctx.visited);
    }

    if (t.type === "RANGE") {
      this.next();
      // Bare range used as value — return sum by default (like Excel)
      const vals = expandRange(t.value, this.ctx.data, this.ctx.visited, this.ctx.evalCell);
      return nums(vals).reduce((a, b) => a + b, 0);
    }

    if (t.type === "FUNC") {
      return this.evalFunc();
    }

    if (t.type === "PAREN" && t.value === "(") {
      this.next();
      const val = this.parse();
      this.expect("PAREN", ")");
      return val;
    }

    throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
  }

  // Collect function arguments (handling ranges and expressions)
  collectArgs(): (number | string | (number | string)[])[] {
    this.expect("PAREN", "(");
    const args: (number | string | (number | string)[])[] = [];
    if (this.peek()?.type === "PAREN" && (this.peek() as any).value === ")") {
      this.next();
      return args;
    }
    while (true) {
      // Check if next arg is a range
      if (this.peek()?.type === "RANGE") {
        const t = this.next() as Token & { type: "RANGE" };
        args.push(expandRange(t.value, this.ctx.data, this.ctx.visited, this.ctx.evalCell));
      } else {
        args.push(this.parse());
      }
      if (this.peek()?.type === "COMMA") { this.next(); continue; }
      break;
    }
    this.expect("PAREN", ")");
    return args;
  }

  // Flatten args: ranges become individual values
  flatArgs(): (number | string)[] {
    const args = this.collectArgs();
    const flat: (number | string)[] = [];
    for (const a of args) {
      if (Array.isArray(a)) flat.push(...a);
      else flat.push(a);
    }
    return flat;
  }

  evalFunc(): number | string {
    const name = (this.next() as any).value as string;

    switch (name) {
      // ─── Math ───
      case "SUM": { return nums(this.flatArgs()).reduce((a, b) => a + b, 0); }
      case "AVERAGE": case "MOYENNE": {
        const n = nums(this.flatArgs());
        if (n.length === 0) throw new Error("#DIV/0!");
        return n.reduce((a, b) => a + b, 0) / n.length;
      }
      case "MIN": { const n = nums(this.flatArgs()); return n.length ? Math.min(...n) : 0; }
      case "MAX": { const n = nums(this.flatArgs()); return n.length ? Math.max(...n) : 0; }
      case "COUNT": { return nums(this.flatArgs()).length; }
      case "COUNTA": { return this.flatArgs().filter((v) => v !== "" && v !== null && v !== undefined).length; }
      case "ABS": { const a = this.collectArgs(); return Math.abs(toNum(a[0] as any)); }
      case "SQRT": case "RACINE": { const a = this.collectArgs(); const v = toNum(a[0] as any); if (v < 0) throw new Error("#NUM!"); return Math.sqrt(v); }
      case "POWER": case "PUISSANCE": { const a = this.collectArgs(); return Math.pow(toNum(a[0] as any), toNum(a[1] as any)); }
      case "MOD": { const a = this.collectArgs(); return toNum(a[0] as any) % toNum(a[1] as any); }
      case "INT": case "ENT": { const a = this.collectArgs(); return Math.floor(toNum(a[0] as any)); }
      case "ROUND": case "ARRONDI": {
        const a = this.collectArgs();
        const val = toNum(a[0] as any);
        const dec = a.length > 1 ? toNum(a[1] as any) : 0;
        const factor = Math.pow(10, dec);
        return Math.round(val * factor) / factor;
      }
      case "ROUNDUP": { const a = this.collectArgs(); const val = toNum(a[0] as any); const dec = a.length > 1 ? toNum(a[1] as any) : 0; const f = Math.pow(10, dec); return Math.ceil(val * f) / f; }
      case "ROUNDDOWN": { const a = this.collectArgs(); const val = toNum(a[0] as any); const dec = a.length > 1 ? toNum(a[1] as any) : 0; const f = Math.pow(10, dec); return Math.floor(val * f) / f; }
      case "CEILING": case "PLAFOND": { const a = this.collectArgs(); const val = toNum(a[0] as any); const sig = a.length > 1 ? toNum(a[1] as any) : 1; return Math.ceil(val / sig) * sig; }
      case "FLOOR": case "PLANCHER": { const a = this.collectArgs(); const val = toNum(a[0] as any); const sig = a.length > 1 ? toNum(a[1] as any) : 1; return Math.floor(val / sig) * sig; }
      case "LOG": { const a = this.collectArgs(); const val = toNum(a[0] as any); const base = a.length > 1 ? toNum(a[1] as any) : 10; return Math.log(val) / Math.log(base); }
      case "LN": { const a = this.collectArgs(); return Math.log(toNum(a[0] as any)); }
      case "EXP": { const a = this.collectArgs(); return Math.exp(toNum(a[0] as any)); }
      case "PI": { this.collectArgs(); return Math.PI; }
      case "RAND": { this.collectArgs(); return Math.random(); }
      case "RANDBETWEEN": { const a = this.collectArgs(); const lo = toNum(a[0] as any); const hi = toNum(a[1] as any); return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
      case "SIGN": { const a = this.collectArgs(); return Math.sign(toNum(a[0] as any)); }

      // ─── Statistics ───
      case "MEDIAN": case "MEDIANE": {
        const n = nums(this.flatArgs()).sort((a, b) => a - b);
        if (!n.length) return 0;
        const mid = Math.floor(n.length / 2);
        return n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2;
      }
      case "STDEV": {
        const n = nums(this.flatArgs());
        if (n.length < 2) throw new Error("#DIV/0!");
        const avg = n.reduce((a, b) => a + b, 0) / n.length;
        const variance = n.reduce((s, v) => s + (v - avg) ** 2, 0) / (n.length - 1);
        return Math.sqrt(variance);
      }
      case "PRODUCT": case "PRODUIT": { return nums(this.flatArgs()).reduce((a, b) => a * b, 1); }

      // ─── Conditional ───
      case "IF": case "SI": {
        const a = this.collectArgs();
        const cond = toNum(a[0] as any);
        return cond ? (a[1] ?? 1) as number | string : (a[2] ?? 0) as number | string;
      }
      case "AND": case "ET": { return this.flatArgs().every((v) => toNum(v) !== 0) ? 1 : 0; }
      case "OR": case "OU": { return this.flatArgs().some((v) => toNum(v) !== 0) ? 1 : 0; }
      case "NOT": case "NON": { const a = this.collectArgs(); return toNum(a[0] as any) === 0 ? 1 : 0; }
      case "IFERROR": {
        const args = this.collectArgs();
        // Already evaluated — if first arg threw, we won't get here.
        // We handle this at a higher level; here just return args[0]
        return args[0] as number | string;
      }

      // ─── Counting with conditions ───
      case "COUNTIF": case "NB.SI": {
        const args = this.collectArgs();
        const range = args[0] as (number | string)[];
        const criteria = String(args[1]);
        return countIf(range, criteria);
      }
      case "SUMIF": case "SOMME.SI": {
        const args = this.collectArgs();
        const range = args[0] as (number | string)[];
        const criteria = String(args[1]);
        const sumRange = args.length > 2 ? args[2] as (number | string)[] : range;
        let total = 0;
        for (let i = 0; i < range.length; i++) {
          if (matchesCriteria(range[i], criteria)) {
            total += toNum((sumRange as any)[i] ?? 0);
          }
        }
        return total;
      }
      case "AVERAGEIF": case "MOYENNE.SI": {
        const args = this.collectArgs();
        const range = args[0] as (number | string)[];
        const criteria = String(args[1]);
        const avgRange = args.length > 2 ? args[2] as (number | string)[] : range;
        let total = 0, cnt = 0;
        for (let i = 0; i < range.length; i++) {
          if (matchesCriteria(range[i], criteria)) {
            total += toNum((avgRange as any)[i] ?? 0);
            cnt++;
          }
        }
        if (cnt === 0) throw new Error("#DIV/0!");
        return total / cnt;
      }

      // ─── Text ───
      case "LEN": case "NBCAR": { const a = this.collectArgs(); return String(a[0] ?? "").length; }
      case "LEFT": case "GAUCHE": { const a = this.collectArgs(); return String(a[0] ?? "").slice(0, toNum(a[1] as any ?? 1)); }
      case "RIGHT": case "DROITE": { const a = this.collectArgs(); const s = String(a[0] ?? ""); const n = toNum(a[1] as any ?? 1); return s.slice(-n); }
      case "MID": case "STXT": { const a = this.collectArgs(); return String(a[0] ?? "").substr(toNum(a[1] as any) - 1, toNum(a[2] as any)); }
      case "UPPER": case "MAJUSCULE": { const a = this.collectArgs(); return String(a[0] ?? "").toUpperCase(); }
      case "LOWER": case "MINUSCULE": { const a = this.collectArgs(); return String(a[0] ?? "").toLowerCase(); }
      case "TRIM": case "SUPPRESPACE": { const a = this.collectArgs(); return String(a[0] ?? "").trim(); }
      case "CONCATENATE": case "CONCATENER": { return this.flatArgs().map(String).join(""); }
      case "SUBSTITUTE": case "SUBSTITUE": {
        const a = this.collectArgs();
        const text = String(a[0] ?? "");
        const oldT = String(a[1] ?? "");
        const newT = String(a[2] ?? "");
        return text.split(oldT).join(newT);
      }
      case "TEXT": case "TEXTE": {
        const a = this.collectArgs();
        // Simplified: just convert number to string
        return String(a[0] ?? "");
      }
      case "VALUE": case "CNUM": { const a = this.collectArgs(); return toNum(a[0] as any); }
      case "FIND": case "TROUVE": {
        const a = this.collectArgs();
        const needle = String(a[0] ?? "");
        const haystack = String(a[1] ?? "");
        const start = a.length > 2 ? toNum(a[2] as any) - 1 : 0;
        const idx = haystack.indexOf(needle, start);
        if (idx === -1) throw new Error("#VALUE!");
        return idx + 1;
      }
      case "SEARCH": case "CHERCHE": {
        const a = this.collectArgs();
        const needle = String(a[0] ?? "").toLowerCase();
        const haystack = String(a[1] ?? "").toLowerCase();
        const start = a.length > 2 ? toNum(a[2] as any) - 1 : 0;
        const idx = haystack.indexOf(needle, start);
        if (idx === -1) throw new Error("#VALUE!");
        return idx + 1;
      }
      case "REPT": case "REPT": {
        const a = this.collectArgs();
        return String(a[0] ?? "").repeat(toNum(a[1] as any));
      }

      // ─── Lookup ───
      case "VLOOKUP": case "RECHERCHEV": {
        const a = this.collectArgs();
        const searchVal = a[0] as number | string;
        const table = a[1] as (number | string)[];
        const colIdx = toNum(a[2] as any);
        // table is flattened from a range — we need to figure out dimensions
        // This is a simplified version
        throw new Error("VLOOKUP requires range context");
      }

      // ─── Date (basic) ───
      case "TODAY": case "AUJOURDHUI": { this.collectArgs(); const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
      case "NOW": case "MAINTENANT": { this.collectArgs(); return new Date().toLocaleString(); }
      case "YEAR": case "ANNEE": { const a = this.collectArgs(); return new Date(String(a[0])).getFullYear(); }
      case "MONTH": case "MOIS": { const a = this.collectArgs(); return new Date(String(a[0])).getMonth() + 1; }
      case "DAY": case "JOUR": { const a = this.collectArgs(); return new Date(String(a[0])).getDate(); }

      default:
        // Try to consume args anyway to not leave parser in bad state
        this.collectArgs();
        throw new Error(`#NAME? (${name})`);
    }
  }
}

// ─── Criteria matching for COUNTIF/SUMIF ───

function matchesCriteria(value: number | string, criteria: string): boolean {
  // Check for operator prefix: ">5", "<=10", "<>hello"
  const opMatch = criteria.match(/^(<>|>=|<=|>|<|=)(.*)$/);
  if (opMatch) {
    const op = opMatch[1];
    const crit = opMatch[2];
    const numCrit = Number(crit);
    const numVal = Number(value);
    const useNum = !isNaN(numCrit) && !isNaN(numVal);
    switch (op) {
      case "=": return useNum ? numVal === numCrit : String(value) === crit;
      case "<>": return useNum ? numVal !== numCrit : String(value) !== crit;
      case ">": return useNum ? numVal > numCrit : false;
      case "<": return useNum ? numVal < numCrit : false;
      case ">=": return useNum ? numVal >= numCrit : false;
      case "<=": return useNum ? numVal <= numCrit : false;
    }
  }
  // Wildcard: * and ?
  if (criteria.includes("*") || criteria.includes("?")) {
    const regex = new RegExp("^" + criteria.replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
    return regex.test(String(value));
  }
  // Exact match
  const numCrit = Number(criteria);
  if (!isNaN(numCrit) && !isNaN(Number(value))) return Number(value) === numCrit;
  return String(value).toLowerCase() === criteria.toLowerCase();
}

function countIf(range: (number | string)[], criteria: string): number {
  return range.filter((v) => matchesCriteria(v, criteria)).length;
}

// ─── Public API ───

/** Evaluate a single cell. Handles formula detection and circular ref protection. */
function evalCell(r: number, c: number, data: string[][], visited: Set<string>): number | string {
  const key = `${r},${c}`;
  if (visited.has(key)) throw new Error("#CIRC!");
  visited.add(key);

  const raw = data[r]?.[c] ?? "";
  if (!raw.startsWith("=")) {
    visited.delete(key);
    // Return as number if possible
    const n = Number(raw);
    if (raw !== "" && !isNaN(n)) { visited.delete(key); return n; }
    visited.delete(key);
    return raw;
  }

  const formula = raw.slice(1); // strip '='
  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens, { data, visited, evalCell });
    const result = parser.parse();
    visited.delete(key);
    return result;
  } catch (e: any) {
    visited.delete(key);
    throw e;
  }
}

/** Compute display value for a cell. Returns the formatted result or error string. */
export function computeCell(r: number, c: number, data: string[][]): string {
  const raw = data[r]?.[c] ?? "";
  if (!raw.startsWith("=")) return raw;

  try {
    const result = evalCell(r, c, data, new Set());
    if (typeof result === "number") {
      // Format: avoid floating point noise
      if (Number.isInteger(result)) return String(result);
      return String(Math.round(result * 1e10) / 1e10);
    }
    return String(result);
  } catch (e: any) {
    return e.message || "#ERROR!";
  }
}

/** Check if a cell contains a formula */
export function isFormula(raw: string): boolean {
  return raw.startsWith("=");
}
