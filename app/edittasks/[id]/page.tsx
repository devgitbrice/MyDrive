"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckSquare, Plus, Trash2, CalendarDays } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "@/components/Toaster";

export interface TaskItem {
  id: string;
  title: string;
  deadline?: string | null; // YYYY-MM-DD
  done: boolean;
}

export function parseTasks(content: string | null | undefined): TaskItem[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    const list = Array.isArray(parsed) ? parsed : parsed?.tasks;
    if (!Array.isArray(list)) return [];
    return list
      .filter((t: any) => t && typeof t.title === "string")
      .map((t: any, i: number) => ({
        id: String(t.id || `t${i}-${Math.random().toString(36).slice(2, 8)}`),
        title: String(t.title),
        deadline: t.deadline ? String(t.deadline).slice(0, 10) : null,
        done: t.done === true,
      }));
  } catch {
    return [];
  }
}

function isOverdue(t: TaskItem): boolean {
  if (t.done || !t.deadline) return false;
  return t.deadline < new Date().toISOString().slice(0, 10);
}

/** Document « Tâches » : liste de tâches avec deadline optionnelle et case à cocher. */
export default function EditTasksPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [title, setTitle] = useState("Tâches");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("MyDrive").select("title, content").eq("id", id).single().then(({ data, error }) => {
      if (error) toast("Erreur de chargement : " + error.message);
      if (data) {
        setTitle(data.title || "Tâches");
        setTasks(parseTasks(data.content));
      }
      setLoading(false);
    });
  }, [id]);

  const persist = useCallback((next: TaskItem[]) => {
    setTasks(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase
        .from("MyDrive")
        .update({ content: JSON.stringify({ tasks: next }) })
        .eq("id", id);
      if (error) toast("Erreur d'enregistrement : " + error.message);
    }, 500);
  }, [id]);

  function addTask() {
    const t = newTitle.trim();
    if (!t) return;
    persist([
      ...tasks,
      { id: `t${Date.now().toString(36)}`, title: t, deadline: newDeadline || null, done: false },
    ]);
    setNewTitle("");
    setNewDeadline("");
  }

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <main className="min-h-dvh bg-neutral-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white"
            aria-label="Retour"
          >
            <ArrowLeft size={16} />
          </button>
          <CheckSquare size={20} className="text-amber-400" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={async () => {
              const { error } = await supabase.from("MyDrive").update({ title }).eq("id", id);
              if (error) toast("Erreur titre : " + error.message);
            }}
            className="flex-1 min-w-0 bg-transparent text-xl md:text-2xl font-bold outline-none border-b border-transparent focus:border-neutral-700"
          />
        </div>

        <p className="text-xs text-neutral-500">
          {tasks.length === 0 ? "Aucune tâche pour l'instant." : `${doneCount}/${tasks.length} tâche${tasks.length > 1 ? "s" : ""} faite${doneCount > 1 ? "s" : ""}`}
        </p>

        {/* Ajout d'une tâche */}
        <div className="flex items-center gap-2 flex-wrap bg-neutral-900 border border-neutral-800 rounded-xl p-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTask(); }}
            placeholder="Nouvelle tâche…"
            className="flex-1 min-w-[160px] bg-transparent px-2 py-1.5 text-sm outline-none"
          />
          <input
            type="date"
            value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1.5 text-xs text-neutral-300 outline-none"
            title="Deadline (optionnelle)"
          />
          <button
            onClick={addTask}
            disabled={!newTitle.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black text-sm font-semibold"
          >
            <Plus size={14} /> Ajouter
          </button>
        </div>

        {loading ? (
          <p className="text-center text-neutral-500 py-8">Chargement…</p>
        ) : (
          <div className="flex flex-col divide-y divide-neutral-800/70 border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900">
            {tasks.map((t) => (
              <div key={t.id} className="group flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => persist(tasks.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))}
                  className="w-4 h-4 accent-amber-500 cursor-pointer shrink-0"
                />
                <input
                  value={t.title}
                  onChange={(e) => persist(tasks.map((x) => x.id === t.id ? { ...x, title: e.target.value } : x))}
                  className={`flex-1 min-w-0 bg-transparent text-sm outline-none ${t.done ? "line-through text-neutral-500" : "text-neutral-100"}`}
                />
                {t.deadline && (
                  <span className={`inline-flex items-center gap-1 text-[11px] shrink-0 tabular-nums ${isOverdue(t) ? "text-red-400 font-semibold" : "text-neutral-500"}`}>
                    <CalendarDays size={12} /> {t.deadline.split("-").reverse().join("/")}
                  </span>
                )}
                <input
                  type="date"
                  value={t.deadline || ""}
                  onChange={(e) => persist(tasks.map((x) => x.id === t.id ? { ...x, deadline: e.target.value || null } : x))}
                  className="w-6 opacity-0 group-hover:opacity-100 group-hover:w-auto bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 text-[11px] text-neutral-300 outline-none transition-all"
                  title="Modifier la deadline"
                />
                <button
                  onClick={() => persist(tasks.filter((x) => x.id !== t.id))}
                  className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-neutral-600 hover:text-white hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-all"
                  title="Supprimer la tâche"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {tasks.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-neutral-500">Ajoute une première tâche ci-dessus, ou demande à l&apos;IA d&apos;en créer.</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
