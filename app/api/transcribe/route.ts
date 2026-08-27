import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { audioBase64, mimeType } = await req.json();

    if (!audioBase64 || typeof audioBase64 !== "string") {
      return NextResponse.json({ error: "Audio requis" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Cle API manquante" }, { status: 500 });
    }

    const res = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || "audio/webm",
                  data: audioBase64,
                },
              },
              {
                text: "Transcris cet audio mot pour mot, en respectant la ponctuation. Reponds uniquement avec la transcription, sans rien d'autre. Si l'audio est en francais, transcris en francais.",
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Erreur Gemini: ${errText}` },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("")
        .trim() || "";

    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
