import { Suspense } from "react";
import Link from "next/link";
import { Settings, Plus } from "lucide-react";
import { fetchMyDrive, fetchAllTags } from "@/features/mydrive/lib/fetchMyDrive";
import FolderView from "@/features/mydrive/components/FolderView";
import CreateVoyageButton from "@/features/voyage/components/CreateVoyageButton";
import AddFileButton from "@/components/AddFileButton";
import AddPendingDocButton from "@/components/AddPendingDocButton";

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
    <main className="min-h-dvh p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-red-500">MyDrive</h1>
          <Link
            href="/settings"
            title="Parametres"
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <Settings size={20} />
          </Link>
        </div>

        <div className="flex flex-col items-end gap-2 ml-auto">
          {lastUpdateStr && (
            <span className="text-xs text-neutral-500" title="Dernière mise à jour (heure de Paris)">
              Dernière MAJ : <span className="text-neutral-300">{lastUpdateStr}</span>
            </span>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link href="/newdoc" className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-blue-600 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors">
              <Plus size={16} /> Doc
            </Link>
            <Link href="/newpython" className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-yellow-500 text-yellow-500 hover:bg-yellow-500 hover:text-black transition-colors">
              <Plus size={16} /> Python
            </Link>
            <Link href="/newmindmap" className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white transition-colors">
              <Plus size={16} /> Mindmap
            </Link>
            <Link href="/newtable" className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-green-600 text-green-400 hover:bg-green-600 hover:text-white transition-colors">
              <Plus size={16} /> Table
            </Link>
            <Link href="/newpresentation" className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-orange-600 text-orange-400 hover:bg-orange-600 hover:text-white transition-colors">
              <Plus size={16} /> Présentation
            </Link>
            <CreateVoyageButton />
            <AddFileButton />
            <AddPendingDocButton />
          </div>
        </div>
      </header>

      <Suspense fallback={null}>
        <FolderView items={items} allTags={allTags} />
      </Suspense>
    </main>
  );
}
