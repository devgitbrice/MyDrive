"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "@/components/Toaster";
import TagSelector from "@/features/mydrive/components/TagSelector";
import { createPythonScriptAction, updateDriveItemAction } from "@/features/mydrive/modify";
import { Tag } from "@/features/mydrive/types";
import Link from "next/link";

interface PythonEditorProps {
  allTags: Tag[];
  initialData?: {
    id: string;
    title: string;
    code: string;
    description: string;
    tags: Tag[];
  };
}

export default function PythonEditor({ allTags, initialData }: PythonEditorProps) {
  // --- ÉTATS INITIALISÉS SELON LE MODE (CREATE OU EDIT) ---
  const [title, setTitle] = useState(initialData?.title || "Nouveau Script Python");
  const [description, setDescription] = useState(initialData?.description || "");
  const [selectedTags, setSelectedTags] = useState<Tag[]>(initialData?.tags || []);
  const [code, setCode] = useState(initialData?.code || `import pandas as pd\nimport matplotlib.pyplot as plt\n\nprint("Hello MyDrive!")`);
  
  const [stdout, setStdout] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const pyodide = useRef<any>(null);

  // --- CHARGEMENT DE PYODIDE ---
  useEffect(() => {
    async function loadPyodideLibrary() {
      if (document.getElementById("pyodide-script")) {
        // @ts-ignore
        if (window.loadPyodide) {
          initPyodide();
          return;
        }
      }

      const script = document.createElement("script");
      script.id = "pyodide-script";
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
      script.async = true;
      script.onload = () => initPyodide();
      document.body.appendChild(script);
    }

    async function initPyodide() {
      try {
        // @ts-ignore
        pyodide.current = await window.loadPyodide();
        await pyodide.current.loadPackage(["pandas", "matplotlib", "numpy"]);
      } catch (err) {
        console.error("Erreur init Pyodide:", err);
        setStdout("❌ Erreur de chargement de l'environnement Python.");
      } finally {
        setIsLoading(false);
      }
    }

    loadPyodideLibrary();
  }, []);

  // --- EXÉCUTION DU CODE ---
  const runCode = async () => {
    if (!pyodide.current) return;
    setIsRunning(true);
    setStdout("");
    
    const plotDiv = document.getElementById('python-plot');
    if (plotDiv) plotDiv.innerHTML = '<span class="text-neutral-500 animate-pulse text-xs">Calcul en cours...</span>';

    try {
      pyodide.current.runPython(`
        import sys, io, matplotlib.pyplot as plt, base64
        from js import document
        sys.stdout = io.StringIO()
        
        def post_plot():
            if plt.get_fignums():
                buf = io.BytesIO()
                plt.savefig(buf, format='png')
                encoded = base64.b64encode(buf.getvalue()).decode('utf-8')
                document.getElementById('python-plot').innerHTML = f'<img src="data:image/png;base64,{encoded}" class="max-w-full rounded border border-neutral-800 shadow-2xl" />'
                plt.close('all')
            else:
                document.getElementById('python-plot').innerHTML = '<span class="text-neutral-700 text-xs italic">Aucun graphique généré</span>'
      `);

      await pyodide.current.runPythonAsync(code);
      pyodide.current.runPython("post_plot()");
      setStdout(pyodide.current.runPython("sys.stdout.getvalue()"));
    } catch (err: any) {
      setStdout(`❌ Erreur Python :\n${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // --- SAUVEGARDE (CREATE OU UPDATE) ---
  const handleSave = async () => {
    try {
      if (initialData?.id) {
        // MODE ÉDITION
        await updateDriveItemAction(initialData.id, {
          title,
          content: code,
          observation: description,
        });
        toast("✅ Modifications enregistrées !");
      } else {
        // MODE CRÉATION
        const result = await createPythonScriptAction({
          title,
          content: code,
          observation: description,
          tagIds: selectedTags.map(t => t.id)
        });

        if (result.success) {
          toast("✅ Script enregistré !");
          // Optionnel : rediriger vers l'URL d'édition pour ne pas recréer de doublons
          window.location.href = `/editpython/${result.id}`;
        } else {
          // @ts-ignore
          toast(`❌ Erreur Supabase : ${result.message}`);
        }
      }
    } catch (e: any) {
      toast(`❌ Erreur technique : ${e.message}`);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-200 overflow-hidden font-sans">
      
      {/* HEADER */}
      <div className="p-4 bg-neutral-900 border-b border-neutral-800 space-y-3 shadow-md">
        <div className="flex items-center justify-between gap-4">
          <Link href="/mydrive" className="text-neutral-500 hover:text-white transition-colors p-2 bg-neutral-800 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>

          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-xl font-bold text-white outline-none border-b border-transparent focus:border-yellow-500/50 flex-1 transition-all"
            placeholder="Titre du script..."
          />
          <div className="flex gap-2 items-center">
            <button 
              onClick={runCode} 
              disabled={isLoading || isRunning} 
              className={`px-6 py-2 rounded-full font-bold transition-all flex items-center gap-2 shadow-lg ${
                isLoading || isRunning 
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed" 
                  : "bg-green-600 hover:bg-green-500 text-white active:scale-95"
              }`}
            >
              {isLoading ? "Chargement..." : isRunning ? "Calcul..." : "▶ Exécuter"}
            </button>

            <button 
              onClick={handleSave} 
              className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-full font-bold text-white shadow-lg active:scale-95 transition-all"
            >
              💾 Sauver
            </button>
          </div>
        </div>

        <textarea 
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes ou observations sur ce script..."
          className="w-full bg-neutral-800/40 rounded-lg p-2 text-sm text-neutral-400 outline-none h-14 resize-none border border-neutral-800 focus:border-neutral-700"
        />
      </div>

      {/* ZONE CENTRALE */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 flex flex-col border-r border-neutral-800 bg-black">
          <div className="bg-neutral-900/50 px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-widest border-b border-neutral-800/50">
            Source Code (Python)
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            className="flex-1 p-6 bg-transparent font-mono text-sm outline-none resize-none text-blue-400 leading-relaxed custom-scrollbar"
          />
        </div>

        <div className="w-1/2 flex flex-col bg-neutral-950 overflow-y-auto custom-scrollbar">
          <div className="bg-neutral-900/50 px-4 py-1 text-[10px] font-bold text-neutral-500 uppercase tracking-widest border-b border-neutral-800/50 sticky top-0 z-10">
            Output & Visualization
          </div>
          
          <div className="p-6 space-y-6">
            <div id="python-plot" className="flex items-center justify-center min-h-[250px] bg-neutral-900/20 rounded-xl border-2 border-dashed border-neutral-800 overflow-hidden">
              <span className="text-neutral-700 text-xs italic font-mono uppercase tracking-widest">Aperçu Graphique</span>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-green-700 uppercase tracking-widest ml-1">Terminal Output</label>
              <pre className="p-5 bg-black rounded-xl border border-neutral-800 font-mono text-xs text-green-400 whitespace-pre-wrap min-h-[150px] shadow-inner">
                {stdout || "> Ready to execute..."}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="p-3 bg-neutral-900 border-t border-neutral-800 flex items-center gap-4">
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Mots-clés :</span>
        <TagSelector 
          itemId={initialData?.id || "new-py-script"} 
          itemTags={selectedTags} 
          allTags={allTags}
          onTagsChange={(_, tags) => setSelectedTags(tags)}
          onNewTagCreated={(tag) => setSelectedTags([...selectedTags, tag])}
        />
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #262626; border-radius: 10px; }
      `}</style>

    </div>
  );
}