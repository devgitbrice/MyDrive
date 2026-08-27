import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { message, history } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message requis" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API manquante" }, { status: 500 });
    }

    // Build conversation contents from history
    const contents = [
      ...(history || []).map((msg: { role: string; text: string }) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const res = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: {
          parts: [
            {
              text: "Tu es l'assistant MyDrive, un assistant intelligent intégré dans une application de gestion de documents, présentations, mindmaps, tableaux et scripts Python. Tu réponds en français de manière concise et utile. Tu peux aider à rédiger du contenu, donner des idées, expliquer des concepts ou aider à structurer des documents.",
            },
          ],
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json(
        { error: "Erreur de l'API Gemini" },
        { status: res.status }
      );
    }

    const data = await res.json();
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Désolé, je n'ai pas pu générer de réponse.";

    return NextResponse.json({ text });
  } catch (e) {
    console.error("Chat API error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
