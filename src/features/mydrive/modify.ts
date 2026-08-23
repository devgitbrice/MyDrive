"use server";

import { supabase } from "@/lib/supabaseClient";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

async function getCurrentFolderId(): Promise<string | null> {
  try {
    const store = await cookies();
    const v = store.get("mydrive-parent")?.value;
    if (!v || v === "" || v === "__unfiled__") return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * METTRE À JOUR UN ITEM (Titre, Observation, etc.)
 */
export async function updateDriveItemAction(id: string, updates: Record<string, any>) {
  const { error } = await supabase
    .from("MyDrive") 
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Erreur update Supabase:", error);
    throw new Error("Erreur lors de la mise à jour");
  }

  revalidatePath("/mydrive");
}

/**
 * REMPLACER UNE IMAGE DANS LE STORAGE ET LA DB
 */
export async function replaceImageAction(id: string, imagePath: string, imageData: string) {
  if (!imagePath) {
    throw new Error("Chemin de l'image manquant");
  }

  const parts = imageData.split(",");
  if (parts.length < 2 || !parts[1]) {
    throw new Error("Données image invalides");
  }
  const bytes = Buffer.from(parts[1], "base64");

  const { error: uploadError } = await supabase.storage
    .from("MyDrive")
    .upload(imagePath, bytes, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "3600",
    });

  if (uploadError) {
    console.error("Erreur upload nouveau fichier:", uploadError);
    throw new Error("Erreur lors de l'upload du nouveau fichier");
  }

  const { data } = supabase.storage.from("MyDrive").getPublicUrl(imagePath);
  const newUrl = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;

  if (newUrl) {
    const { error: updateError } = await supabase
      .from("MyDrive")
      .update({ image_url: newUrl })
      .eq("id", id);

    if (updateError) console.error("Erreur update URL:", updateError);
  }

  revalidatePath("/mydrive");
  return { success: true, newUrl };
}

/**
 * GESTION DES TAGS (Création, Ajout, Suppression)
 */
export async function createTagAction(name: string) {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) throw new Error("Nom du tag vide");

  const { data: existing } = await supabase
    .from("tags")
    .select("id, name, created_at")
    .eq("name", trimmed)
    .single();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("tags")
    .insert({ name: trimmed })
    .select("id, name, created_at")
    .single();

  if (error) {
    console.error("Erreur création tag:", error);
    throw new Error("Erreur lors de la création du tag");
  }

  revalidatePath("/mydrive");
  return data;
}

export async function addTagToItemAction(mydriveId: string, tagId: string) {
  const { error } = await supabase
    .from("mydrive_tags")
    .insert({ mydrive_id: mydriveId, tag_id: tagId });

  if (error && !error.message.includes("duplicate")) {
    console.error("Erreur ajout tag:", error);
    throw new Error("Erreur lors de l'ajout du tag");
  }
  revalidatePath("/mydrive");
}

export async function removeTagFromItemAction(mydriveId: string, tagId: string) {
  const { error } = await supabase
    .from("mydrive_tags")
    .delete()
    .eq("mydrive_id", mydriveId)
    .eq("tag_id", tagId);

  if (error) {
    console.error("Erreur suppression tag:", error);
    throw new Error("Erreur lors de la suppression du tag");
  }
  revalidatePath("/mydrive");
}

/**
 * METTRE À JOUR LE CONTENU TEXTE (Doc, Python, Table)
 */
export async function updateDriveContentAction(id: string, content: string) {
  const { error } = await supabase
    .from("MyDrive")
    .update({ content })
    .eq("id", id);

  if (error) {
    console.error("Erreur update content:", error);
    throw new Error("Erreur lors de la mise à jour du contenu");
  }
  revalidatePath("/mydrive");
}

/**
 * SUPPRIMER UN ITEM (Fichier + Ligne DB)
 */
export async function deleteDriveItemAction(id: string, imagePath: string) {
  if (imagePath) {
    await supabase.storage.from("MyDrive").remove([imagePath]);
  }

  const { error: dbError } = await supabase
    .from("MyDrive")
    .delete()
    .eq("id", id);

  if (dbError) {
    console.error("Erreur suppression DB:", dbError);
    throw new Error("Erreur lors de la suppression de l'entrée");
  }

  revalidatePath("/mydrive");
}

/**
 * --- CRÉATION MINDMAP ---
 */
export async function createMindmapAction(input: {
  title: string;
  content: string;
  observation?: string;
}) {
  const parentId = await getCurrentFolderId();
  const { data, error } = await supabase
    .from("MyDrive")
    .insert([
      {
        title: input.title,
        content: input.content,
        observation: input.observation || "",
        doc_type: "mindmap",
        type: "file",
        parent_id: parentId,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("ERREUR CRÉATION MINDMAP (Supabase):", error.message, error.details);
    throw new Error(`Erreur Supabase: ${error.message}`);
  }

  revalidatePath("/mydrive");
  return { success: true, id: data.id };
}

/**
 * RECHERCHER DES FICHIERS PAR TITRE (pour Cmd+K)
 */
export async function searchDriveItemsAction(query: string) {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 3) return [];

  const { data, error } = await supabase
    .from("MyDrive")
    .select("id, title, doc_type, type")
    .ilike("title", `%${trimmed}%`)
    .limit(10);

  if (error) {
    console.error("Erreur recherche MyDrive:", error);
    return [];
  }

  return data || [];
}

/**
 * --- CRÉATION VOYAGE ---
 */
export async function createVoyageAction(title: string) {
  const parentId = await getCurrentFolderId();
  const { data, error } = await supabase
    .from("MyDrive")
    .insert({
      title,
      content: JSON.stringify({ trajets: [], logements: [] }),
      observation: "",
      image_path: "",
      image_url: "",
      doc_type: "voyage",
      type: "file",
      parent_id: parentId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("ERREUR CRÉATION VOYAGE (Supabase):", error.message, error.details, error.hint);
    return { success: false as const, error: error.message };
  }

  return { success: true as const, id: data.id };
}

/**
 * --- CRÉATION SCRIPT PYTHON ---
 */
export async function createPythonScriptAction(input: {
  title: string;
  content: string;
  observation?: string;
  tagIds?: string[];
}) {
  const parentId = await getCurrentFolderId();
  const { data, error } = await supabase
    .from("MyDrive")
    .insert([
      {
        title: input.title,
        content: input.content,
        observation: input.observation || "",
        doc_type: "python",
        type: "file",
        parent_id: parentId,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("ERREUR CRÉATION PYTHON (Supabase):", error.message, error.details);
    throw new Error(`Erreur Supabase: ${error.message}`);
  }

  if (input.tagIds && input.tagIds.length > 0) {
    const tagLinks = input.tagIds.map(tagId => ({
      mydrive_id: data.id,
      tag_id: tagId
    }));
    
    const { error: tagError } = await supabase
      .from("mydrive_tags")
      .insert(tagLinks);

    if (tagError) {
      console.error("Erreur liaison tags Python:", tagError);
    }
  }

  revalidatePath("/mydrive");
  return { success: true, id: data.id };
}
