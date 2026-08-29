import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { text, title } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Texte requis" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Clé API OpenAI manquante" }, { status: 500 });

    const model = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
    // On borne l'entrée pour rester raisonnable en tokens.
    const input = text.slice(0, 12000);

    const res = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Tu résumes des documents en français. Produis un résumé d'environ 200 mots, en un texte fluide et clair (pas de liste, pas de titre), fidèle au contenu, prêt à être lu à voix haute." },
          { role: "user", content: `Titre : ${title || "(sans titre)"}\n\nDocument :\n${input}` },
        ],
        temperature: 0.4,
        max_tokens: 400,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("summarize-doc OpenAI error:", err);
      return NextResponse.json({ error: "Erreur de l'API OpenAI" }, { status: res.status });
    }
    const data = await res.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({ summary });
  } catch (e) {
    console.error("summarize-doc error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
