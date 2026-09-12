import { fetchMyDrive } from "@/features/mydrive/lib/fetchMyDrive";
import FolderMindmap from "@/features/foldermindmap/FolderMindmap";

export const dynamic = "force-dynamic";

export default async function FolderMindmapPage() {
  const items = await fetchMyDrive();
  return (
    <main className="h-dvh w-full bg-neutral-950 overflow-hidden">
      <FolderMindmap items={items} />
    </main>
  );
}
