"use client";
import { supabase } from "@/lib/supabaseClient";
import type { MyDriveItem } from "@/features/mydrive/types";

/**
 * Miroirs : un même dossier ou fichier rangé à plusieurs endroits.
 *
 * Le miroir est une ligne « alias » sans contenu propre, qui pointe vers
 * l'élément d'origine. Comme l'affichage résout l'alias, l'original et ses
 * miroirs sont littéralement le même fichier : une modification faite depuis
 * l'un est visible depuis l'autre.
 */

/**
 * Vérifie qu'un miroir de `item` peut être créé dans `destParentId`.
 * Renvoie le motif du refus, ou null si l'opération est possible.
 */
export function mirrorBlocker(
  item: MyDriveItem,
  destParentId: string | null,
  items: MyDriveItem[]
): string | null {
  if ((item.parent_id ?? null) === destParentId) {
    return "L'élément est déjà rangé ici.";
  }

  const dejaPresent = items.some(
    (i) => (i.parent_id ?? null) === destParentId && i.id === item.id
  );
  if (dejaPresent) {
    return "Ce dossier contient déjà cet élément.";
  }

  if (item.type === "folder") {
    if (item.id === destParentId) {
      return "Un dossier ne peut pas contenir son propre miroir.";
    }
    // Interdit de refléter un dossier dans l'un de ses propres sous-dossiers :
    // cela créerait une boucle infinie à la navigation.
    let cur: string | null = destParentId;
    let guard = 0;
    while (cur && guard++ < 100) {
      if (cur === item.id) {
        return "Impossible : la destination est à l'intérieur du dossier à refléter.";
      }
      cur = items.find((i) => i.id === cur)?.parent_id ?? null;
    }
  }

  return null;
}

/** Crée un miroir de `item` dans le dossier `destParentId`. */
export async function createMirror(
  item: MyDriveItem,
  destParentId: string | null
): Promise<void> {
  const { error } = await supabase.from("MyDrive").insert({
    title: item.title,
    type: "alias",
    target_id: item.id,
    parent_id: destParentId,
    doc_type: null,
    image_path: "",
    image_url: "",
    observation: "",
    content: "",
  });

  if (error) {
    // 42703 / PGRST204 = colonne target_id absente : migration pas encore lancée
    if (error.code === "42703" || error.code === "PGRST204") {
      throw new Error(
        "Colonne `target_id` absente : applique d'abord la migration SQL des miroirs."
      );
    }
    if (error.code === "23505") {
      throw new Error("Ce dossier contient déjà un miroir de cet élément.");
    }
    throw new Error(error.message);
  }
}

/** Supprime un miroir. L'élément d'origine n'est pas touché. */
export async function deleteMirror(aliasId: string): Promise<void> {
  const { error } = await supabase.from("MyDrive").delete().eq("id", aliasId);
  if (error) throw new Error(error.message);
}
