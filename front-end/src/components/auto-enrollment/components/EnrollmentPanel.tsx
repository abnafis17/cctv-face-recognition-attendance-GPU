"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Session, Step } from "../types";
import { RingProgress } from "./RingProgress";
import { BigInstruction } from "./BigInstruction";
import { stepLabel } from "../utils";
import { SCAN_1, SCAN_2, STEPS } from "../constants";

export const EnrollmentPanel = React.memo(function EnrollmentPanel({
  // stream
  cameraId,
  laptopCameraId,
  laptopActive,
  previewVideoRef,

  streamSrc,
  imgKey,
  streamHasFrame,
  streamRetries,
  onFrame,
  onError,

  // session & progress
  session,
  pct,
  phase,
  doneCount,
  scan1Done,
  scan2Done,
  title,
  hint,
  currentStep,
  multiWarn,

  // controls
  busy,
  stop,

  // voice
  tts,
  setTts,
}: {
  cameraId: string;
  laptopCameraId: string;
  laptopActive: boolean;
  previewVideoRef: React.RefObject<HTMLVideoElement | null>;

  streamSrc: string;
  imgKey: string;
  streamHasFrame: boolean;
  streamRetries: number;
  onFrame: () => void;
  onError: () => void;

  session: Session | null;
  pct: number;
  phase: string;
  doneCount: number;
  scan1Done: number;
  scan2Done: number;
  title: string;
  hint: string;
  currentStep: Step;
  multiWarn: boolean;

  busy: boolean;
  stop: () => void;

  tts: boolean;
  setTts: (v: boolean) => void;
}) {
  const collected = session?.collected ?? {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stream */}
        <div className="space-y-3">
          <div className="rounded-2xl border overflow-hidden bg-gray-100">
            <div className="aspect-video w-full relative">
              {/* Local preview fallback (instant) while MJPEG overlay connects */}
              {cameraId === laptopCameraId && laptopActive && !streamHasFrame ? (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}

              {streamSrc ? (
                // MJPEG stream (not compatible with next/image optimizations)
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={imgKey}
                  src={streamSrc}
                  alt="Enrollment Stream"
                  className={`absolute inset-0 h-full w-full object-cover ${
                    streamHasFrame ? "opacity-100" : "opacity-0"
                  }`}
                  onLoad={onFrame}
                  onError={onError}
                />
              ) : null}

              {!streamHasFrame && !(cameraId === laptopCameraId && laptopActive) ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-600">
                  {streamRetries > 0 ? "Reconnecting camera..." : "Starting camera..."}
                </div>
              ) : null}
            </div>
          </div>

          {multiWarn && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
              More than one face is inside the box. Please keep only one face in view.
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-gray-500">Quality</div>
              <div className="text-lg font-semibold">
                {session?.last_quality?.toFixed?.(1) ?? "0.0"}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-gray-500">Pose</div>
              <div className="text-lg font-semibold">{session?.last_pose || "—"}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-gray-500">Faces in box</div>
              <div className="text-lg font-semibold">{session?.overlay_roi_faces ?? 0}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={stop} disabled={busy}>
              {busy ? "Stopping…" : "Stop"}
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <input
                type="checkbox"
                checked={tts}
                onChange={(e) => setTts(e.target.checked)}
              />
              <span className="text-sm text-gray-600">Voice instructions</span>
            </div>
          </div>
        </div>

        {/* Guidance */}
        <div className="space-y-4">
          <RingProgress
            value={pct}
            label={phase}
            sublabel="Keep your face in the frame and follow the prompts."
          />

          <BigInstruction title={title} hint={hint} step={currentStep} />

          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">Progress</div>
              <div className="text-sm font-semibold text-gray-900">
                {doneCount}/{STEPS.length}
              </div>
            </div>

            <Progress value={pct} />

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Scan 1</div>
                <div className="text-sm text-gray-600">
                  {scan1Done}/{SCAN_1.length}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {SCAN_1.map((s) => (
                  <Badge
                    key={s}
                    className={`${
                      (collected?.[s] || 0) > 0 ? "bg-black" : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {(collected?.[s] || 0) > 0 ? "✓ " : ""}
                    {stepLabel(s)}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center justify-between mt-1">
                <div className="text-sm font-semibold">Scan 2</div>
                <div className="text-sm text-gray-600">
                  {scan2Done}/{SCAN_2.length}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {SCAN_2.map((s) => (
                  <Badge
                    key={s}
                    className={`${
                      (collected?.[s] || 0) > 0 ? "bg-black" : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {(collected?.[s] || 0) > 0 ? "✓ " : ""}
                    {stepLabel(s)}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {session?.status === "saved" && (
            <div className="rounded-2xl border border-green-300 bg-green-50 p-4">
              <div className="text-green-800 font-semibold">Enrollment complete ✅</div>
              <div className="text-green-800 text-sm mt-1">
                Templates saved automatically. Recognition/attendance will work normally.
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Button onClick={stop} variant="secondary" disabled={busy}>
                  Done
                </Button>
              </div>
            </div>
          )}

          {session?.status === "error" && (
            <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
              <div className="text-red-800 font-semibold">Enrollment failed ❌</div>
              <div className="text-red-800 text-sm mt-1">
                {session?.last_message || "Please try again."}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Button onClick={stop} variant="secondary" disabled={busy}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
