import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";
import { FolderDoc, MAX_DOCS, buildDocsContext, fetchDocs } from "@/lib/folderContext";

export const maxDuration = 60;

// Speech-to-speech OpenAI Realtime. « Mini » = compétitif : bonne qualité
// vocale + tool use, nettement moins cher que GPT-Live 1 / Realtime-2.1.
const REALTIME_MODEL = "gpt-realtime-2.1-mini";

const TOOLS = [
  {
    type: "function",
    name: "create_folder",
    description: "Crée un dossier dans le dossier actuellement ouvert de MyDrive.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Nom du dossier" } },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "create_task_doc",
    description: "Crée un document de tâches (checklist) dans le dossier ouvert. Chaque tâche a un titre, une deadline optionnelle (YYYY-MM-DD) et démarre non faite.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, deadline: { type: "string" } },
            required: ["title"],
          },
        },
      },
      required: ["title", "tasks"],
    },
  },
  {
    type: "function",
    name: "update_tasks",
    description: "Remplace la liste complète des tâches d'un document de tâches existant (pour cocher, décocher, ajouter ou retirer). Renvoie TOUTES les tâches, y compris celles inchangées.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "id du document de tâches (voir [id: …] dans le contexte)" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, deadline: { type: "string" }, done: { type: "boolean" } },
            required: ["title"],
          },
        },
      },
      required: ["id", "tasks"],
    },
  },
  {
    type: "function",
    name: "create_table",
    description: "Crée un document tableau dans le dossier ouvert. cells = grille complète (lignes de cellules texte), première ligne = en-têtes.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        cells: { type: "array", items: { type: "array", items: { type: "string" } } },
      },
      required: ["title", "cells"],
    },
  },
  {
    type: "function",
    name: "update_table",
    description: "Remplace la grille complète d'un tableau existant (ajouter des lignes/colonnes, trier, corriger). Renvoie TOUTE la grille, en conservant ce qui ne change pas.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "id du document tableau (voir [id: …] dans le contexte)" },
        cells: { type: "array", items: { type: "array", items: { type: "string" } } },
      },
      required: ["id", "cells"],
    },
  },
];

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Clé API OpenAI manquante" }, { status: 500 });

    const { docIds, folderTitle } = await req.json().catch(() => ({}));
    const ids: string[] = (Array.isArray(docIds) ? docIds : []).map(String).slice(0, MAX_DOCS);
    const list: FolderDoc[] = await fetchDocs(req, ids);
    // Pas d'images en voix temps réel (audio uniquement).
    const { context } = await buildDocsContext(list, 0);

    const instructions =
      "Tu es l'assistant vocal du dossier MyDrive « " + String(folderTitle || "Sans dossier").slice(0, 200) + " ». " +
      "Tu parles UNIQUEMENT en français, de façon brève et naturelle (1 à 3 phrases). " +
      "Tes réponses s'appuient uniquement sur les documents fournis ci-dessous ; si l'information n'y figure pas, dis-le. " +
      "Quand l'utilisateur demande une création ou une modification, appelle immédiatement l'outil correspondant, puis confirme oralement en une phrase. " +
      "N'appelle jamais un outil sans demande explicite. Les id des documents sont notés [id: …].\n\n" +
      `Documents du dossier (${list.length}) :${context || "\n(aucun document lisible)"}`;

    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: instructions.slice(0, 60000),
          audio: {
            input: { transcription: { model: "whisper-1", language: "fr" } },
            output: { voice: "marin" },
          },
          tools: TOOLS,
          tool_choice: "auto",
        },
      }),
    });

    if (!res.ok) {
      console.error("realtime-token error:", res.status, await res.text());
      return NextResponse.json({ error: "Impossible de créer la session vocale." }, { status: 502 });
    }

    const data = await res.json();
    const value = data?.value || data?.client_secret?.value;
    if (!value) return NextResponse.json({ error: "Jeton vocal absent de la réponse." }, { status: 502 });

    return NextResponse.json({ token: value, model: REALTIME_MODEL });
  } catch (e) {
    console.error("realtime-token:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
