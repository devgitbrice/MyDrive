import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { instruction, html, title, history } = await req.json();
    if (!instruction || typeof instruction !== "string") {
      return NextResponse.json({ error: "Instruction requise" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY manquante — ajoute-la dans les variables d'environnement Vercel." },
        { status: 500 }
      );
    }

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    const doc = String(html || "").slice(0, 150000);

    const messages = [
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

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system:
          "Tu es l'assistant d'édition de documents de MyDrive. Tu aides à rédiger et modifier des documents HTML (balises autorisées : h1, h2, h3, p, ul, ol, li, strong, em, table/thead/tbody/tr/th/td, a, code, pre, blockquote). " +
          "Quand l'utilisateur demande une MODIFICATION ou un AJOUT au document : réponds par une phrase courte décrivant ce que tu as fait, puis renvoie le document COMPLET mis à jour entre balises <doc> et </doc> (tout le document, pas seulement la partie modifiée ; conserve ce qui ne change pas). " +
          "Quand c'est une simple question sans modification : réponds normalement, sans balise <doc>. " +
          "Réponds en français. Ne mets jamais de markdown dans le document, uniquement du HTML.",
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json({ error: "Erreur de l'API Anthropic" }, { status: res.status });
    }

    const data = await res.json();
    const text: string = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    // Sépare la réponse conversationnelle du document mis à jour
    const match = text.match(/<doc>([\s\S]*?)<\/doc>/);
    const newHtml = match ? match[1].trim() : null;
    const reply = text.replace(/<doc>[\s\S]*?<\/doc>/, "").trim() || (newHtml ? "Document mis à jour." : "");

    return NextResponse.json({ reply, html: newHtml });
  } catch (e) {
    console.error("doc-assistant error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
