"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { MyDriveItem, Tag } from "@/features/mydrive/types";
import { fetchMyDrive, fetchAllTags } from "@/features/mydrive/lib/fetchMyDrive";
import { supabase } from "@/lib/supabaseClient";
import { ItemCodeProvider } from "./ItemCodeProvider";
import FolderView from "./FolderView";

/**
 * Enveloppe cliente qui rend le Drive « temps réel » : les éléments sont
 * initialisés depuis le rendu serveur (props), puis rafraîchis en direct dès
 * qu'une ligne de la table MyDrive change (ajout / suppression / modification),
 * sans rechargement de page. Un repli (polling + retour sur l'onglet) couvre le
 * cas où le Realtime n'est pas connecté.
 */
export default function LiveDrive({
  initialItems,
  initialTags,
}: {
  initialItems: MyDriveItem[];
  initialTags: Tag[];
}) {
  const [items, setItems] = useState<MyDriveItem[]>(initialItems);
  const [tags, setTags] = useState<Tag[]>(initialTags);

  // Évite les rechargements concurrents et regroupe les rafales d'événements.
  const busyRef = useRef(false);
  const pendingRef = useRef(false);

  const reload = useCallback(async () => {
    if (busyRef.current) { pendingRef.current = true; return; }
    busyRef.current = true;
    try {
      const [nextItems, nextTags] = await Promise.all([fetchMyDrive(), fetchAllTags()]);
      setItems(nextItems);
      setTags(nextTags);
    } catch {
      // silencieux : on garde l'état précédent, le prochain event/polling réessaiera
    } finally {
      busyRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; reload(); }
    }
  }, []);

  useEffect(() => {
    // Petite temporisation : une mutation touche souvent plusieurs lignes
    // (ex. déplacement, miroirs) → on ne recharge qu'une fois la rafale passée.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => reload(), 250);
    };

    let realtimeOk = false;
    const channel = supabase
      .channel("mydrive-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "MyDrive" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "mydrive_tags" }, schedule)
      .subscribe((status) => { realtimeOk = status === "SUBSCRIBED"; });

    // Repli si le Realtime n'est pas connecté.
    const poll = setInterval(() => { if (!realtimeOk) reload(); }, 8000);

    // Rafraîchit au retour sur l'onglet / l'app.
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);

  return (
    <ItemCodeProvider items={items}>
      <FolderView items={items} allTags={tags} />
    </ItemCodeProvider>
  );
}
