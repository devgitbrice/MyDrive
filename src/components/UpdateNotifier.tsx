"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X, Sparkles } from "lucide-react";

const CHECK_MS = 90_000; // vérifie toutes les 90 s (+ au retour sur l'onglet)
const SCROLL_KEY = "update-restore";

// Petit son de cloche (Web Audio, sans fichier). Silencieux si le navigateur
// bloque l'audio avant toute interaction — dans ce cas on échoue sans bruit.
function playBell() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const ring = (freq: number, delay: number, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.3);
    };
    // Fondamentale + harmoniques légères = timbre de clochette
    ring(880, 0, 0.18);
    ring(1320, 0, 0.07);
    ring(1760, 0.005, 0.04);
    setTimeout(() => ctx.close().catch(() => {}), 1800);
  } catch {}
}

async function fetchVersion(): Promise<{ version: string; message: string } | null> {
  try {
    const r = await fetch("/api/version", { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export default function UpdateNotifier() {
  const [update, setUpdate] = useState<{ message: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const initialVersion = useRef<string | null>(null);

  // Restaure la position après un rechargement déclenché par le bouton.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY);
      if (raw) {
        sessionStorage.removeItem(SCROLL_KEY);
        const { url, y, ts } = JSON.parse(raw);
        if (url === window.location.href && Date.now() - ts < 30_000) {
          // Deux essais : immédiat + après hydratation du contenu
          window.scrollTo(0, y);
          setTimeout(() => window.scrollTo(0, y), 400);
        }
      }
    } catch {}
  }, []);

  // Surveille la version déployée.
  useEffect(() => {
    let alive = true;

    const check = async () => {
      const v = await fetchVersion();
      if (!alive || !v || v.version === "dev") return;
      if (initialVersion.current === null) {
        initialVersion.current = v.version;
        return;
      }
      if (v.version !== initialVersion.current) {
        setUpdate((prev) => {
          if (!prev) playBell(); // 🔔 une seule fois, à la première détection
          return { message: v.message };
        });
      }
    };

    check();
    const interval = setInterval(check, CHECK_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const reload = () => {
    try {
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ url: window.location.href, y: window.scrollY, ts: Date.now() })
      );
    } catch {}
    window.location.reload();
  };

  if (!update || dismissed) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-teal-500/40 bg-neutral-900 shadow-2xl p-4 animate-[slideIn_0.25s_ease]">
      <div className="flex items-start gap-2">
        <Sparkles size={18} className="text-teal-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Nouveauté disponible !</p>
          {update.message && (
            <p className="text-xs text-neutral-400 mt-1 line-clamp-3">{update.message.split("\n")[0]}</p>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Ignorer"
          className="p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 shrink-0"
        >
          <X size={16} />
        </button>
      </div>
      <button
        onClick={reload}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold py-2 transition-colors"
      >
        <RefreshCw size={15} /> Recharger la page
      </button>
    </div>
  );
}
