import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const maxDuration = 60;

// Modèles autorisés (menu déroulant côté client)
const ALLOWED_MODELS = new Set(["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
const DEFAULT_MODEL = "gpt-5.6-terra";

const MAX_DOCS = 15;
const MAX_TEXT_PER_DOC = 20000;
const MAX_TOTAL_TEXT = 120000;
const MAX_IMAGES = 4;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface FolderDoc {
  id: string;
  title?: string;
  doc_type?: string;
  observation?: string;
  content?: string;
  image_url?: string;
}

function stripTags(html: string): string {
  return html
    // Les images base64 (présentations, dessins) n'apportent rien au texte et pèsent des Mo.
    .replace(/data:[a-zA-Z0-9/+.;=-]{100,}/g, "(image)")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Recharge les documents côté serveur : la liste MyDrive côté client est
// volontairement chargée sans `content` (performance), on le récupère ici
// avec le token de l'utilisateur (RLS respecté).
async function fetchDocs(req: NextRequest, ids: string[]): Promise<FolderDoc[]> {
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
    console.error("folder-assistant fetchDocs:", r.status, await r.text());
    return [];
  }
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

// Extrait le texte d'un fichier stocké (PDF, Word, PowerPoint, texte) depuis son URL.
async function extractFromUrl(url: string, title: string): Promise<string> {
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
    console.error("folder-assistant extraction:", title, e);
    return "";
  }
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|heic|avif)$/.test(url.toLowerCase().split("?")[0]);
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { question, history, model: reqModel, folderTitle, docIds, docs } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question requise" }, { status: 400 });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Clé API OpenAI manquante" }, { status: 500 });

    const model = ALLOWED_MODELS.has(reqModel) ? reqModel : DEFAULT_MODEL;
    // Chemin normal : ids → rechargés en base avec leur content complet.
    // Fallback : liste de docs envoyée par un client pas encore à jour.
    const ids: string[] = (Array.isArray(docIds) ? docIds : []).map(String).slice(0, MAX_DOCS);
    const list: FolderDoc[] = ids.length > 0
      ? await fetchDocs(req, ids)
      : (Array.isArray(docs) ? docs : []).slice(0, MAX_DOCS);

    // Construit le contexte : contenu des documents du dossier
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
          if (imageParts.length < MAX_IMAGES) {
            imageParts.push({ type: "image_url", image_url: { url: d.image_url } });
            body = "(image fournie en vision ci-dessous)";
          } else {
            body = "(image non incluse : limite atteinte)";
          }
        } else {
          body = await extractFromUrl(d.image_url, title);
        }
      }
      if (!body && d.observation) body = "";
      const obs = d.observation ? `\nDescription : ${String(d.observation).slice(0, 1000)}` : "";
      const block = `\n\n===== Document : « ${title} »${d.doc_type ? ` (${d.doc_type})` : ""} =====${obs}\n${body || "(contenu non lisible)"}\n===== fin de « ${title} » =====`;
      context += block;
      total += block.length;
    }

    const messages: any[] = [
      {
        role: "system",
        content:
          "Tu es l'assistant IA d'un dossier de MyDrive (GED personnelle). " +
          "On te fournit le contenu des documents du dossier ouvert : tes réponses doivent s'appuyer UNIQUEMENT sur ces documents. " +
          "Cite le titre du ou des documents sur lesquels tu t'appuies (ex. « D'après “Avis d'appel octobre 2026”… »). " +
          "Si l'information demandée ne figure dans aucun document du dossier, dis-le clairement au lieu d'inventer. " +
          "Réponds en français, de façon concise et factuelle (dates, montants, noms exacts).",
      },
      ...((history || []) as { role: string; text: string }[]).slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
    ];

    const userText =
      `Dossier ouvert : « ${String(folderTitle || "Sans dossier").slice(0, 200)} » (${list.length} document(s)).\n` +
      `Contenu des documents :${context || "\n(aucun document lisible)"}\n\nQuestion : ${question}`;

    messages.push({
      role: "user",
      content: imageParts.length > 0 ? [{ type: "text", text: userText }, ...imageParts] : userText,
    });

    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_completion_tokens: 4000 }),
    });

    if (!res.ok) {
      console.error("folder-assistant OpenAI error:", await res.text());
      return NextResponse.json({ error: "Erreur de l'API OpenAI" }, { status: res.status });
    }

    const data = await res.json();
    const reply: string = data.choices?.[0]?.message?.content || "";
    if (!reply) return NextResponse.json({ error: "Réponse vide de l'IA." }, { status: 502 });

    return NextResponse.json({ reply, model });
  } catch (e) {
    console.error("folder-assistant error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
