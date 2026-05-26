import Link from "next/link";
import AddButtonWithCamera from "@/components/AddButtonWithCamera";

const projects = [
  { name: "MyMindMap", web: "https://mymindmap-kappa.vercel.app/", vercel: "https://vercel.com/bricems-projects/mymindmap" },
  { name: "TravauxAppart", web: "https://travauxappart.vercel.app/", vercel: "https://vercel.com/bricems-projects/travauxappart" },
  { name: "USA2026", web: "https://usa2026-ten.vercel.app/", vercel: "https://vercel.com/bricems-projects/usa2026" },
  { name: "Formations", web: "https://formations-seven.vercel.app/", vercel: "https://vercel.com/bricems-projects/formations" },
  { name: "NouvoMediaManager", web: "https://nouvomediamanager.vercel.app/", vercel: "https://vercel.com/bricems-projects/nouvomediamanager" },
  { name: "CrossNote", web: "https://crossnote.vercel.app/", vercel: "https://vercel.com/bricems-projects/crossnote" },
  { name: "SuperCal", web: "https://supercal-five.vercel.app/", vercel: "https://vercel.com/bricems-projects/supercal" },
  { name: "Photo App", web: "https://photo-app-coral-seven.vercel.app/", vercel: "https://vercel.com/bricems-projects/photo-app" },
  { name: "FormateurBriceMatter", web: "https://formateurbricematter.vercel.app/", vercel: "https://vercel.com/bricems-projects/formateurbricematter" },
  { name: "Nouvo Media", web: "https://nouvo-media.vercel.app/", vercel: "https://vercel.com/bricems-projects/nouvo-media" },
  { name: "Gennn", web: "https://gennn.vercel.app/", vercel: "https://vercel.com/bricems-projects/gennn" },
  { name: "VideoMaker", web: "https://videomaker-zeta.vercel.app/", vercel: "https://vercel.com/bricems-projects/videomaker" },
  { name: "MyStream", web: "https://mystream-three.vercel.app/", vercel: "https://vercel.com/bricems-projects/mystream" },
  { name: "MyMail", web: "https://mymail-coral.vercel.app/", vercel: "https://vercel.com/bricems-projects/mymail" },
  { name: "MyMixApp", web: "https://mymixapp.vercel.app/", vercel: "https://vercel.com/bricems-projects/mymixapp" },
  { name: "FullCrea", web: "https://fullcrea.vercel.app/", vercel: "https://vercel.com/bricems-projects/fullcrea" },
  { name: "Contens", web: "https://contens-khaki.vercel.app/", vercel: "https://vercel.com/bricems-projects/contens" },
  { name: "MyAbleMax", web: "https://myablemax.vercel.app/", vercel: "https://vercel.com/bricems-projects/myablemax" },
  { name: "EasyFrench", web: "https://easyfrench.vercel.app/", vercel: "https://vercel.com/bricems-projects/easyfrench" },
  { name: "Muxeo", web: "https://muxeo.vercel.app/", vercel: "https://vercel.com/bricems-projects/muxeo" },
  { name: "Orrors", web: "https://orrors.vercel.app/", vercel: "https://vercel.com/bricems-projects/orrors" },
  { name: "Toutes mes apps", web: "https://toutes-mes-apps.vercel.app/", vercel: "https://vercel.com/bricems-projects/toutes-mes-apps" },
  { name: "Producteur de films", web: "https://producteur-de-films.vercel.app/", vercel: "https://vercel.com/bricems-projects/producteur-de-films" },
  { name: "KnowledgeIA", web: "https://knowledgeia.vercel.app/", vercel: "https://vercel.com/bricems-projects/knowledgeia" },
  { name: "CRFPA2026", web: "https://crfpa2026.vercel.app/", vercel: "https://vercel.com/bricems-projects/crfpa2026" },
  { name: "News", web: "https://news-liart-one.vercel.app/", vercel: "https://vercel.com/bricems-projects/news" },
];

export default function HomePage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-neutral-950 text-white">
      <div className="w-full max-w-sm text-center space-y-4">
        <h1 className="text-2xl font-semibold">Photo App</h1>
        <p className="text-sm opacity-80">
          Ajoute une photo depuis l'appareil, puis renseigne un titre et une observation.
        </p>

        {/* Bouton principal : Scan */}
        <Link
          href="/quickscan"
          className="block w-full rounded-2xl px-6 py-5 text-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
        >
          Quick Scan
        </Link>

        <AddButtonWithCamera />

        {/* --- SECTION CRÉATION --- */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/newdoc"
            className="flex items-center justify-center rounded-2xl px-4 py-4 font-semibold border border-blue-600 text-blue-400 hover:bg-blue-600 hover:text-white transition-colors text-sm"
          >
            Créer Doc
          </Link>

          {/* NOUVEAU BOUTON PYTHON */}
          <Link
            href="/newpython"
            className="flex items-center justify-center rounded-2xl px-4 py-4 font-semibold border border-yellow-600 text-yellow-500 hover:bg-yellow-600 hover:text-white transition-colors text-sm"
          >
            Script Python
          </Link>
        </div>

        {/* --- SECTION NAVIGATION --- */}
        <Link
          href="/mydrive"
          className="block w-full rounded-2xl px-6 py-4 font-semibold border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 transition-all"
        >
          Voir MyDrive
        </Link>

        {/* --- LISTE DES PROJETS --- */}
        <div className="pt-6 mt-4 border-t border-neutral-800 space-y-2 text-left">
          <h2 className="text-sm font-semibold opacity-70 text-center">Mes projets</h2>
          {projects.map((p) => (
            <div
              key={p.name}
              className="flex items-center justify-between gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2"
            >
              <span className="text-sm font-medium truncate">{p.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <a
                  href={p.web}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                >
                  Web
                </a>
                <a
                  href={p.vercel}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-neutral-400 hover:text-neutral-200 underline"
                >
                  Vercel
                </a>
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}