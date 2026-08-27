import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Cle API manquante" }, { status: 500 });
  }
  return NextResponse.json({ apiKey });
}
