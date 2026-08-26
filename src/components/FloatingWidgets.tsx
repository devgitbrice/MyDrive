"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Widgets flottants chargés APRÈS que la page est interactive (pas dans le
// bundle initial), pour accélérer le premier rendu.
const ChatBot = dynamic(() => import("@/components/ChatBot"), { ssr: false });
const TaskManager = dynamic(() => import("@/components/TaskManager"), { ssr: false });
const ClaudeButton = dynamic(() => import("@/components/ClaudeButton"), { ssr: false });

export default function FloatingWidgets() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // On attend que le navigateur soit au repos (ou 1,2 s max) avant de monter.
    const w = window as any;
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => setShow(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;
  return (
    <>
      <ChatBot />
      <TaskManager />
      <ClaudeButton />
    </>
  );
}
