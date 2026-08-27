"use client";
import { supabase } from "@/lib/supabaseClient";

export interface AppTask {
  id: string;
  text: string;
  createdAt: number;
  // Champs éphémères (audio / transcription), non persistés en base
  audioBase64?: string;
  audioMime?: string;
  transcribing?: boolean;
}

const TABLE = "app_tasks";

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch { return null; }
}

export async function fetchTasks(): Promise<AppTask[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, text, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    text: r.text || "",
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  }));
}

export async function addTask(text: string): Promise<AppTask> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ text, user_id: uid })
    .select("id, text, created_at")
    .single();
  if (error) throw error;
  return { id: data.id, text: data.text || "", createdAt: new Date(data.created_at).getTime() };
}

export async function updateTaskText(id: string, text: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ text }).eq("id", id);
  if (error) throw error;
}

export async function removeTask(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

// Migration unique des anciennes tâches localStorage → Supabase.
const LEGACY_KEY = "app-tasks-v1";
const MIGRATED_KEY = "app-tasks-migrated";
export async function migrateLegacyTasks(): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const legacy = JSON.parse(raw) as { text?: string }[];
      const uid = await currentUserId();
      const rows = legacy
        .filter((t) => t?.text && t.text.trim() && !/transcription/i.test(t.text))
        .map((t) => ({ text: t.text!.trim(), user_id: uid }));
      if (rows.length) await supabase.from(TABLE).insert(rows);
    }
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    // silencieux — si la table n'existe pas encore, on réessaiera au prochain chargement
  }
}
