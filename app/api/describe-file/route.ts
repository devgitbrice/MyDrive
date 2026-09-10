import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const maxDuration = 60;

const MAX_TEXT = 60000;

// Extrait le texte d'un fichier (PDF, Word, PowerPoint, texte). Les images passent en vision.
async function extractText(name: string, type: string, buf: Buffer): Promise<string> {
  const lower = name.toLowerCase();
  try {
    if (type === "application/pdf" || lower.endsWith(".pdf")) {
      const { extractText: ex } = await import("unpdf");
      const { text } = await ex(new Uint8Array(buf), { mergePages: true });
      return String(text || "").slice(0, MAX_TEXT);
    }
    if (lower.endsWith(".docx") || type.includes("wordprocessingml")) {
      const mammoth = (await import("mammoth")).default;
      const r = await mammoth.extractRawText({ buffer: buf });
      return String(r.value || "").slice(0, MAX_TEXT);
    }
    if (lower.endsWith(".pptx") || type.includes("presentationml")) {
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
      return parts.join("\n").slice(0, MAX_TEXT);
    }
    if (lower.endsWith(".txt") || lower.endsWith(".md") || type.startsWith("text/")) {
      return buf.toString("utf8").slice(0, MAX_TEXT);
    }
  } catch (e) {
    console.error("describe-file extraction failed:", name, e);
  }
  return "";
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { name, type, data, existingTags } = await req.json();
    if (typeof data !== "string" || !data) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Clé API OpenAI manquante" }, { status: 500 });

    const fileName = String(name || "document");
    const fileType = String(type || "");
    const tags: string[] = Array.isArray(existingTags) ? existingTags.map(String).slice(0, 300) : [];

    const isImage = fileType.startsWith("image/");
    let contextText = "";
    if (!isImage) {
      const buf = Buffer.from(data, "base64");
      contextText = await extractText(fileName, fileType, buf);
      if (!contextText.trim()) {
        return NextResponse.json({ error: "Impossible d'extraire le texte de ce fichier." }, { status: 422 });
      }
    }

    const system =
      "Tu analyses un document pour la GED personnelle de l'utilisateur. Réponds UNIQUEMENT en JSON strict : " +
      '{"description": "...", "tags": ["...", "..."]}. ' +
      "description : environ 100 mots, en français, factuelle (nature du document, parties/personnes, objet, dates et montants importants). " +
      "tags : 3 à 6 mots-clés en minuscules. RÈGLE IMPORTANTE : réutilise en priorité les mots-clés EXISTANTS fournis quand ils correspondent au contenu (reprends-les à l'identique), et n'ajoute de nouveaux mots-clés courts (1-2 mots) que si nécessaire. " +
      (tags.length ? `Mots-clés existants : ${tags.join(", ")}` : "Aucun mot-clé existant pour l'instant.");

    const userContent: any = isImage
      ? [
          { type: "text", text: `Document : « ${fileName} » (image ci-dessous). Analyse-la.` },
          { type: "image_url", image_url: { url: `data:${fileType};base64,${data}` } },
        ]
      : `Document : « ${fileName} »\n\nContenu extrait :\n${contextText}`;

    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6-terra",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        max_completion_tokens: 1500,
      }),
    });

    if (!res.ok) {
      console.error("describe-file OpenAI error:", await res.text());
      return NextResponse.json({ error: "Erreur de l'API OpenAI" }, { status: res.status });
    }

    const out = await res.json();
    const text: string = out.choices?.[0]?.message?.content || "";
    const jsonStr = text.replace(/```json|```/g, "").trim();
    let parsed: { description?: string; tags?: string[] } = {};
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Tente de récupérer le premier objet JSON dans la réponse
      const m = jsonStr.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    const description = String(parsed.description || "").trim();
    const outTags = (Array.isArray(parsed.tags) ? parsed.tags : [])
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 6);
    if (!description) return NextResponse.json({ error: "Réponse IA inexploitable." }, { status: 502 });

    return NextResponse.json({ description, tags: outTags });
  } catch (e) {
    console.error("describe-file error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
