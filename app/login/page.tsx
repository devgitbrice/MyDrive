"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Déjà connecté → rediriger vers l'accueil
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/mydrive");
    });
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      router.replace("/mydrive");
    } catch (err: any) {
      setError(
        err?.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : err?.message || "Erreur de connexion."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-neutral-950 text-white p-6">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-3 mb-4">
          <div className="w-16 h-16 rounded-2xl bg-black flex items-center justify-center text-2xl font-bold border border-neutral-800">
            MD
          </div>
          <h1 className="text-2xl font-semibold text-red-500">MyDrive</h1>
          <p className="text-sm text-neutral-500">Connecte-toi pour accéder à tes documents</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-neutral-500">Email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 outline-none focus:border-blue-500"
            placeholder="contact@bricematter.com"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-neutral-500">Mot de passe</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 outline-none focus:border-blue-500"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
