import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Version de l'app = commit du déploiement Vercel (+ son message, affiché comme "nouveauté").
export async function GET() {
  return NextResponse.json(
    {
      version: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE || "",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
