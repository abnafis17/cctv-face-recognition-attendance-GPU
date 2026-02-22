import axios from "axios";
import { prisma } from "../prisma";

const AI_BASE = (process.env.AI_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);

let bootRetryTimer: ReturnType<typeof setTimeout> | null = null;

function hasRtsp(url: string | null | undefined): url is string {
  return typeof url === "string" && url.trim().length > 0;
}

function isNumericDeviceSource(url: string): boolean {
  return /^\d+$/.test(String(url || "").trim());
}

function isNetworkStreamSource(url: string): boolean {
  const value = String(url || "").trim().toLowerCase();
  if (!value) return false;
  if (isNumericDeviceSource(value)) return false;

  // Allow common network stream protocols; treat generic scheme://host as network too.
  if (
    value.startsWith("rtsp://") ||
    value.startsWith("rtsps://") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("rtmp://") ||
    value.startsWith("udp://") ||
    value.startsWith("tcp://")
  ) {
    return true;
  }

  const withoutCreds = (value.split("@").pop() || value).trim();

  // Accept RTSP-style host:port paths even if the scheme is missing (common misconfiguration).
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[\\/]|$)/.test(withoutCreds)) {
    return true;
  }

  // host:port[/...] (avoid Windows drive paths like "c:\...")
  if (
    !/^[a-z]:\\/.test(withoutCreds) &&
    /^[^/\\\s]+:\d+(?:[\\/]|$)/.test(withoutCreds)
  ) {
    return true;
  }

  return value.includes("://");
}

function readEnvMs(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallbackMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallbackMs;
  return parsed;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function isAiHealthy() {
  try {
    const response = await axios.get(`${AI_BASE}/health`, {
      timeout: readEnvMs("AI_HEALTH_TIMEOUT_MS", 2000),
    });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

async function waitForAiHealth() {
  const maxWaitMs = readEnvMs("AI_HEALTH_WAIT_MAX_MS", 60000);
  const retryDelayMs = readEnvMs("AI_HEALTH_RETRY_DELAY_MS", 1500);

  const startedAt = Date.now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    if (await isAiHealthy()) return { ok: true as const, attempt };

    const elapsed = Date.now() - startedAt;
    if (elapsed >= maxWaitMs) {
      return { ok: false as const, attempt, waitedMs: elapsed };
    }

    await sleep(retryDelayMs);
  }
}

async function startCameraOnAi(params: {
  cameraId: string;
  cameraName: string;
  companyId: string;
  rtspUrl: string;
}) {
  const { cameraId, cameraName, companyId, rtspUrl } = params;
  const response = await axios.post(
    `${AI_BASE}/camera/start`,
    null,
    {
      params: {
        camera_id: cameraId,
        camera_name: cameraName,
        companyId,
        rtsp_url: rtspUrl,
      },
      headers: companyId ? { "x-company-id": companyId } : undefined,
      timeout: Number(process.env.AI_START_TIMEOUT_MS || 8000),
    }
  );
  return response.data as { startedNow?: boolean };
}

export async function autoStartCameraById(params: {
  id: string;
  camId?: string | null;
  name: string;
  companyId: string | null;
  rtspUrl: string | null;
}) {
  const cameraId = String(params.id || "").trim();
  const cameraName = String(params.name || params.camId || params.id).trim();
  const companyId = String(params.companyId || "").trim();

  if (!cameraId || !companyId || !hasRtsp(params.rtspUrl)) {
    return { ok: false, reason: "missing_camera_or_stream" as const };
  }

  try {
    const started = await startCameraOnAi({
      cameraId,
      cameraName,
      companyId,
      rtspUrl: params.rtspUrl.trim(),
    });

    await prisma.camera.update({
      where: { id: cameraId },
      data: { isActive: true, attendance: true },
    });

    return { ok: true as const, startedNow: Boolean(started?.startedNow) };
  } catch (error: any) {
    await prisma.camera.update({
      where: { id: cameraId },
      data: { isActive: false },
    });

    const detail =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      String(error);
    return { ok: false as const, reason: "start_failed" as const, detail };
  }
}

export async function autoStartRtspCamerasOnBoot() {
  const enabled = String(process.env.AUTO_START_RTSP_CAMERAS || "1").trim() !== "0";
  if (!enabled) {
    console.log("[CAMERA-AUTOSTART] disabled via AUTO_START_RTSP_CAMERAS=0");
    return;
  }

  if (bootRetryTimer) {
    clearTimeout(bootRetryTimer);
    bootRetryTimer = null;
  }

  const health = await waitForAiHealth();
  if (!health.ok) {
    const retryMs = readEnvMs("CAMERA_AUTOSTART_RETRY_MS", 30000);
    if (retryMs > 0) {
      console.warn(
        `[CAMERA-AUTOSTART] AI not ready after ${health.waitedMs}ms; retrying in ${retryMs}ms`
      );
      bootRetryTimer = setTimeout(() => {
        bootRetryTimer = null;
        void autoStartRtspCamerasOnBoot().catch((error) => {
          console.error("[CAMERA-AUTOSTART] unexpected error:", error);
        });
      }, retryMs);
    } else {
      console.warn(
        `[CAMERA-AUTOSTART] AI not ready after ${health.waitedMs}ms; giving up (CAMERA_AUTOSTART_RETRY_MS=0)`
      );
    }

    return;
  }

  const cameras = await prisma.camera.findMany({
    where: {
      companyId: { not: null },
      rtspUrl: { not: null },
    },
    select: {
      id: true,
      camId: true,
      name: true,
      companyId: true,
      rtspUrl: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });

  let started = 0;
  let failed = 0;
  let skipped = 0;
  let skippedLocal = 0;
  const includeLocal = String(process.env.AUTO_START_LOCAL_SOURCES || "0").trim() === "1";

  for (const cam of cameras) {
    if (!hasRtsp(cam.rtspUrl)) {
      skipped += 1;
      continue;
    }

    if (!includeLocal && !isNetworkStreamSource(cam.rtspUrl)) {
      skipped += 1;
      skippedLocal += 1;
      continue;
    }

    const result = await autoStartCameraById({
      id: cam.id,
      camId: cam.camId,
      name: cam.name,
      companyId: cam.companyId,
      rtspUrl: cam.rtspUrl,
    });

    if (result.ok) {
      started += 1;
      continue;
    }

    if (result.reason === "missing_camera_or_stream") {
      skipped += 1;
      continue;
    }

    failed += 1;
    console.error(
      `[CAMERA-AUTOSTART] failed id=${cam.id} name=${cam.name} detail=${result.detail}`
    );
  }

  console.log(
    `[CAMERA-AUTOSTART] complete started=${started} failed=${failed} skipped=${skipped} skippedLocal=${skippedLocal}`
  );
}
