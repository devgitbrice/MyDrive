import { supabase } from "@/lib/supabaseClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Vue publique en lecture seule d'un document (#22).
 * Aucun bouton d'édition, aucune navigation MyDrive : juste le contenu.
 */
export default async function ViewDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Seuls les documents explicitement partagés (is_public) sont visibles.
  // Repli : si la colonne n'existe pas encore (migration SQL non lancée),
  // on garde l'ancien comportement pour ne pas casser les liens.
  let item: any = null;
  const withFlag = await supabase
    .from("MyDrive")
    .select("id, title, observation, content, doc_type, type, is_public")
    .eq("id", id)
    .single();
  if (withFlag.error && withFlag.error.code === "42703") {
    const legacy = await supabase
      .from("MyDrive")
      .select("id, title, observation, content, doc_type, type")
      .eq("id", id)
      .single();
    item = legacy.data;
  } else if (!withFlag.error) {
    item = withFlag.data;
    if (item && item.is_public !== true) return notFound();
  }

  if (!item) return notFound();

  return (
    <main className="min-h-dvh bg-neutral-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-[11px] uppercase tracking-widest text-neutral-600 mb-4">
          Document partagé · lecture seule
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">{item.title}</h1>
        {item.observation && (
          <p className="text-sm text-neutral-400 mb-8">{item.observation}</p>
        )}
        <article
          className="prose prose-invert prose-neutral max-w-none prose-headings:tracking-tight prose-a:text-blue-400"
          // Contenu authoré dans l'app par le propriétaire du compte.
          dangerouslySetInnerHTML={{ __html: item.content || "<p>(document vide)</p>" }}
        />
      </div>
    </main>
  );
}
