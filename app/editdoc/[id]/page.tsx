import { supabase } from "@/lib/supabaseClient";
import { fetchAllTags } from "@/features/mydrive/lib/fetchMyDrive";
import DocEditor from "./DocEditor";
import { notFound } from "next/navigation";

// Toujours re-fetch le doc a chaque requete (evite le contenu perime dans l'iframe/preview)
export const dynamic = "force-dynamic";

export default async function EditDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: item, error }, allTags] = await Promise.all([
    supabase
      .from("MyDrive")
      .select("*, tags:mydrive_tags(tag_id)")
      .eq("id", id)
      .single(),
    fetchAllTags(),
  ]);

  if (error || !item) return notFound();

  const initialTags = allTags.filter((t) =>
    item.tags?.some((st: any) => st.tag_id === t.id)
  );

  return (
    <main className="min-h-dvh bg-neutral-950 text-white">
      <DocEditor
        allTags={allTags}
        initialData={{
          id: item.id,
          title: item.title,
          content: item.content || "",
          observation: item.observation || "",
          tags: initialTags,
        }}
      />
    </main>
  );
}
