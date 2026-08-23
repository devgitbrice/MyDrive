import { supabase } from "@/lib/supabaseClient";
import type { MyDriveItem, Tag } from "@/features/mydrive/types";

/**
 * Récupère tous les documents MyDrive avec leurs tags
 */
export async function fetchMyDrive(): Promise<MyDriveItem[]> {
  const { data, error } = await supabase
    .from("MyDrive")
    .select(
      `
      id,
      title,
      observation,
      image_path,
      image_url,
      content,
      doc_type,
      type,
      parent_id,
      created_at,
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
      content: row.content || "",
      created_at: row.created_at,
      type: row.type || "file",
      doc_type: row.doc_type || "scan",
      parent_id: row.parent_id ?? null,
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
