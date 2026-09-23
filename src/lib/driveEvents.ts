/**
 * Signal « le Drive a changé » émis côté client (ex. actions du bot IA).
 * Les vues ouvertes (liste du Drive, aperçu d'un document) l'écoutent pour se
 * mettre à jour immédiatement, sans dépendre du Realtime Supabase ni d'un
 * rechargement de page.
 */
const EVENT = "mydrive-changed";

export type DriveChange = { ids: string[] };

export function emitDriveChange(ids: string[] = []): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DriveChange>(EVENT, { detail: { ids } }));
}

export function onDriveChange(cb: (change: DriveChange) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<DriveChange>).detail ?? { ids: [] });
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
