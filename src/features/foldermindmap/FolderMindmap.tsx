"use client";

import { useCallback, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
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

function deg2rad(deg: number) {
  return (deg * Math.PI) / 180;
}

function buildGraph(items: MyDriveItem[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const groups: Record<string, MyDriveItem[]> = {};
  for (const item of items) {
    const key = item.doc_type || item.type || "scan";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  const types = Object.keys(groups);
  const TYPE_RADIUS = 340;
  const ITEM_RADIUS = 220;

  // Root node
  nodes.push({
    id: "root",
    position: { x: 0, y: 0 },
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

  types.forEach((type, ti) => {
    const typeAngleDeg = (360 / types.length) * ti - 90;
    const typeAngle = deg2rad(typeAngleDeg);
    const tx = Math.cos(typeAngle) * TYPE_RADIUS;
    const ty = Math.sin(typeAngle) * TYPE_RADIUS;
    const cfg = TYPE_CONFIG[type] ?? { label: type, color: "#6b7280", bg: "#1f2937" };
    const typeId = `type-${type}`;

    nodes.push({
      id: typeId,
      position: { x: tx, y: ty },
      data: { label: `${cfg.label}\n(${groups[type].length})` },
      style: {
        background: cfg.bg,
        color: cfg.color,
        border: `2px solid ${cfg.color}`,
        borderRadius: 12,
        padding: "10px 18px",
        fontWeight: 700,
        fontSize: 13,
        whiteSpace: "pre-line",
        textAlign: "center",
        lineHeight: 1.3,
      },
    });

    edges.push({
      id: `e-root-${typeId}`,
      source: "root",
      target: typeId,
      style: { stroke: cfg.color, strokeWidth: 2 },
    });

    const typeItems = groups[type];
    const arcSpanDeg = Math.min(80, Math.max(30, typeItems.length * 15));

    typeItems.forEach((item, ii) => {
      const t = typeItems.length === 1
        ? 0
        : (ii / (typeItems.length - 1) - 0.5);
      const itemAngle = typeAngle + deg2rad(arcSpanDeg * t);
      const ix = tx + Math.cos(itemAngle) * ITEM_RADIUS;
      const iy = ty + Math.sin(itemAngle) * ITEM_RADIUS;
      const itemId = `item-${item.id}`;
      const url = getItemUrl(item);
      const label = item.title.length > 28 ? item.title.slice(0, 25) + "…" : item.title;

      nodes.push({
        id: itemId,
        position: { x: ix, y: iy },
        data: { label, url },
        style: {
          background: "#111827",
          color: "#e5e7eb",
          border: `1px solid ${cfg.color}66`,
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 12,
          cursor: "pointer",
          maxWidth: 170,
          textAlign: "center",
          lineHeight: 1.4,
        },
      });

      edges.push({
        id: `e-${typeId}-${itemId}`,
        source: typeId,
        target: itemId,
        style: { stroke: `${cfg.color}66`, strokeWidth: 1 },
      });
    });
  });

  return { nodes, edges };
}

export default function FolderMindmap({ items }: { items: MyDriveItem[] }) {
  const { nodes: initNodes, edges: initEdges } = useMemo(() => buildGraph(items), [items]);
  const [nodes, , onNodesChange] = useNodesState(initNodes);
  const [edges, , onEdgesChange] = useEdgesState(initEdges);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.data?.url) {
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
        minZoom={0.05}
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

      {/* Top bar */}
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
          Déplacer : glisser le canvas · Ouvrir : cliquer sur un item
        </span>
      </div>
    </div>
  );
}
