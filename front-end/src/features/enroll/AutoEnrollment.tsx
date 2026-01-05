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
import { useErpEmployees } from "@/hooks/useErpEmployees";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";

type Camera = {
  id: string;
  name?: string;
  isActive?: boolean;
};

type Step = "front" | "left" | "right" | "up" | "down";
const STEPS: Step[] = ["front", "left", "right", "up", "down"];

const SCAN_1: Step[] = ["front", "left", "right"];
const SCAN_2: Step[] = ["up", "down"];

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
  voice_seq?: number;
  voice_text?: string | null;
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
  const lastKeyRef = useRef<string>("");
  return useCallback(
    (key: string, text: string) => {
      if (!enabled) return;
      if (!text) return;
      if (lastKeyRef.current === key) return;

      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      // Calm / “system voice” vibe
      u.rate = 0.98;
      u.pitch = 1.0;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);

      lastKeyRef.current = key;
    },
    [enabled]
  );
}

function stepLabel(step: Step) {
  switch (step) {
    case "front":
      return "Look straight";
    case "left":
      return "Turn left";
    case "right":
      return "Turn right";
    case "up":
      return "Look up";
    case "down":
      return "Look down";
    default:
      return step;
  }
}

function stepArrow(step: Step) {
  switch (step) {
    case "front":
      return "•";
    case "left":
      return "←";
    case "right":
      return "→";
    case "up":
      return "↑";
    case "down":
      return "↓";
    default:
      return "•";
  }
}

function RingProgress({
  value,
  label,
  sublabel,
}: {
  value: number; // 0..100
  label: string;
  sublabel?: string;
}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;

  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="10"
          fill="none"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke="rgba(0,0,0,0.85)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 60 60)"
        />
        <circle cx="60" cy="60" r="34" fill="rgba(0,0,0,0.03)" />
        <text
          x="60"
          y="64"
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="rgba(0,0,0,0.85)"
        >
          {pct}%
        </text>
      </svg>

      <div className="min-w-0">
        <div className="text-xl font-semibold text-gray-900">{label}</div>
        {sublabel ? (
          <div className="text-sm text-gray-600 mt-1">{sublabel}</div>
        ) : null}
      </div>
    </div>
  );
}

function BigInstruction({
  title,
  hint,
  step,
}: {
  title: string;
  hint: string;
  step: Step;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-gray-500">Next</div>
          <div className="text-2xl font-semibold truncate">{title}</div>
        </div>
        <div className="h-12 w-12 rounded-full border flex items-center justify-center text-2xl font-semibold bg-gray-50">
          {stepArrow(step)}
        </div>
      </div>

      <div className="rounded-xl border bg-gray-50 p-4 text-gray-700">
        <div className="text-sm font-medium">{hint}</div>
        <div className="text-xs text-gray-500 mt-1">
          Keep your face inside the box. Move slowly.
        </div>
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
  const speak = useTTS(tts);
  const lastVoiceSeqRef = useRef<number>(-1);

  const [session, setSession] = useState<Session | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);

  // “Face ID style” flow
  type Screen = "setup" | "enrolling";
  const [screen, setScreen] = useState<Screen>("setup");
  const sessionStatus = session?.status;

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
      if (s && s.status !== "stopped") setScreen("enrolling");
      if (!s) setScreen("setup");
    } catch {
      // keep silent in polling
    }
  }, []);

  // ---- camera ensure ON (your existing backend logic) ----
  const ensureCameraOn = useCallback(
    async (camId: string) => {
      if (!camId) return false;
      // if DB says active, don't call start again
      if (cameras.find((c) => c.id === camId)?.isActive) return false;

      await axiosInstance.post(`/cameras/start/${camId}`);
      await loadCameras();
      return true;
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
    if (!employeeId.trim() || !name.trim() || !cameraId) {
      toast.error("Please select camera, employee ID, and name.");
      return;
    }

    setBusy(true);
    let startedCamera = false;
    try {
      startedCamera = await ensureCameraOn(cameraId);

      // Start auto-enroll session via backend proxy (NO CORS)
      const res = await axiosInstance.post<{ ok: boolean; session: Session }>(
        "/enroll2-auto/session/start",
        { employeeId: employeeId.trim(), name: name.trim(), cameraId }
      );

      setSession(res.data.session);
      setRunning(true);
      setScreen("enrolling");
      toast.success("Enrollment started");
    } catch (e: any) {
      toast.error(friendlyAxiosError(e));
      if (startedCamera && cameraId) {
        try {
          await stopCamera(cameraId);
        } catch {
          // ignore camera stop failure
        }
      }
    } finally {
      setBusy(false);
    }
  }, [employeeId, name, cameraId, ensureCameraOn, stopCamera]);

  // ---- STOP: stop enroll session -> stop camera -> clear UI ----
  const stop = useCallback(async () => {
    setBusy(true);
    try {
      // 1) stop session
      await axiosInstance.post("/enroll2-auto/session/stop");

      // 2) stop camera (stop fully stops everything)
      if (cameraId) {
        await stopCamera(cameraId);
      }

      // 3) refresh session + clear
      await refreshStatus();
      setSession(null);
      setRunning(false);
      setScreen("setup");

      // stop any speaking
      window.speechSynthesis.cancel();

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
      window.speechSynthesis.cancel();
    };
  }, [refreshStatus, running]);

  // ---- Speak when backend emits voice event ----
  useEffect(() => {
    if (sessionStatus !== "running") return;
    const seq = session?.voice_seq;
    const text = (session?.voice_text || "").trim();
    if (typeof seq !== "number") return;
    if (!text) return;
    if (lastVoiceSeqRef.current === seq) return;

    lastVoiceSeqRef.current = seq;
    speak(`voice:${seq}`, text);
  }, [sessionStatus, session?.voice_seq, session?.voice_text, speak]);

  // ---- Fallback: speak instruction on step change (only if no voice events yet) ----
  const lastStepRef = useRef<string>("");
  useEffect(() => {
    if (!session) return;
    if (session.status !== "running") return;
    const step = session?.current_step;
    if (!step) return;
    if (lastStepRef.current !== step) {
      const instr = (session?.instruction || stepLabel(step)).trim();
      // only if backend hasn't emitted voice yet
      if (lastVoiceSeqRef.current < 0) {
        speak(`step:${step}`, instr);
      }
      lastStepRef.current = step;
    }
  }, [session?.current_step, session?.instruction, session, speak]);

  // ---- Stop/cancel speech when session ends ----
  useEffect(() => {
    if (!sessionStatus) return;
    if (sessionStatus === "running") return;
    window.speechSynthesis.cancel();
  }, [sessionStatus]);

  const collected = session?.collected || {};

  const doneCount = useMemo(() => {
    return STEPS.filter((s) => (collected?.[s] || 0) > 0).length;
  }, [collected]);

  const pct = useMemo(
    () => Math.round((doneCount / STEPS.length) * 100),
    [doneCount]
  );

  const scan1Done = useMemo(
    () => SCAN_1.filter((s) => (collected?.[s] || 0) > 0).length,
    [collected]
  );
  const scan2Done = useMemo(
    () => SCAN_2.filter((s) => (collected?.[s] || 0) > 0).length,
    [collected]
  );

  const phase =
    scan1Done < SCAN_1.length
      ? "First scan"
      : scan2Done < SCAN_2.length
      ? "Second scan"
      : "Finishing";

  const currentStep = (session?.current_step as Step) || "front";

  const title =
    session?.status === "saved"
      ? "Setup complete"
      : session?.status === "saving"
      ? "Saving…"
      : session?.status === "error"
      ? "Something went wrong"
      : stepLabel(currentStep);

  const hint =
    session?.status === "saved"
      ? "Enrollment saved. This person can now be recognized."
      : session?.status === "saving"
      ? "Please keep still for a moment."
      : session?.status === "error"
      ? session?.last_message || "Please try again."
      : session?.last_message || "Position your face in the frame.";

  const multiWarn = !!session?.overlay_multi_in_roi;

  const startDisabled =
    busy || running || !cameraId || !employeeId.trim() || !name.trim();

  const {
    employees,
    loading: erpLoading,
    error: erpError,
    setSearch: setErpSearch,
    search: erpSearch,
  } = useErpEmployees({ debounceMs: 350, initialSearch: "" });

  const [selectedErpEmployeeId, setSelectedErpEmployeeId] = useState("");

  // Build dropdown items (Name + ID)
  const erpItems = useMemo(() => {
    return employees.map((e) => ({
      value: e.employeeId,
      label: `${e.employeeName} (${e.employeeId})`,
      keywords: `${e.employeeName} ${e.employeeId}`,
    }));
  }, [employees]);

  // When select from dropdown => fill existing fields
  const onPickEmployee = useCallback(
    (empId: string) => {
      setSelectedErpEmployeeId(empId);
      const picked = employees.find((e) => e.employeeId === empId);
      if (!picked) return;

      setEmployeeId(picked.employeeId);
      setName(picked.employeeName);
    },
    [employees]
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="text-sm text-gray-500">
        Auto enrollment stream (AI: {AI_HOST})
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-gray-500">Face enrollment</div>
              <div className="text-xl font-semibold truncate">
                Quick Setup (Face ID style)
              </div>
            </div>

            <Badge
              className={`${
                running
                  ? "bg-green-600"
                  : session?.status === "saved"
                  ? "bg-green-600"
                  : session?.status === "error"
                  ? "bg-red-600"
                  : "bg-gray-400"
              }`}
            >
              {running
                ? "Running"
                : session?.status === "saved"
                ? "Saved"
                : session?.status === "saving"
                ? "Saving"
                : session?.status === "error"
                ? "Error"
                : "Idle"}
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Setup (simple) */}
          {screen === "setup" && (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-5">
                <div className="text-lg font-semibold">1) Choose camera</div>
                <div className="text-sm text-gray-600 mt-1">
                  Make sure the camera sees a single face clearly.
                </div>

                <div className="mt-4">
                  <Label>Camera</Label>
                  <select
                    className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                    value={cameraId}
                    onChange={(e) => setCameraId(e.target.value)}
                    disabled={busy}
                  >
                    {(cameras || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name ? `${c.name} (${c.id})` : c.id}
                      </option>
                    ))}
                  </select>

                  <div className="text-xs text-gray-500 mt-2">
                    Camera status:{" "}
                    <b
                      className={
                        selectedCam?.isActive
                          ? "text-green-700"
                          : "text-red-700"
                      }
                    >
                      {selectedCam?.isActive ? "ON" : "OFF"}
                    </b>
                    {" — "}
                    {selectedCam?.isActive
                      ? "You should see the video preview."
                      : "It will start automatically when you press Start."}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-5">
                <div className="text-lg font-semibold">
                  2) Enter employee details
                </div>

                <div className="mt-4">
                  <Label>Select from ERP (search by Name or ID)</Label>

                  <div className="mt-1">
                    <SearchableSelect
                      value={selectedErpEmployeeId}
                      items={erpItems}
                      placeholder="Search employee..."
                      searchPlaceholder="Type name or ID..."
                      disabled={busy}
                      loading={erpLoading}
                      onSearchChange={(q) => setErpSearch(q)}
                      onChange={onPickEmployee}
                    />
                  </div>

                  {erpError ? (
                    <div className="text-xs text-red-600 mt-2">{erpError}</div>
                  ) : (
                    <div className="text-xs text-gray-500 mt-2">
                      Showing results for: <b>{erpSearch || "all"}</b>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label>Employee ID</Label>
                    <Input
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="EMP001"
                      disabled={busy}
                    />
                  </div>

                  <div>
                    <Label>Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      disabled={busy}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-5">
                  <Button onClick={start} disabled={startDisabled}>
                    {busy ? "Starting…" : "Start Setup"}
                  </Button>

                  <div className="ml-auto flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={tts}
                      onChange={(e) => setTts(e.target.checked)}
                    />
                    <span className="text-sm text-gray-600">
                      Voice instructions
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Enrolling */}
          {screen === "enrolling" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Stream */}
                <div className="space-y-3">
                  <div className="rounded-2xl border overflow-hidden bg-gray-100">
                    {selectedCam?.isActive && streamUrl ? (
                      <div className="aspect-video w-full">
                        <Image
                          src={streamUrl}
                          alt="Enrollment Stream"
                          className="h-full w-full object-cover"
                          width={1280}
                          height={720}
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="aspect-video flex items-center justify-center text-sm text-gray-600">
                        Starting camera…
                      </div>
                    )}
                  </div>

                  {multiWarn && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
                      More than one face is inside the box. Please keep only one
                      face in view.
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
                        {session?.last_pose || "—"}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-white p-3">
                      <div className="text-xs text-gray-500">Faces in box</div>
                      <div className="text-lg font-semibold">
                        {session?.overlay_roi_faces ?? 0}
                      </div>
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
                      <span className="text-sm text-gray-600">
                        Voice instructions
                      </span>
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

                  <BigInstruction
                    title={title}
                    hint={hint}
                    step={currentStep}
                  />

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
                              (collected?.[s] || 0) > 0
                                ? "bg-black"
                                : "bg-gray-200 text-gray-700"
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
                              (collected?.[s] || 0) > 0
                                ? "bg-black"
                                : "bg-gray-200 text-gray-700"
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
                      <div className="text-green-800 font-semibold">
                        Enrollment complete ✅
                      </div>
                      <div className="text-green-800 text-sm mt-1">
                        Templates saved automatically. Recognition/attendance
                        will work normally.
                      </div>

                      <div className="flex items-center gap-3 mt-4">
                        <Button
                          onClick={stop}
                          variant="secondary"
                          disabled={busy}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  )}

                  {session?.status === "error" && (
                    <div className="rounded-2xl border border-red-300 bg-red-50 p-4">
                      <div className="text-red-800 font-semibold">
                        Enrollment failed ❌
                      </div>
                      <div className="text-red-800 text-sm mt-1">
                        {session?.last_message || "Please try again."}
                      </div>

                      <div className="flex items-center gap-3 mt-4">
                        <Button
                          onClick={stop}
                          variant="secondary"
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
