"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }
  return (
    <button
      onClick={handleLogout}
      title="Se déconnecter"
      className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
    >
      <LogOut size={20} />
    </button>
  );
}
