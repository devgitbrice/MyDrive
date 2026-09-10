import { supabase } from "@/lib/supabaseClient";

type CreateRowInput = {
  title: string;
  observation: string;
  imagePath: string;
  imageUrl: string;
};

function getCurrentFolderIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )mydrive-parent=([^;]*)/);
  const v = match ? decodeURIComponent(match[1]) : "";
  if (!v || v === "__unfiled__") return null;
  return v;
}

export async function createMyDriveRow(input: CreateRowInput): Promise<string> {
  const parentId = getCurrentFolderIdFromCookie();
  const { data, error } = await supabase
    .from("MyDrive")
    .insert({
      title: input.title,
      observation: input.observation,
      image_path: input.imagePath,
      image_url: input.imageUrl,
      parent_id: parentId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`DB insert failed: ${error.message}`);
  }
  return data.id as string;
}
