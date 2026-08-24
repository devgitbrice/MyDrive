import { supabase } from "@/lib/supabaseClient";
import DrawEditor from "./DrawEditor";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditDrawPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: item, error } = await supabase
    .from("MyDrive")
    .select("id, title, content")
    .eq("id", id)
    .single();

  if (error || !item) return notFound();

  return (
    <main className="min-h-dvh bg-neutral-950 text-white">
      <DrawEditor
        initialData={{
          id: item.id,
          title: item.title,
          content: item.content || "",
        }}
      />
    </main>
  );
}
