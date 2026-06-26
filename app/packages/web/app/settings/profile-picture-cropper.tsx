"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ProfilePictureCrop } from "./profile-picture-resizer";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const DEFAULT_VIEWPORT_SIZE = 320;

type ImageDimensions = {
  width: number;
  height: number;
};

type Offset = {
  x: number;
  y: number;
};

type RenderMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffset: Offset;
};

type ProfilePictureCropperProps = {
  imageUrl: string;
  isUploading: boolean;
  onCancel: () => void;
  onConfirm: (crop: ProfilePictureCrop) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getRenderMetrics(
  dimensions: ImageDimensions,
  zoom: number,
  offset: Offset,
  viewportSize: number,
): RenderMetrics {
  const baseScale = Math.max(viewportSize / dimensions.width, viewportSize / dimensions.height);
  const scale = baseScale * zoom;
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;

  return {
    left: (viewportSize - width) / 2 + offset.x,
    top: (viewportSize - height) / 2 + offset.y,
    width,
    height,
    scale,
  };
}

function constrainOffset(offset: Offset, dimensions: ImageDimensions, zoom: number, viewportSize: number) {
  const centeredMetrics = getRenderMetrics(dimensions, zoom, { x: 0, y: 0 }, viewportSize);
  const minX = viewportSize - centeredMetrics.width - centeredMetrics.left;
  const maxX = -centeredMetrics.left;
  const minY = viewportSize - centeredMetrics.height - centeredMetrics.top;
  const maxY = -centeredMetrics.top;

  return {
    x: clamp(offset.x, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(offset.y, Math.min(minY, maxY), Math.max(minY, maxY)),
  };
}

function getCrop(metrics: RenderMetrics, dimensions: ImageDimensions, viewportSize: number): ProfilePictureCrop {
  const cropSize = viewportSize / metrics.scale;
  const maxX = Math.max(0, dimensions.width - cropSize);
  const maxY = Math.max(0, dimensions.height - cropSize);

  return {
    x: clamp(-metrics.left / metrics.scale, 0, maxX),
    y: clamp(-metrics.top / metrics.scale, 0, maxY),
    size: Math.min(cropSize, dimensions.width, dimensions.height),
  };
}

export default function ProfilePictureCropper({
  imageUrl,
  isUploading,
  onCancel,
  onConfirm,
}: ProfilePictureCropperProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [viewportSize, setViewportSize] = useState(DEFAULT_VIEWPORT_SIZE);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);

  useEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) {
      return;
    }

    const measuredElement = viewportElement;

    function updateViewportSize() {
      const width = measuredElement.getBoundingClientRect().width;
      if (width > 0) {
        setViewportSize(Math.round(width));
      }
    }

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(measuredElement);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isUploading) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isUploading, onCancel]);

  useEffect(() => {
    if (!dimensions) {
      return;
    }

    setOffset((currentOffset) => constrainOffset(currentOffset, dimensions, zoom, viewportSize));
  }, [dimensions, viewportSize, zoom]);

  const metrics = useMemo(() => {
    if (!dimensions) {
      return null;
    }

    return getRenderMetrics(dimensions, zoom, offset, viewportSize);
  }, [dimensions, offset, viewportSize, zoom]);

  function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    setDimensions({
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    setOffset({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!dimensions || isUploading) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: offset,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dimensions || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    setOffset(constrainOffset({
      x: dragState.startOffset.x + event.clientX - dragState.startClientX,
      y: dragState.startOffset.y + event.clientY - dragState.startClientY,
    }, dimensions, zoom, viewportSize));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  }

  function handleZoomChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextZoom = Number(event.target.value);
    setZoom(nextZoom);

    if (dimensions) {
      setOffset((currentOffset) => constrainOffset(currentOffset, dimensions, nextZoom, viewportSize));
    }
  }

  function handleConfirm() {
    if (!dimensions || !metrics) {
      return;
    }

    onConfirm(getCrop(metrics, dimensions, viewportSize));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-picture-cropper-title"
        className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900"
      >
        <h3 id="profile-picture-cropper-title" className="text-base font-semibold text-slate-950 dark:text-slate-50">
          Crop profile picture
        </h3>

        <div
          ref={viewportRef}
          className="relative mx-auto mt-4 aspect-square w-[min(20rem,calc(100vw-3rem))] touch-none select-none overflow-hidden rounded-md bg-slate-950"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            onLoad={handleImageLoad}
            className="absolute max-w-none select-none"
            style={metrics ? {
              left: metrics.left,
              top: metrics.top,
              width: metrics.width,
              height: metrics.height,
            } : {
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-inset ring-white/90" />
        </div>

        <div className="mt-4 grid gap-2">
          <label htmlFor="profile-picture-zoom" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Zoom
          </label>
          <input
            id="profile-picture-zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={handleZoomChange}
            disabled={!dimensions || isUploading}
            className="w-full accent-emerald-600 disabled:cursor-not-allowed dark:accent-emerald-400"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!dimensions || isUploading}
            className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          >
            {isUploading ? "Uploading..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
