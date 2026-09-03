"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/store/themeStore";

/**
 * Énumère les « lignes » du document dans l'ordre : les enfants directs de
 * chaque bloc (.block-editor-content), en descendant dans les <li> des listes.
 * Même logique côté affichage (badges) et côté IA (carte de repérage).
 */
export function collectLineElements(): HTMLElement[] {
  const out: HTMLElement[] = [];
  document.querySelectorAll(".block-editor-content").forEach((blk) => {
    Array.from(blk.children).forEach((child) => {
      const el = child as HTMLElement;
      if (el.tagName === "UL" || el.tagName === "OL") {
        el.querySelectorAll(":scope > li").forEach((li) => out.push(li as HTMLElement));
      } else {
        out.push(el);
      }
    });
  });
  return out;
}

/** Carte « n° → extrait » fournie à l'IA pour interpréter « Ligne N ». */
export function computeLineMap(maxLines = 400): string {
  const els = collectLineElements().slice(0, maxLines);
  return els
    .map((el, i) => `${i + 1}: <${el.tagName.toLowerCase()}> ${(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70)}`)
    .join("\n");
}

export default function LineNumbers({ enabled, refreshKey }: { enabled: boolean; refreshKey: number }) {
  const light = useThemeStore((s) => s.theme) === "light";

  useEffect(() => {
    if (!enabled) return;
    const container = document.querySelector(".doc-scroll") as HTMLElement | null;
    if (!container) return;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;left:0;top:0;right:0;pointer-events:none;z-index:30;";
    container.appendChild(overlay);

    let raf = 0;
    const render = () => {
      overlay.innerHTML = "";
      const contRect = container.getBoundingClientRect();
      collectLineElements().forEach((el, i) => {
        const n = i + 1;
        const r = el.getBoundingClientRect();
        if (r.height === 0) return;
        const top = r.top - contRect.top + container.scrollTop;
        const btn = document.createElement("button");
        btn.textContent = String(n);
        btn.title = `Ligne ${n} — cliquer pour l'ajouter au prompt IA`;
        const idle = light
          ? "background:rgba(255,255,255,.95);color:#525252;border:1px solid rgba(0,0,0,.2);"
          : "background:rgba(23,23,23,.85);color:#a3a3a3;border:1px solid rgba(115,115,115,.35);";
        btn.style.cssText =
          `position:absolute;left:6px;top:${top + 2}px;pointer-events:auto;` +
          "min-width:26px;padding:1px 5px;border-radius:6px;font-size:10px;line-height:1.5;" +
          "font-family:monospace;text-align:right;cursor:pointer;" + idle;
        const hoverColor = light ? "#0d9488" : "#2dd4bf";
        btn.onmouseenter = () => { btn.style.color = hoverColor; btn.style.borderColor = hoverColor; };
        btn.onmouseleave = () => { btn.style.cssText = btn.style.cssText.replace(/color:[^;]+;border:[^;]+;$/, "") ; btn.style.cssText += idle; };
        btn.onclick = (e) => {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("doc-line-click", { detail: { n } }));
        };
        overlay.appendChild(btn);
      });
    };

    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
    render();
    const t = setTimeout(render, 350); // après hydratation/re-mount des blocs

    // Observe le contenu (pas l'overlay) pour suivre les éditions en direct
    const wrapper = container.querySelector(":scope > div");
    const obs = new MutationObserver(schedule);
    if (wrapper) obs.observe(wrapper, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);

    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      obs.disconnect();
      window.removeEventListener("resize", schedule);
      overlay.remove();
    };
  }, [enabled, refreshKey, light]);

  return null;
}
