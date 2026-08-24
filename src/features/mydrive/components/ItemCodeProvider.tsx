"use client";

import { createContext, useContext, useMemo } from "react";
import { buildCodeMap, codeFromId } from "@/features/mydrive/lib/itemCode";

const ItemCodeContext = createContext<Record<string, string> | null>(null);

/**
 * Calcule les codes 3 lettres sur l'ensemble des éléments (dossiers + fichiers)
 * pour garantir leur unicité, et les met à disposition de tout l'arbre MyDrive.
 */
export function ItemCodeProvider({
  items,
  children,
}: {
  items: { id: string; created_at?: string }[];
  children: React.ReactNode;
}) {
  const codes = useMemo(() => buildCodeMap(items), [items]);
  return <ItemCodeContext.Provider value={codes}>{children}</ItemCodeContext.Provider>;
}

/** Code 3 lettres d'un élément (repli sur le hash brut hors provider). */
export function useItemCode(id: string): string {
  const codes = useContext(ItemCodeContext);
  return codes?.[id] ?? codeFromId(id);
}

/** Table complète des codes, pour la recherche. */
export function useItemCodes(): Record<string, string> | null {
  return useContext(ItemCodeContext);
}
