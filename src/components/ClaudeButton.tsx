"use client";

const CLAUDE_URL = "https://claude.ai/code/session_018R4c3AezWN6Dcdc3byvkNg";

export default function ClaudeButton() {
  return (
    <a
      href={CLAUDE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Ouvrir la session Claude Code"
      className="fixed bottom-6 right-42 z-50 h-14 px-4 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold shadow-lg shadow-orange-600/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
    >
      <span className="text-lg">🤖</span>
      <span>CLAUDE</span>
    </a>
  );
}
