"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNewItemStore } from "@/store/newItemStore";
import { uploadToMyDrive } from "@/lib/uploadToMyDrive";
import { createMyDriveRow } from "@/lib/createMyDriveRow";

function getCurrentFolderIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )mydrive-parent=([^;]*)/);
  const v = match ? decodeURIComponent(match[1]) : "";
  if (!v || v === "__unfiled__") return null;
  return v;
}

export default function AddPage() {
  const router = useRouter();
  const {
    photo,
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

  const [progress, setProgress] = useState(0);

  const previewUrl = useMemo(() => {
    if (!photo) return null;
    return URL.createObjectURL(photo);
  }, [photo]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!photo) {
    return (
      <main className="min-h-dvh p-6 flex items-center justify-center">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Ajouter</h1>
          <p className="text-sm opacity-80">
            Aucun fichier sélectionné. Reviens à MyDrive et utilise le bouton « + Fichier » pour choisir une source.
          </p>
          <Link
            className="block w-full rounded-2xl px-6 py-4 font-semibold border"
            href="/mydrive"
          >
            Retour MyDrive
          </Link>
        </div>
      </main>
    );
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

      await createMyDriveRow({
        title: cleanTitle,
        observation: cleanObs,
        imagePath,
        imageUrl: publicUrl,
      });

      setStatus("success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue.";
      setError(message);
    }
  }

  function handleBackToFolder() {
    const folderId = getCurrentFolderIdFromCookie();
    resetAll();
    router.push(folderId ? `/mydrive?folder=${folderId}` : "/mydrive");
  }

  return (
    <main className="min-h-dvh p-6">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Ajout d’un document</h1>
        </header>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl ?? ""}
          alt="Prévisualisation"
          className="w-full rounded-2xl border"
        />

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
