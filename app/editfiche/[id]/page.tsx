import { supabase } from "@/lib/supabaseClient";
import { notFound } from "next/navigation";
import FicheEditor from "./FicheEditor";

export const dynamic = "force-dynamic";

export default async function EditFichePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: item, error } = await supabase
    .from("MyDrive")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !item) return notFound();

  return (
    <main className="min-h-dvh w-full bg-neutral-950 text-white">
      <FicheEditor item={item} />
    </main>
  );
}
