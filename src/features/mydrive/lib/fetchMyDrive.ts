import { supabase } from "@/lib/supabaseClient";
import type { MyDriveItem, Tag } from "@/features/mydrive/types";

const BASE_FIELDS = `
      id,
      title,
      observation,
      image_path,
      image_url,
      doc_type,
      type,
      parent_id,
      created_at
`;

/** Champs optionnels : absents tant que leur migration SQL n'a pas été lancée. */
const OPTIONAL_FIELDS = ["code", "target_id"];

const TAGS_FIELDS = `
      mydrive_tags (
        tags (
          id,
          name,
          created_at
        )
      )
`;

/**
 * Résout les miroirs : une ligne portant un `target_id` n'a pas de contenu
 * propre, elle désigne un élément existant rangé ailleurs. On renvoie donc
 * l'élément cible, mais placé dans le dossier du miroir.
 *
 * Conséquence voulue : original et miroirs partagent le même id, donc le même
 * contenu et le même code — modifier l'un revient à modifier l'autre.
 */
type Row = {
  id: string;
  target_id?: string | null;
  parent_id?: string | null;
  [key: string]: unknown;
};

function resolveMirrors(rows: Row[]): Row[] {
  const byId = new Map<string, Row>(rows.map((r) => [r.id, r]));
  const out: Row[] = [];

  for (const row of rows) {
    if (!row.target_id) {
      out.push(row);
      continue;
    }

    // Un miroir de miroir remonte jusqu'à l'élément réel.
    let target = byId.get(row.target_id);
    let depth = 0;
    while (target?.target_id && depth++ < 5) target = byId.get(target.target_id);

    // Cible supprimée : on ignore le miroir orphelin.
    if (!target || target.target_id) continue;

    out.push({
      ...target,
      parent_id: row.parent_id ?? null,
      alias_id: row.id,
      is_mirror: true,
    });
  }

  return out;
}

/**
 * Récupère tous les documents MyDrive avec leurs tags — SANS le champ `content`
 * (qui peut peser plusieurs Mo pour les docs).
 *
 * Le champ `content` n'est utile que pour :
 *   - les vignettes de présentation dans la galerie → chargées à part ci-dessous
 *   - les éditeurs (edit*), qui font leur propre fetch par id
 */
export async function fetchMyDrive(): Promise<MyDriveItem[]> {
  // 1) Métadonnées légères (pas de content) pour tous les items.
  //    Si une migration optionnelle n'a pas été appliquée, on retente sans
  //    ses colonnes plutôt que de casser toute la page.
  const select = (fields: string[]) =>
    supabase
      .from("MyDrive")
      .select([BASE_FIELDS, ...fields, TAGS_FIELDS].join(",\n"))
      .order("created_at", { ascending: false });

  let { data, error } = await select(OPTIONAL_FIELDS);

  if (error) {
    // Au moins une migration optionnelle n'est pas appliquée. On teste chaque
    // colonne séparément pour ne garder que celles qui manquent réellement :
    // un `target_id` absent ne doit pas faire perdre les codes personnalisés.
    const supported: string[] = [];
    for (const field of OPTIONAL_FIELDS) {
      const probe = await supabase.from("MyDrive").select(field).limit(1);
      if (!probe.error) supported.push(field);
    }
    console.warn(
      `fetchMyDrive: colonnes absentes [${OPTIONAL_FIELDS.filter((f) => !supported.includes(f)).join(", ")}] — migration SQL à appliquer.`
    );
    ({ data, error } = await select(supported));
  }

  if (error) {
    console.error("fetchMyDrive error:", error);
    throw new Error("Impossible de charger MyDrive.");
  }

  const rows = resolveMirrors((data ?? []) as unknown as Row[]);

  // 2) Contenu ciblé uniquement pour les présentations (utile pour les mini-slides)
  const { data: presContents } = await supabase
    .from("MyDrive")
    .select("id, content")
    .eq("doc_type", "presentation");

  const presContentMap = new Map<string, string>();
  (presContents ?? []).forEach((row: any) => {
    if (row?.id) presContentMap.set(row.id, row.content || "");
  });

  return rows.map((row: any) => {
    const flattenedTags = (row.mydrive_tags || [])
      .map((mt: any) => mt.tags)
      .filter(Boolean);

    return {
      id: row.id,
      title: row.title,
      observation: row.observation || "",
      image_path: row.image_path || "",
      image_url: row.image_url || "",
      content: presContentMap.get(row.id) || "",
      created_at: row.created_at,
      type: row.type || "file",
      doc_type: row.doc_type || "scan",
      parent_id: row.parent_id ?? null,
      code: row.code ?? null,
      alias_id: row.alias_id ?? null,
      is_mirror: row.is_mirror === true,
      tags: flattenedTags,
    };
  });
}

/**
 * Récupère tous les tags existants
 */
export async function fetchAllTags(): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, created_at")
    .order("name", { ascending: true });

  if (error) {
    console.error("fetchAllTags error:", error);
    throw new Error("Impossible de charger les tags.");
  }

  return data ?? [];
}
