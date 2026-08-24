import { supabase } from "@/lib/supabaseClient";
import type { MyDriveItem, Tag } from "@/features/mydrive/types";

/**
 * Récupère tous les documents MyDrive avec leurs tags — SANS le champ `content`
 * (qui peut peser plusieurs Mo pour les docs).
 *
 * Le champ `content` n'est utile que pour :
 *   - les vignettes de présentation dans la galerie → chargées à part ci-dessous
 *   - les éditeurs (edit*), qui font leur propre fetch par id
 */
export async function fetchMyDrive(): Promise<MyDriveItem[]> {
  // 1) Métadonnées légères (pas de content) pour tous les items
  const { data, error } = await supabase
    .from("MyDrive")
    .select(
      `
      id,
      title,
      observation,
      image_path,
      image_url,
      doc_type,
      type,
      parent_id,
      created_at,
      code,
      mydrive_tags (
        tags (
          id,
          name,
          created_at
        )
      )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchMyDrive error:", error);
    throw new Error("Impossible de charger MyDrive.");
  }

  // 2) Contenu ciblé uniquement pour les présentations (utile pour les mini-slides)
  const { data: presContents } = await supabase
    .from("MyDrive")
    .select("id, content")
    .eq("doc_type", "presentation");

  const presContentMap = new Map<string, string>();
  (presContents ?? []).forEach((row: any) => {
    if (row?.id) presContentMap.set(row.id, row.content || "");
  });

  return (data ?? []).map((row: any) => {
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
