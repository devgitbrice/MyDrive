"use server";

import { supabase } from "@/lib/supabaseClient";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

type DocType = "doc" | "mindmap" | "table" | "presentation";

type CreateDocInput = {
  title: string;
  content: string;
  doc_type: DocType;
  observation?: string;
};

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

export async function createDocRow(input: CreateDocInput): Promise<string> {
  const parentId = await getCurrentFolderId();
  const { data, error } = await supabase
    .from("MyDrive")
    .insert({
      title: input.title,
      content: input.content,
      observation: input.observation || "",
      image_path: "",
      image_url: "",
      doc_type: input.doc_type,
      parent_id: parentId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`DB insert failed: ${error.message}`);
  }

  revalidatePath("/mydrive");
  return data.id;
}
