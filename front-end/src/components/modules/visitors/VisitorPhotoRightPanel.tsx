"use client";

import React from "react";
import Webcam from "react-webcam";
import { Camera, AlertTriangle, Loader2, X, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CameraDeviceInfo } from "@/hooks/useCameraDevices";

type VisitorPhotoRightPanelProps = {
  isCameraActive: boolean;
  setIsCameraActive: (val: boolean) => void;
  photoPreview: string | null;
  liveDetectionStatus: "idle" | "ok" | "no_face" | "multi_face" | "out_of_box";
  isExtractingFace: boolean;
  webcamRef: React.RefObject<Webcam | null>;
  capturePhoto: () => void;
  cameraDevices?: CameraDeviceInfo[];
  selectedDeviceId?: string;
  setSelectedDeviceId?: (id: string) => void;
  hasPhotoError?: boolean;
  photoErrorMessage?: string;
};

export function VisitorPhotoRightPanel({
  isCameraActive,
  setIsCameraActive,
  photoPreview,
  liveDetectionStatus,
  isExtractingFace,
  webcamRef,
  capturePhoto,
  cameraDevices = [],
  selectedDeviceId,
  setSelectedDeviceId,
  hasPhotoError,
  photoErrorMessage,
}: VisitorPhotoRightPanelProps) {
  const isOk = liveDetectionStatus === "ok";
  const isMulti = liveDetectionStatus === "multi_face";
  const isNoFace = liveDetectionStatus === "no_face";
  const isOutOfBox = liveDetectionStatus === "out_of_box";
  const isError = isMulti || isNoFace || isOutOfBox;

  const boxColor = isOk
    ? "rgba(34,197,94,0.85)"
    : isError
      ? "rgba(239,68,68,0.90)"
      : "rgba(34,211,238,0.65)";
  const glowColor = isOk
    ? "rgba(34,197,94,0.35)"
    : isError
      ? "rgba(239,68,68,0.40)"
      : "rgba(34,211,238,0.25)";
  const bracketClr = isOk ? "#22c55e" : isError ? "#ef4444" : "#22d3ee";
  const scanClr = isOk
    ? "rgba(34,197,94,0.95)"
    : isError
      ? "rgba(239,68,68,0.90)"
      : "rgba(34,211,238,0.95)";
  const chipBg = isOk
    ? "rgba(21,128,61,0.85)"
    : isError
      ? "rgba(153,27,27,0.85)"
      : "rgba(0,0,0,0.80)";
  const chipBorder = isOk
    ? "rgba(34,197,94,0.50)"
    : isError
      ? "rgba(239,68,68,0.50)"
      : "rgba(34,211,238,0.30)";
  const dotClr = isOk ? "#22c55e" : isError ? "#ef4444" : "#22d3ee";

  const statusMsg = isOk
    ? "Face detected — Ready to capture"
    : isMulti
      ? `Multiple faces (${liveDetectionStatus}) — 1 person only`
      : isNoFace
        ? "No face detected — Move closer"
        : isOutOfBox
          ? "Face out of frame — Centre yourself"
          : "Place face inside the box";

  const chipLabel = isMulti
    ? "Multiple faces — 1 person only"
    : statusMsg;

  const videoConstraints = selectedDeviceId
    ? { deviceId: { exact: selectedDeviceId } }
    : { width: 640, height: 640, facingMode: "user" };

  return (
    <div className="sticky top-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#0c1b33] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Visitor Photo
        </div>
        {isCameraActive && (
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold normal-case">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            LIVE CAMERA
          </span>
        )}
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Camera Selector Dropdown (when devices exist) */}
        {cameraDevices.length > 0 && setSelectedDeviceId && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">Select Camera Device</label>
            <select
              value={selectedDeviceId || ""}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="h-8 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-800 outline-none focus:border-indigo-500"
            >
              {cameraDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Camera Box */}
        <div className="relative aspect-square w-full rounded-2xl border-2 border-dashed border-zinc-200 bg-slate-950 overflow-hidden flex items-center justify-center shadow-inner">
          {isCameraActive ? (
            <>
              <Webcam
                audio={false}
                ref={webcamRef as any}
                screenshotFormat="image/jpeg"
                className="h-full w-full object-cover"
                videoConstraints={videoConstraints}
              />

              {/* ══ Professional Face-Alignment Overlay ══ */}
              <div className="absolute inset-0 pointer-events-none z-10">
                {/* 4-panel dark cutout mask */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "18%", background: "rgba(0,0,0,0.72)" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "18%", background: "rgba(0,0,0,0.72)" }} />
                <div style={{ position: "absolute", top: "18%", left: 0, width: "20%", bottom: "18%", background: "rgba(0,0,0,0.72)" }} />
                <div style={{ position: "absolute", top: "18%", right: 0, width: "20%", bottom: "18%", background: "rgba(0,0,0,0.72)" }} />

                {/* Face guide rectangle */}
                <div
                  style={{
                    position: "absolute", top: "18%", left: "20%", right: "20%", bottom: "18%",
                    borderRadius: 6, border: `2px solid ${boxColor}`,
                    boxShadow: `0 0 14px 3px ${glowColor}, inset 0 0 10px ${glowColor}`,
                    transition: "border-color 0.25s, box-shadow 0.25s",
                  }}
                />

                {/* 4 L-bracket corners */}
                <div style={{ position: "absolute", top: "18%", left: "20%" }}>
                  <div style={{ position: "relative", width: 30, height: 30 }}>
                    <div style={{ position: "absolute", top: 0, left: 0, width: 30, height: 3.5, background: bracketClr, borderRadius: "3px 0 0 0" }} />
                    <div style={{ position: "absolute", top: 0, left: 0, width: 3.5, height: 30, background: bracketClr, borderRadius: "3px 0 0 0" }} />
                  </div>
                </div>

                <div style={{ position: "absolute", top: "18%", right: "20%" }}>
                  <div style={{ position: "relative", width: 30, height: 30 }}>
                    <div style={{ position: "absolute", top: 0, right: 0, width: 30, height: 3.5, background: bracketClr, borderRadius: "0 3px 0 0" }} />
                    <div style={{ position: "absolute", top: 0, right: 0, width: 3.5, height: 30, background: bracketClr, borderRadius: "0 3px 0 0" }} />
                  </div>
                </div>

                <div style={{ position: "absolute", bottom: "18%", left: "20%" }}>
                  <div style={{ position: "relative", width: 30, height: 30 }}>
                    <div style={{ position: "absolute", bottom: 0, left: 0, width: 30, height: 3.5, background: bracketClr, borderRadius: "0 0 0 3px" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, width: 3.5, height: 30, background: bracketClr, borderRadius: "0 0 0 3px" }} />
                  </div>
                </div>

                <div style={{ position: "absolute", bottom: "18%", right: "20%" }}>
                  <div style={{ position: "relative", width: 30, height: 30 }}>
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: 30, height: 3.5, background: bracketClr, borderRadius: "0 0 3px 0" }} />
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: 3.5, height: 30, background: bracketClr, borderRadius: "0 0 3px 0" }} />
                  </div>
                </div>

                {/* Scan line */}
                {!isError && (
                  <div
                    style={{
                      position: "absolute", left: "20%", right: "20%", height: 2,
                      background: `linear-gradient(90deg,transparent 0%,${scanClr} 35%,${scanClr} 65%,transparent 100%)`,
                      boxShadow: `0 0 8px 2px ${glowColor}`, animation: "scanLineBox 2.4s linear infinite", top: "18%",
                    }}
                  />
                )}

                {/* Top status chip */}
                <div
                  style={{
                    position: "absolute", top: "7%", left: "50%", transform: "translateX(-50%)",
                    display: "flex", alignItems: "center", gap: 6, background: chipBg,
                    backdropFilter: "blur(6px)", border: `1px solid ${chipBorder}`, borderRadius: 20,
                    padding: "5px 12px", whiteSpace: "nowrap", transition: "background 0.25s, border-color 0.25s",
                  }}
                >
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: dotClr, boxShadow: `0 0 6px 2px ${dotClr}`, animation: "dotBlink 1.4s ease-in-out infinite", flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f0fdf4", letterSpacing: "0.05em", textTransform: "uppercase" }}>{chipLabel}</span>
                </div>

                {/* Error detail badge */}
                {isError && (
                  <div style={{ position: "absolute", top: "83%", left: "10%", right: "10%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(127,29,29,0.88)", backdropFilter: "blur(6px)", border: "1px solid rgba(239,68,68,0.40)", borderRadius: 8, padding: "6px 10px" }}>
                    <AlertTriangle style={{ width: 12, height: 12, color: "#fca5a5", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fca5a5", letterSpacing: "0.03em" }}>
                      {isMulti ? "Multiple faces detected — only 1 person allowed" : isNoFace ? "No face found — move closer & improve lighting" : "Face outside guide box — centre your face"}
                    </span>
                  </div>
                )}

                {/* OK confirmation badge */}
                {isOk && (
                  <div style={{ position: "absolute", top: "83%", left: "10%", right: "10%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(5,46,22,0.88)", backdropFilter: "blur(6px)", border: "1px solid rgba(34,197,94,0.40)", borderRadius: 8, padding: "6px 10px" }}>
                    <CheckCircle style={{ width: 12, height: 12, color: "#86efac", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#86efac", letterSpacing: "0.03em" }}>
                      Face aligned — click <span style={{ color: "#4ade80" }}>Capture Photo</span>
                    </span>
                  </div>
                )}

                {/* Bottom hint (idle only) */}
                {liveDetectionStatus === "idle" && (
                  <div
                    style={{
                      position: "absolute",
                      top: "83%",
                      left: "10%",
                      right: "10%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                      background: "rgba(0,0,0,0.78)",
                      backdropFilter: "blur(6px)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 8,
                      padding: "6px 10px",
                      textAlign: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.45)",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      Keep face centred &amp; look straight
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : photoPreview ? (
            <div className="relative h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="Visitor Preview" className="h-full w-full object-cover" />
              <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-emerald-950/90 backdrop-blur-xs p-1.5 text-center text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                ✓ Photo Available
              </div>
            </div>
          ) : (
            <div onClick={() => setIsCameraActive(true)} className="flex flex-col items-center justify-center gap-3 p-6 text-center cursor-pointer group">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-zinc-300 border border-white/10 group-hover:scale-105 group-hover:bg-white/20 transition-all">
                <Camera className="h-7 w-7 text-zinc-300" />
              </div>
              <div>
                <span className="text-xs font-bold text-zinc-200 block">Visitor Photo</span>
                <span className="text-[11px] text-zinc-400 block mt-0.5">Click below to start live camera</span>
              </div>
            </div>
          )}
        </div>

        {/* Control Buttons */}
        {isCameraActive ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={capturePhoto}
              disabled={isExtractingFace || liveDetectionStatus !== "ok"}
              title={
                liveDetectionStatus === "multi_face"
                  ? "Multiple faces detected — only 1 person allowed"
                  : liveDetectionStatus === "no_face"
                    ? "No face detected — align your face in the box"
                    : liveDetectionStatus === "out_of_box"
                      ? "Face is outside the guide box — centre yourself"
                      : liveDetectionStatus === "idle"
                        ? "Initialising camera detection…"
                        : "Capture Photo"
              }
              className={cn(
                "w-full h-11 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md transition-all duration-200",
                liveDetectionStatus === "ok" && !isExtractingFace
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                  : "bg-red-700/80 text-red-100 cursor-not-allowed opacity-80"
              )}
            >
              {isExtractingFace ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Extracting Face...</>
              ) : liveDetectionStatus === "ok" ? (
                <><Camera className="h-4 w-4" /> Capture Photo</>
              ) : liveDetectionStatus === "multi_face" ? (
                <><AlertTriangle className="h-4 w-4" /> Multiple Faces Detected</>
              ) : liveDetectionStatus === "no_face" ? (
                <><AlertTriangle className="h-4 w-4" /> No Face Detected</>
              ) : liveDetectionStatus === "out_of_box" ? (
                <><AlertTriangle className="h-4 w-4" /> Face Out of Frame</>
              ) : (
                <><Camera className="h-4 w-4" /> Initialising...</>
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
            onClick={() => setIsCameraActive(true)}
            className="w-full h-11 rounded-xl bg-[#0c1b33] text-white hover:bg-[#11274c] flex items-center justify-center gap-2 font-bold cursor-pointer shadow-sm"
          >
            <Camera className="h-4 w-4 text-cyan-400" />
            {photoPreview ? "Retake / Verify Camera" : "Open Camera to Verify"}
          </Button>
        )}

        {hasPhotoError && <p className="text-[11px] font-medium text-red-500 text-center block mt-1">{photoErrorMessage}</p>}
      </div>

      <style>{`
        @keyframes scanLineBox {
          0%   { top: 18%; opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 82%; opacity: 0; }
        }
        @keyframes dotBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
