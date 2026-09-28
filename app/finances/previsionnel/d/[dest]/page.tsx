import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import PrevisionnelView from "../../PrevisionnelView";

export const dynamic = "force-dynamic";

// Vue annuelle d'un destinataire du prévisionnel : total, répartition par
// statut, graphique mensuel et tableau filtré (filtres Mois / Statut).
export default async function DestinatairePage({ params }: { params: Promise<{ dest: string }> }) {
  const { dest } = await params;
  const name = decodeURIComponent(dest);
  return (
    <main className="min-h-dvh w-full bg-neutral-950 text-white p-4 sm:p-6 pb-32">
      <header className="flex items-center gap-3 mb-6 max-w-6xl mx-auto">
        <Link href="/finances/previsionnel" className="text-neutral-500 hover:text-white transition-colors"><ChevronLeft size={22} /></Link>
        <h1 className="text-xl font-semibold text-sky-400">Prévisionnel — {name}</h1>
      </header>
      <div className="max-w-6xl mx-auto">
        <PrevisionnelView dest={name} />
      </div>
    </main>
  );
}
