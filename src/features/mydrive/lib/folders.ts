"use client";
import { supabase } from "@/lib/supabaseClient";

export type FolderLite = { id: string; title: string; parent_id: string | null };

export async function createFolder(name: string, parentId: string | null): Promise<FolderLite> {
  const { data, error } = await supabase
    .from("MyDrive")
    .insert({
      title: name,
      type: "folder",
      doc_type: null,
      image_path: "",
      image_url: "",
      observation: "",
      content: "",
      parent_id: parentId,
    })
    .select("id, title, parent_id")
    .single();
  if (error) throw new Error(error.message);
  return data as FolderLite;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("MyDrive").update({ title: name }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from("MyDrive").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function moveItem(id: string, parentId: string | null): Promise<void> {
  const { error } = await supabase.from("MyDrive").update({ parent_id: parentId }).eq("id", id);
  if (error) throw new Error(error.message);
}
