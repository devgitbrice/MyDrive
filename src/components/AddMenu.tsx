"use client";

import { useState, useRef } from "react";
import { toast } from "@/components/Toaster";
import { useRouter } from "next/navigation";
import { Plus, FileText, Code2, Brain, Table2, Presentation, Palette, Upload, Clock, ScanLine, ClipboardList } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function getParentFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )mydrive-parent=([^;]*)/);
  const v = m ? decodeURIComponent(m[1]) : "";
  return v && v !== "__unfiled__" ? v : null;
}

type Kind = "doc" | "python" | "mindmap" | "table" | "presentation" | "voyage" | "draw" | "fiche" | "file" | "pending" | "scan";

const OPTIONS: { kind: Kind; label: string; sub: string; icon: React.ReactNode; color: string }[] = [
  { kind: "doc",          label: "Doc",          sub: "Document texte",          icon: <FileText size={20} />,     color: "text-blue-400 border-blue-500 hover:bg-blue-500 hover:text-white" },
  { kind: "python",       label: "Python",       sub: "Script executable",       icon: <Code2 size={20} />,        color: "text-yellow-400 border-yellow-500 hover:bg-yellow-500 hover:text-black" },
  { kind: "mindmap",      label: "Mindmap",      sub: "Carte mentale",           icon: <Brain size={20} />,        color: "text-purple-400 border-purple-500 hover:bg-purple-500 hover:text-white" },
  { kind: "table",        label: "Table",        sub: "Feuille de calcul",       icon: <Table2 size={20} />,       color: "text-green-400 border-green-500 hover:bg-green-500 hover:text-white" },
  { kind: "presentation", label: "Presentation", sub: "Diapositives",            icon: <Presentation size={20} />, color: "text-orange-400 border-orange-500 hover:bg-orange-500 hover:text-white" },
  { kind: "draw",         label: "Draw",         sub: "Dessin (Apple Pencil)",   icon: <Palette size={20} />,      color: "text-pink-400 border-pink-500 hover:bg-pink-500 hover:text-white" },
  { kind: "fiche",        label: "Fiche projet", sub: "Suivi structuré",         icon: <ClipboardList size={20} />, color: "text-teal-400 border-teal-500 hover:bg-teal-500 hover:text-white" },
  { kind: "file",         label: "Fichier",      sub: "Photo, image, PDF...",    icon: <Upload size={20} />,       color: "text-white border-neutral-500 hover:bg-white hover:text-black" },
  { kind: "pending",      label: "En attente",   sub: "Placeholder a uploader",  icon: <Clock size={20} />,        color: "text-amber-400 border-amber-500 hover:bg-amber-500 hover:text-black" },
  { kind: "scan",         label: "Scan rapide",  sub: "Scanner avec la camera",  icon: <ScanLine size={20} />,     color: "text-rose-400 border-rose-500 hover:bg-rose-500 hover:text-white" },
];

export default function AddMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prompting, setPrompting] = useState<{ kind: Kind; title: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function openMenu() { setOpen(true); }
  function closeMenu() { setOpen(false); setPrompting(null); }

  async function createVoyage(title: string) {
    const { data, error } = await supabase.from("MyDrive").insert({
      title, type: "file", doc_type: "voyage",
      image_path: "", image_url: "", observation: "",
      content: JSON.stringify({ trajets: [], logements: [] }),
      parent_id: getParentFromCookie(),
    }).select("id").single();
    if (error) throw new Error(error.message);
    router.push(`/editvoyage/${data!.id}`);
  }

  async function createFiche(title: string) {
    const { data, error } = await supabase.from("MyDrive").insert({
      title, type: "file", doc_type: "fiche",
      image_path: "", image_url: "", observation: "", content: "",
      parent_id: getParentFromCookie(),
    }).select("id").single();
    if (error) throw new Error(error.message);
    router.push(`/editfiche/${data!.id}`);
  }

  async function createDraw(title: string) {
    const { data, error } = await supabase.from("MyDrive").insert({
      title, type: "file", doc_type: "draw",
      image_path: "", image_url: "", observation: "", content: "",
      parent_id: getParentFromCookie(),
    }).select("id").single();
    if (error) throw new Error(error.message);
    router.push(`/editdraw/${data!.id}`);
  }

  async function createPending(title: string) {
    const { error } = await supabase.from("MyDrive").insert({
      title, type: "pending", doc_type: null,
      image_path: "", image_url: "", observation: "", content: "",
      parent_id: getParentFromCookie(),
    });
    if (error) throw new Error(error.message);
    router.refresh();
  }

  async function handlePrompt(kind: Kind, t: string) {
    const trimmed = t.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      if (kind === "voyage") await createVoyage(trimmed);
      else if (kind === "fiche") await createFiche(trimmed);
      else if (kind === "draw") await createDraw(trimmed);
      else if (kind === "pending") await createPending(trimmed);
      closeMenu();
    } catch (e: any) {
      toast("Erreur : " + e.message);
    } finally {
      setCreating(false);
    }
  }

  function handleClick(kind: Kind) {
    if (kind === "doc") { router.push("/newdoc"); closeMenu(); return; }
    if (kind === "python") { router.push("/newpython"); closeMenu(); return; }
    if (kind === "mindmap") { router.push("/newmindmap"); closeMenu(); return; }
    if (kind === "table") { router.push("/newtable"); closeMenu(); return; }
    if (kind === "presentation") { router.push("/newpresentation"); closeMenu(); return; }
    if (kind === "scan") { router.push("/quickscan"); closeMenu(); return; }
    if (kind === "file") { fileInputRef.current?.click(); return; }
    // voyage, draw, pending -> prompt title
    setPrompting({ kind, title: "" });
  }

  return (
    <>
      <button
        onClick={openMenu}
        aria-label="Ajouter un element"
        className="inline-flex items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold border border-neutral-500 text-neutral-200 hover:bg-white hover:text-black transition-colors"
      >
        <Plus size={18} /> Ajouter
      </button>

      {/* Hidden file input for + Fichier */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.heic,.heif"
        multiple
        style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length === 0) return;
          // reuse newItemStore
          import("@/store/newItemStore").then(({ useNewItemStore }) => {
            const st = useNewItemStore.getState();
            if (files.length > 1 && typeof (st as any).setPhotos === "function") {
              (st as any).setPhotos(files);
            } else {
              (st as any).setPhoto(files[0]);
            }
            e.currentTarget.value = "";
            closeMenu();
            router.push("/add");
          });
        }}
      />

      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeMenu}>
          <div
            className="bg-neutral-900 border border-neutral-700 rounded-2xl p-5 w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {!prompting ? (
              <>
                <h3 className="text-lg font-semibold text-white mb-1">Ajouter un element</h3>
                <p className="text-xs text-neutral-500 mb-4">Choisis le type de contenu a creer.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {OPTIONS.map((o) => (
                    <button
                      key={o.kind}
                      onClick={() => handleClick(o.kind)}
                      className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition-colors bg-neutral-950/40 ${o.color}`}
                    >
                      <span className="flex items-center gap-2 font-semibold text-sm">{o.icon} {o.label}</span>
                      <span className="text-[11px] opacity-70 leading-tight">{o.sub}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button onClick={closeMenu} className="text-sm text-neutral-400 hover:text-white px-3 py-2">Fermer</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-white mb-1">
                  Titre du {OPTIONS.find((o) => o.kind === prompting.kind)?.label.toLowerCase()}
                </h3>
                <p className="text-xs text-neutral-500 mb-4">
                  Sera cree dans le dossier courant.
                </p>
                <input
                  autoFocus
                  type="text"
                  value={prompting.title}
                  onChange={(e) => setPrompting({ ...prompting, title: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handlePrompt(prompting.kind, prompting.title);
                    if (e.key === "Escape") setPrompting(null);
                  }}
                  placeholder="Titre..."
                  className="w-full bg-neutral-800 text-white border border-neutral-700 rounded-lg px-3 py-2 outline-none focus:border-blue-500"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setPrompting(null)} className="px-4 py-2 text-sm text-neutral-400 hover:text-white">Retour</button>
                  <button
                    onClick={() => handlePrompt(prompting.kind, prompting.title)}
                    disabled={!prompting.title.trim() || creating}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg disabled:opacity-50"
                  >
                    {creating ? "..." : "Creer"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
