import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { text, voice, model, speed, response_format, instructions } =
      await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Texte requis" }, { status: 400 });
    }

    if (text.length > 4096) {
      return NextResponse.json(
        { error: "Le texte ne doit pas depasser 4096 caracteres" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Cle API OpenAI manquante" },
        { status: 500 }
      );
    }

    const body: Record<string, unknown> = {
      model: model || "gpt-4o-mini-tts",
      input: text,
      voice: voice || "alloy",
      response_format: response_format || "mp3",
    };

    if (speed !== undefined && speed !== null) {
      body.speed = speed;
    }

    if (instructions) {
      body.instructions = instructions;
    }

    const res = await fetch(OPENAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI TTS error:", err);
      return NextResponse.json(
        { error: "Erreur de l'API OpenAI TTS" },
        { status: res.status }
      );
    }

    // OpenAI returns audio bytes directly
    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": `audio/${response_format || "mp3"}`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("OpenAI TTS API error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
