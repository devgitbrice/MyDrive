export default function Loading() {
  return (
    <main className="min-h-dvh p-6 pb-32 space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="h-7 w-32 rounded bg-neutral-800" />
        <div className="h-9 w-28 rounded-2xl bg-neutral-800" />
      </div>
      {/* Barre de recherche */}
      <div className="h-11 max-w-xl rounded-xl bg-neutral-900 border border-neutral-800" />
      {/* Grille de dossiers */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-xl bg-neutral-900 border border-neutral-800" />
        ))}
      </div>
    </main>
  );
}
