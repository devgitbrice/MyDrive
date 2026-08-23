import { supabase } from "@/lib/supabaseClient";

type UploadResult = {
  imagePath: string;
  publicUrl: string;
};

function getSafeExtension(file: File) {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
  };
  return byMime[file.type] ?? "jpg";
}

/**
 * Upload un fichier vers le bucket MyDrive.
 * onProgress reçoit un pourcentage 0→100 pendant l'upload réel (via XHR).
 */
export async function uploadToMyDrive(
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  const bucket = "MyDrive";

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");

  const ext = getSafeExtension(file);
  const filename = `${crypto.randomUUID()}.${ext}`;
  const imagePath = `${yyyy}/${mm}/${filename}`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(imagePath)}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl, true);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("cache-control", "3600");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        reject(new Error(`Upload Storage failed (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'upload"));
    xhr.send(file);
  });

  const { data } = supabase.storage.from(bucket).getPublicUrl(imagePath);

  if (!data?.publicUrl) {
    throw new Error("Could not generate public URL for uploaded image.");
  }

  return { imagePath, publicUrl: data.publicUrl };
}
