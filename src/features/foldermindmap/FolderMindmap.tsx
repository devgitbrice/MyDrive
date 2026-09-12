"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  Node, Edge, Position,
} from "reactflow";
import "reactflow/dist/style.css";
import Link from "next/link";
import type { MyDriveItem } from "@/features/mydrive/types";
import { fetchMyDrive } from "@/features/mydrive/lib/fetchMyDrive";
import { moveItem, createFolder } from "@/features/mydrive/lib/folders";

// ─── Palette ─────────────────────────────────────────────────────────────────
const FOLDER_COLORS = [
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899",
  "#f97316", "#d97706", "#16a34a", "#0d9488",
  "#0891b2", "#e11d48",
];

const CREATE_OPTIONS = [
  { label: "📄 Document",      url: "/newdoc" },
  { label: "🧠 Mindmap",       url: "/newmindmap" },
  { label: "📊 Table",         url: "/newtable" },
  { label: "📽 Présentation",  url: "/newpresentation" },
  { label: "🐍 Script Python", url: "/newpython" },
];

// JOUR  = fond noir, texte/contours blancs
const JOUR = {
  canvas: "#0d0d0d", bgDot: "#2a2a2a",
  itemBg: "#111827", itemText: "#f1f5f9",
  itemBorder: "#e5e7eb",
  ctrlBg: "#1a1a1a", ctrlBorder: "#374151",
  barBg: "#1f2937", barText: "#e5e7eb", barBorder: "#4b5563",
  menuBg: "#1f2937", menuText: "#f1f5f9", menuHover: "#374151",
  minimap: "#111",
  folderText: (c: string) => c,   // couleur vive sur fond noir
};
// NUIT  = fond blanc, texte/contours noirs
const NUIT = {
  canvas: "#ffffff", bgDot: "#d1d5db",
  itemBg: "#f9fafb", itemText: "#111827",
  itemBorder: "#374151",
  ctrlBg: "#ffffff", ctrlBorder: "#9ca3af",
  barBg: "#f3f4f6", barText: "#111827", barBorder: "#d1d5db",
  menuBg: "#ffffff", menuText: "#111827", menuHover: "#f3f4f6",
  minimap: "#f9fafb",
  folderText: (_c: string) => "#111827", // texte noir forcé
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getItemUrl(item: MyDriveItem): string {
  switch (item.doc_type || item.type) {
    case "doc":          return `/editdoc/${item.id}`;
    case "mindmap":      return `/editmindmap/${item.id}`;
    case "table":        return `/edittable/${item.id}`;
    case "presentation": return `/editpresentation/${item.id}`;
    case "voyage":       return `/editvoyage/${item.id}`;
    case "python":       return `/editpython/${item.id}`;
    default:             return `/mydrive`;
  }
}
function docLabel(item: MyDriveItem): string {
  const icons: Record<string, string> = {
    scan:"🖼", doc:"📄", mindmap:"🧠", table:"📊",
    presentation:"📽", voyage:"✈️", python:"🐍", fiche:"🗂",
  };
  return `${icons[item.doc_type ?? item.type ?? ""] ?? "📁"} ${item.title}`;
}

// ─── Tree ─────────────────────────────────────────────────────────────────────
interface TreeNode {
  id: string;
  title: string;
  isFolder: boolean;
  color: string;
  level: number;
  children: TreeNode[];
  docItem?: MyDriveItem;
}

const MAX_DEPTH  = 6;
const FOLDER_H   = 44;
const DOC_H      = 60;
const DOC_SLOT   = 110; // vertical slot per doc (accounts for multi-line wrapping)
const FOLD_SLOT  = 70;  // vertical slot for collapsed folder (allows 2-line names)
const FOLDER_MAX_W = 210; // max-width pour les nœuds dossier (retour à la ligne)
const ADD_SLOT   = 50;  // slot for the "+" add node
const CHILD_GAP  = 14;
const COL_GAP    = 320;
const COL_ROOT   = 0;
const ITEM_WIDTH = 340;

function buildTreeItem(
  item: MyDriveItem, all: MyDriveItem[], color: string, level: number,
): TreeNode {
  const isFolder = item.type === "folder";
  let children: TreeNode[] = [];
  if (isFolder && level < MAX_DEPTH) {
    children = all
      .filter((i) => i.parent_id === item.id)
      .sort((a, b) => {
        if (a.type === "folder" && b.type !== "folder") return -1;
        if (a.type !== "folder" && b.type === "folder") return 1;
        return a.title.localeCompare(b.title);
      })
      .map((c) => buildTreeItem(c, all, color, level + 1));
  }
  return { id: item.id, title: item.title, isFolder, color, level, children, docItem: isFolder ? undefined : item };
}

function buildRoots(items: MyDriveItem[]): TreeNode[] {
  const active = items.filter((i) => !(i as any).deleted_at);
  const rootFolders = active
    .filter((i) => i.type === "folder" && !i.parent_id)
    .sort((a, b) => a.title.localeCompare(b.title));
  const noDocs = active.filter((i) => i.type !== "folder" && !i.parent_id);

  const result: TreeNode[] = [];
  if (noDocs.length > 0) {
    const c = FOLDER_COLORS[0];
    result.push({
      id: "no-folder", title: "Sans dossier", isFolder: true,
      color: c, level: 0,
      children: noDocs.map((d) => ({ id: d.id, title: d.title, isFolder: false, color: c, level: 1, children: [], docItem: d })),
    });
  }
  rootFolders.forEach((f, fi) => {
    result.push(buildTreeItem(f, active, FOLDER_COLORS[(fi + 1) % FOLDER_COLORS.length], 0));
  });
  return result;
}

// Slot height: total vertical space a node occupies (self + expanded children)
function slotH(node: TreeNode, exp: Set<string>): number {
  if (!node.isFolder) return DOC_SLOT;
  if (!exp.has(node.id)) return FOLD_SLOT;
  // Even empty open folders show the "+" node
  if (node.children.length === 0) return FOLD_SLOT + CHILD_GAP + ADD_SLOT;
  const childTotal = node.children.reduce((s, c) => s + slotH(c, exp), 0);
  return childTotal + CHILD_GAP * node.children.length + ADD_SLOT; // extra slot for "+"
}

// ─── Graph builder ────────────────────────────────────────────────────────────
function placeNodes(
  treeNodes: TreeNode[],
  exp: Set<string>,
  hovered: string | null,
  T: typeof JOUR,
  rfNodes: Node[],
  rfEdges: Edge[],
  parentId: string,
  level: number,
  startY: number,
): void {
  let cursor = startY;
  for (const n of treeNodes) {
    const sh = slotH(n, exp);
    const nodeH = n.isFolder ? FOLDER_H : DOC_H;
    const nodeY = cursor + sh / 2 - nodeH / 2;
    const nodeX = COL_ROOT + (level + 1) * COL_GAP;
    const rfId = n.isFolder ? n.id : `item-${n.id}`;
    const { color } = n;
    const isOpen = n.isFolder && exp.has(n.id);
    const isHover = hovered === n.id;

    if (n.isFolder) {
      const arrow = n.children.length === 0 ? "·" : isOpen ? "▼" : "▶";
      rfNodes.push({
        id: rfId,
        position: { x: nodeX, y: nodeY },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: `${arrow} ${n.title} (${n.children.length})`, folderId: n.id, isFolder: true, hasChildren: n.children.length > 0 },
        style: {
          background: isHover ? color + "44" : color + "18",
          color: T.folderText(color),
          border: `2px solid ${isHover ? color : isOpen ? color : color + "99"}`,
          borderRadius: 12, padding: "8px 14px",
          fontWeight: 700, fontSize: 13,
          whiteSpace: "normal", wordBreak: "break-word",
          maxWidth: FOLDER_MAX_W,
          lineHeight: 1.4,
          cursor: n.children.length > 0 ? "pointer" : "default",
          boxShadow: isHover ? `0 0 12px ${color}55` : "none",
          transition: "background 0.15s, box-shadow 0.15s",
        },
      });
    } else {
      rfNodes.push({
        id: rfId,
        position: { x: nodeX, y: nodeY },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: docLabel(n.docItem!), url: getItemUrl(n.docItem!), docId: n.id },
        style: {
          background: T.itemBg, color: T.itemText,
          border: `1.5px solid ${T.itemBorder}`,
          borderRadius: 8, padding: "10px 16px",
          fontSize: 13, cursor: "grab",
          width: ITEM_WIDTH, minHeight: DOC_H,
          whiteSpace: "normal", wordBreak: "break-word",
          lineHeight: 1.55, textAlign: "left", boxSizing: "border-box",
        },
      });
    }

    rfEdges.push({
      id: `e-${parentId}-${rfId}`,
      source: parentId, target: rfId, type: "smoothstep",
      style: { stroke: color + (isOpen ? "cc" : "77"), strokeWidth: isOpen ? 2 : 1.5 },
    });

    // Recurse into open folders + ajoute un nœud "+"
    if (n.isFolder && isOpen) {
      let childCursor = cursor;
      if (n.children.length > 0) {
        placeNodes(n.children, exp, hovered, T, rfNodes, rfEdges, rfId, level + 1, cursor);
        childCursor += n.children.reduce((s, c) => s + slotH(c, exp), 0) + CHILD_GAP * n.children.length;
      }
      // Nœud "+" pour créer dans ce dossier
      const addId = `add-${n.id}`;
      const addX = COL_ROOT + (level + 2) * COL_GAP;
      const addY = childCursor + ADD_SLOT / 2 - 18;
      rfNodes.push({
        id: addId,
        position: { x: addX, y: addY },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: "+ Ajouter ici", isAdd: true, folderId: n.id },
        style: {
          background: "transparent", color,
          border: `1.5px dashed ${color}99`,
          borderRadius: 8, padding: "6px 16px",
          fontSize: 12, cursor: "pointer",
          fontWeight: 600, whiteSpace: "nowrap",
          opacity: 0.7,
        },
      });
      rfEdges.push({
        id: `e-${rfId}-${addId}`,
        source: rfId, target: addId, type: "smoothstep",
        style: { stroke: `${color}44`, strokeWidth: 1, strokeDasharray: "4 3" },
      });
    }

    cursor += sh + CHILD_GAP;
  }
}

function buildGraph(
  roots: TreeNode[],
  exp: Set<string>,
  hovered: string | null,
  T: typeof JOUR,
): { nodes: Node[]; edges: Edge[] } {
  const rfNodes: Node[] = [];
  const rfEdges: Edge[] = [];

  const totalH = roots.reduce((s, r) => s + slotH(r, exp), 0) + CHILD_GAP * (roots.length - 1);

  rfNodes.push({
    id: "root",
    position: { x: COL_ROOT, y: totalH / 2 - 55 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    draggable: false,
    data: { label: "MyDrive" },
    style: {
      background: "#166534", color: "#4ade80", border: "2px solid #22c55e",
      borderRadius: "50%", width: 110, height: 110,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: "bold", fontSize: 18,
    },
  });

  placeNodes(roots, exp, hovered, T, rfNodes, rfEdges, "root", 0, 0);
  return { nodes: rfNodes, edges: rfEdges };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FolderMindmap({ items: init }: { items: MyDriveItem[] }) {
  const [items, setItems] = useState(init);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createInFolder, setCreateInFolder] = useState<string | null>(null);
  const [isJour, setIsJour] = useState(true); // Jour = fond noir / Nuit = fond blanc
  const T = isJour ? JOUR : NUIT;

  const refetch = useCallback(async () => {
    try { setItems(await fetchMyDrive()); } catch {}
  }, []);

  useEffect(() => {
    window.addEventListener("focus", refetch);
    return () => window.removeEventListener("focus", refetch);
  }, [refetch]);

  const roots = useMemo(() => buildRoots(items), [items]);

  const { nodes: cNodes, edges: cEdges } = useMemo(
    () => buildGraph(roots, expanded, hovered, T as typeof JOUR),
    [roots, expanded, hovered, T],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(cNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(cEdges);
  useEffect(() => { setNodes(cNodes); setEdges(cEdges); }, [cNodes, cEdges, setNodes, setEdges]);

  // Drag: highlight nearest folder
  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node, all: Node[]) => {
    if (!node.id.startsWith("item-")) { setHovered(null); return; }
    const { x, y } = node.position;
    const t = all.find((n) => n.data?.isFolder && Math.abs(n.position.x - x) < 280 && Math.abs(n.position.y - y) < 90);
    setHovered(t?.data?.folderId ?? null);
  }, []);

  // Drop: move doc to folder
  const onNodeDragStop = useCallback(async (_: React.MouseEvent, node: Node, all: Node[]) => {
    setHovered(null);
    if (!node.id.startsWith("item-")) return;
    const docId = node.data?.docId as string;
    const { x, y } = node.position;
    const target = all.find((n) => n.data?.isFolder && Math.abs(n.position.x - x) < 280 && Math.abs(n.position.y - y) < 90);
    if (!target) return;
    const newParent = target.id === "no-folder" ? null : (target.data?.folderId as string);
    const cur = items.find((i) => i.id === docId);
    if (!cur || cur.parent_id === newParent) return;
    try { await moveItem(docId, newParent); await refetch(); } catch (e) { console.error(e); }
  }, [items, refetch]);

  // Création dans un dossier spécifique
  const handleCreateInFolder = useCallback(async (type: string, url: string, folderId: string | null) => {
    setShowCreate(false);
    setCreateInFolder(null);
    if (type === "folder") {
      const name = window.prompt("Nom du dossier :");
      if (!name?.trim()) return;
      try { await createFolder(name.trim(), folderId); await refetch(); } catch (e) { console.error(e); }
    } else {
      window.open(url, "_blank");
      // Au retour de focus, refetch pour voir le nouvel item
    }
  }, [refetch]);

  // Click: toggle folder / open doc / ouvrir menu "+"
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.data?.isAdd) {
      setCreateInFolder(node.data.folderId as string);
      setShowCreate(true);
    } else if (node.data?.isFolder && node.data?.hasChildren) {
      const key = node.data.folderId as string;
      setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    } else if (node.data?.url) {
      window.open(node.data.url as string, "_blank");
    }
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative", background: T.canvas }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag} onNodeDragStop={onNodeDragStop}
        fitView fitViewOptions={{ padding: 0.15 }}
        minZoom={0.04} maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={T.bgDot} gap={28} />
        <Controls style={{ background: T.ctrlBg, border: `1px solid ${T.ctrlBorder}` }} />
        <MiniMap
          style={{ background: T.minimap, border: `1px solid ${T.ctrlBorder}` }}
          nodeColor={(n) => {
            if (n.id === "root") return "#22c55e";
            const r = roots.find((f) => f.id === n.id);
            return r?.color ?? "#9ca3af";
          }}
        />
      </ReactFlow>

      {/* Barre du haut */}
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/mydrive" style={{
          background: T.barBg, color: T.barText, border: `1px solid ${T.barBorder}`,
          borderRadius: 8, padding: "8px 14px", fontSize: 13, textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>← MyDrive</Link>
        <button onClick={() => setIsJour((v) => !v)}
          title={isJour ? "Passer en vue Nuit (fond blanc)" : "Passer en vue Jour (fond noir)"}
          style={{ background: T.barBg, color: T.barText, border: `1px solid ${T.barBorder}`, borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
          {isJour ? "☀️ Jour" : "🌙 Nuit"}
        </button>
        <span style={{ color: T.barText, fontSize: 12, opacity: 0.6, userSelect: "none" }}>
          Glisser un doc sur un dossier · Cliquer ▶ pour ouvrir
        </span>
      </div>

      {/* Bouton + */}
      <div style={{ position: "absolute", bottom: 28, right: 28, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
        {showCreate && (
          <div style={{ background: T.menuBg, border: `1px solid ${T.barBorder}`, borderRadius: 12, padding: "8px 4px", display: "flex", flexDirection: "column", gap: 2, boxShadow: "0 8px 24px #00000044" }}>
            {createInFolder && (
              <div style={{ padding: "6px 20px 4px", fontSize: 11, color: T.barText, opacity: 0.7, borderBottom: `1px solid ${T.barBorder}`, marginBottom: 4 }}>
                Dans le dossier sélectionné
              </div>
            )}
            {/* Dossier en premier si on est dans un contexte dossier */}
            {createInFolder && (
              <button
                onClick={() => handleCreateInFolder("folder", "", createInFolder)}
                style={{ background: "transparent", color: T.menuText, border: "none", padding: "10px 20px", fontSize: 14, textAlign: "left", cursor: "pointer", borderRadius: 8, whiteSpace: "nowrap" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.menuHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >📁 Sous-dossier</button>
            )}
            {CREATE_OPTIONS.map((opt) => (
              <button key={opt.url}
                onClick={() => handleCreateInFolder(opt.label, opt.url, createInFolder)}
                style={{ background: "transparent", color: T.menuText, border: "none", padding: "10px 20px", fontSize: 14, textAlign: "left", cursor: "pointer", borderRadius: 8, whiteSpace: "nowrap" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.menuHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >{opt.label}</button>
            ))}
          </div>
        )}
        <button onClick={() => { setShowCreate((v) => !v); if (showCreate) setCreateInFolder(null); }}
          style={{ width: 54, height: 54, borderRadius: "50%", background: showCreate ? T.barBg : "#166534", color: showCreate ? T.barText : "#4ade80", border: `2px solid ${showCreate ? T.barBorder : "#22c55e"}`, fontSize: 28, cursor: "pointer", lineHeight: 1, boxShadow: "0 4px 16px #00000044" }}>
          {showCreate ? "×" : "+"}
        </button>
      </div>
    </div>
  );
}
