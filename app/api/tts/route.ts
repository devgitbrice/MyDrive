import { NextRequest } from "next/server";
import { requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not configured on server" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: { text?: string; voice?: string; model?: string; speed?: number } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const text = (body.text || "").trim();
  if (!text) {
    return new Response(JSON.stringify({ error: "Empty text" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  // OpenAI TTS accepts up to 4096 chars per request
  if (text.length > 4096) {
    return new Response(
      JSON.stringify({ error: `Text too long: ${text.length} chars (max 4096 per chunk)` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const voice = body.voice || "alloy";
  const model = body.model || "gpt-4o-mini-tts";
  const speed = typeof body.speed === "number" ? Math.max(0.25, Math.min(4, body.speed)) : 1;

  const openai = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      speed,
      response_format: "mp3",
    }),
  });

  if (!openai.ok) {
    const err = await openai.text();
    return new Response(
      JSON.stringify({ error: `OpenAI TTS failed: ${openai.status}`, detail: err }),
      { status: openai.status, headers: { "Content-Type": "application/json" } }
    );
  }

  const audio = await openai.arrayBuffer();
  return new Response(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
