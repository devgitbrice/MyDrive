import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Prompt requis" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API manquante" }, { status: 500 });
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
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini Image API error:", err);
      return NextResponse.json(
        { error: "Erreur de l'API Gemini Image" },
        { status: res.status }
      );
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];

    const imagePart = parts.find(
      (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData
    );
    const textPart = parts.find((p: { text?: string }) => p.text);

    if (imagePart?.inlineData) {
      return NextResponse.json({
        image: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
        text: textPart?.text || "",
      });
    }

    // If no image was generated, return text explanation
    if (textPart?.text) {
      return NextResponse.json({
        error: textPart.text,
      });
    }

    return NextResponse.json(
      { error: "Impossible de générer l'image" },
      { status: 500 }
    );
  } catch (e) {
    console.error("Image generation API error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
