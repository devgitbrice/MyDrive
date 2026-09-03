import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// Modèles autorisés (menu déroulant côté client)
const ALLOWED_MODELS = new Set(["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
const DEFAULT_MODEL = "gpt-5.6-terra";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { instruction, html, title, history, model: reqModel } = await req.json();
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
          "Tu es l'assistant d'édition de documents de MyDrive. Tu aides à rédiger et modifier des documents HTML (balises autorisées : h1, h2, h3, p, ul, ol, li, strong, em, table/thead/tbody/tr/th/td, a, code, pre, blockquote). " +
          "Quand l'utilisateur demande une MODIFICATION ou un AJOUT au document : réponds par une phrase courte décrivant ce que tu as fait, puis renvoie le document COMPLET mis à jour entre balises <doc> et </doc> (tout le document, pas seulement la partie modifiée ; conserve ce qui ne change pas). " +
          "Quand c'est une simple question sans modification : réponds normalement, sans balise <doc>. " +
          "Réponds en français. Ne mets jamais de markdown dans le document, uniquement du HTML.",
      },
      ...((history || []) as { role: string; text: string }[]).slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
      {
        role: "user",
        content:
          `Document actuel (titre : ${title || "(sans titre)"}) :\n<doc>\n${doc}\n</doc>\n\n` +
          `Demande : ${instruction}`,
      },
    ];

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
    const reply = text.replace(/<doc>[\s\S]*?<\/doc>/, "").trim() || (newHtml ? "Document mis à jour." : "");

    return NextResponse.json({ reply, html: newHtml, model });
  } catch (e) {
    console.error("doc-assistant error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
