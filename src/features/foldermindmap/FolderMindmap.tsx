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

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scan:         { label: "Scans",          color: "#3b82f6", bg: "#0f1f3d" },
  doc:          { label: "Documents",      color: "#6366f1", bg: "#13104a" },
  mindmap:      { label: "Mindmaps",       color: "#a855f7", bg: "#1a0a3d" },
  table:        { label: "Tables",         color: "#22c55e", bg: "#052e16" },
  presentation: { label: "Présentations",  color: "#f97316", bg: "#2c1000" },
  voyage:       { label: "Voyages",        color: "#14b8a6", bg: "#012a29" },
  python:       { label: "Python",         color: "#eab308", bg: "#1c1200" },
  fiche:        { label: "Fiches",         color: "#ec4899", bg: "#2d0a1e" },
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

const ITEM_GAP = 60;
const TYPE_GAP = 40;
const TYPE_H   = 44;
const COL_ROOT = 0;
const COL_TYPE = 280;
const COL_ITEM = 560;

function buildGraph(
  items: MyDriveItem[],
  expandedTypes: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const groups: Record<string, MyDriveItem[]> = {};
  for (const item of items) {
    const key = item.doc_type || item.type || "scan";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  const types = Object.keys(groups);

  const slotHeights = types.map((t) =>
    expandedTypes.has(t)
      ? Math.max(TYPE_H, groups[t].length * ITEM_GAP)
      : TYPE_H
  );
  const totalHeight =
    slotHeights.reduce((a, b) => a + b, 0) + TYPE_GAP * (types.length - 1);

  // Nœud racine — connexions droite sortante
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
  types.forEach((type, ti) => {
    const slotH = slotHeights[ti];
    const typeCenterY = cursorY + slotH / 2;
    cursorY += slotH + TYPE_GAP;

    const cfg = TYPE_CONFIG[type] ?? { label: type, color: "#6b7280", bg: "#1f2937" };
    const typeId = `type-${type}`;
    const isOpen = expandedTypes.has(type);
    const arrow = isOpen ? "▼" : "▶";

    // Nœud type — connexions gauche entrante, droite sortante
    nodes.push({
      id: typeId,
      position: { x: COL_TYPE, y: typeCenterY - TYPE_H / 2 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { label: `${arrow} ${cfg.label} (${groups[type].length})`, typeKey: type, isFolder: true },
      style: {
        background: cfg.bg,
        color: cfg.color,
        border: `2px solid ${isOpen ? cfg.color : cfg.color + "99"}`,
        borderRadius: 12,
        padding: "8px 18px",
        fontWeight: 700,
        fontSize: 13,
        whiteSpace: "nowrap",
        cursor: "pointer",
      },
    });

    edges.push({
      id: `e-root-${typeId}`,
      source: "root",
      target: typeId,
      type: "smoothstep",
      style: { stroke: cfg.color + (isOpen ? "ff" : "99"), strokeWidth: isOpen ? 2 : 1.5 },
    });

    if (isOpen) {
      const typeItems = groups[type];
      const itemsHeight = (typeItems.length - 1) * ITEM_GAP;
      const itemsStartY = typeCenterY - itemsHeight / 2;

      typeItems.forEach((item, ii) => {
        const iy = itemsStartY + ii * ITEM_GAP;
        const itemId = `item-${item.id}`;
        const url = getItemUrl(item);
        const label = item.title.length > 34 ? item.title.slice(0, 31) + "…" : item.title;

        nodes.push({
          id: itemId,
          position: { x: COL_ITEM, y: iy - 18 },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: { label, url },
          style: {
            background: "#111827",
            color: "#e5e7eb",
            border: `1px solid ${cfg.color}66`,
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
          },
        });

        edges.push({
          id: `e-${typeId}-${itemId}`,
          source: typeId,
          target: itemId,
          type: "smoothstep",
          style: { stroke: `${cfg.color}88`, strokeWidth: 1 },
        });
      });
    }
  });

  return { nodes, edges };
}

export default function FolderMindmap({ items }: { items: MyDriveItem[] }) {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const { nodes: computed, edges: computedEdges } = useMemo(
    () => buildGraph(items, expandedTypes),
    [items, expandedTypes],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(computed);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => {
    setNodes(computed);
    setEdges(computedEdges);
  }, [computed, computedEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.data?.isFolder) {
      const key = node.data.typeKey as string;
      setExpandedTypes((prev) => {
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
            if (n.id.startsWith("type-")) {
              const t = n.id.replace("type-", "");
              return TYPE_CONFIG[t]?.color ?? "#6b7280";
            }
            return "#374151";
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
