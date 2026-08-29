import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { summary, projet } = await req.json();
    if (!summary || typeof summary !== "string") {
      return NextResponse.json({ error: "Résumé requis" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API OpenAI manquante" }, { status: 500 });
    }

    // Modèle configurable (l'utilisateur peut viser un modèle plus récent via env).
    const model = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";

    const res = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Tu es un conseiller business francophone. À partir de la fiche d'un projet, écris une analyse synthétique d'environ 100 mots (ni titre, ni liste, un seul paragraphe fluide) : où en est le projet, ses atouts, ses manques, et la priorité concrète à traiter. Ton direct et actionnable, en français.",
          },
          {
            role: "user",
            content: `Projet : ${projet || "(sans nom)"}\n\nDonnées de la fiche :\n${summary}`,
          },
        ],
        temperature: 0.6,
        max_tokens: 300,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI chat error:", err);
      return NextResponse.json({ error: "Erreur de l'API OpenAI" }, { status: res.status });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    return NextResponse.json({ text });
  } catch (e) {
    console.error("analyze-fiche error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
