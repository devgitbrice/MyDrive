import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { FolderDoc, MAX_DOCS, buildDocsContext, fetchDocs } from "@/lib/folderContext";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const maxDuration = 60;

// Modèles autorisés (menu déroulant côté client)
const ALLOWED_MODELS = new Set(["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
const DEFAULT_MODEL = "gpt-5.6-terra";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const { question, history, model: reqModel, folderTitle, docIds, docs } = await req.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Question requise" }, { status: 400 });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Clé API OpenAI manquante" }, { status: 500 });

    const model = ALLOWED_MODELS.has(reqModel) ? reqModel : DEFAULT_MODEL;
    // Chemin normal : ids → rechargés en base avec leur content complet.
    // Fallback : liste de docs envoyée par un client pas encore à jour.
    const ids: string[] = (Array.isArray(docIds) ? docIds : []).map(String).slice(0, MAX_DOCS);
    const list: FolderDoc[] = ids.length > 0
      ? await fetchDocs(req, ids)
      : (Array.isArray(docs) ? docs : []).slice(0, MAX_DOCS);

    // Construit le contexte : contenu des documents du dossier (4 images max en vision)
    const { context, imageParts } = await buildDocsContext(list, 4);

    const messages: any[] = [
      {
        role: "system",
        content:
          "Tu es l'assistant IA d'un dossier de MyDrive (GED personnelle). " +
          "On te fournit le contenu des documents du dossier ouvert : tes réponses doivent s'appuyer UNIQUEMENT sur ces documents. " +
          "Cite le titre du ou des documents sur lesquels tu t'appuies (ex. « D'après “Avis d'appel octobre 2026”… »). " +
          "Si l'information demandée ne figure dans aucun document du dossier, dis-le clairement au lieu d'inventer. " +
          "ACTIONS : quand l'utilisateur demande explicitement une création ou une modification, termine ta réponse par une ou plusieurs balises <action>…</action> (une par action, JSON strict à l'intérieur) : " +
          '1. Créer un dossier : <action>{"type":"create_folder","name":"Nom"}</action>. ' +
          '2. Créer un document de tâches : <action>{"type":"create_task_doc","title":"Titre","tasks":[{"title":"Tâche 1","deadline":"2026-10-01"},{"title":"Tâche 2"}]}</action> (deadline optionnelle, format YYYY-MM-DD ; toutes les tâches démarrent non faites). ' +
          '3. Remplacer les tâches d\'un document de tâches existant (cocher/décocher/ajouter/retirer : renvoie la LISTE COMPLÈTE mise à jour) : <action>{"type":"update_tasks","id":"<id du document>","tasks":[{"title":"…","deadline":null,"done":true}]}</action>. ' +
          '4. Créer un tableau : <action>{"type":"create_table","title":"Titre","cells":[["En-tête A","En-tête B"],["l1A","l1B"]]}</action> (cells = grille de lignes de textes). ' +
          '5. Remplacer le contenu d\'un tableau existant (ajouter des lignes/colonnes, trier, corriger : renvoie la GRILLE COMPLÈTE mise à jour en conservant ce qui ne change pas) : <action>{"type":"update_table","id":"<id du document>","cells":[["…"]]}</action>. ' +
          "Les id des documents sont indiqués dans le contexte ([id: …]). Utilise les balises UNIQUEMENT sur demande explicite, jamais de ta propre initiative. Décris toujours en une phrase ce que tu fais avant les balises. " +
          "Réponds en français, de façon concise et factuelle (dates, montants, noms exacts).",
      },
      ...((history || []) as { role: string; text: string }[]).slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
    ];

    const userText =
      `Dossier ouvert : « ${String(folderTitle || "Sans dossier").slice(0, 200)} » (${list.length} document(s)).\n` +
      `Contenu des documents :${context || "\n(aucun document lisible)"}\n\nQuestion : ${question}`;

    messages.push({
      role: "user",
      content: imageParts.length > 0 ? [{ type: "text", text: userText }, ...imageParts] : userText,
    });

    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_completion_tokens: 4000 }),
    });

    if (!res.ok) {
      console.error("folder-assistant OpenAI error:", await res.text());
      return NextResponse.json({ error: "Erreur de l'API OpenAI" }, { status: res.status });
    }

    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content || "";
    if (!raw) return NextResponse.json({ error: "Réponse vide de l'IA." }, { status: 502 });

    // Actions demandées par l'IA, validées ici et exécutées côté client.
    const knownIds = new Set(list.map((d) => String(d.id)));
    const sanitizeTasks = (arr: any): { title: string; deadline: string | null; done: boolean }[] =>
      (Array.isArray(arr) ? arr : [])
        .filter((t: any) => t && typeof t.title === "string" && t.title.trim())
        .slice(0, 100)
        .map((t: any) => ({
          title: String(t.title).trim().slice(0, 300),
          deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(t.deadline || "")) ? String(t.deadline) : null,
          done: t.done === true,
        }));
    const sanitizeCells = (arr: any): string[][] | null => {
      if (!Array.isArray(arr) || arr.length === 0 || arr.length > 300) return null;
      const out = arr.slice(0, 300).map((row: any) =>
        (Array.isArray(row) ? row : [row]).slice(0, 40).map((c: any) => String(c ?? "").slice(0, 2000))
      );
      return out;
    };

    const actions: any[] = [];
    for (const m of raw.matchAll(/<action>([\s\S]*?)<\/action>/g)) {
      try {
        const a = JSON.parse(m[1]);
        if (a?.type === "create_folder" && typeof a.name === "string" && a.name.trim()) {
          actions.push({ type: "create_folder", name: a.name.trim().slice(0, 120) });
        } else if (a?.type === "create_task_doc" && typeof a.title === "string" && a.title.trim()) {
          actions.push({ type: "create_task_doc", title: a.title.trim().slice(0, 150), tasks: sanitizeTasks(a.tasks) });
        } else if (a?.type === "update_tasks" && knownIds.has(String(a.id))) {
          actions.push({ type: "update_tasks", id: String(a.id), tasks: sanitizeTasks(a.tasks) });
        } else if (a?.type === "create_table" && typeof a.title === "string" && a.title.trim()) {
          const cells = sanitizeCells(a.cells);
          if (cells) actions.push({ type: "create_table", title: a.title.trim().slice(0, 150), cells });
        } else if (a?.type === "update_table" && knownIds.has(String(a.id))) {
          const cells = sanitizeCells(a.cells);
          if (cells) actions.push({ type: "update_table", id: String(a.id), cells });
        }
      } catch {}
    }
    const reply = raw.replace(/<action>[\s\S]*?<\/action>/g, "").trim() ||
      (actions.length ? "C'est fait." : raw);

    return NextResponse.json({ reply, actions: actions.slice(0, 8), model });
  } catch (e) {
    console.error("folder-assistant error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
