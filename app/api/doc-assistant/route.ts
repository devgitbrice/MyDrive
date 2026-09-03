import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const maxDuration = 60;

interface AttachedFile { name: string; type: string; data: string } // data = base64

const MAX_TEXT_PER_FILE = 60000;

// Extrait le texte d'un fichier joint (PDF, Word, PowerPoint, texte).
async function extractFileText(f: AttachedFile): Promise<string> {
  const buf = Buffer.from(f.data, "base64");
  const name = f.name.toLowerCase();
  try {
    if (f.type === "application/pdf" || name.endsWith(".pdf")) {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
      return String(text || "").slice(0, MAX_TEXT_PER_FILE);
    }
    if (name.endsWith(".docx") || f.type.includes("wordprocessingml")) {
      const mammoth = (await import("mammoth")).default;
      const r = await mammoth.extractRawText({ buffer: buf });
      return String(r.value || "").slice(0, MAX_TEXT_PER_FILE);
    }
    if (name.endsWith(".pptx") || f.type.includes("presentationml")) {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buf);
      const slideNames = Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]));
      const parts: string[] = [];
      for (const sn of slideNames) {
        const xml = await zip.files[sn].async("string");
        const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ");
        parts.push(`[Diapositive ${parseInt(sn.match(/\d+/)![0])}] ${texts}`);
      }
      return parts.join("\n").slice(0, MAX_TEXT_PER_FILE);
    }
    if (name.endsWith(".txt") || name.endsWith(".md") || f.type.startsWith("text/")) {
      return buf.toString("utf8").slice(0, MAX_TEXT_PER_FILE);
    }
  } catch (e) {
    console.error("Extraction echouee pour", f.name, e);
    return "(extraction impossible pour ce fichier)";
  }
  return "(format non pris en charge)";
}

// Modèles autorisés (menu déroulant côté client)
const ALLOWED_MODELS = new Set(["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
const DEFAULT_MODEL = "gpt-5.6-terra";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { instruction, html, title, description, history, model: reqModel, lineMap, files } = await req.json();
    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json({ error: "Instruction requise" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API OpenAI manquante" }, { status: 500 });
    }

    const model = ALLOWED_MODELS.has(reqModel) ? reqModel : DEFAULT_MODEL;
    const doc = String(html || "").slice(0, 150000);

    const messages = [
      {
        role: "system",
        content:
          "Tu es l'assistant d'édition de documents de MyDrive. Tu aides à rédiger et modifier des documents HTML. " +
          "Balises autorisées : h1, h2, h3, p, ul, ol, li, strong, em, u, s, hr, table/thead/tbody/tr/th/td, a, code, pre, blockquote, span. " +
          "Mises en forme autorisées (les mêmes que le ruban de l'éditeur) : gras <strong>, italique <em>, souligné <u>, barré <s>, couleur de texte et surlignage via <span style=\"color:#...\"> ou <span style=\"background-color:#...\">, alignement via style=\"text-align:center|right|left\" sur les blocs, séparateur <hr>, citation <blockquote>, code <pre>. Utilise-les librement quand la demande s'y prête. " +
          "Quand l'utilisateur demande une MODIFICATION ou un AJOUT au contenu : réponds par une phrase courte décrivant ce que tu as fait, puis renvoie le document COMPLET mis à jour entre balises <doc> et </doc> (tout le document, pas seulement la partie modifiée ; conserve ce qui ne change pas). " +
          "Tu peux aussi modifier le TITRE du document (renvoie alors <title>nouveau titre</title>) et sa DESCRIPTION courte (renvoie <desc>nouvelle description</desc>) — uniquement si la demande le justifie. " +
          "Si la demande référence des lignes (« Ligne 25 »), utilise le repérage des lignes fourni : chaque numéro correspond à un élément du document dans l'ordre (les <li> comptent individuellement). " +
          "Des fichiers peuvent etre joints (PDF, Word, PowerPoint, texte : contenu extrait fourni ; images : fournies en vision) - utilise-les comme source quand la demande s'y refere. " +
          "Quand c'est une simple question sans modification : réponds normalement, sans balise <doc>. " +
          "Réponds en français. Ne mets jamais de markdown dans le document, uniquement du HTML.",
      },
      ...((history || []) as { role: string; text: string }[]).slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
    ];

    // Fichiers joints : images -> vision ; PDF/Word/PowerPoint/texte -> extraction
    const attached: AttachedFile[] = Array.isArray(files) ? files.slice(0, 6) : [];
    const imageParts: any[] = [];
    let filesText = "";
    for (const f of attached) {
      if (typeof f?.data !== "string" || typeof f?.name !== "string") continue;
      if ((f.type || "").startsWith("image/")) {
        imageParts.push({ type: "image_url", image_url: { url: `data:${f.type};base64,${f.data}` } });
        filesText += `\n[Image jointe : « ${f.name} » — visible ci-dessous]`;
      } else {
        const text = await extractFileText(f);
        filesText += `\n\n===== Fichier joint : « ${f.name} » =====\n${text}\n===== fin de « ${f.name} » =====`;
      }
    }

    const userText =
      `Document actuel (titre : ${title || "(sans titre)"} ; description : ${description || "(vide)"}) :\n<doc>\n${doc}\n</doc>\n` +
      (lineMap ? `\nRepérage des lignes (n° : balise + extrait) :\n${String(lineMap).slice(0, 20000)}\n` : "") +
      filesText +
      `\n\nDemande : ${instruction}`;

    messages.push({
      role: "user",
      content: imageParts.length > 0
        ? [{ type: "text", text: userText }, ...imageParts]
        : userText,
    } as any);

    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_completion_tokens: 16000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI doc-assistant error:", err);
      return NextResponse.json({ error: "Erreur de l'API OpenAI" }, { status: res.status });
    }

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content || "";

    // Sépare la réponse conversationnelle du document mis à jour
    const match = text.match(/<doc>([\s\S]*?)<\/doc>/);
    const newHtml = match ? match[1].trim() : null;
    const titleMatch = text.match(/<title>([\s\S]*?)<\/title>/);
    const descMatch = text.match(/<desc>([\s\S]*?)<\/desc>/);
    const reply = text
      .replace(/<doc>[\s\S]*?<\/doc>/, "")
      .replace(/<title>[\s\S]*?<\/title>/, "")
      .replace(/<desc>[\s\S]*?<\/desc>/, "")
      .trim() || (newHtml || titleMatch || descMatch ? "Document mis à jour." : "");

    return NextResponse.json({
      reply,
      html: newHtml,
      title: titleMatch ? titleMatch[1].trim().slice(0, 200) : null,
      desc: descMatch ? descMatch[1].trim().slice(0, 500) : null,
      model,
    });
  } catch (e) {
    console.error("doc-assistant error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
