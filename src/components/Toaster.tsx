"use client";

import { useEffect, useState } from "react";

// Système de toasts minimal, sans dépendance.
// Usage : import { toast } from "@/components/Toaster"; toast("Message", "error");

type ToastKind = "info" | "success" | "error";
interface ToastItem { id: number; message: string; kind: ToastKind; }

export function toast(message: string, kind: ToastKind = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, kind } }));
}

let nextId = 1;

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail as { message: string; kind: ToastKind };
      const id = nextId++;
      setItems((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
    };
    window.addEventListener("app-toast", handler);
    return () => window.removeEventListener("app-toast", handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 items-center pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl border max-w-[90vw] truncate ${
            t.kind === "error"
              ? "bg-red-600 text-white border-red-500"
              : t.kind === "success"
                ? "bg-green-600 text-white border-green-500"
                : "bg-neutral-800 text-neutral-100 border-neutral-700"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
