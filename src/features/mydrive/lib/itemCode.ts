/**
 * Code court à 3 lettres (AAA → ZZZ) associé à chaque dossier / fichier MyDrive.
 *
 * Le code est dérivé de l'id de l'élément : il est donc stable dans le temps,
 * identique sur tous les appareils, et ne nécessite aucune colonne en base.
 * Les collisions (26³ = 17576 codes possibles) sont résolues de façon
 * déterministe par buildCodeMap.
 */

const ALPHABET_SIZE = 26;
const TOTAL_CODES = ALPHABET_SIZE * ALPHABET_SIZE * ALPHABET_SIZE; // 17576

/** Hash FNV-1a 32 bits, stable et sans dépendance. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Convertit un entier en code 3 lettres majuscules. */
function numberToCode(value: number): string {
  const n = ((value % TOTAL_CODES) + TOTAL_CODES) % TOTAL_CODES;
  return (
    String.fromCharCode(65 + Math.floor(n / (ALPHABET_SIZE * ALPHABET_SIZE))) +
    String.fromCharCode(65 + (Math.floor(n / ALPHABET_SIZE) % ALPHABET_SIZE)) +
    String.fromCharCode(65 + (n % ALPHABET_SIZE))
  );
}

/**
 * Code "naturel" d'un élément, sans gestion de collision.
 * Sert de repli quand la liste complète des éléments n'est pas disponible.
 */
export function codeFromId(id: string): string {
  return numberToCode(fnv1a(id));
}

type CodableItem = { id: string; created_at?: string };

/**
 * Attribue un code unique à chaque élément.
 *
 * L'attribution se fait par ancienneté croissante : un élément déjà présent
 * conserve son code quand de nouveaux éléments sont ajoutés (seul le nouvel
 * arrivant se décale en cas de collision).
 */
export function buildCodeMap(items: CodableItem[]): Record<string, string> {
  const ordered = [...items].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    if (Number.isNaN(ta) || Number.isNaN(tb) || ta === tb) return a.id.localeCompare(b.id);
    return ta - tb;
  });

  const used = new Set<string>();
  const map: Record<string, string> = {};

  for (const item of ordered) {
    if (!item?.id || map[item.id]) continue;
    const base = fnv1a(item.id);
    let code = numberToCode(base);
    // Sondage linéaire déterministe si le code est déjà pris.
    for (let offset = 1; used.has(code) && offset < TOTAL_CODES; offset++) {
      code = numberToCode(base + offset);
    }
    used.add(code);
    map[item.id] = code;
  }

  return map;
}

/**
 * Texte réellement placé dans le presse-papier quand on clique sur un code.
 * Format prêt à coller dans un chat : Dans le code "ABC" fais ça :
 */
export function copyTextForCode(code: string): string {
  return `Dans le code "${code}" fais ça : `;
}
