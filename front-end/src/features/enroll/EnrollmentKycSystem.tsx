"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { fetchJSON, postJSON } from "@/lib/api";
import { Camera, Employee } from "@/types";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Image from "next/image";

type Angle = "front" | "left" | "right" | "up" | "down";
const ANGLES: Angle[] = ["front", "left", "right", "up", "down"];

type NormBBox = { x: number; y: number; w: number; h: number } | null;

function angleLabel(a: Angle) {
  return a.charAt(0).toUpperCase() + a.slice(1);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function EnrollmentKycSystem({
  cameras,
}: {
  cameras: Camera[];
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cameraId, setCameraId] = useState("");

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [noScan, setNoScan] = useState(false);

  const [running, setRunning] = useState(false);
  const [currentAngle, setCurrentAngle] = useState<Angle>("front");

  // KYC / autoscan UI
  const [kycEnabled, setKycEnabled] = useState(true);
  const [autoScan, setAutoScan] = useState(true);
  const [samplesPerAngle, setSamplesPerAngle] = useState<number>(3);

  const [kycOk, setKycOk] = useState(false);
  const [kycReason, setKycReason] = useState<string>("");

  // face rectangle overlay (normalized)
  const [faceBox, setFaceBox] = useState<NormBBox>(null);

  // local staged is source-of-truth for progress UI
  const [staged, setStaged] = useState<Record<string, number>>({});
  const stagedRef = useRef<Record<string, number>>({});
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Auto-scan loop control
  const autoTimerRef = useRef<number | null>(null);
  const tickInFlightRef = useRef(false);
  const lastSpokenRef = useRef<string>("");

  const aiBase = process.env.NEXT_PUBLIC_AI_URL || "http://127.0.0.1:8000";

  const selectedCamera = useMemo(
    () => cameras.find((c) => c.id === cameraId),
    [cameras, cameraId]
  );

  const need = useMemo(() => clamp(samplesPerAngle, 1, 10), [samplesPerAngle]);

  const doneCount = useMemo(() => {
    return ANGLES.filter((a) => (staged?.[a] ?? 0) >= need).length;
  }, [staged, need]);

  const progressPct = useMemo(() => {
    return Math.round((doneCount / ANGLES.length) * 100);
  }, [doneCount]);

  const canSave = useMemo(() => {
    return Object.values(staged || {}).some((v) => (v ?? 0) > 0);
  }, [staged]);

  async function loadEmployees() {
    const emps = await fetchJSON<Employee[]>("/api/employees");
    setEmployees(emps);
  }

  function applyServerSession(s: any) {
    setRunning(s?.status === "running");

    if (s?.current_angle) setCurrentAngle(s.current_angle as Angle);
    if (typeof s?.last_message === "string") setMsg(s.last_message);

    // KYC fields from AI session
    if (typeof s?.kyc_ok === "boolean") setKycOk(!!s.kyc_ok);
    if (typeof s?.kyc_reason === "string") setKycReason(s.kyc_reason || "");

    // normalized bbox for rectangle overlay
    if (s?.last_bbox && typeof s.last_bbox === "object") {
      const b = s.last_bbox;
      if (
        typeof b.x === "number" &&
        typeof b.y === "number" &&
        typeof b.w === "number" &&
        typeof b.h === "number"
      ) {
        setFaceBox({
          x: clamp(b.x, 0, 1),
          y: clamp(b.y, 0, 1),
          w: clamp(b.w, 0, 1),
          h: clamp(b.h, 0, 1),
        });
      } else {
        setFaceBox(null);
      }
    } else {
      setFaceBox(null);
    }

    // collected counts
    const serverCollected: Record<string, number> = s?.collected || {};
    if (serverCollected && typeof serverCollected === "object") {
      setStaged((prev) => {
        const next = { ...prev };
        for (const a of ANGLES) {
          const pv = prev[a] ?? 0;
          const sv = Number(serverCollected[a] ?? 0);
          next[a] = Math.max(pv, sv);
        }
        return next;
      });
    }
  }

  async function refreshStatus() {
    try {
      const data = await fetchJSON<any>("/api/enroll/status");
      const s = data?.session;
      if (!s) {
        setRunning(false);
        return;
      }
      applyServerSession(s);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to refresh status");
    }
  }

  // -------------------------
  // Audio helpers (browser)
  // -------------------------
  function speak(text: string) {
    try {
      if (!text) return;
      if (lastSpokenRef.current === text) return;
      lastSpokenRef.current = text;

      const synth = window.speechSynthesis;
      if (!synth) return;

      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      synth.speak(u);
    } catch {
      // no-op
    }
  }

  function instructionForAngle(a: Angle) {
    if (a === "front") return "Hold your face in front";
    if (a === "left") return "Turn left";
    if (a === "right") return "Turn right";
    if (a === "up") return "Look up";
    return "Look down";
  }

  // -------------------------
  // Start/Stop
  // -------------------------
  async function startEnroll() {
    try {
      setErr("");
      setBusy(true);

      if (!noScan && !cameraId) throw new Error("Select a camera");
      if (mode === "new" && !name.trim())
        throw new Error("Enter employee name");
      if (mode === "existing" && !employeeId)
        throw new Error("Select employee");

      if (!noScan) {
        await postJSON(`/api/cameras/${cameraId}/start`);
      }

      await postJSON("/api/enroll/start", {
        cameraId,
        name: mode === "new" ? name.trim() : undefined,
        employeeId: mode === "existing" ? employeeId : undefined,
        allowNoScan: noScan,
        kycEnabled,
        samplesPerAngle: clamp(samplesPerAngle, 1, 10),
      });

      if (noScan) {
        toast.success("Employee created (no scan).");
        await loadEmployees();
        setMsg(
          "Employee created without scanning. Select existing employee later to scan."
        );
        return;
      }

      toast.success("Enrollment started");

      // reset UI
      setStaged({});
      setFaceBox(null);
      setKycOk(false);
      setKycReason("");
      setCurrentAngle("front");
      lastSpokenRef.current = "";

      await loadEmployees();
      await refreshStatus();

      speak(instructionForAngle("front"));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to start enroll");
      toast.error("Start failed");
    } finally {
      setBusy(false);
    }
  }

  async function stopEnroll() {
    try {
      setErr("");
      setBusy(true);

      await postJSON("/api/enroll/stop");
      if (cameraId) await postJSON(`/api/cameras/${cameraId}/stop`);

      setRunning(false);
      setStaged({});
      setFaceBox(null);
      setMsg("");
      setErr("");
      setCurrentAngle("front");
      setKycOk(false);
      setKycReason("");

      toast("Enrollment stopped", { icon: "🛑" });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to stop");
      toast.error("Stop failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeAngle(a: Angle) {
    try {
      setErr("");
      setBusy(true);
      await postJSON("/api/enroll/angle", { angle: a });
      setCurrentAngle(a);
      speak(instructionForAngle(a));
      await refreshStatus();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to change angle");
      toast.error("Angle change failed");
    } finally {
      setBusy(false);
    }
  }

  // -------------------------
  // Manual capture (non-auto)
  // -------------------------
  async function captureManual() {
    try {
      setErr("");
      setBusy(true);

      const resp = await postJSON<any>("/api/enroll/capture", {
        angle: currentAngle,
      });

      if (!resp?.ok || !resp?.result?.ok) {
        const m =
          resp?.result?.error ||
          resp?.error ||
          resp?.session?.last_message ||
          "Capture failed";
        setErr(m);
        setMsg(m);
        toast.error(m);
        await refreshStatus();
        return;
      }

      toast.success(`Captured: ${currentAngle}`);
      if (resp?.session) applyServerSession(resp.session);
      else await refreshStatus();
    } catch (e: any) {
      const m = e?.message ?? "Capture failed";
      setErr(m);
      toast.error(m);
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    try {
      setErr("");
      setBusy(true);

      if (!canSave) {
        toast.error("Capture at least 1 angle to enable Save", { icon: "ℹ️" });
        return;
      }

      const out = await postJSON<any>("/api/enroll/save");
      const saved: string[] = out?.result?.saved_angles || [];

      if (saved.length > 0) toast.success(`Saved: ${saved.join(", ")}`);
      else toast("Nothing saved", { icon: "ℹ️" });

      await postJSON("/api/enroll/stop");
      if (cameraId) await postJSON(`/api/cameras/${cameraId}/stop`);

      setRunning(false);
      setStaged({});
      setFaceBox(null);
      setMsg("");
      setCurrentAngle("front");
      setKycOk(false);
      setKycReason("");

      await refreshStatus();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save enrollment");
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function cancelAll() {
    try {
      setErr("");
      setBusy(true);

      await postJSON("/api/enroll/cancel");

      // ✅ local reset to match server hard reset (front + clear box)
      setStaged({});
      setFaceBox(null);
      setCurrentAngle("front");
      setKycOk(false);
      setKycReason("canceled");
      setMsg("Canceled. Restart scanning from Front.");
      lastSpokenRef.current = "";

      toast("Canceled staged captures", { icon: "↩️" });

      await refreshStatus();
      speak(instructionForAngle("front"));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to cancel");
      toast.error("Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  async function rescanCurrentAngle() {
    try {
      setErr("");
      setBusy(true);

      await postJSON("/api/enroll/clear-angle", { angle: currentAngle });
      setStaged((prev) => ({ ...prev, [currentAngle]: 0 }));
      toast(`Cleared ${angleLabel(currentAngle)}. Capture again.`, {
        icon: "🧹",
      });
      await refreshStatus();
      speak(instructionForAngle(currentAngle));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to clear angle");
      toast.error("Re-scan failed");
    } finally {
      setBusy(false);
    }
  }

  // -------------------------
  // ✅ Auto-scan loop (KYC) — uses /api/enroll/kyc/tick
  // -------------------------

  const liveRef = useRef({
    running: false,
    noScan: false,
    autoScan: true,
    kycEnabled: true,
    busy: false,
    currentAngle: "front" as Angle,
    cameraId: "",
  });

  useEffect(() => {
    liveRef.current.running = running;
    liveRef.current.noScan = noScan;
    liveRef.current.autoScan = autoScan;
    liveRef.current.kycEnabled = kycEnabled;
    liveRef.current.busy = busy;
    liveRef.current.currentAngle = currentAngle;
    liveRef.current.cameraId = cameraId;
  }, [running, noScan, autoScan, kycEnabled, busy, currentAngle, cameraId]);

  async function tickAutoScan() {
    const live = liveRef.current;

    // ✅ gate before request (avoid useless network calls)
    if (!live.running || live.noScan || !live.autoScan) return;
    if (!live.kycEnabled) return;
    if (live.busy) return; // optional: keep, but don’t use it after response
    if (tickInFlightRef.current) return;

    try {
      tickInFlightRef.current = true;

      const resp = await postJSON<any>("/api/enroll/kyc/tick");
      const out = resp?.result;

      // ✅ if server returned a session, always apply it (even when error/throttled)
      const prevAngle = liveRef.current.currentAngle;
      if (resp?.session) {
        applyServerSession(resp.session);

        const nextAngle = resp.session?.current_angle as Angle | undefined;
        if (nextAngle && nextAngle !== prevAngle) {
          speak(instructionForAngle(nextAngle));
        }
      }

      // ✅ now validate outer+inner ok
      if (!resp?.ok || !out?.ok) {
        const m =
          out?.error ||
          resp?.error ||
          resp?.session?.last_message ||
          "KYC tick failed";
        setErr(m);
        setMsg(m);
        return;
      }

      // ✅ throttled is normal
      if (out?.throttled) return;

      // if session missing (rare), fallback refresh
      if (!resp?.session) {
        await refreshStatus();
      }

      // ✅ completion check
      const s = resp?.session;
      const stage = String(s?.kyc_stage || "");
      const passed = !!s?.kyc_ok;

      if (stage === "done" && passed) {
        toast.success("KYC passed & saved ✅");
        speak("Verification complete.");

        await postJSON("/api/enroll/stop");

        const camToStop = liveRef.current.cameraId; // ✅ always in-scope
        if (camToStop) await postJSON(`/api/cameras/${camToStop}/stop`);

        setRunning(false);
        setStaged({});
        setFaceBox(null);
        setMsg("KYC passed & saved");
        setCurrentAngle("front");
        setKycOk(false);
        setKycReason("");
      }
    } finally {
      tickInFlightRef.current = false;
    }
  }

  function startAutoLoop() {
    stopAutoLoop();
    autoTimerRef.current = window.setInterval(() => {
      tickAutoScan();
    }, 250); // smooth UI; AI side throttles with KYC_TICK_FPS anyway
  }

  function stopAutoLoop() {
    if (autoTimerRef.current) {
      window.clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }

  // Poll status
  useEffect(() => {
    loadEmployees();
    refreshStatus();

    const t = window.setInterval(() => {
      if (running) refreshStatus();
    }, 1500);

    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Auto loop lifecycle
  useEffect(() => {
    if (running && autoScan && kycEnabled && !noScan) startAutoLoop();
    else stopAutoLoop();
    return () => stopAutoLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, autoScan, kycEnabled, noScan]);

  // Per-angle progress
  const angleProgress = useMemo(() => {
    const v = staged[currentAngle] ?? 0;
    return clamp(v, 0, need);
  }, [staged, currentAngle, need]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* LEFT: Preview (Portrait) */}
      <Card className="overflow-hidden">
        <CardHeader className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Enrollment Preview</CardTitle>
              <CardDescription className="text-sm">
                Portrait preview + face rectangle overlay.
              </CardDescription>
            </div>

            <Badge variant={running ? "default" : "secondary"} className="mt-1">
              {running ? "Running" : "Stopped"}
            </Badge>
          </div>

          <div className="text-xs text-muted-foreground">
            {selectedCamera
              ? `${selectedCamera.name} (${selectedCamera.id})`
              : "Select a camera"}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Portrait container: 9:16 */}
          <div className="relative overflow-hidden rounded-xl border bg-muted">
            <div className="relative w-full overflow-hidden rounded-lg bg-black aspect-[9/16] max-h-[70vh] sm:max-h-[520px] md:max-h-[600px]">
              {running && cameraId && !noScan ? (
                <Image
                  src={`${aiBase}/camera/stream/${cameraId}`}
                  alt="camera"
                  fill
                  className="object-cover"
                  unoptimized
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 420px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                  {noScan ? "No-scan mode enabled" : "Camera OFF"}
                </div>
              )}

              {/* ✅ Face rectangle overlay (no circles) */}
              {running && !noScan && faceBox ? (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute rounded-md border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
                    style={{
                      left: `${faceBox.x * 100}%`,
                      top: `${faceBox.y * 100}%`,
                      width: `${faceBox.w * 100}%`,
                      height: `${faceBox.h * 100}%`,
                    }}
                  />
                </div>
              ) : null}

              {/* Status chip */}
              {running && !noScan ? (
                <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/55 px-3 py-2 text-white">
                  <div className="text-xs font-semibold">
                    {autoScan && kycEnabled ? "Auto KYC Scanning" : "Manual"}
                  </div>
                  <div className="mt-0.5 text-[11px] opacity-90">
                    {angleLabel(currentAngle)} • {angleProgress}/{need}
                  </div>
                  {kycEnabled ? (
                    <div className="mt-0.5 text-[11px] opacity-90">
                      {kycOk ? "KYC PASS ✅" : `KYC… ${kycReason || ""}`}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="text-muted-foreground">Angle: </span>
                <span className="font-semibold">
                  {angleLabel(currentAngle)}
                </span>
                <span className="ml-2 text-muted-foreground">
                  ({angleProgress}/{need})
                </span>
              </div>
              <div className="text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {doneCount}
                </span>{" "}
                / {ANGLES.length} angles
                <span className="ml-2">({progressPct}%)</span>
              </div>
            </div>
            <Progress value={progressPct} />
          </div>

          {msg ? (
            <div className="rounded-lg border bg-background px-3 py-2 text-sm">
              <span className="text-muted-foreground">Info: </span>
              <span className="font-medium">{msg}</span>
            </div>
          ) : null}

          {err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* RIGHT: Controls */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Enrollment Controls</CardTitle>
          <CardDescription className="text-sm">
            Start → (Auto KYC tick) → AI saves → Stop.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Top row */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm">Camera</Label>
              <Select
                value={cameraId}
                onValueChange={setCameraId}
                disabled={running || busy}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  {cameras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Mode</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as any)}
                disabled={running || busy}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New employee</SelectItem>
                  <SelectItem value="existing">Existing employee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              {mode === "new" ? (
                <>
                  <Label className="text-sm">Employee name</Label>
                  <Input
                    className="h-10"
                    placeholder="e.g. Rahim"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={running || busy}
                  />
                </>
              ) : (
                <>
                  <Label className="text-sm">Employee</Label>
                  <Select
                    value={employeeId}
                    onValueChange={(v) => {
                      setEmployeeId(v);
                      const emp = employees.find((x) => x.id === v);
                      if (emp) setName(emp.name);
                    }}
                    disabled={running || busy}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} ({e.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>

          {/* No scan toggle */}
          <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">
                Create without scanning
              </div>
              <div className="text-xs text-muted-foreground">
                Creates employee record only. Scan later from existing employee.
              </div>
            </div>
            <button
              className={`h-6 w-11 rounded-full border transition ${
                noScan ? "bg-black" : "bg-white"
              }`}
              onClick={() => !busy && !running && setNoScan((v) => !v)}
              disabled={busy || running}
              aria-label="Toggle no-scan"
            >
              <div
                className={`h-5 w-5 translate-x-1 rounded-full bg-white shadow transition ${
                  noScan ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          <Separator />

          {/* KYC settings */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">KYC Mode</div>
                <div className="text-xs text-muted-foreground">
                  Uses KYC tick + auto save in AI.
                </div>
              </div>
              <button
                className={`h-6 w-11 rounded-full border transition ${
                  kycEnabled ? "bg-black" : "bg-white"
                }`}
                onClick={() => !busy && !running && setKycEnabled((v) => !v)}
                disabled={busy || running}
                aria-label="Toggle kyc"
              >
                <div
                  className={`h-5 w-5 translate-x-1 rounded-full bg-white shadow transition ${
                    kycEnabled ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Auto Scan</div>
                <div className="text-xs text-muted-foreground">
                  Calls /api/enroll/kyc/tick repeatedly.
                </div>
              </div>
              <button
                className={`h-6 w-11 rounded-full border transition ${
                  autoScan ? "bg-black" : "bg-white"
                }`}
                onClick={() => !busy && setAutoScan((v) => !v)}
                disabled={busy || noScan || !kycEnabled}
                aria-label="Toggle autoscan"
                title={!kycEnabled ? "Enable KYC to use Auto Scan" : ""}
              >
                <div
                  className={`h-5 w-5 translate-x-1 rounded-full bg-white shadow transition ${
                    autoScan ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label className="text-sm">Samples per angle</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={samplesPerAngle}
                  onChange={(e) =>
                    setSamplesPerAngle(
                      clamp(Number(e.target.value || 3), 1, 10)
                    )
                  }
                  disabled={running || busy || noScan}
                  className="h-10 w-32"
                />
                <div className="text-xs text-muted-foreground">
                  Recommended 3–5.
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Angles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Angles</Label>
              <div className="text-xs text-muted-foreground">
                Need: {need}/angle
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {ANGLES.map((a) => {
                const captured = (staged[a] ?? 0) >= need;
                const active = currentAngle === a;
                return (
                  <Button
                    key={a}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="h-9"
                    onClick={() => changeAngle(a)}
                    disabled={!running || busy || noScan || autoScan}
                    title={
                      captured
                        ? `Done (${staged[a]}/${need})`
                        : `${staged[a] ?? 0}/${need}`
                    }
                  >
                    {angleLabel(a)}{" "}
                    {captured ? <span className="ml-1">✅</span> : null}
                  </Button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={rescanCurrentAngle}
                disabled={!running || busy || noScan}
              >
                Re-scan this angle
              </Button>
              <div className="text-xs text-muted-foreground self-center">
                Clears only <b>{angleLabel(currentAngle)}</b>.
              </div>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={startEnroll}
              disabled={busy || running}
              className="h-10"
            >
              Start Enroll
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={captureManual}
              disabled={busy || !running || noScan || autoScan}
              className="h-10"
              title={autoScan ? "Disable Auto Scan to use manual capture" : ""}
            >
              Capture (manual)
            </Button>

            <Button
              type="button"
              onClick={saveAll}
              disabled={
                busy ||
                !running ||
                noScan ||
                autoScan ||
                !canSave ||
                (kycEnabled && !kycOk)
              }
              className="h-10"
              title={
                autoScan
                  ? "Auto Scan uses AI auto-save"
                  : kycEnabled && !kycOk
                  ? "KYC must pass to save"
                  : ""
              }
            >
              Save
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={cancelAll}
              disabled={busy || !running || noScan}
              className="h-10"
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={stopEnroll}
              disabled={busy || !running}
              className="h-10"
            >
              Stop
            </Button>
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed">
            <b>Auto Scan:</b> uses <code>/api/enroll/kyc/tick</code> and AI will
            save automatically when complete. The overlay is a{" "}
            <b>rectangle around the detected face</b> (no circles).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
