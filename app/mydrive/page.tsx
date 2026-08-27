import { Suspense } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { fetchMyDrive, fetchAllTags } from "@/features/mydrive/lib/fetchMyDrive";
import LiveDrive from "@/features/mydrive/components/LiveDrive";
import AddMenu from "@/components/AddMenu";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";

// Re-render a chaque requete pour que les mutations Supabase externes
// (curl, autre onglet, etc.) apparaissent sans hard refresh.
// La nav intra-page reste rapide grace au soft-nav (useSearchParams).
export const dynamic = "force-dynamic";

export default async function MyDrivePage() {
  const [items, allTags] = await Promise.all([fetchMyDrive(), fetchAllTags()]);

  const lastUpdate = items.reduce<Date | null>((max, item) => {
    if (!item.created_at) return max;
    const d = new Date(item.created_at);
    return !max || d > max ? d : max;
  }, null);
  const lastUpdateStr = lastUpdate
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Europe/Paris",
      }).format(lastUpdate)
    : null;

  return (
    <main className="min-h-dvh p-6 pb-32 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-blue-500">MyDrive</h1>
          <Link
            href="/settings"
            title="Parametres"
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <Settings size={20} />
          </Link>
          <ThemeToggle />
          <LogoutButton />
        </div>

        <div className="flex flex-col items-end gap-2 ml-auto">
          {lastUpdateStr && (
            <span className="text-xs text-neutral-500" title="Derniere mise a jour (heure de Paris)">
              Derniere MAJ : <span className="text-neutral-300">{lastUpdateStr}</span>
            </span>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <AddMenu />
          </div>
        </div>
      </header>

      <Suspense fallback={null}>
        <LiveDrive initialItems={items} initialTags={allTags} />
      </Suspense>
    </main>
  );
}
