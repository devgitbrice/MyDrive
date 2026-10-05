import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

// Relais d'envoi du récap financier quotidien via Resend (clé stockée sur Vercel).
// Le destinataire est verrouillé : cette route ne peut écrire qu'à Brice.
// Si RECAP_SECRET est défini sur Vercel, l'en-tête x-recap-key doit correspondre.
const RECIPIENT = "contact@bricematter.com";
const RESEND_URL = "https://api.resend.com/emails";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY manquante sur Vercel" }, { status: 500 });

    const secret = process.env.RECAP_SECRET;
    if (secret && req.headers.get("x-recap-key") !== secret) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { subject, html } = await req.json().catch(() => ({}));
    if (typeof subject !== "string" || !subject.trim() || typeof html !== "string" || !html.trim()) {
      return NextResponse.json({ error: "subject et html requis" }, { status: 400 });
    }
    if (subject.length > 255 || html.length > 200_000) {
      return NextResponse.json({ error: "Contenu trop long" }, { status: 400 });
    }

    // Premier essai avec le domaine du site ; si Resend refuse (domaine non
    // vérifié), repli sur l'expéditeur de test Resend.
    const senders = ["MyDrive <recap@bricematter.com>", "MyDrive <onboarding@resend.dev>"];
    let lastError = "";
    for (const from of senders) {
      const r = await fetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        // recap@ n'est pas une vraie boîte : les réponses repartent vers contact@.
        body: JSON.stringify({ from, to: [RECIPIENT], reply_to: RECIPIENT, subject: subject.trim(), html }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return NextResponse.json({ ok: true, id: data?.id, from });
      lastError = `${r.status} ${JSON.stringify(data)}`;
      if (r.status !== 403 && r.status !== 422) break; // seule l'erreur domaine justifie le repli
    }
    console.error("send-recap Resend:", lastError);
    return NextResponse.json({ error: "Échec Resend", detail: lastError }, { status: 502 });
  } catch (e) {
    console.error("send-recap:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
