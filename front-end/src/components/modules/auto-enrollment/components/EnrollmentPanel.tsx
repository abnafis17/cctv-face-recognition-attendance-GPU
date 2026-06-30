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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch w-full">
      
      {/* Left Column: Camera Feed & Metrics */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        <div className="flex flex-col border border-zinc-100 bg-white rounded-md shadow-sm overflow-hidden border-t-4 border-t-blue-500 h-full">
          <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-5 py-3.5">
            <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Camera Feed</h2>
            {streamHasFrame && (
              <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-150 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
          </div>

          <div className="p-5 flex-1 flex flex-col justify-between gap-4 min-h-[320px]">
            {/* Aspect Video */}
            <div className="rounded-md border border-zinc-150 overflow-hidden bg-zinc-100 shadow-inner aspect-video w-full relative">
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
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={imgKey}
                  src={streamSrc}
                  alt="Enrollment Stream"
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                    streamHasFrame ? "opacity-100" : "opacity-0"
                  }`}
                  decoding="async"
                  draggable={false}
                  onLoad={onFrame}
                  onError={onError}
                />
              ) : null}

              {!streamHasFrame && !(cameraId === laptopCameraId && laptopActive) ? (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
                  {streamRetries > 0 ? "Reconnecting camera..." : "Starting camera..."}
                </div>
              ) : null}
            </div>

            {multiWarn && (
              <div className="rounded-md border border-amber-200 bg-amber-50/75 p-3 text-xs text-amber-850 leading-relaxed">
                More than one face is inside the box. Please keep only one face in view.
              </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-zinc-100 bg-zinc-50/50 p-3">
                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Quality</div>
                <div className="text-sm font-bold text-zinc-850 mt-0.5">
                  {session?.last_quality?.toFixed?.(1) ?? "0.0"}
                </div>
              </div>
              <div className="rounded-md border border-zinc-100 bg-zinc-50/50 p-3">
                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Pose</div>
                <div className="text-sm font-bold text-zinc-855 mt-0.5">
                  {session?.last_pose || "—"}
                </div>
              </div>
              <div className="rounded-md border border-zinc-100 bg-zinc-50/50 p-3">
                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Faces</div>
                <div className="text-sm font-bold text-zinc-855 mt-0.5">
                  {session?.overlay_roi_faces ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* Footer controls */}
          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/50 px-5 py-3.5 mt-auto">
            <Button 
              variant="outline" 
              onClick={stop} 
              disabled={busy}
              className="h-9 px-4 rounded-md border border-zinc-250 bg-white text-zinc-655 hover:bg-zinc-50 hover:text-zinc-800 text-xs font-semibold uppercase tracking-wider transition-all shadow-xs cursor-pointer"
            >
              {busy ? "Stopping…" : "Stop"}
            </Button>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tts}
                onChange={(e) => setTts(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
              />
              <span className="text-xs font-semibold text-zinc-600">Voice instructions</span>
            </label>
          </div>
        </div>
      </div>

      {/* Right Column: Guidance & Progress */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="flex flex-col border border-zinc-100 bg-white rounded-md shadow-sm overflow-hidden border-t-4 border-t-violet-500 h-full p-5 space-y-4">
          
          <RingProgress
            value={pct}
            label={phase}
            sublabel="Keep your face in the frame and follow the prompts."
          />

          <BigInstruction title={title} hint={hint} step={currentStep} />

          <div className="rounded-md border border-zinc-100 bg-white p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Progress</div>
              <div className="text-xs font-bold text-zinc-800">
                {doneCount}/{STEPS.length}
              </div>
            </div>

            <Progress value={pct} className="h-2 bg-zinc-100 [&>[data-state=complete]]:bg-violet-600 [&>div]:bg-violet-600" />

            <Separator className="bg-zinc-100" />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-zinc-700">Scan 1</div>
                <div className="text-[11px] text-zinc-550">
                  {scan1Done}/{SCAN_1.length}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SCAN_1.map((s) => {
                  const isDone = (collected?.[s] || 0) > 0;
                  return (
                    <Badge
                      key={s}
                      variant="outline"
                      className={`rounded-md text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 transition-colors border ${
                        isDone
                          ? "bg-violet-55 text-violet-750 border-violet-200"
                          : "bg-zinc-55 text-zinc-500 border-zinc-200"
                      }`}
                    >
                      {isDone ? "✓ " : ""}
                      {stepLabel(s)}
                    </Badge>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-1">
                <div className="text-xs font-bold text-zinc-700">Scan 2</div>
                <div className="text-[11px] text-zinc-555">
                  {scan2Done}/{SCAN_2.length}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SCAN_2.map((s) => {
                  const isDone = (collected?.[s] || 0) > 0;
                  return (
                    <Badge
                      key={s}
                      variant="outline"
                      className={`rounded-md text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 transition-colors border ${
                        isDone
                          ? "bg-violet-55 text-violet-750 border-violet-200"
                          : "bg-zinc-55 text-zinc-500 border-zinc-200"
                      }`}
                    >
                      {isDone ? "✓ " : ""}
                      {stepLabel(s)}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>

          {session?.status === "saved" && (
            <div className="rounded-md border border-emerald-150 bg-emerald-50/75 p-4 shadow-xs">
              <div className="text-emerald-800 font-bold text-sm">
                Enrollment complete ✅
              </div>
              <div className="text-emerald-755 text-xs mt-1 leading-relaxed">
                Templates saved automatically. Recognition/attendance will work normally.
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Button 
                  onClick={stop} 
                  className="h-9 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-md shadow-emerald-600/10 cursor-pointer"
                  disabled={busy}
                >
                  Done
                </Button>
              </div>
            </div>
          )}

          {session?.status === "error" && (
            <div className="rounded-md border border-rose-150 bg-rose-50/75 p-4 shadow-xs">
              <div className="text-rose-800 font-bold text-sm">
                Enrollment failed ❌
              </div>
              <div className="text-rose-755 text-xs mt-1 leading-relaxed">
                {session?.last_message || "Please try again."}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <Button 
                  onClick={stop} 
                  className="h-9 px-4 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-md shadow-rose-600/10 cursor-pointer"
                  disabled={busy}
                >
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

