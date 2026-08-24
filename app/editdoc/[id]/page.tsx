import { supabase } from "@/lib/supabaseClient";
import { fetchAllTags } from "@/features/mydrive/lib/fetchMyDrive";
import DocEditor from "./DocEditor";
import { notFound } from "next/navigation";

// Toujours re-fetch le doc a chaque requete (evite le contenu perime dans l'iframe/preview)
export const dynamic = "force-dynamic";

function editUrlFor(id: string, docType: string | null): string {
  switch (docType) {
    case "python": return `/editpython/${id}`;
    case "table": return `/edittable/${id}`;
    case "mindmap": return `/editmindmap/${id}`;
    case "presentation": return `/editpresentation/${id}`;
    case "voyage": return `/editvoyage/${id}`;
    default: return `/editdoc/${id}`;
  }
}

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

  // Prev / next sibling in the same folder, sorted by title (numeric-aware, asc)
  let prevHref: string | null = null;
  let nextHref: string | null = null;
  {
    const q = supabase
      .from("MyDrive")
      .select("id, title, doc_type")
      .eq("type", "file");
    const { data: siblings } = item.parent_id
      ? await q.eq("parent_id", item.parent_id)
      : await q.is("parent_id", null);
    if (siblings && siblings.length > 0) {
      const sorted = [...siblings].sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", "fr", { numeric: true, sensitivity: "base" })
      );
      const idx = sorted.findIndex((s) => s.id === item.id);
      if (idx > 0) {
        const p = sorted[idx - 1];
        prevHref = editUrlFor(p.id, p.doc_type);
      }
      if (idx >= 0 && idx < sorted.length - 1) {
        const n = sorted[idx + 1];
        nextHref = editUrlFor(n.id, n.doc_type);
      }
    }
  }

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
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </main>
  );
}
