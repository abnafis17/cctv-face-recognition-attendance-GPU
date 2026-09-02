import type {
  BoundingBoxCorners,
  BoundingBoxEmployeeOption,
  BoundingBoxPoint,
  BoundingBoxRect,
  BoundingBoxResizeHandle,
  CameraBoundingBoxPayload,
  CameraBoundingBoxRecord,
  EditableBoundingBox,
} from "./types";

export const MIN_BOX_SIZE = 0.02;

const BOX_COLORS = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#dc2626",
  "#7c3aed",
  "#0f766e",
  "#ca8a04",
  "#db2777",
];

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `local-${crypto.randomUUID()}`;
  }

  return `local-${Math.random().toString(36).slice(2, 10)}`;
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function roundUnit(value: number): number {
  return Number(clampUnit(value).toFixed(6));
}

export function sortDistinctIds(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of values) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

export function rectToCorners(rect: BoundingBoxRect): BoundingBoxCorners {
  const x1 = roundUnit(rect.x);
  const y1 = roundUnit(rect.y);
  const x2 = roundUnit(rect.x + rect.width);
  const y2 = roundUnit(rect.y + rect.height);

  return {
    topLeft: { x: x1, y: y1 },
    topRight: { x: x2, y: y1 },
    bottomLeft: { x: x1, y: y2 },
    bottomRight: { x: x2, y: y2 },
  };
}

export function cornersToRect(corners: BoundingBoxCorners): BoundingBoxRect {
  const xs = [
    corners.topLeft.x,
    corners.topRight.x,
    corners.bottomLeft.x,
    corners.bottomRight.x,
  ].map(clampUnit);
  const ys = [
    corners.topLeft.y,
    corners.topRight.y,
    corners.bottomLeft.y,
    corners.bottomRight.y,
  ].map(clampUnit);

  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    x: roundUnit(left),
    y: roundUnit(top),
    width: roundUnit(right - left),
    height: roundUnit(bottom - top),
  };
}

export function boxColorForIndex(index: number): string {
  return BOX_COLORS[index % BOX_COLORS.length] ?? BOX_COLORS[0];
}

export function formatEmployeeLabel(employee: BoundingBoxEmployeeOption): string {
  return employee.empId || employee.publicId || employee.id;
}

export function searchMatchesEmployee(
  employee: BoundingBoxEmployeeOption,
  query: string,
): boolean {
  const normalized = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return true;

  const haystack = [
    employee.name,
    employee.empId ?? "",
    employee.publicId,
    employee.unit ?? "",
    employee.section ?? "",
    employee.department ?? "",
    employee.line ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function createRectFromPoints(
  start: BoundingBoxPoint,
  end: BoundingBoxPoint,
): BoundingBoxRect {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);

  return {
    x: roundUnit(left),
    y: roundUnit(top),
    width: roundUnit(right - left),
    height: roundUnit(bottom - top),
  };
}

export function moveRect(
  rect: BoundingBoxRect,
  deltaX: number,
  deltaY: number,
): BoundingBoxRect {
  const width = clampUnit(rect.width);
  const height = clampUnit(rect.height);
  const x = clampUnit(Math.min(rect.x + deltaX, 1 - width));
  const y = clampUnit(Math.min(rect.y + deltaY, 1 - height));

  return {
    x: roundUnit(x),
    y: roundUnit(y),
    width: roundUnit(width),
    height: roundUnit(height),
  };
}

export function resizeRectWithHandle(
  rect: BoundingBoxRect,
  handle: BoundingBoxResizeHandle,
  point: BoundingBoxPoint,
): BoundingBoxRect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle === "top-left" || handle === "bottom-left") {
    left = clampUnit(Math.min(point.x, right - MIN_BOX_SIZE));
  }
  if (handle === "top-right" || handle === "bottom-right") {
    right = clampUnit(Math.max(point.x, left + MIN_BOX_SIZE));
  }
  if (handle === "top-left" || handle === "top-right") {
    top = clampUnit(Math.min(point.y, bottom - MIN_BOX_SIZE));
  }
  if (handle === "bottom-left" || handle === "bottom-right") {
    bottom = clampUnit(Math.max(point.y, top + MIN_BOX_SIZE));
  }

  return {
    x: roundUnit(left),
    y: roundUnit(top),
    width: roundUnit(right - left),
    height: roundUnit(bottom - top),
  };
}

export function editableBoxFromRecord(
  box: CameraBoundingBoxRecord,
): EditableBoundingBox {
  return {
    id: box.id,
    persistedId: box.id,
    name: box.name,
    rect: cornersToRect(box),
    employeeIds: sortDistinctIds(box.employeeIds),
  };
}

export function createEditableBox(
  index: number,
  rect?: BoundingBoxRect,
): EditableBoundingBox {
  const baseSize = 0.26;
  const offset = (index % 4) * 0.05;
  const nextRect = rect ?? {
    x: clampUnit(0.12 + offset),
    y: clampUnit(0.12 + offset),
    width: baseSize,
    height: baseSize,
  };

  return {
    id: createLocalId(),
    persistedId: null,
    name: `Box ${index + 1}`,
    rect: {
      x: roundUnit(nextRect.x),
      y: roundUnit(nextRect.y),
      width: roundUnit(nextRect.width),
      height: roundUnit(nextRect.height),
    },
    employeeIds: [],
  };
}

export function editableBoxToPayload(
  box: EditableBoundingBox,
): CameraBoundingBoxPayload {
  return {
    ...(box.persistedId ? { id: box.persistedId } : {}),
    name: box.name.trim() || "Unnamed Box",
    ...rectToCorners(box.rect),
    employeeIds: sortDistinctIds(box.employeeIds),
  };
}

export function serializeEditableBoxes(boxes: EditableBoundingBox[]): string {
  return JSON.stringify(
    boxes.map((box, index) => ({
      index,
      persistedId: box.persistedId,
      name: box.name.trim(),
      rect: {
        x: roundUnit(box.rect.x),
        y: roundUnit(box.rect.y),
        width: roundUnit(box.rect.width),
        height: roundUnit(box.rect.height),
      },
      employeeIds: sortDistinctIds(box.employeeIds),
    })),
  );
}
