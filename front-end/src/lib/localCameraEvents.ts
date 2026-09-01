export const LOCAL_CAMERA_STOP_EVENT = "local-camera:stop";
export const DEFAULT_LOCAL_CAMERA_ID = "cmkdpsq300000j7284bwluxh2";

export type LocalCameraStopDetail = {
  cameraId?: string | null;
};

export function isLocalCameraId(cameraId?: string | null) {
  const normalized = String(cameraId ?? "").trim().toLowerCase();
  return (
    normalized === DEFAULT_LOCAL_CAMERA_ID ||
    normalized.startsWith("laptop-")
  );
}

export function dispatchLocalCameraStop(cameraId?: string | null) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<LocalCameraStopDetail>(LOCAL_CAMERA_STOP_EVENT, {
      detail: { cameraId },
    }),
  );
}

export function getLocalCameraStopTarget(event: Event) {
  return String(
    (event as CustomEvent<LocalCameraStopDetail>).detail?.cameraId ?? "",
  ).trim();
}
