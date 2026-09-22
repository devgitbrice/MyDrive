import { NextRequest } from "next/server";

// Contexte documentaire partagé entre /api/folder-assistant (chat texte)
// et /api/realtime-token (voix temps réel).

export const MAX_DOCS = 15;
export const MAX_TEXT_PER_DOC = 20000;
export const MAX_TOTAL_TEXT = 120000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export interface FolderDoc {
  id: string;
  title?: string;
  doc_type?: string;
  observation?: string;
  content?: string;
  image_url?: string;
}

export function stripTags(html: string): string {
  return html
    // Les images base64 (présentations, dessins) n'apportent rien au texte et pèsent des Mo.
    .replace(/data:[a-zA-Z0-9/+.;=-]{100,}/g, "(image)")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|heic|avif)$/.test(url.toLowerCase().split("?")[0]);
}

// Recharge les documents côté serveur : la liste MyDrive côté client est
// volontairement chargée sans `content` (performance), on le récupère ici
// avec le token de l'utilisateur (RLS respecté).
export async function fetchDocs(req: NextRequest, ids: string[]): Promise<FolderDoc[]> {
  const token = (req.headers.get("x-supabase-auth") || "").replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon || ids.length === 0) return [];
  const filter = ids.map((i) => encodeURIComponent(i)).join(",");
  const r = await fetch(
    `${url}/rest/v1/MyDrive?id=in.(${filter})&select=id,title,doc_type,observation,content,image_url`,
    { headers: { apikey: anon, Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) {
    console.error("folderContext fetchDocs:", r.status, await r.text());
    return [];
  }
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

// Extrait le texte d'un fichier stocké (PDF, Word, PowerPoint, texte) depuis son URL.
export async function extractFromUrl(url: string, title: string): Promise<string> {
  const lower = url.toLowerCase().split("?")[0];
  const isPdf = lower.endsWith(".pdf");
  const isDocx = lower.endsWith(".docx");
  const isPptx = lower.endsWith(".pptx");
  const isText = /\.(txt|md|csv)$/.test(lower);
  if (!isPdf && !isDocx && !isPptx && !isText) return "";
  try {
    const r = await fetch(url);
    if (!r.ok) return "";
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_FILE_BYTES) return "(fichier trop volumineux pour être lu)";
    const buf = Buffer.from(ab);
    if (isPdf) {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
      return String(text || "").slice(0, MAX_TEXT_PER_DOC);
    }
    if (isDocx) {
      const mammoth = (await import("mammoth")).default;
      const r2 = await mammoth.extractRawText({ buffer: buf });
      return String(r2.value || "").slice(0, MAX_TEXT_PER_DOC);
    }
    if (isPptx) {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buf);
      const slides = Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]));
      const parts: string[] = [];
      for (const sn of slides) {
        const xml = await zip.files[sn].async("string");
        parts.push([...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" "));
      }
      return parts.join("\n").slice(0, MAX_TEXT_PER_DOC);
    }
    return buf.toString("utf8").slice(0, MAX_TEXT_PER_DOC);
  } catch (e) {
    console.error("folderContext extraction:", title, e);
    return "";
  }
}

/**
 * Construit le texte de contexte des documents (+ images pour la vision quand
 * `maxImages` > 0 ; en voix temps réel, les images ne sont pas transmises).
 */
export async function buildDocsContext(list: FolderDoc[], maxImages: number): Promise<{ context: string; imageParts: any[] }> {
  let context = "";
  const imageParts: any[] = [];
  let total = 0;
  for (const d of list) {
    if (total >= MAX_TOTAL_TEXT) break;
    const title = String(d.title || "(sans titre)").slice(0, 200);
    let body = "";
    if (typeof d.content === "string" && d.content.trim()) {
      body = stripTags(d.content).slice(0, MAX_TEXT_PER_DOC);
    } else if (typeof d.image_url === "string" && d.image_url.startsWith("http")) {
      if (isImageUrl(d.image_url)) {
        if (imageParts.length < maxImages) {
          imageParts.push({ type: "image_url", image_url: { url: d.image_url } });
          body = "(image fournie en vision ci-dessous)";
        } else {
          body = maxImages > 0 ? "(image non incluse : limite atteinte)" : "(image non lisible en mode vocal)";
        }
      } else {
        body = await extractFromUrl(d.image_url, title);
      }
    }
    const obs = d.observation ? `\nDescription : ${String(d.observation).slice(0, 1000)}` : "";
    const block = `\n\n===== Document : « ${title} »${d.doc_type ? ` (${d.doc_type})` : ""} [id: ${d.id}] =====${obs}\n${body || "(contenu non lisible)"}\n===== fin de « ${title} » =====`;
    context += block;
    total += block.length;
  }
  return { context, imageParts };
}
