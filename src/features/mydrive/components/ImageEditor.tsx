"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "@/components/Toaster";

type Props = {
  imageUrl: string;
  mode: "crop" | "rotate";
  onSave: (blob: Blob) => void;
  onCancel: () => void;
};

export default function ImageEditor({ imageUrl, mode, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);

  // Crop state
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragType, setDragType] = useState<"move" | "resize" | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  // Canvas display dimensions
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0, scale: 1 });

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
    };
    img.onerror = () => {
      toast("Impossible de charger l'image. Veuillez réessayer.");
      onCancel();
    };
    img.src = imageUrl;
  }, [imageUrl, onCancel]);

  // Calculate display size and draw
  useEffect(() => {
    if (!image || !canvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const maxWidth = container.clientWidth - 40;
    const maxHeight = container.clientHeight - 100;

    let imgWidth = image.width;
    let imgHeight = image.height;

    // For rotation, swap dimensions if 90 or 270 degrees
    if (mode === "rotate" && (rotation === 90 || rotation === 270)) {
      [imgWidth, imgHeight] = [imgHeight, imgWidth];
    }

    const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);
    const displayWidth = imgWidth * scale;
    const displayHeight = imgHeight * scale;

    setDisplaySize({ width: displayWidth, height: displayHeight, scale });

    const canvas = canvasRef.current;
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    if (mode === "rotate") {
      ctx.save();
      ctx.translate(displayWidth / 2, displayHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);

      if (rotation === 90 || rotation === 270) {
        ctx.drawImage(image, -displayHeight / 2, -displayWidth / 2, displayHeight, displayWidth);
      } else {
        ctx.drawImage(image, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
      }
      ctx.restore();
    } else {
      ctx.drawImage(image, 0, 0, displayWidth, displayHeight);
    }

    // Initialize crop area to full image if not set
    if (mode === "crop" && cropArea.width === 0) {
      setCropArea({
        x: displayWidth * 0.1,
        y: displayHeight * 0.1,
        width: displayWidth * 0.8,
        height: displayHeight * 0.8,
      });
    }
  }, [image, rotation, mode, cropArea.width]);

  // Draw crop overlay
  useEffect(() => {
    if (mode !== "crop" || !canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Redraw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, displaySize.width, displaySize.height);

    // Draw dark overlay outside crop area
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, cropArea.y);
    ctx.fillRect(0, cropArea.y, cropArea.x, cropArea.height);
    ctx.fillRect(cropArea.x + cropArea.width, cropArea.y, canvas.width - cropArea.x - cropArea.width, cropArea.height);
    ctx.fillRect(0, cropArea.y + cropArea.height, canvas.width, canvas.height - cropArea.y - cropArea.height);

    // Draw crop border
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.strokeRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);

    // Draw corner handles
    const handleSize = 10;
    ctx.fillStyle = "#3b82f6";
    const corners = [
      { x: cropArea.x, y: cropArea.y },
      { x: cropArea.x + cropArea.width, y: cropArea.y },
      { x: cropArea.x, y: cropArea.y + cropArea.height },
      { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height },
    ];
    corners.forEach(({ x, y }) => {
      ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
    });

    // Draw grid lines (rule of thirds)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const x = cropArea.x + (cropArea.width * i) / 3;
      const y = cropArea.y + (cropArea.height * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, cropArea.y);
      ctx.lineTo(x, cropArea.y + cropArea.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cropArea.x, y);
      ctx.lineTo(cropArea.x + cropArea.width, y);
      ctx.stroke();
    }
  }, [cropArea, mode, image, displaySize]);

  const getMousePos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const getResizeHandle = (pos: { x: number; y: number }) => {
    const handleSize = 15;
    const { x, y, width, height } = cropArea;

    if (Math.abs(pos.x - x) < handleSize && Math.abs(pos.y - y) < handleSize) return "tl";
    if (Math.abs(pos.x - (x + width)) < handleSize && Math.abs(pos.y - y) < handleSize) return "tr";
    if (Math.abs(pos.x - x) < handleSize && Math.abs(pos.y - (y + height)) < handleSize) return "bl";
    if (Math.abs(pos.x - (x + width)) < handleSize && Math.abs(pos.y - (y + height)) < handleSize) return "br";

    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== "crop") return;
    const pos = getMousePos(e);
    const handle = getResizeHandle(pos);

    if (handle) {
      setDragType("resize");
      setResizeHandle(handle);
    } else if (
      pos.x >= cropArea.x &&
      pos.x <= cropArea.x + cropArea.width &&
      pos.y >= cropArea.y &&
      pos.y <= cropArea.y + cropArea.height
    ) {
      setDragType("move");
    } else {
      return;
    }

    setIsDragging(true);
    setDragStart(pos);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || mode !== "crop") return;

    const pos = getMousePos(e);
    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;

    setCropArea((prev) => {
      let newArea = { ...prev };
      const minSize = 50;

      if (dragType === "move") {
        newArea.x = Math.max(0, Math.min(displaySize.width - prev.width, prev.x + dx));
        newArea.y = Math.max(0, Math.min(displaySize.height - prev.height, prev.y + dy));
      } else if (dragType === "resize" && resizeHandle) {
        switch (resizeHandle) {
          case "tl":
            newArea.width = Math.max(minSize, prev.width - dx);
            newArea.height = Math.max(minSize, prev.height - dy);
            if (newArea.width !== prev.width) newArea.x = prev.x + dx;
            if (newArea.height !== prev.height) newArea.y = prev.y + dy;
            break;
          case "tr":
            newArea.width = Math.max(minSize, prev.width + dx);
            newArea.height = Math.max(minSize, prev.height - dy);
            if (newArea.height !== prev.height) newArea.y = prev.y + dy;
            break;
          case "bl":
            newArea.width = Math.max(minSize, prev.width - dx);
            newArea.height = Math.max(minSize, prev.height + dy);
            if (newArea.width !== prev.width) newArea.x = prev.x + dx;
            break;
          case "br":
            newArea.width = Math.max(minSize, prev.width + dx);
            newArea.height = Math.max(minSize, prev.height + dy);
            break;
        }

        // Clamp to canvas bounds
        newArea.x = Math.max(0, newArea.x);
        newArea.y = Math.max(0, newArea.y);
        newArea.width = Math.min(displaySize.width - newArea.x, newArea.width);
        newArea.height = Math.min(displaySize.height - newArea.y, newArea.height);
      }

      return newArea;
    });

    setDragStart(pos);
  }, [isDragging, mode, dragStart, dragType, resizeHandle, displaySize]);

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragType(null);
    setResizeHandle(null);
  };

  const rotate90 = (direction: "cw" | "ccw") => {
    setRotation((prev) => {
      const delta = direction === "cw" ? 90 : -90;
      return (prev + delta + 360) % 360;
    });
  };

  const handleApply = () => {
    setShowConfirm(true);
  };

  const handleConfirmSave = async () => {
    if (!image) return;

    try {
      const outputCanvas = document.createElement("canvas");
      const ctx = outputCanvas.getContext("2d");
      if (!ctx) {
        toast("Erreur : impossible de créer le canvas");
        return;
      }

      if (mode === "crop") {
        // Calculate original image coordinates from display coordinates
        const scaleX = image.width / displaySize.width;
        const scaleY = image.height / displaySize.height;

        const origX = cropArea.x * scaleX;
        const origY = cropArea.y * scaleY;
        const origWidth = cropArea.width * scaleX;
        const origHeight = cropArea.height * scaleY;

        outputCanvas.width = origWidth;
        outputCanvas.height = origHeight;

        ctx.drawImage(
          image,
          origX, origY, origWidth, origHeight,
          0, 0, origWidth, origHeight
        );
      } else {
        // Rotation
        if (rotation === 90 || rotation === 270) {
          outputCanvas.width = image.height;
          outputCanvas.height = image.width;
        } else {
          outputCanvas.width = image.width;
          outputCanvas.height = image.height;
        }

        ctx.translate(outputCanvas.width / 2, outputCanvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(image, -image.width / 2, -image.height / 2);
      }

      outputCanvas.toBlob(
        (blob) => {
          if (blob) {
            onSave(blob);
          } else {
            toast("Erreur lors de la conversion de l'image. Veuillez réessayer.");
          }
        },
        "image/jpeg",
        0.92
      );
    } catch (error) {
      console.error("Erreur lors de la transformation:", error);
      toast("Erreur lors de la transformation de l'image. Veuillez réessayer.");
    }
  };

  const getCursor = () => {
    if (mode !== "crop") return "default";
    return "crosshair";
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <h3 className="text-white text-lg font-semibold">
          {mode === "crop" ? "Rogner l'image" : "Pivoter l'image"}
        </h3>
        <button
          onClick={onCancel}
          className="text-white/50 hover:text-white text-2xl p-2"
        >
          ✕
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center w-full overflow-hidden py-16">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: getCursor() }}
          className="max-w-full max-h-full"
        />
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-4">
        {mode === "rotate" && (
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={() => rotate90("ccw")}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span className="text-xl">↺</span> -90°
            </button>
            <span className="text-white/70 min-w-[60px] text-center">{rotation}°</span>
            <button
              onClick={() => rotate90("cw")}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              +90° <span className="text-xl">↻</span>
            </button>
          </div>
        )}

        {mode === "crop" && (
          <p className="text-white/50 text-sm">
            Glissez les coins ou le cadre pour ajuster la zone de rognage
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="bg-neutral-700 hover:bg-neutral-600 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleApply}
            disabled={mode === "rotate" && rotation === 0}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
          >
            Appliquer
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-neutral-900 rounded-xl p-6 max-w-sm mx-4 shadow-2xl border border-neutral-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-2">
              Enregistrer les modifications ?
            </h3>
            <p className="text-neutral-400 text-sm mb-6">
              L'image originale sera remplacee par la nouvelle version. Cette action est irreversible.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-neutral-300 hover:text-white transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmSave}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
