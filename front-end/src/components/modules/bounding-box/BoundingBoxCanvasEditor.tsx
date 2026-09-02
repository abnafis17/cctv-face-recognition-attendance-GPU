"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useMjpegStream } from "@/hooks/useMjpegStream";
import { cn } from "@/lib/utils";

import {
  boxColorForIndex,
  createRectFromPoints,
  MIN_BOX_SIZE,
  moveRect,
  resizeRectWithHandle,
} from "./boundingBoxUtils";
import type {
  BoundingBoxPoint,
  BoundingBoxRect,
  BoundingBoxResizeHandle,
  EditableBoundingBox,
} from "./types";

const FIRST_FRAME_DETECT_WINDOW_MS = 20000;

type PointerInteraction =
  | {
      mode: "create";
      boxId: string;
      startPoint: BoundingBoxPoint;
    }
  | {
      mode: "move";
      boxId: string;
      startPoint: BoundingBoxPoint;
      initialRect: BoundingBoxRect;
    }
  | {
      mode: "resize";
      boxId: string;
      startPoint: BoundingBoxPoint;
      initialRect: BoundingBoxRect;
      handle: BoundingBoxResizeHandle;
    };

type BoundingBoxCanvasEditorProps = {
  cameraName: string;
  streamUrl: string;
  streamEnabled: boolean;
  boxes: EditableBoundingBox[];
  selectedBoxId: string | null;
  onSelectBox: (boxId: string) => void;
  onAddBox: (rect?: BoundingBoxRect) => string;
  onUpdateBoxRect: (boxId: string, rect: BoundingBoxRect) => void;
  onRemoveBox: (boxId: string) => void;
};

export default function BoundingBoxCanvasEditor({
  cameraName,
  streamUrl,
  streamEnabled,
  boxes,
  selectedBoxId,
  onSelectBox,
  onAddBox,
  onUpdateBoxRect,
  onRemoveBox,
}: BoundingBoxCanvasEditorProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxesRef = useRef(boxes);
  const interactionRef = useRef<PointerInteraction | null>(null);
  const [activeInteraction, setActiveInteraction] =
    useState<PointerInteraction | null>(null);

  useEffect(() => {
    boxesRef.current = boxes;
  }, [boxes]);

  useEffect(() => {
    interactionRef.current = activeInteraction;
  }, [activeInteraction]);

  const { streamSrc, streamHasFrame, streamRetries, imgKey, onFrame, onError } =
    useMjpegStream({
      streamUrl,
      enabled: streamEnabled,
    });

  useEffect(() => {
    if (!streamEnabled || !streamSrc) return;

    let raf = 0;
    const deadline = window.performance.now() + FIRST_FRAME_DETECT_WINDOW_MS;

    const checkFrame = () => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        onFrame();
        return;
      }
      if (window.performance.now() < deadline) {
        raf = window.requestAnimationFrame(checkFrame);
      }
    };

    raf = window.requestAnimationFrame(checkFrame);
    return () => window.cancelAnimationFrame(raf);
  }, [imgKey, onFrame, streamEnabled, streamSrc]);

  useEffect(() => {
    if (!streamEnabled || !streamSrc) return;

    const img = imgRef.current;
    if (!img) return;

    return () => {
      try {
        img.src = "about:blank";
      } catch {
        // ignore
      }
    };
  }, [imgKey, streamEnabled, streamSrc]);

  const getPointFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const finishInteraction = useCallback(() => {
    const interaction = interactionRef.current;
    if (!interaction) return;

    if (interaction.mode === "create") {
      const createdBox = boxesRef.current.find(
        (box) => box.id === interaction.boxId,
      );
      if (
        createdBox &&
        (createdBox.rect.width < MIN_BOX_SIZE ||
          createdBox.rect.height < MIN_BOX_SIZE)
      ) {
        onRemoveBox(interaction.boxId);
      }
    }

    setActiveInteraction(null);
  }, [onRemoveBox]);

  useEffect(() => {
    if (!activeInteraction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const point = getPointFromClient(event.clientX, event.clientY);
      if (!point) return;

      if (interaction.mode === "create") {
        onUpdateBoxRect(
          interaction.boxId,
          createRectFromPoints(interaction.startPoint, point),
        );
        return;
      }

      if (interaction.mode === "move") {
        onUpdateBoxRect(
          interaction.boxId,
          moveRect(
            interaction.initialRect,
            point.x - interaction.startPoint.x,
            point.y - interaction.startPoint.y,
          ),
        );
        return;
      }

      onUpdateBoxRect(
        interaction.boxId,
        resizeRectWithHandle(
          interaction.initialRect,
          interaction.handle,
          point,
        ),
      );
    };

    const handlePointerUp = () => {
      finishInteraction();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [
    activeInteraction,
    finishInteraction,
    getPointFromClient,
    onUpdateBoxRect,
  ]);

  const handleSurfacePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (event.target !== event.currentTarget) return;

      const startPoint = getPointFromClient(event.clientX, event.clientY);
      if (!startPoint) return;

      event.preventDefault();
      const boxId = onAddBox(createRectFromPoints(startPoint, startPoint));
      onSelectBox(boxId);
      setActiveInteraction({
        mode: "create",
        boxId,
        startPoint,
      });
    },
    [getPointFromClient, onAddBox, onSelectBox],
  );

  const handleBoxPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, box: EditableBoundingBox) => {
      if (event.button !== 0) return;

      const startPoint = getPointFromClient(event.clientX, event.clientY);
      if (!startPoint) return;

      event.preventDefault();
      event.stopPropagation();
      onSelectBox(box.id);
      setActiveInteraction({
        mode: "move",
        boxId: box.id,
        startPoint,
        initialRect: box.rect,
      });
    },
    [getPointFromClient, onSelectBox],
  );

  const handleResizePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLSpanElement>,
      box: EditableBoundingBox,
      handle: BoundingBoxResizeHandle,
    ) => {
      if (event.button !== 0) return;

      const startPoint = getPointFromClient(event.clientX, event.clientY);
      if (!startPoint) return;

      event.preventDefault();
      event.stopPropagation();
      onSelectBox(box.id);
      setActiveInteraction({
        mode: "resize",
        boxId: box.id,
        startPoint,
        initialRect: box.rect,
        handle,
      });
    },
    [getPointFromClient, onSelectBox],
  );

  const shouldRenderStream = streamEnabled && Boolean(streamSrc);
  const previewMessage = !streamEnabled
    ? "Preview unavailable until the camera is started."
    : !streamHasFrame
      ? streamRetries > 0
        ? "Reconnecting preview..."
        : "Loading preview..."
      : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">
            Preview Editor
          </h3>
          <p className="text-xs text-zinc-500">
            Drag on the preview to create a box. Drag inside a box to move it,
            or drag a corner handle to resize it.
          </p>
        </div>
        <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
          {boxes.length} {boxes.length === 1 ? "box" : "boxes"}
        </div>
      </div>

      <div
        ref={stageRef}
        className={cn(
          "relative aspect-video w-full touch-none overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 shadow-sm",
          activeInteraction ? "cursor-grabbing" : "cursor-crosshair",
        )}
        onPointerDown={handleSurfacePointerDown}
      >
        {shouldRenderStream ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={imgKey}
              ref={imgRef}
              src={streamSrc}
              alt={`${cameraName} preview`}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-left-top"
              width={1280}
              height={720}
              draggable={false}
              onLoad={onFrame}
              onError={onError}
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,rgba(255,255,255,0.04)_50%,transparent_100%)] bg-size-[100%_6px] opacity-20" />
          </>
        ) : null}

        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold tracking-wide text-white">
          {streamEnabled ? "LIVE PREVIEW" : "PREVIEW OFF"}
        </div>

        {previewMessage ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm text-white/85">
            {previewMessage}
          </div>
        ) : null}

        {boxes.length === 0 ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-medium text-white/85">
            Drag anywhere on the preview to create the first bounding box.
          </div>
        ) : null}

        {boxes.map((box, index) => {
          const isSelected = box.id === selectedBoxId;
          const color = boxColorForIndex(index);
          const displayName = box.name.trim() || `Box ${index + 1}`;

          return (
            <div
              key={box.id}
              className={cn(
                "absolute touch-none border-2 transition-shadow",
                isSelected ? "shadow-[0_0_0_9999px_rgba(15,23,42,0.12)]" : "",
              )}
              style={{
                left: `${box.rect.x * 100}%`,
                top: `${box.rect.y * 100}%`,
                width: `${box.rect.width * 100}%`,
                height: `${box.rect.height * 100}%`,
                borderColor: color,
                zIndex: isSelected ? 30 : 20,
              }}
              onPointerDown={(event) => handleBoxPointerDown(event, box)}
            >
              <div
                className="absolute left-0 top-0 max-w-full truncate rounded-br-md px-2 py-1 text-[11px] font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {displayName}
              </div>

              {(
                [
                  "top-left",
                  "top-right",
                  "bottom-left",
                  "bottom-right",
                ] as BoundingBoxResizeHandle[]
              ).map((handle) => {
                const positionClassName =
                  handle === "top-left"
                    ? "-left-2 -top-2 cursor-nwse-resize"
                    : handle === "top-right"
                      ? "-right-2 -top-2 cursor-nesw-resize"
                      : handle === "bottom-left"
                        ? "-bottom-2 -left-2 cursor-nesw-resize"
                        : "-bottom-2 -right-2 cursor-nwse-resize";

                return (
                  <span
                    key={handle}
                    className={cn(
                      "absolute h-4 w-4 rounded-full border-2 border-white bg-zinc-950 shadow-sm",
                      positionClassName,
                    )}
                    style={{ borderColor: color }}
                    onPointerDown={(event) =>
                      handleResizePointerDown(event, box, handle)
                    }
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
