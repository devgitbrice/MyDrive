"use client";

import { useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";

export default function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggleTheme);

  // Applique la classe theme-light sur <body> pour que les overrides CSS s'appliquent partout
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (theme === "light") document.body.classList.add("theme-light");
    else document.body.classList.remove("theme-light");
  }, [theme]);

  const isLight = theme === "light";
  return (
    <button
      onClick={toggle}
      title={isLight ? "Passer en mode sombre" : "Passer en mode clair"}
      className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
    >
      {isLight ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
}
