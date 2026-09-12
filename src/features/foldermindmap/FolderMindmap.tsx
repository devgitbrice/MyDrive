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

// Palette de couleurs pour les dossiers (cycle si > 10 dossiers)
const FOLDER_COLORS = [
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#f43f5e",
];

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
  const t = item.doc_type || item.type || "";
  const icons: Record<string, string> = {
    scan: "🖼", doc: "📄", mindmap: "🧠", table: "📊",
    presentation: "📽", voyage: "✈️", python: "🐍", fiche: "🗂",
  };
  const icon = icons[t] ?? "📁";
  const title = item.title.length > 30 ? item.title.slice(0, 27) + "…" : item.title;
  return `${icon} ${title}`;
}

const ITEM_GAP = 58;
const TYPE_GAP = 44;
const FOLDER_H = 44;
const COL_ROOT   = 0;
const COL_FOLDER = 300;
const COL_ITEM   = 620;

interface FolderNode {
  id: string;
  title: string;
  color: string;
  count: number;        // nb d'items directs
  children: MyDriveItem[];
}

function buildGraph(
  folders: FolderNode[],
  expandedFolders: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const slotHeights = folders.map((f) =>
    expandedFolders.has(f.id)
      ? Math.max(FOLDER_H, f.children.length * ITEM_GAP)
      : FOLDER_H
  );
  const totalHeight =
    slotHeights.reduce((a, b) => a + b, 0) + TYPE_GAP * (folders.length - 1);

  // Nœud racine MyDrive
  nodes.push({
    id: "root",
    position: { x: COL_ROOT, y: totalHeight / 2 - 55 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { label: "MyDrive" },
    style: {
      background: "#166534",
      color: "#4ade80",
      border: "2px solid #22c55e",
      borderRadius: "50%",
      width: 110,
      height: 110,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "bold",
      fontSize: 18,
    },
  });

  let cursorY = 0;
  folders.forEach((folder, fi) => {
    const slotH = slotHeights[fi];
    const centerY = cursorY + slotH / 2;
    cursorY += slotH + TYPE_GAP;

    const color = folder.color;
    const isOpen = expandedFolders.has(folder.id);
    const arrow = folder.children.length === 0 ? "·" : isOpen ? "▼" : "▶";

    // Nœud dossier
    nodes.push({
      id: folder.id,
      position: { x: COL_FOLDER, y: centerY - FOLDER_H / 2 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: `${arrow} ${folder.title} (${folder.count})`, folderId: folder.id, isFolder: true, hasChildren: folder.children.length > 0 },
      style: {
        background: color + "22",
        color: color,
        border: `2px solid ${isOpen ? color : color + "88"}`,
        borderRadius: 12,
        padding: "8px 18px",
        fontWeight: 700,
        fontSize: 13,
        whiteSpace: "nowrap",
        cursor: folder.children.length > 0 ? "pointer" : "default",
      },
    });

    edges.push({
      id: `e-root-${folder.id}`,
      source: "root",
      target: folder.id,
      type: "smoothstep",
      style: { stroke: color + (isOpen ? "cc" : "77"), strokeWidth: isOpen ? 2 : 1.5 },
    });

    if (isOpen && folder.children.length > 0) {
      const itemsH = (folder.children.length - 1) * ITEM_GAP;
      const startY = centerY - itemsH / 2;

      folder.children.forEach((item, ii) => {
        const iy = startY + ii * ITEM_GAP;
        const itemId = `item-${item.id}`;
        const url = getItemUrl(item);

        nodes.push({
          id: itemId,
          position: { x: COL_ITEM, y: iy - 18 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: { label: docLabel(item), url },
          style: {
            background: "#111827",
            color: "#e5e7eb",
            border: `1px solid ${color}55`,
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
          },
        });

        edges.push({
          id: `e-${folder.id}-${itemId}`,
          source: folder.id,
          target: itemId,
          type: "smoothstep",
          style: { stroke: `${color}66`, strokeWidth: 1 },
        });
      });
    }
  });

  return { nodes, edges };
}

export default function FolderMindmap({ items }: { items: MyDriveItem[] }) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Construire la liste de dossiers à partir des items
  const folders = useMemo<FolderNode[]>(() => {
    const activeItems = items.filter((i) => !(i as any).deleted_at);

    // Dossiers racine (type="folder", parent_id=null)
    const rootFolders = activeItems
      .filter((i) => i.type === "folder" && !i.parent_id)
      .sort((a, b) => a.title.localeCompare(b.title));

    // Items sans dossier (type≠folder, parent_id=null)
    const noFolder = activeItems.filter((i) => i.type !== "folder" && !i.parent_id);

    const result: FolderNode[] = [];

    // "Sans dossier" en premier si des items existent
    if (noFolder.length > 0) {
      result.push({
        id: "no-folder",
        title: "Sans dossier",
        color: FOLDER_COLORS[0],
        count: noFolder.length,
        children: noFolder,
      });
    }

    // Vrais dossiers
    rootFolders.forEach((folder, fi) => {
      const children = activeItems.filter(
        (i) => i.parent_id === folder.id && i.type !== "folder"
      );
      const subFolderCount = activeItems.filter(
        (i) => i.parent_id === folder.id && i.type === "folder"
      ).length;

      result.push({
        id: folder.id,
        title: folder.title,
        color: FOLDER_COLORS[(fi + 1) % FOLDER_COLORS.length],
        count: children.length + subFolderCount,
        children,
      });
    });

    return result;
  }, [items]);

  const { nodes: computed, edges: computedEdges } = useMemo(
    () => buildGraph(folders, expandedFolders),
    [folders, expandedFolders],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(computed);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes(computed);
    setEdges(computedEdges);
  }, [computed, computedEdges, setNodes, setEdges]);

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
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.04}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2a2a2a" gap={28} />
        <Controls style={{ background: "#1a1a1a", border: "1px solid #374151" }} />
        <MiniMap
          style={{ background: "#111", border: "1px solid #374151" }}
          nodeColor={(n) => {
            if (n.id === "root") return "#22c55e";
            const f = folders.find((f) => f.id === n.id);
            return f?.color ?? "#374151";
          }}
        />
      </ReactFlow>

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          pointerEvents: "auto",
        }}
      >
        <Link
          href="/mydrive"
          style={{
            background: "#1f2937",
            color: "#9ca3af",
            border: "1px solid #374151",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          ← MyDrive
        </Link>
        <span style={{ color: "#6b7280", fontSize: 12, userSelect: "none" }}>
          Cliquer un dossier ▶ pour l&apos;ouvrir · Cliquer un item pour l&apos;éditer
        </span>
      </div>
    </div>
  );
}
