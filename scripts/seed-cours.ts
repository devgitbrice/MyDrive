/**
 * Crée le dossier « Cours » et les documents du programme, à l'intérieur de
 * l'élément désigné par son code 3 lettres.
 *
 *   npm run seed:cours -- WXS
 *
 * Le script lit NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * depuis l'environnement ou depuis .env.local.
 *
 * Il est idempotent : relancé, il ne recrée pas ce qui existe déjà.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildCodeMap } from "../src/features/mydrive/lib/itemCode";
import { COURS } from "./cours-content";

const SEPARATOR = "||BLOCK||";
const FOLDER_NAME = "Cours";

// --- Connexion ---------------------------------------------------------------

function loadEnv(): { url: string; key: string } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    try {
      const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const value = m[2].replace(/^["']|["']$/g, "").trim();
        if (m[1] === "NEXT_PUBLIC_SUPABASE_URL" && !url) url = value;
        if (m[1] === "NEXT_PUBLIC_SUPABASE_ANON_KEY" && !key) key = value;
      }
    } catch {
      /* pas de .env.local : on retombe sur l'erreur ci-dessous */
    }
  }

  if (!url || !key) {
    throw new Error(
      "Variables manquantes. Lance le script depuis la racine du projet (avec .env.local), " +
        "ou exporte NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return { url, key };
}

const { url, key } = loadEnv();
const supabase = createClient(url, key);

// --- Contenu ----------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Numérotation sur 2 chiffres : 01, 02, … */
const num = (i: number) => String(i).padStart(2, "0");

/** Lien cliquable vers un doc, au format que l'éditeur produit lui-même. */
function docLink(id: string, title: string): string {
  return (
    `<p><a href="/editdoc/${id}" target="_blank" rel="noopener noreferrer" contenteditable="false" ` +
    `style="display:inline-flex;align-items:center;gap:6px;background:#1e3a5f;border:1px solid #334155;` +
    `border-radius:8px;padding:8px 14px;color:#60a5fa;text-decoration:none;font-size:14px;` +
    `font-weight:500;cursor:pointer;">` +
    `<span style="font-size:11px;font-weight:600;color:#60a5fa;margin-right:4px;">Doc</span>` +
    `${esc(title)}</a></p>`
  );
}

// --- Programme --------------------------------------------------------------

async function main() {
  const parentCode = (process.argv[2] || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(parentCode)) {
    throw new Error("Usage : npm run seed:cours -- WXS   (code 3 lettres de l'élément cible)");
  }

  // 1. Retrouver l'élément portant ce code
  const { data: items, error } = await supabase
    .from("MyDrive")
    .select("id, title, type, parent_id, created_at, code");
  if (error) throw new Error(`Lecture MyDrive impossible : ${error.message}`);

  const codes = buildCodeMap(items ?? []);
  const targetId = Object.keys(codes).find((id) => codes[id] === parentCode);
  if (!targetId) throw new Error(`Aucun élément ne porte le code ${parentCode}.`);

  const target = (items ?? []).find((i: any) => i.id === targetId);
  console.log(`Cible ${parentCode} : « ${target.title} » (${target.type})`);

  // Un document ne peut pas contenir de dossier : on se rattache au parent.
  const parentId = target.type === "folder" ? target.id : target.parent_id ?? null;
  if (target.type !== "folder") {
    console.log("  (ce n'est pas un dossier — « Cours » sera créé à côté, dans son dossier parent)");
  }

  // 2. Dossier « Cours » (réutilisé s'il existe déjà)
  const existingFolder = (items ?? []).find(
    (i: any) => i.type === "folder" && i.title === FOLDER_NAME && (i.parent_id ?? null) === parentId
  );

  let folderId: string;
  if (existingFolder) {
    folderId = existingFolder.id;
    console.log(`Dossier « ${FOLDER_NAME} » déjà présent, réutilisé.`);
  } else {
    const { data, error: e } = await supabase
      .from("MyDrive")
      .insert({
        title: FOLDER_NAME,
        type: "folder",
        doc_type: null,
        image_path: "",
        image_url: "",
        observation: "",
        content: "",
        parent_id: parentId,
      })
      .select("id")
      .single();
    if (e) throw new Error(`Création du dossier impossible : ${e.message}`);
    folderId = data.id;
    console.log(`Dossier « ${FOLDER_NAME} » créé.`);
  }

  // 3. Documents déjà présents dans le dossier (pour ne rien dupliquer)
  const { data: existingDocs } = await supabase
    .from("MyDrive")
    .select("id, title")
    .eq("parent_id", folderId);
  const byTitle = new Map<string, string>(
    (existingDocs ?? []).map((d: any) => [d.title, d.id])
  );

  // 4. Les modules, numérotés à partir de 02 (le 01 est le plan, créé ensuite)
  const created: { title: string; id: string }[] = [];

  for (let i = 0; i < COURS.length; i++) {
    const module = COURS[i];
    const title = `${num(i + 2)} - ${module.titre}`;

    const known = byTitle.get(title);
    if (known) {
      created.push({ title, id: known });
      console.log(`  = ${title} (déjà présent)`);
      continue;
    }

    const { data, error: e } = await supabase
      .from("MyDrive")
      .insert({
        title,
        content: module.blocs.join(SEPARATOR),
        observation: module.resume,
        image_path: "",
        image_url: "",
        doc_type: "doc",
        type: "file",
        parent_id: folderId,
      })
      .select("id")
      .single();
    if (e) throw new Error(`Création de « ${title} » impossible : ${e.message}`);

    created.push({ title, id: data.id });
    console.log(`  + ${title}`);
  }

  // 5. Le plan, avec un lien cliquable vers chaque module
  const planTitle = "01 - Plan de ce qui va suivre";
  const blocs: string[] = [
    `<h1>Plan de la formation</h1><p>Ce document est le sommaire du cours. Chaque entrée ci-dessous ouvre le module correspondant.</p>`,
  ];

  let cursor = 0;
  for (const partie of PARTIES) {
    blocs.push(`<h2>${esc(partie.titre)}</h2><p>${esc(partie.intro)}</p>`);
    for (let i = 0; i < partie.modules; i++) {
      const doc = created[cursor++];
      blocs.push(docLink(doc.id, doc.title));
    }
  }

  const planContent = blocs.join(SEPARATOR);
  const existingPlan = byTitle.get(planTitle);

  if (existingPlan) {
    const { error: e } = await supabase
      .from("MyDrive")
      .update({ content: planContent })
      .eq("id", existingPlan);
    if (e) throw new Error(`Mise à jour du plan impossible : ${e.message}`);
    console.log(`  ~ ${planTitle} (liens mis à jour)`);
  } else {
    const { error: e } = await supabase.from("MyDrive").insert({
      title: planTitle,
      content: planContent,
      observation: "Sommaire cliquable de la formation",
      image_path: "",
      image_url: "",
      doc_type: "doc",
      type: "file",
      parent_id: folderId,
    });
    if (e) throw new Error(`Création du plan impossible : ${e.message}`);
    console.log(`  + ${planTitle}`);
  }

  console.log(`\nTerminé : ${created.length + 1} documents dans « ${FOLDER_NAME} ».`);
}

/** Découpage du programme en parties, pour les intertitres du plan. */
const PARTIES = [
  {
    titre: "Partie 1 — Comprendre l'IA",
    intro: "Les fondamentaux techniques, du machine learning au déploiement d'un modèle.",
    modules: 9,
  },
  {
    titre: "Partie 2 — Vibe coding",
    intro: "Construire des applications en dialoguant avec une IA, de l'idée au déploiement mobile.",
    modules: 10,
  },
  {
    titre: "Partie 3 — Open source et open weight",
    intro: "Utiliser et héberger des modèles ouverts, sur sa machine comme sur un serveur.",
    modules: 6,
  },
  {
    titre: "Partie 4 — IA agentique",
    intro: "Faire agir l'IA : outils, orchestration et principaux frameworks du marché.",
    modules: 6,
  },
  {
    titre: "Partie 5 — Le protocole MCP",
    intro: "Le standard qui connecte les modèles aux outils et aux données.",
    modules: 2,
  },
];

main().catch((e) => {
  console.error("\n❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
