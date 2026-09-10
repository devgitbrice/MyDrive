"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNewItemStore } from "@/store/newItemStore";
import { uploadToMyDrive } from "@/lib/uploadToMyDrive";
import { createMyDriveRow } from "@/lib/createMyDriveRow";
import { supabase } from "@/lib/supabaseClient";
import { authFetch } from "@/lib/authFetch";
import { createTagAction, addTagToItemAction } from "@/features/mydrive/modify";

// Lit un File en base64 (sans le préfixe data:)
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function getCurrentFolderIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )mydrive-parent=([^;]*)/);
  const v = match ? decodeURIComponent(match[1]) : "";
  if (!v || v === "__unfiled__") return null;
  return v;
}

function stripExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

export default function AddPage() {
  const router = useRouter();
  const {
    photo,
    photos,
    observation,
    title,
    status,
    error,
    setObservation,
    setTitle,
    setStatus,
    setError,
    resetAll,
  } = useNewItemStore();

  const [progress, setProgress] = useState(0); // current file %
  const [batchIndex, setBatchIndex] = useState(0); // index dans photos
  const [batchPrefix, setBatchPrefix] = useState("");
  // Description IA : état + mots-clés proposés (rattachés à l'enregistrement)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [existingTagNames, setExistingTagNames] = useState<Set<string>>(new Set());

  const previewUrl = useMemo(() => {
    if (!photo) return null;
    return URL.createObjectURL(photo);
  }, [photo]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const batchPreviews = useMemo(
    () => photos.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    [photos]
  );
  useEffect(() => {
    return () => batchPreviews.forEach((b) => URL.revokeObjectURL(b.url));
  }, [batchPreviews]);

  const isBatch = photos.length > 0;

  // ---------- Aucun fichier ----------
  if (!photo && !isBatch) {
    return (
      <main className="min-h-dvh p-6 flex items-center justify-center">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Ajouter</h1>
          <p className="text-sm opacity-80">
            Aucun fichier sélectionné. Reviens à MyDrive et utilise le bouton « + Fichier » pour choisir une source.
          </p>
          <Link className="block w-full rounded-2xl px-6 py-4 font-semibold border" href="/mydrive">
            Retour MyDrive
          </Link>
        </div>
      </main>
    );
  }

  function handleBackToFolder() {
    const folderId = getCurrentFolderIdFromCookie();
    resetAll();
    router.push(folderId ? `/mydrive?folder=${folderId}` : "/mydrive");
  }

  // ================================================================
  // MODE BATCH (plusieurs fichiers)
  // ================================================================
  if (isBatch) {
    async function handleBatchUpload() {
      if (status === "uploading") return;
      setStatus("uploading");
      setBatchIndex(0);
      setProgress(0);

      // Garde-fou : prévient si on quitte la page en plein upload (#15)
      const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); };
      window.addEventListener("beforeunload", guard);

      try {
        // Upload parallèle par vagues de 3 (#15) — ~3x plus rapide qu'en séquentiel
        const CONCURRENCY = 3;
        let done = 0;
        for (let i = 0; i < photos.length; i += CONCURRENCY) {
          const wave = photos.slice(i, i + CONCURRENCY);
          await Promise.all(wave.map(async (f) => {
            const autoTitle = (batchPrefix.trim() ? `${batchPrefix.trim()} ` : "") + stripExt(f.name);
            const { imagePath, publicUrl } = await uploadToMyDrive(f);
            await createMyDriveRow({
              title: autoTitle,
              observation: "",
              imagePath,
              imageUrl: publicUrl,
            });
            done += 1;
            setBatchIndex(done - 1);
            setProgress(100);
          }));
        }
        setStatus("success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      } finally {
        window.removeEventListener("beforeunload", guard);
      }
    }

    const overall = Math.round(
      ((batchIndex + progress / 100) / photos.length) * 100
    );

    return (
      <main className="min-h-dvh p-6">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <header>
            <h1 className="text-2xl font-semibold">
              Ajouter {photos.length} fichier{photos.length > 1 ? "s" : ""}
            </h1>
            <p className="text-sm opacity-70 mt-1">Le nom de chaque fichier sera utilisé comme titre.</p>
          </header>

          {/* Grille de prévisualisations */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {batchPreviews.map((b, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900">
                {b.file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.url} alt={b.file.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-neutral-500 p-2 text-center">
                    <span className="text-3xl">📄</span>
                    <span className="text-[10px] mt-1 truncate w-full">{b.file.name}</span>
                  </div>
                )}
                {status === "uploading" && i === batchIndex && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs font-mono">
                    {progress} %
                  </div>
                )}
                {status === "uploading" && i < batchIndex && (
                  <div className="absolute inset-0 bg-green-500/40 flex items-center justify-center text-white text-2xl">✓</div>
                )}
              </div>
            ))}
          </div>

          {status === "idle" || status === "observation" || status === "title" ? (
            <section className="space-y-3">
              <label className="block text-sm opacity-80">Préfixe de titre (optionnel)</label>
              <input
                type="text"
                value={batchPrefix}
                onChange={(e) => setBatchPrefix(e.target.value)}
                placeholder="ex. Vacances 2026"
                className="w-full rounded-2xl border p-3 bg-neutral-800 border-neutral-700 text-white"
              />
              <button
                type="button"
                onClick={handleBatchUpload}
                className="w-full rounded-2xl px-6 py-4 font-semibold border bg-blue-600 text-white hover:bg-blue-500"
              >
                Envoyer les {photos.length} fichier{photos.length > 1 ? "s" : ""}
              </button>
            </section>
          ) : null}

          {status === "uploading" && (
            <section className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="opacity-80">
                  Fichier {batchIndex + 1} / {photos.length} — {photos[batchIndex]?.name}
                </span>
                <span className="font-mono opacity-80">{progress} %</span>
              </div>
              <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="opacity-80">Progression totale</span>
                <span className="font-mono opacity-80">{overall} %</span>
              </div>
              <div className="w-full h-3 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-200" style={{ width: `${overall}%` }} />
              </div>
            </section>
          )}

          {status === "success" && (
            <section className="space-y-3 text-center">
              <h2 className="text-lg font-semibold">Tout est enregistré ✅</h2>
              <button type="button" onClick={handleBackToFolder} className="w-full rounded-2xl px-6 py-4 font-semibold border bg-blue-600 text-white">
                Retour au dossier
              </button>
              <button type="button" onClick={resetAll} className="w-full rounded-2xl px-6 py-4 font-semibold border">
                Ajouter d’autres fichiers
              </button>
            </section>
          )}

          {status === "error" && (
            <section className="space-y-3 text-center">
              <h2 className="text-lg font-semibold">❌ Problème</h2>
              <p className="text-sm opacity-80">{error}</p>
              <button type="button" onClick={resetAll} className="w-full rounded-2xl px-6 py-4 font-semibold border">
                Recommencer
              </button>
            </section>
          )}
        </div>
      </main>
    );
  }

  // ================================================================
  // MODE SINGLE (1 fichier) — flow original avec titre + observation
  // ================================================================

  // Description IA : ~100 mots + mots-clés (réutilise les tags existants en priorité)
  async function handleAiDescribe() {
    if (!photo || aiLoading) return;
    setAiError(null);
    if (photo.size > 3.5 * 1024 * 1024) {
      setAiError("Fichier trop lourd pour l'analyse IA (~3,5 Mo max).");
      return;
    }
    setAiLoading(true);
    try {
      const { data: tagRows } = await supabase.from("tags").select("name");
      const names = (tagRows || []).map((t: { name: string }) => String(t.name));
      setExistingTagNames(new Set(names.map((n) => n.toLowerCase())));
      const b64 = await fileToBase64(photo);
      const res = await authFetch("/api/describe-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: photo.name, type: photo.type, data: b64, existingTags: names }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de l'analyse IA");
      setObservation(data.description);
      if (data.title) setTitle(data.title);
      setAiTags(Array.isArray(data.tags) ? data.tags : []);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Erreur de l'analyse IA");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleFinalize() {
    try {
      const currentPhoto = photo;
      if (!currentPhoto) {
        throw new Error("Fichier manquant.");
      }
      if (status === "uploading") return;

      setStatus("uploading");
      setProgress(0);

      const cleanTitle = title.trim();
      const cleanObs = observation.trim();

      if (!cleanObs) throw new Error("Observation manquante.");
      if (!cleanTitle) throw new Error("Titre manquant.");

      const { imagePath, publicUrl } = await uploadToMyDrive(currentPhoto, (pct) => {
        setProgress(pct);
      });

      const rowId = await createMyDriveRow({
        title: cleanTitle,
        observation: cleanObs,
        imagePath,
        imageUrl: publicUrl,
      });

      // Rattache les mots-clés proposés par l'IA (réutilise le tag existant, sinon le crée)
      for (const name of aiTags) {
        try {
          const tag = await createTagAction(name);
          if (tag?.id) await addTagToItemAction(rowId, tag.id);
        } catch (err) {
          console.error("Tag non rattaché :", name, err);
        }
      }

      setStatus("success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue.";
      setError(message);
    }
  }

  return (
    <main className="min-h-dvh p-6">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Ajout d’un document</h1>
        </header>

        {photo && !photo.type.startsWith("image/") ? (
          <div className="w-full rounded-2xl border p-8 text-center space-y-1">
            <div className="text-4xl">📄</div>
            <div className="font-medium break-all">{photo.name}</div>
            <div className="text-xs opacity-60">{Math.round(photo.size / 1024)} Ko — sera enregistré tel quel</div>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewUrl ?? ""}
            alt="Prévisualisation"
            className="w-full rounded-2xl border"
          />
        )}

        {status === "observation" && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Observations</h2>

            <textarea
              className="w-full min-h-[120px] rounded-2xl border p-4"
              placeholder="Décris ce qui a été photographié…"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />

            <button
              type="button"
              disabled={aiLoading}
              onClick={handleAiDescribe}
              className="w-full rounded-2xl px-6 py-3 font-semibold border border-teal-500/60 text-teal-400 hover:bg-teal-500/10 disabled:opacity-50 transition-colors"
            >
              {aiLoading ? "✨ Analyse du document en cours…" : "✨ Description IA (100 mots + mots-clés)"}
            </button>
            {aiError && <p className="text-sm text-red-400">{aiError}</p>}

            {title.trim() && (
              <p className="text-sm opacity-80">
                <span className="opacity-60">Titre proposé :</span> <span className="font-medium">{title}</span>
                <span className="opacity-60"> — modifiable à l’étape suivante</span>
              </p>
            )}

            {aiTags.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs opacity-70">Mots-clés (rattachés à l’enregistrement — touche pour retirer) :</p>
                <div className="flex flex-wrap gap-1.5">
                  {aiTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAiTags((prev) => prev.filter((x) => x !== t))}
                      title="Retirer ce mot-clé"
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs border ${
                        existingTagNames.has(t.toLowerCase())
                          ? "border-green-500/50 text-green-400 bg-green-500/10"
                          : "border-blue-500/50 text-blue-400 bg-blue-500/10"
                      }`}
                    >
                      #{t}
                      {!existingTagNames.has(t.toLowerCase()) && <span className="opacity-60">(nouveau)</span>}
                      <span className="opacity-60">×</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!observation.trim()}
              className="w-full rounded-2xl px-6 py-4 font-semibold border disabled:opacity-50"
              onClick={() => setStatus("title")}
            >
              Valider l’observation
            </button>
          </section>
        )}

        {status === "title" && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Titre</h2>

            <input
              type="text"
              className="w-full rounded-2xl border p-4"
              placeholder="Titre du document"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <button
              type="button"
              disabled={!title.trim()}
              className="w-full rounded-2xl px-6 py-4 font-semibold border disabled:opacity-50"
              onClick={handleFinalize}
            >
              Enregistrer
            </button>
          </section>
        )}

        {status === "uploading" && (
          <section className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="opacity-80">Envoi en cours…</span>
              <span className="font-mono opacity-80">{progress} %</span>
            </div>
            <div className="w-full h-3 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            {progress >= 100 && (
              <p className="text-xs opacity-60 text-center">Finalisation…</p>
            )}
          </section>
        )}

        {status === "success" && (
          <section className="space-y-4 text-center">
            <h2 className="text-lg font-semibold">C’est bon, merci ✅</h2>
            <button
              type="button"
              className="w-full rounded-2xl px-6 py-4 font-semibold border bg-blue-600 text-white"
              onClick={handleBackToFolder}
            >
              Retour au dossier
            </button>
            <button
              type="button"
              className="w-full rounded-2xl px-6 py-4 font-semibold border"
              onClick={resetAll}
            >
              Ajouter un autre fichier
            </button>
          </section>
        )}

        {status === "error" && (
          <section className="space-y-4 text-center">
            <h2 className="text-lg font-semibold">❌ Problème</h2>
            <p className="text-sm opacity-80">{error}</p>
            <button
              type="button"
              className="w-full rounded-2xl px-6 py-4 font-semibold border"
              onClick={resetAll}
            >
              Recommencer
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
