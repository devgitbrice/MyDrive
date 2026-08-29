import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import FinancesTabs from "./FinancesTabs";

export const dynamic = "force-dynamic";

export default function FinancesPage() {
  return (
    <main className="min-h-dvh w-full bg-neutral-950 text-white p-4 sm:p-6 pb-32">
      <header className="flex items-center gap-3 mb-6 max-w-3xl mx-auto">
        <Link href="/mydrive" className="text-neutral-500 hover:text-white transition-colors"><ChevronLeft size={22} /></Link>
        <h1 className="text-xl font-semibold text-emerald-400">Finances</h1>
      </header>
      <div className="max-w-3xl mx-auto">
        <FinancesTabs />
      </div>
    </main>
  );
}
