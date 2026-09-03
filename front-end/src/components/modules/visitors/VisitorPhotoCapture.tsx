"use client";

import React, { useRef, useEffect } from "react";
import Webcam from "react-webcam";
import { Camera, RotateCcw, AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VisitorPhotoCaptureProps = {
  webcamRef: React.RefObject<Webcam | null>;
  isCameraActive: boolean;
  setIsCameraActive: (active: boolean) => void;
  photoPreview: string | null;
  liveDetectionStatus: string;
  isExtractingFace: boolean;
  capturePhoto: () => void;
  retakePhoto: () => void;
};

export function VisitorPhotoCapture({
  webcamRef,
  isCameraActive,
  setIsCameraActive,
  photoPreview,
  liveDetectionStatus,
  isExtractingFace,
  capturePhoto,
  retakePhoto,
}: VisitorPhotoCaptureProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-900 shadow-inner flex flex-col items-center justify-center min-h-[260px]">
        {isCameraActive ? (
          <div className="relative w-full aspect-4/3 flex items-center justify-center">
            <Webcam
              audio={false}
              ref={webcamRef as any}
              screenshotFormat="image/jpeg"
              className="w-full h-full object-cover"
              videoConstraints={{ facingMode: "user" }}
            />
            <div className="absolute inset-0 border-2 border-dashed border-cyan-400/40 rounded-xl pointer-events-none margin-4" />
            <div className="absolute top-3 left-3 right-3 rounded-lg bg-zinc-950/80 backdrop-blur-xs p-2 text-center text-xs font-semibold border border-white/10">
              {liveDetectionStatus === "ok" && <span className="text-emerald-400 font-bold">✓ Face Aligned — Ready to Capture</span>}
              {liveDetectionStatus === "multi_face" && <span className="text-amber-400 font-bold">⚠️ Multiple Faces Detected — 1 Person Allowed</span>}
              {liveDetectionStatus === "no_face" && <span className="text-zinc-300">Position face inside frame</span>}
              {liveDetectionStatus === "out_of_box" && <span className="text-amber-400">Center face in guide box</span>}
            </div>
          </div>
        ) : photoPreview ? (
          <div className="relative w-full aspect-4/3 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Visitor Preview" className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-emerald-950/90 backdrop-blur-xs p-1.5 text-center text-xs font-bold text-emerald-300 border border-emerald-500/30">
              ✓ Photo Verified & Captured
            </div>
          </div>
        ) : (
          <div onClick={() => setIsCameraActive(true)} className="flex flex-col items-center justify-center gap-3 p-6 text-center cursor-pointer group">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-zinc-300 border border-white/10 group-hover:scale-105 group-hover:bg-white/20 transition-all">
              <Camera className="h-7 w-7 text-zinc-300" />
            </div>
            <div>
              <span className="text-xs font-bold text-zinc-200 block">Visitor Verification Photo</span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">Click to activate live webcam</span>
            </div>
          </div>
        )}
      </div>

      {isCameraActive ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            onClick={capturePhoto}
            disabled={isExtractingFace || liveDetectionStatus !== "ok"}
            className={cn(
              "w-full h-11 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md transition-all duration-200",
              liveDetectionStatus === "ok" && !isExtractingFace
                ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                : "bg-red-700/80 text-red-100 cursor-not-allowed opacity-80"
            )}
          >
            {isExtractingFace ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Extracting Face Features...</>
            ) : liveDetectionStatus === "ok" ? (
              <><Camera className="h-4 w-4" /> Capture Photo</>
            ) : (
              <><AlertTriangle className="h-4 w-4" /> Align Face In Frame</>
            )}
          </Button>
          <Button
            type="button"
            onClick={() => setIsCameraActive(false)}
            variant="outline"
            className="w-full h-9 rounded-xl border-zinc-300 text-zinc-600 hover:bg-zinc-100 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <X className="h-3.5 w-3.5" /> Close Camera
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => (photoPreview ? retakePhoto() : setIsCameraActive(true))}
          className="w-full h-11 rounded-xl bg-[#0c1b33] text-white hover:bg-[#11274c] flex items-center justify-center gap-2 font-bold cursor-pointer shadow-sm"
        >
          {photoPreview ? <><RotateCcw className="h-4 w-4 text-cyan-400" /> Retake Photo</> : <><Camera className="h-4 w-4 text-cyan-400" /> Open Verification Camera</>}
        </Button>
      )}
    </div>
  );
}
