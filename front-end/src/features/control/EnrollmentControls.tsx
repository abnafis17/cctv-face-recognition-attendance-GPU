"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { fetchJSON, postJSON } from "@/lib/api";
import { Camera, Employee } from "@/types";
import { getCompanyIdFromToken } from "@/lib/authStorage";

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

const DEFAULT_LAPTOP_CAMERA_ID = "cmkdpsq300000j7284bwluxh2";

function nextAngleAfter(current: Angle, staged: Record<string, number>): Angle {
  const idx = ANGLES.indexOf(current);

  // Prefer next missing angle
  for (let step = 1; step <= ANGLES.length; step++) {
    const a = ANGLES[(idx + step) % ANGLES.length];
    if ((staged[a] ?? 0) === 0) return a;
  }

  // If all captured at least once, cycle normally
  return ANGLES[(idx + 1) % ANGLES.length];
}

function angleLabel(a: Angle) {
  return a.charAt(0).toUpperCase() + a.slice(1);
}

export default function EnrollmentControls({ cameras }: { cameras: Camera[] }) {
  const companyId = getCompanyIdFromToken();
  const laptopCameraId = companyId
    ? `laptop-${companyId}`
    : DEFAULT_LAPTOP_CAMERA_ID;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cameraId, setCameraId] = useState(laptopCameraId);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [laptopActive, setLaptopActive] = useState(false);

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [noScan, setNoScan] = useState(false);

  const [running, setRunning] = useState(false);
  const [currentAngle, setCurrentAngle] = useState<Angle>("front");

  // ✅ IMPORTANT: local staged is source-of-truth for progress UI
  const [staged, setStaged] = useState<Record<string, number>>({});
  const stagedRef = useRef<Record<string, number>>({});
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const aiBase = process.env.NEXT_PUBLIC_AI_URL || "http://127.0.0.1:8000";
  const wsSignalUrl = useMemo(() => {
    const base = String(aiBase || "").replace(/^http/i, "ws").replace(/\/$/, "");
    return `${base}/webrtc/signal`;
  }, [aiBase]);

  const camerasWithLaptop = useMemo(() => {
    const hasLaptop = cameras.some((c) => c.id === laptopCameraId);
    if (hasLaptop) return cameras;

    const laptopCam: Camera = {
      id: laptopCameraId,
      camId: laptopCameraId,
      name: "Laptop Camera",
      rtspUrl: "",
      isActive: laptopActive,
    };
    return [laptopCam, ...cameras];
  }, [cameras, laptopActive, laptopCameraId]);

  const selectedCamera = useMemo(
    () => camerasWithLaptop.find((c) => c.id === cameraId),
    [camerasWithLaptop, cameraId]
  );

  const stopLaptopCamera = useCallback(() => {
    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}

    try {
      pcRef.current?.close();
    } catch {}

    try {
      wsRef.current?.close();
    } catch {}

    localStreamRef.current = null;
    pcRef.current = null;
    wsRef.current = null;

    setLaptopActive(false);
  }, []);

  const startLaptopCamera = useCallback(async () => {
    if (laptopActive) stopLaptopCamera();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    localStreamRef.current = stream;

    const pc = new RTCPeerConnection();
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const ws = new WebSocket(wsSignalUrl);
    wsRef.current = ws;

    ws.onerror = () => {
      stopLaptopCamera();
    };

    ws.onclose = () => {
      if (pcRef.current) stopLaptopCamera();
    };

    ws.onopen = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      ws.send(
        JSON.stringify({
          sdp: pc.localDescription,
          cameraId: laptopCameraId,
          companyId: companyId || undefined,
          type: "attendance",
          purpose: "enroll",
        })
      );
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.sdp && data.cameraId === laptopCameraId) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        setLaptopActive(true);
      } else if (data.ice && data.cameraId === laptopCameraId) {
        await pc.addIceCandidate(data.ice);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            ice: event.candidate,
            cameraId: laptopCameraId,
            companyId: companyId || undefined,
            type: "attendance",
            purpose: "enroll",
          })
        );
      }
    };
  }, [companyId, laptopActive, laptopCameraId, stopLaptopCamera, wsSignalUrl]);

  useEffect(() => {
    return () => stopLaptopCamera();
  }, [stopLaptopCamera]);

  const doneAngles = useMemo(() => {
    return ANGLES.filter((a) => (staged?.[a] ?? 0) > 0);
  }, [staged]);

  const doneCount = doneAngles.length;
  const progressPct = Math.round((doneCount / ANGLES.length) * 100);
  const canSave = doneCount > 0;

  async function loadEmployees() {
    const emps = await fetchJSON<Employee[]>("/employees");
    setEmployees(emps);
  }

  // ✅ Merge server status WITHOUT resetting progress
  function applyServerSession(s: any) {
    // running + angle + message
    setRunning(s?.status === "running");
    if (s?.current_angle) setCurrentAngle(s.current_angle);
    if (typeof s?.last_message === "string") setMsg(s.last_message);

    // ✅ merge collected into local staged, keep max per angle
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
      const data = await fetchJSON<any>("/enroll/status");
      const s = data?.session;
      if (!s) {
        setRunning(false);
        return;
      }
      applyServerSession(s);
    } catch (e: any) {
      // don’t spam; show once
      setErr(e?.message ?? "Failed to refresh status");
    }
  }

  async function startEnroll() {
    const wasCameraActive = selectedCamera?.isActive === true;
    let startedCamera = false;
    try {
      setErr("");
      setBusy(true);

      if (!noScan && !cameraId) throw new Error("Select a camera");
      if (mode === "new" && !name.trim())
        throw new Error("Enter employee name");
      if (mode === "existing" && !employeeId)
        throw new Error("Select employee");

      // Raw preview needs camera runtime started
      if (!noScan) {
        if (cameraId === laptopCameraId) {
          startedCamera = !wasCameraActive;
          await startLaptopCamera();
        } else {
          const res = await postJSON<{
            ok: boolean;
            startedNow?: boolean;
            isActive?: boolean;
          }>(`/cameras/start/${cameraId}`);
          startedCamera =
            typeof res?.startedNow === "boolean"
              ? res.startedNow
              : !wasCameraActive;
        }
      }

      await postJSON("/enroll/start", {
        cameraId,
        name: mode === "new" ? name.trim() : undefined,
        employeeId: mode === "existing" ? employeeId : undefined,
        allowNoScan: noScan,
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
      await loadEmployees();
      await refreshStatus();
    } catch (e: any) {
      const msg = e?.message ?? "Failed to start enroll";
      setErr(msg);
      toast.error(msg);
      if (startedCamera && cameraId) {
        try {
          if (cameraId === laptopCameraId) {
            stopLaptopCamera();
          } else {
            await postJSON(`/cameras/stop/${cameraId}`);
          }
        } catch {
          // ignore camera stop failure
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function stopEnroll() {
    try {
      setErr("");
      setBusy(true);

      await postJSON("/enroll/stop");
      if (cameraId) {
        if (cameraId === laptopCameraId) {
          stopLaptopCamera();
        } else {
          await postJSON(`/cameras/stop/${cameraId}`);
        }
      }

      // ✅ explicit reset
      setRunning(false);
      setStaged({});
      setMsg("");
      setCurrentAngle("front");

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
      await postJSON("/enroll/angle", { angle: a });
      setCurrentAngle(a);
      await refreshStatus();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to change angle");
      toast.error("Angle change failed");
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    try {
      setErr("");
      setBusy(true);

      const resp = await postJSON<any>("/enroll/capture", {
        angle: currentAngle,
      });

      // ✅ IMPORTANT: AI capture success is resp.result.ok, not resp.ok
      if (!resp?.ok || !resp?.result?.ok) {
        const msg =
          resp?.result?.error ||
          resp?.error ||
          resp?.session?.last_message ||
          "Capture failed";
        setErr(msg);
        toast.error(msg);

        // keep UI in sync with server
        await refreshStatus();
        return;
      }

      // ✅ Use server truth for counts (no optimistic fake progress)
      const s = resp?.session;
      if (s?.collected) {
        setStaged((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(s.collected)) {
            next[k] = Math.max(next[k] ?? 0, Number(s.collected[k] ?? 0));
          }
          return next;
        });
      }

      toast.success(`Captured: ${currentAngle}`);

      // Auto-next based on UPDATED staged (from server)
      const stagedSnapshot = { ...stagedRef.current, ...(s?.collected || {}) };
      const next = nextAngleAfter(currentAngle, stagedSnapshot);

      await postJSON("/enroll/angle", { angle: next });
      setCurrentAngle(next);

      await refreshStatus();
    } catch (e: any) {
      const msg = e?.message ?? "Capture failed";
      setErr(msg);
      toast.error(msg);
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

      const out = await postJSON<any>("/enroll/save");
      const saved: string[] = out?.result?.saved_angles || [];

      if (saved.length > 0) toast.success(`Saved: ${saved.join(", ")}`);
      else toast("Nothing saved", { icon: "ℹ️" });

      // ✅ auto stop after save
      await postJSON("/enroll/stop");
      if (cameraId) await postJSON(`/cameras/${cameraId}/stop`);

      // ✅ explicit reset UI
      setRunning(false);
      setStaged({});
      setMsg("");
      setCurrentAngle("front");

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

      await postJSON("/enroll/cancel");

      // ✅ explicit reset staged (user asked cancel)
      setStaged({});
      setMsg("Canceled staged captures");

      toast("Canceled staged captures", { icon: "↩️" });
      await refreshStatus();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to cancel");
      toast.error("Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  // Requires /enroll/clear-angle (you already enabled earlier)
  async function rescanCurrentAngle() {
    try {
      setErr("");
      setBusy(true);

      await postJSON("/enroll/clear-angle", { angle: currentAngle });

      // ✅ explicitly clear only this angle locally
      setStaged((prev) => ({ ...prev, [currentAngle]: 0 }));

      toast(`Cleared ${angleLabel(currentAngle)}. Capture again.`, {
        icon: "🧹",
      });
      await refreshStatus();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to clear angle");
      toast.error("Re-scan failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadEmployees();
    refreshStatus();

    const t = setInterval(() => {
      if (running) refreshStatus();
    }, 1500);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* LEFT: Preview */}
      <Card className="overflow-hidden">
        <CardHeader className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Enrollment Preview</CardTitle>
              <CardDescription className="text-sm">
                Raw camera stream (no recognition overlays).
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
          {/* Portrait container: 9:16 (best for face scan framing) */}
          <div className="mx-auto w-full overflow-hidden rounded-xl border bg-muted">
            <div className="relative w-full aspect-9/16 overflow-hidden bg-black max-h-[70vh] sm:max-h-130 md:max-h-150">
              {running && cameraId && !noScan ? (
                <Image
                  src={`${aiBase}/camera/stream/${cameraId}`}
                  alt="camera"
                  fill
                  className="object-cover"
                  unoptimized
                  priority
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 420px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  {noScan ? "No-scan mode enabled" : "Camera OFF"}
                </div>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="text-muted-foreground">Angle: </span>
                <span className="font-semibold">
                  {angleLabel(currentAngle)}
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
            Start → Capture angles (auto-next) → Save (auto-stop).
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
                  {camerasWithLaptop.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.camId ?? c.id})
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
                        <SelectItem key={e.id} value={e.empId ?? e.id}>
                          {e.name} ({e.empId ?? e.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>

          {/* No scan */}
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

          {/* Angles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Angles</Label>
              <div className="text-xs text-muted-foreground">
                Captured: {doneCount}/{ANGLES.length}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {ANGLES.map((a) => {
                const captured = (staged[a] ?? 0) > 0;
                const active = currentAngle === a;
                return (
                  <Button
                    key={a}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="h-9"
                    onClick={() => changeAngle(a)}
                    disabled={!running || busy || noScan}
                    title={
                      captured ? `Captured (${staged[a]})` : "Not captured"
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
              onClick={capture}
              disabled={busy || !running || noScan}
              className="h-10"
            >
              Capture (auto-next)
            </Button>

            <Button
              type="button"
              onClick={saveAll}
              disabled={busy || !running || noScan || !canSave}
              className="h-10"
              title={!canSave ? "Capture at least 1 angle to enable Save" : ""}
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
            Save will show a toast, then automatically stop the camera and reset
            the enrollment UI.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
