"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import Image from "next/image";

import axiosInstance, { AI_HOST } from "@/config/axiosInstance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Camera = {
  id: string;
  name?: string;
  isActive?: boolean;
};

type Step = "front" | "right" | "left" | "up" | "down" | "blink";
const STEPS: Step[] = ["front", "right", "left", "up", "down", "blink"];

type Session = {
  session_id: string;
  employee_id: string;
  name: string;
  camera_id: string;
  status: "running" | "saving" | "saved" | "error" | "stopped";
  current_step: Step;
  instruction: string;
  collected: Record<string, number>;
  last_quality: number;
  last_pose?: string | null;
  last_message?: string | null;
  overlay_roi_faces?: number;
  overlay_multi_in_roi?: boolean;
};

function friendlyAxiosError(err: any) {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    "Request failed"
  );
}

function useTTS(enabled: boolean) {
  const lastSpokenRef = useRef<string>("");
  return useCallback(
    (text: string) => {
      if (!enabled) return;
      if (!text) return;
      if (lastSpokenRef.current === text) return;

      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);

      lastSpokenRef.current = text;
    },
    [enabled]
  );
}

function StepChip({
  step,
  active,
  done,
}: {
  step: Step;
  active: boolean;
  done: boolean;
}) {
  const label =
    step === "front"
      ? "Front"
      : step === "right"
      ? "Right"
      : step === "left"
      ? "Left"
      : step === "up"
      ? "Up"
      : step === "down"
      ? "Down"
      : "Blink";

  return (
    <div
      className={`rounded-full px-3 py-1 text-sm border flex items-center gap-2 ${
        active
          ? "bg-black text-white border-black"
          : "bg-white text-gray-700 border-gray-200"
      }`}
    >
      <span className={`${done ? "text-green-600" : "text-gray-400"}`}>
        {done ? "✓" : "•"}
      </span>
      <span>{label}</span>
    </div>
  );
}

function ArrowCue({ step }: { step: Step }) {
  const base =
    "relative h-24 w-full rounded-xl border bg-white overflow-hidden";
  const pulse = "animate-pulse";

  if (step === "blink") {
    return (
      <div className={base}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`text-3xl font-semibold ${pulse}`}>👁️ Blink</div>
        </div>
      </div>
    );
  }

  const text =
    step === "front"
      ? "Look Straight"
      : step === "right"
      ? "Turn Right →"
      : step === "left"
      ? "← Turn Left"
      : step === "up"
      ? "Look Up ↑"
      : "Look Down ↓";

  return (
    <div className={base}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`text-3xl font-semibold ${pulse}`}>{text}</div>
      </div>
    </div>
  );
}

export default function AutoEnrollment({
  cameras,
  loadCameras,
}: {
  cameras: Camera[];
  loadCameras: () => Promise<void>;
}) {
  const [cameraId, setCameraId] = useState<string>(cameras?.[0]?.id || "");
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [tts, setTts] = useState(true);

  const [session, setSession] = useState<Session | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);

  const speak = useTTS(tts);

  // when cameras load async, set initial camera once (safe + lint clean)
  useEffect(() => {
    if (running) return;
    if (!cameraId && cameras?.length) setCameraId(cameras[0].id);
  }, [cameras, cameraId, running]);

  const selectedCam = useMemo(
    () => cameras.find((c) => c.id === cameraId),
    [cameras, cameraId]
  );

  // IMPORTANT: stream must go to AI server like recognition page does
  const streamUrl = useMemo(() => {
    if (!cameraId) return "";
    return `${AI_HOST}/camera/enroll2/auto/stream/${encodeURIComponent(
      cameraId
    )}`;
  }, [cameraId]);

  // ---- status refresh (via backend proxy, avoids CORS) ----
  const refreshStatus = useCallback(async () => {
    try {
      const res = await axiosInstance.get<{
        ok: boolean;
        session: Session | null;
      }>("/enroll2-auto/session/status");
      const s = res.data?.session || null;
      setSession(s);
      setRunning(!!s && s.status === "running");
    } catch {
      // keep silent in polling
    }
  }, []);

  // ---- camera ensure ON (your existing backend logic) ----
  const ensureCameraOn = useCallback(
    async (camId: string) => {
      if (!camId) return;
      // if DB says active, don't call start again
      if (cameras.find((c) => c.id === camId)?.isActive) return;

      await axiosInstance.post(`/cameras/start/${camId}`);
      await loadCameras();
    },
    [cameras, loadCameras]
  );

  // ---- stop camera (your existing backend logic) ----
  const stopCamera = useCallback(
    async (camId: string) => {
      if (!camId) return;
      await axiosInstance.post(`/cameras/stop/${camId}`);
      await loadCameras();
    },
    [loadCameras]
  );

  // ---- START: start camera -> start enroll session ----
  const start = useCallback(async () => {
    if (!employeeId || !name || !cameraId) {
      toast.error("employeeId, name, cameraId required");
      return;
    }

    setBusy(true);
    try {
      await ensureCameraOn(cameraId);

      // Start auto-enroll session via backend proxy (NO CORS)
      const res = await axiosInstance.post<{ ok: boolean; session: Session }>(
        "/enroll2-auto/session/start",
        { employeeId, name, cameraId }
      );

      setSession(res.data.session);
      setRunning(true);
      toast.success("Auto enrollment started");
    } catch (e: any) {
      toast.error(friendlyAxiosError(e));
    } finally {
      setBusy(false);
    }
  }, [employeeId, name, cameraId, ensureCameraOn]);

  // ---- STOP: stop enroll session -> stop camera -> clear UI ----
  const stop = useCallback(async () => {
    setBusy(true);
    try {
      // 1) stop session
      await axiosInstance.post("/enroll2-auto/session/stop");

      // 2) stop camera (you said you want stop to fully stop everything)
      if (cameraId) {
        await stopCamera(cameraId);
      }

      // 3) refresh session + clear
      await refreshStatus();
      setSession(null);
      setRunning(false);

      toast.success("Stopped");
    } catch (e: any) {
      toast.error(friendlyAxiosError(e));
    } finally {
      setBusy(false);
    }
  }, [cameraId, refreshStatus, stopCamera]);

  // ---- Polling (fast when running, slow when idle) ----
  useEffect(() => {
    let alive = true;
    let t: any;

    const loop = async () => {
      if (!alive) return;
      await refreshStatus();
      // 400ms while running, 1500ms while idle
      const wait = running ? 400 : 1500;
      t = setTimeout(loop, wait);
    };

    loop();
    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [refreshStatus, running]);

  // ---- Speak instruction on step change ----
  const lastStepRef = useRef<string>("");
  useEffect(() => {
    const step = session?.current_step;
    if (!step) return;
    if (lastStepRef.current !== step) {
      speak(session?.instruction || step);
      lastStepRef.current = step;
    }
  }, [session?.current_step, session?.instruction, speak]);

  const doneCount = useMemo(() => {
    if (!session?.collected) return 0;
    return STEPS.filter((s) => (session.collected?.[s] || 0) > 0).length;
  }, [session?.collected]);

  const pct = useMemo(
    () => Math.round((doneCount / STEPS.length) * 100),
    [doneCount]
  );

  const multiWarn = !!session?.overlay_multi_in_roi;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="text-sm text-gray-500">
        Auto enrollment stream (AI: {AI_HOST})
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Enrollment v2 Auto</span>
            <Badge className={`${running ? "bg-green-600" : "bg-gray-400"}`}>
              {running
                ? "Running"
                : session?.status === "saved"
                ? "Saved"
                : session?.status === "error"
                ? "Error"
                : "Idle"}
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Camera</Label>
              <select
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                disabled={running || busy}
              >
                {(cameras || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ? `${c.name} (${c.id})` : c.id}
                  </option>
                ))}
              </select>

              <div className="text-xs text-gray-500 mt-1">
                Status:{" "}
                <b
                  className={
                    selectedCam?.isActive ? "text-green-700" : "text-red-700"
                  }
                >
                  {selectedCam?.isActive ? "ON" : "OFF"}
                </b>
                {" — "}
                {selectedCam?.isActive
                  ? "Stream will show overlay box."
                  : "Start camera from here."}
              </div>
            </div>

            <div>
              <Label>Employee ID</Label>
              <Input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="EMP001"
                disabled={running || busy}
              />
            </div>

            <div>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                disabled={running || busy}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={start} disabled={running || busy || !cameraId}>
              {busy && !running ? "Starting..." : "Start Auto Enrollment"}
            </Button>

            <Button
              variant="secondary"
              onClick={stop}
              disabled={!running || busy}
            >
              {busy && running ? "Stopping..." : "Stop"}
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

          <Separator />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stream */}
            <div className="space-y-3">
              <div className="rounded-2xl border overflow-hidden bg-gray-100">
                {selectedCam?.isActive && streamUrl ? (
                  <div className="aspect-video w-full">
                    <Image
                      src={streamUrl}
                      alt="Auto Enrollment Stream"
                      className="h-full w-full object-cover"
                      width={1280}
                      height={720}
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="aspect-video flex items-center justify-center text-sm text-gray-600">
                    Camera OFF
                  </div>
                )}
              </div>

              {multiWarn && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-700">
                  Multiple faces detected in ROI. Please show a single face
                  only.
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
                  <div className="text-lg font-semibold">
                    {session?.last_pose || "-"}
                  </div>
                </div>
                <div className="rounded-xl border bg-white p-3">
                  <div className="text-xs text-gray-500">ROI Faces</div>
                  <div className="text-lg font-semibold">
                    {session?.overlay_roi_faces ?? 0}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-3 text-sm text-gray-700">
                {session?.last_message ||
                  "Place your face inside the box to begin."}
              </div>
            </div>

            {/* Guidance / progress */}
            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">
                      Current instruction
                    </div>
                    <div className="text-xl font-semibold">
                      {session?.instruction || "—"}
                    </div>
                  </div>
                  <Badge className="bg-black">
                    {session?.current_step || "—"}
                  </Badge>
                </div>

                <ArrowCue step={(session?.current_step as Step) || "front"} />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Progress</span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {STEPS.map((s) => (
                    <StepChip
                      key={s}
                      step={s}
                      active={session?.current_step === s}
                      done={!!session?.collected?.[s]}
                    />
                  ))}
                </div>
              </div>

              {session?.status === "saved" && (
                <div className="rounded-2xl border border-green-300 bg-green-50 p-4">
                  <div className="text-green-700 font-semibold">
                    Enrollment complete ✅
                  </div>
                  <div className="text-green-700 text-sm mt-1">
                    Templates saved automatically. Recognition/attendance will
                    work normally.
                  </div>
                </div>
              )}

              {session?.status === "error" && (
                <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
                  <div className="text-red-700 font-semibold">
                    Enrollment failed ❌
                  </div>
                  <div className="text-red-700 text-sm mt-1">
                    {session?.last_message || "Please try again."}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
