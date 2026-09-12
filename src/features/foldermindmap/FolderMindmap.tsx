"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import Link from "next/link";
import type { MyDriveItem } from "@/features/mydrive/types";
import { fetchMyDrive } from "@/features/mydrive/lib/fetchMyDrive";
import { moveItem } from "@/features/mydrive/lib/folders";

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

// Thèmes
const DARK = {
  canvas:      "#0d0d0d",
  bgDot:       "#2a2a2a",
  itemBg:      "#111827",
  itemText:    "#e5e7eb",
  ctrlBg:      "#1a1a1a",
  ctrlBorder:  "#374151",
  barBg:       "#1f2937",
  barText:     "#9ca3af",
  barBorder:   "#374151",
  menuBg:      "#1f2937",
  menuText:    "#e5e7eb",
  menuHover:   "#374151",
  minimap:     "#111",
};
const LIGHT = {
  canvas:      "#f1f5f9",
  bgDot:       "#cbd5e1",
  itemBg:      "#ffffff",
  itemText:    "#111827",
  ctrlBg:      "#ffffff",
  ctrlBorder:  "#d1d5db",
  barBg:       "#ffffff",
  barText:     "#374151",
  barBorder:   "#d1d5db",
  menuBg:      "#ffffff",
  menuText:    "#111827",
  menuHover:   "#f3f4f6",
  minimap:     "#f9fafb",
};

function getItemUrl(item: MyDriveItem): string {
  const t = item.doc_type || item.type || "scan";
  switch (t) {
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
    scan: "🖼", doc: "📄", mindmap: "🧠", table: "📊",
    presentation: "📽", voyage: "✈️", python: "🐍", fiche: "🗂",
  };
  const t = item.doc_type || item.type || "";
  return `${icons[t] ?? "📁"} ${item.title}`;
}

const ITEM_GAP    = 110;
const ITEM_WIDTH  = 340;
const ITEM_MINHGT = 60;
const TYPE_GAP    = 44;
const FOLDER_H    = 44;
const COL_ROOT    = 0;
const COL_FOLDER  = 300;
const COL_ITEM    = 680;

interface FolderNode { id: string; title: string; color: string; count: number; children: MyDriveItem[] }

function buildFolders(items: MyDriveItem[]): FolderNode[] {
  const active = items.filter((i) => !(i as any).deleted_at);
  const rootFolders = active
    .filter((i) => i.type === "folder" && !i.parent_id)
    .sort((a, b) => a.title.localeCompare(b.title));
  const noFolder = active.filter((i) => i.type !== "folder" && !i.parent_id);

  const result: FolderNode[] = [];
  if (noFolder.length > 0) {
    result.push({ id: "no-folder", title: "Sans dossier", color: FOLDER_COLORS[0], count: noFolder.length, children: noFolder });
  }
  rootFolders.forEach((folder, fi) => {
    const children = active.filter((i) => i.parent_id === folder.id && i.type !== "folder");
    const subCount = active.filter((i) => i.parent_id === folder.id && i.type === "folder").length;
    result.push({
      id: folder.id, title: folder.title,
      color: FOLDER_COLORS[(fi + 1) % FOLDER_COLORS.length],
      count: children.length + subCount, children,
    });
  });
  return result;
}

function buildGraph(
  folders: FolderNode[],
  expandedFolders: Set<string>,
  draggingOver: string | null,
  T: typeof DARK,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const slotHeights = folders.map((f) =>
    expandedFolders.has(f.id) ? Math.max(FOLDER_H, f.children.length * ITEM_GAP) : FOLDER_H
  );
  const totalHeight = slotHeights.reduce((a, b) => a + b, 0) + TYPE_GAP * (folders.length - 1);

  // Nœud racine
  nodes.push({
    id: "root",
    position: { x: COL_ROOT, y: totalHeight / 2 - 55 },
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

  let cursorY = 0;
  folders.forEach((folder) => {
    const slotH = slotHeights[folders.indexOf(folder)];
    const centerY = cursorY + slotH / 2;
    cursorY += slotH + TYPE_GAP;

    const { color } = folder;
    const isOpen = expandedFolders.has(folder.id);
    const isTarget = draggingOver === folder.id;
    const arrow = folder.children.length === 0 ? "·" : isOpen ? "▼" : "▶";

    nodes.push({
      id: folder.id,
      position: { x: COL_FOLDER, y: centerY - FOLDER_H / 2 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: `${arrow} ${folder.title} (${folder.count})`, folderId: folder.id, isFolder: true, hasChildren: folder.children.length > 0 },
      style: {
        background: isTarget ? color + "44" : color + "18",
        color,
        border: `2px solid ${isTarget ? color : isOpen ? color : color + "99"}`,
        borderRadius: 12, padding: "8px 18px",
        fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
        cursor: folder.children.length > 0 ? "pointer" : "default",
        transition: "background 0.15s, border-color 0.15s",
        boxShadow: isTarget ? `0 0 12px ${color}66` : "none",
      },
    });

    edges.push({
      id: `e-root-${folder.id}`,
      source: "root", target: folder.id, type: "smoothstep",
      style: { stroke: color + (isOpen ? "dd" : "88"), strokeWidth: isOpen ? 2 : 1.5 },
    });

    if (isOpen && folder.children.length > 0) {
      const itemsH = (folder.children.length - 1) * ITEM_GAP;
      const startY = centerY - itemsH / 2;

      folder.children.forEach((item, ii) => {
        const itemId = `item-${item.id}`;
        nodes.push({
          id: itemId,
          position: { x: COL_ITEM, y: startY + ii * ITEM_GAP - ITEM_MINHGT / 2 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: { label: docLabel(item), url: getItemUrl(item), docId: item.id },
          style: {
            background: T.itemBg, color: T.itemText,
            border: `1.5px solid ${color}66`,
            borderRadius: 8, padding: "10px 16px",
            fontSize: 13, cursor: "grab",
            width: ITEM_WIDTH, minHeight: ITEM_MINHGT,
            whiteSpace: "normal", wordBreak: "break-word",
            lineHeight: 1.55, textAlign: "left", boxSizing: "border-box",
          },
        });
        edges.push({
          id: `e-${folder.id}-${itemId}`,
          source: folder.id, target: itemId, type: "smoothstep",
          style: { stroke: `${color}77`, strokeWidth: 1 },
        });
      });
    }
  });

  return { nodes, edges };
}

export default function FolderMindmap({ items: initialItems }: { items: MyDriveItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [draggingOver, setDraggingOver] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isDark, setIsDark] = useState(true);

  const T = isDark ? DARK : LIGHT;

  const refetch = useCallback(async () => {
    try { setItems(await fetchMyDrive()); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    window.addEventListener("focus", refetch);
    return () => window.removeEventListener("focus", refetch);
  }, [refetch]);

  const folders = useMemo(() => buildFolders(items), [items]);

  const { nodes: computed, edges: computedEdges } = useMemo(
    () => buildGraph(folders, expandedFolders, draggingOver, T),
    [folders, expandedFolders, draggingOver, T],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(computed);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => { setNodes(computed); setEdges(computedEdges); },
    [computed, computedEdges, setNodes, setEdges]);

  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node, allNodes: Node[]) => {
    if (!node.id.startsWith("item-")) { setDraggingOver(null); return; }
    const { x: nx, y: ny } = node.position;
    const target = allNodes.find(
      (n) => n.data?.isFolder && Math.abs(n.position.x - nx) < 250 && Math.abs(n.position.y - ny) < 80
    );
    setDraggingOver(target?.id ?? null);
  }, []);

  const onNodeDragStop = useCallback(async (_: React.MouseEvent, node: Node, allNodes: Node[]) => {
    setDraggingOver(null);
    if (!node.id.startsWith("item-")) return;
    const docId = node.data?.docId as string;
    const { x: nx, y: ny } = node.position;
    const target = allNodes.find(
      (n) => n.data?.isFolder && Math.abs(n.position.x - nx) < 250 && Math.abs(n.position.y - ny) < 80
    );
    if (!target) return;
    const newParentId = target.id === "no-folder" ? null : target.id;
    const current = items.find((i) => i.id === docId);
    if (!current || current.parent_id === newParentId) return;
    try { await moveItem(docId, newParentId); await refetch(); } catch (e) { console.error(e); }
  }, [items, refetch]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.data?.isFolder && node.data?.hasChildren) {
      const key = node.data.folderId as string;
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
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
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
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
            const f = folders.find((f) => f.id === n.id);
            return f?.color ?? "#9ca3af";
          }}
        />
      </ReactFlow>

      {/* Barre du haut */}
      <div style={{
        position: "absolute", top: 16, left: 16, zIndex: 10,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Link href="/mydrive" style={{
          background: T.barBg, color: T.barText, border: `1px solid ${T.barBorder}`,
          borderRadius: 8, padding: "8px 14px", fontSize: 13, textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          ← MyDrive
        </Link>

        {/* Toggle jour / nuit */}
        <button
          onClick={() => setIsDark((v) => !v)}
          title={isDark ? "Vue de jour" : "Vue de nuit"}
          style={{
            background: T.barBg, color: T.barText, border: `1px solid ${T.barBorder}`,
            borderRadius: 8, padding: "8px 12px", fontSize: 16,
            cursor: "pointer", lineHeight: 1,
          }}
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        <span style={{ color: T.barText, fontSize: 12, opacity: 0.7, userSelect: "none" }}>
          Glisser un doc sur un dossier pour le déplacer
        </span>
      </div>

      {/* Bouton + flottant */}
      <div style={{ position: "absolute", bottom: 28, right: 28, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
        {showCreate && (
          <div style={{
            background: T.menuBg, border: `1px solid ${T.barBorder}`, borderRadius: 12,
            padding: "8px 4px", display: "flex", flexDirection: "column", gap: 2,
            boxShadow: "0 8px 24px #00000044",
          }}>
            {CREATE_OPTIONS.map((opt) => (
              <button
                key={opt.url}
                onClick={() => { window.open(opt.url, "_blank"); setShowCreate(false); }}
                style={{
                  background: "transparent", color: T.menuText, border: "none",
                  padding: "10px 20px", fontSize: 14, textAlign: "left",
                  cursor: "pointer", borderRadius: 8, whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.menuHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowCreate((v) => !v)}
          style={{
            width: 54, height: 54, borderRadius: "50%",
            background: showCreate ? T.barBg : "#166534",
            color: showCreate ? T.barText : "#4ade80",
            border: `2px solid ${showCreate ? T.barBorder : "#22c55e"}`,
            fontSize: 28, cursor: "pointer", lineHeight: 1,
            boxShadow: "0 4px 16px #00000044", transition: "all 0.15s",
          }}
        >
          {showCreate ? "×" : "+"}
        </button>
      </div>
    </div>
  );
}
