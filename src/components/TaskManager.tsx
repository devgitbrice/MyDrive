"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";
import { supabase } from "@/lib/supabaseClient";
import { AppTask as Task, fetchTasks, addTask, updateTaskText, removeTask, migrateLegacyTasks } from "@/features/tasks/tasksApi";
import { toast } from "@/components/Toaster";

// Code à 3 chiffres stable, dérivé de l'id de la tâche (déterministe : ne
// change pas d'un rendu à l'autre).
function taskCode(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return String(h % 1000).padStart(3, "0");
}

export default function TaskManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const reload = useCallback(async () => {
    try { setTasks(await fetchTasks()); } catch {}
  }, []);

  // Chargement initial : migration des anciennes tâches locales puis fetch Supabase.
  useEffect(() => {
    (async () => {
      await migrateLegacyTasks();
      await reload();
    })();
    // Realtime : tâches ajoutées/supprimées/modifiées ailleurs (autre appareil,
    // Claude) apparaissent en direct, sans rafraîchir la page.
    let realtimeOk = false;
    const channel = supabase
      .channel("app-tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_tasks" }, () => reload())
      .subscribe((status) => {
        realtimeOk = status === "SUBSCRIBED";
      });

    // Repli : si le Realtime n'est pas connecté (table non publiée, réseau…),
    // on recharge périodiquement pour rester synchro malgré tout.
    const poll = setInterval(() => { if (!realtimeOk) reload(); }, 5000);

    // Recharge au retour sur l'onglet / l'app (couvre le cas iOS en arrière-plan).
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);

  const addTextTask = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    try {
      const t = await addTask(text);
      setTasks((prev) => [t, ...prev]);
    } catch (e: any) {
      toast("Erreur ajout tâche : " + (e?.message || ""));
      setInput(text);
    }
  }, [input]);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const transcribeAudio = async (
    taskId: string,
    base64: string,
    mimeType: string
  ) => {
    try {
      const res = await authFetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, mimeType }),
      });
      const data = await res.json();
      const text = data.text || data.error || "(transcription vide)";
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, text, transcribing: false } : t
        )
      );
      try { await updateTaskText(taskId, text); } catch {}
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, text: "(erreur de transcription)", transcribing: false }
            : t
        )
      );
      try { await updateTaskText(taskId, "(erreur de transcription)"); } catch {}
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const base64 = await blobToBase64(blob);
        // Crée d'abord la tâche en base (placeholder), puis transcrit et met à jour.
        let created: Task;
        try {
          created = await addTask("Transcription en cours...");
        } catch (e: any) {
          toast("Erreur : " + (e?.message || ""));
          return;
        }
        const task: Task = { ...created, audioBase64: base64, audioMime: mimeType, transcribing: true };
        setTasks((prev) => [task, ...prev]);
        transcribeAudio(created.id, base64, mimeType);
      };

      recorder.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    removeTask(id).catch(() => reload());
  };

  const formatTaskForCopy = (t: Task, index: number) =>
    `- [ ] ${t.text}${index >= 0 ? "" : ""}`;

  const copyTask = async (t: Task) => {
    try {
      await navigator.clipboard.writeText(formatTaskForCopy(t, -1));
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  };

  const copyAll = async () => {
    if (tasks.length === 0) return;
    const header =
      "Voici les taches a realiser sur l'application (depuis le gestionnaire de taches) :\n\n";
    const body = tasks
      .slice()
      .reverse()
      .map((t, i) => `${i + 1}. ${t.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(header + body);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Floating button - left of ChatBot */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-24 z-50 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title="Taches de l'application"
      >
        {isOpen ? (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        )}
        {tasks.length > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {tasks.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-24 z-50 w-80 sm:w-96 max-h-[70vh] bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-emerald-600 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-semibold text-sm truncate">
                  Taches de l&apos;app
                </h3>
                <p className="text-emerald-100 text-xs">
                  {tasks.length} tache{tasks.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <button
              onClick={copyAll}
              disabled={tasks.length === 0}
              className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors shrink-0 ${
                copiedAll
                  ? "bg-white text-emerald-700"
                  : "bg-white/20 hover:bg-white/30 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
              title="Copier toutes les taches pour Claude Code"
            >
              {copiedAll ? (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copie !
                </>
              ) : (
                <>
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Tout copier
                </>
              )}
            </button>
          </div>

          {/* Tasks */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px] max-h-[45vh]">
            {tasks.length === 0 ? (
              <div className="text-neutral-500 text-sm text-center py-8">
                Aucune tache. Ajoute une tache en texte ou avec le micro
                ci-dessous.
              </div>
            ) : (
              tasks.map((t) => (
                <div
                  key={t.id}
                  className="bg-neutral-800 rounded-xl p-3 flex flex-col gap-2 border border-neutral-700"
                >
                  <button
                    onClick={() => {
                      const code = taskCode(t.id);
                      navigator.clipboard?.writeText(code).catch(() => {});
                      setCopiedId(t.id + "-code");
                      setTimeout(() => setCopiedId((c) => (c === t.id + "-code" ? null : c)), 1500);
                    }}
                    title="Copier le code"
                    className={`self-start px-2 py-0.5 rounded-md text-[11px] font-bold tracking-widest tabular-nums border transition-colors ${
                      copiedId === t.id + "-code"
                        ? "bg-green-600 text-white border-green-500"
                        : "bg-neutral-900 text-neutral-400 border-neutral-700 hover:text-white hover:border-neutral-500"
                    }`}
                  >
                    {copiedId === t.id + "-code" ? "Copié" : taskCode(t.id)}
                  </button>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 text-sm text-neutral-200 whitespace-pre-wrap break-words">
                      {t.transcribing ? (
                        <span className="text-neutral-400 italic flex items-center gap-2">
                          <span className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:300ms]" />
                          </span>
                          Transcription...
                        </span>
                      ) : (
                        t.text
                      )}
                    </div>
                    <button
                      onClick={() => deleteTask(t.id)}
                      className="text-neutral-500 hover:text-red-400 transition-colors shrink-0"
                      title="Supprimer"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                        />
                      </svg>
                    </button>
                  </div>

                  {t.audioBase64 && t.audioMime && (
                    <audio
                      controls
                      className="w-full h-8"
                      src={`data:${t.audioMime};base64,${t.audioBase64}`}
                    />
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={() => copyTask(t)}
                      disabled={t.transcribing}
                      className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 transition-colors ${
                        copiedId === t.id
                          ? "bg-emerald-600/20 text-emerald-400"
                          : "bg-neutral-700 hover:bg-neutral-600 text-neutral-300 disabled:opacity-40"
                      }`}
                    >
                      {copiedId === t.id ? (
                        <>
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Copie !
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                          Copier
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="border-t border-neutral-800 p-3 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTextTask()}
              placeholder="Nouvelle tache..."
              className="flex-1 bg-neutral-800 text-white rounded-xl px-3 py-2 text-sm outline-none border border-neutral-700 focus:border-emerald-500 transition-colors"
            />
            <button
              onClick={addTextTask}
              disabled={!input.trim()}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-colors"
              title="Ajouter"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            <button
              onClick={toggleRecording}
              className={`px-3 py-2 rounded-xl transition-colors text-white ${
                recording
                  ? "bg-red-600 hover:bg-red-500 animate-pulse"
                  : "bg-neutral-700 hover:bg-neutral-600"
              }`}
              title={recording ? "Arreter l'enregistrement" : "Enregistrer une tache vocale"}
            >
              {recording ? (
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-14 0m7 7v3m-4 0h8M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
