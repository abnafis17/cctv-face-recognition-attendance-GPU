import { Prisma } from "@prisma/client";
import { prisma } from "../../../prisma";
import { findCameraByAnyId } from "../../../utils/camera";
import { employeePublicId } from "../../../utils/employee";
import type {
  CameraCreateInput as CameraCreatePayload,
  CameraBoundingBoxesUpdateInput,
  CameraUpdateInput as CameraUpdatePayload,
} from "./dto";

type ListCompanyCamerasOptions = {
  includeVirtual?: boolean;
  task?: string | null;
};
const cameraHasAttendanceField = true;
const cameraHasTaskField = true;

export class CameraAuthorizedEmployeesValidationError extends Error {
  invalidEmployeeIds: string[];

  constructor(invalidEmployeeIds: string[]) {
    super("Some employees are invalid or not enrolled");
    this.name = "CameraAuthorizedEmployeesValidationError";
    this.invalidEmployeeIds = invalidEmployeeIds;
  }
}

export class CameraBoundingBoxesValidationError extends Error {
  invalidEmployeeIds: string[];
  invalidBoxIds: string[];
  invalidBoxes: string[];

  constructor(params?: {
    invalidEmployeeIds?: string[];
    invalidBoxIds?: string[];
    invalidBoxes?: string[];
  }) {
    const invalidEmployeeIds = params?.invalidEmployeeIds ?? [];
    const invalidBoxIds = params?.invalidBoxIds ?? [];
    const invalidBoxes = params?.invalidBoxes ?? [];

    super("Bounding box payload is invalid");
    this.name = "CameraBoundingBoxesValidationError";
    this.invalidEmployeeIds = invalidEmployeeIds;
    this.invalidBoxIds = invalidBoxIds;
    this.invalidBoxes = invalidBoxes;
  }
}

type CameraAuthorizedStateCamera = {
  id: string;
  camId: string | null;
  name: string;
};

type CameraCompanyEmployee = {
  id: string;
  empId: string | null;
  publicId: string;
  name: string;
  unit: string | null;
  section: string | null;
  department: string | null;
  line: string | null;
};

type CameraAuthorizedStateEmployee = CameraCompanyEmployee & {
  selected: boolean;
};

type CameraBoundingBoxStateCamera = CameraAuthorizedStateCamera & {
  isActive: boolean;
};

type CameraBoundingBoxStatePoint = {
  x: number;
  y: number;
};

type CameraBoundingBoxStateBox = {
  id: string;
  name: string;
  sortOrder: number;
  topLeft: CameraBoundingBoxStatePoint;
  topRight: CameraBoundingBoxStatePoint;
  bottomLeft: CameraBoundingBoxStatePoint;
  bottomRight: CameraBoundingBoxStatePoint;
  employeeIds: string[];
  employeePublicIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type CameraAuthorizedEmployeesState = {
  camera: CameraAuthorizedStateCamera;
  employees: CameraAuthorizedStateEmployee[];
  authorizedEmployeeIds: string[];
  authorizedEmployeePublicIds: string[];
};

export type CameraBoundingBoxesState = {
  camera: CameraBoundingBoxStateCamera;
  employees: CameraCompanyEmployee[];
  boxes: CameraBoundingBoxStateBox[];
};

function normalizeCameraTask(value: unknown): string | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (normalized === "gatepass") return "gate_pass";
  if (normalized === "gate pass") return "gate_pass";
  return normalized;
}

function cameraListWhere(
  companyId: string,
  options?: ListCompanyCamerasOptions,
): Prisma.CameraWhereInput {
  const includeVirtual = Boolean(options?.includeVirtual);
  const task = normalizeCameraTask(options?.task);

  const where: Prisma.CameraWhereInput = {
    companyId,
    ...(includeVirtual
      ? {}
      : {
          NOT: {
            OR: [
              { camId: { startsWith: "laptop-" } },
              { id: { startsWith: "laptop-" } },
            ],
          },
        }),
  };

  if (cameraHasTaskField && task) {
    (where as any).task = task;
  }

  return where;
}

export async function listCompanyCameras(
  companyId: string,
  options?: ListCompanyCamerasOptions,
) {
  return prisma.camera.findMany({
    where: cameraListWhere(companyId, options),
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { createdAt: "desc" }],
  });
}

export async function createCompanyCamera(
  companyId: string,
  payload: CameraCreatePayload,
) {
  const task = normalizeCameraTask(payload.task) ?? "attendance";
  const data: Prisma.CameraUncheckedCreateInput = {
    name: payload.name,
    rtspUrl: payload.rtspUrl,
    companyId,
    isActive: false,
    attendance: task === "attendance",
    ...(payload.camId ? { camId: payload.camId } : {}),
    ...(payload.relayAgentId !== undefined
      ? { relayAgentId: payload.relayAgentId }
      : {}),
    ...(payload.rtspUrlEnc !== undefined
      ? { rtspUrlEnc: payload.rtspUrlEnc }
      : {}),
    ...(payload.sendFps !== undefined ? { sendFps: payload.sendFps } : {}),
    ...(payload.sendWidth !== undefined
      ? { sendWidth: payload.sendWidth }
      : {}),
    ...(payload.sendHeight !== undefined
      ? { sendHeight: payload.sendHeight }
      : {}),
    ...(payload.jpegQuality !== undefined
      ? { jpegQuality: payload.jpegQuality }
      : {}),
  };

  if (cameraHasTaskField) {
    (data as any).task = task;
  }

  return prisma.camera.create({
    data: data as any,
  });
}

export async function updateCompanyCamera(
  companyId: string,
  anyId: string,
  payload: CameraUpdatePayload,
) {
  const existing = await findCameraByAnyId(anyId, companyId);
  if (!existing) return null;

  const data: Prisma.CameraUncheckedUpdateInput = {};

  if (payload.camId !== undefined) data.camId = payload.camId;
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.rtspUrl !== undefined) data.rtspUrl = payload.rtspUrl;
  if (payload.relayAgentId !== undefined)
    data.relayAgentId = payload.relayAgentId;
  if (payload.rtspUrlEnc !== undefined) data.rtspUrlEnc = payload.rtspUrlEnc;
  if (payload.sendFps !== undefined) data.sendFps = payload.sendFps;
  if (payload.sendWidth !== undefined) data.sendWidth = payload.sendWidth;
  if (payload.sendHeight !== undefined) data.sendHeight = payload.sendHeight;
  if (payload.jpegQuality !== undefined) data.jpegQuality = payload.jpegQuality;
  if (payload.isActive !== undefined) data.isActive = payload.isActive;
  if (cameraHasTaskField && payload.task !== undefined) {
    const task = normalizeCameraTask(payload.task);
    if (task) {
      (data as any).task = task;
      if (cameraHasAttendanceField && task !== "attendance") {
        data.attendance = false;
      }
    }
  }

  return prisma.camera.update({
    where: { id: existing.id },
    data: data as any,
  });
}

export async function deleteCompanyCamera(companyId: string, anyId: string) {
  const existing = await findCameraByAnyId(anyId, companyId);
  if (!existing) return null;

  await prisma.camera.delete({ where: { id: existing.id } });
  return existing;
}

function normalizeDistinctEmployeeIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function normalizeUnitCoordinate(value: number): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Number(Math.max(0, Math.min(1, next)).toFixed(6));
}

function toCameraEmployee(row: {
  id: string;
  empId: string | null;
  name: string;
  unit: string | null;
  section: string | null;
  department: string | null;
  line: string | null;
}): CameraCompanyEmployee {
  return {
    id: row.id,
    empId: row.empId ?? null,
    publicId: employeePublicId(row),
    name: row.name,
    unit: row.unit ?? null,
    section: row.section ?? null,
    department: row.department ?? null,
    line: row.line ?? null,
  };
}

function toBoundingBoxPoint(x: number, y: number): CameraBoundingBoxStatePoint {
  return {
    x: normalizeUnitCoordinate(x),
    y: normalizeUnitCoordinate(y),
  };
}

function normalizeBoundingBoxGeometry(
  input: CameraBoundingBoxesUpdateInput["boxes"][number]
) {
  const xs = [
    input.topLeft.x,
    input.topRight.x,
    input.bottomLeft.x,
    input.bottomRight.x,
  ].map(normalizeUnitCoordinate);
  const ys = [
    input.topLeft.y,
    input.topRight.y,
    input.bottomLeft.y,
    input.bottomRight.y,
  ].map(normalizeUnitCoordinate);

  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  const width = right - left;
  const height = bottom - top;
  if (width < 0.01 || height < 0.01) return null;

  return {
    topLeftX: left,
    topLeftY: top,
    topRightX: right,
    topRightY: top,
    bottomLeftX: left,
    bottomLeftY: bottom,
    bottomRightX: right,
    bottomRightY: bottom,
  };
}

function toCameraStateCamera(input: { id: string; camId: string | null; name: string }) {
  return {
    id: input.id,
    camId: input.camId,
    name: input.name,
  };
}

function toBoundingBoxStateCamera(input: {
  id: string;
  camId: string | null;
  name: string;
  isActive: boolean;
}): CameraBoundingBoxStateCamera {
  return {
    id: input.id,
    camId: input.camId,
    name: input.name,
    isActive: input.isActive,
  };
}

async function loadCameraAuthorizedEmployeesState(params: {
  companyId: string;
  camera: {
    id: string;
    camId: string | null;
    name: string;
  };
}) {
  const { companyId, camera } = params;

  const [enrolledEmployees, assignedRows] = await Promise.all([
    prisma.employee.findMany({
      where: {
        companyId,
        templates: { some: {} },
      },
      select: {
        id: true,
        empId: true,
        name: true,
        unit: true,
        section: true,
        department: true,
        line: true,
      },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    }),
    prisma.cameraAuthorizedEmployee.findMany({
      where: { cameraId: camera.id },
      include: {
        employee: {
          select: {
            id: true,
            empId: true,
            name: true,
          },
        },
      },
      orderBy: [{ employee: { name: "asc" } }],
    }),
  ]);

  const authorizedEmployeeIds = normalizeDistinctEmployeeIds(
    assignedRows.map((row) => row.employeeId)
  );
  const authorizedSet = new Set(authorizedEmployeeIds);
  const authorizedEmployeePublicIds = normalizeDistinctEmployeeIds(
    assignedRows.map((row) => employeePublicId(row.employee))
  );

  const employees: CameraAuthorizedStateEmployee[] = enrolledEmployees.map((row) => ({
    ...toCameraEmployee(row),
    selected: authorizedSet.has(row.id),
  }));

  const state: CameraAuthorizedEmployeesState = {
    camera: toCameraStateCamera(camera),
    employees,
    authorizedEmployeeIds,
    authorizedEmployeePublicIds,
  };
  return state;
}

export async function listCompanyCameraAuthorizedEmployees(
  companyId: string,
  anyId: string
) {
  const camera = await findCameraByAnyId(anyId, companyId);
  if (!camera) return null;

  return loadCameraAuthorizedEmployeesState({
    companyId,
    camera: {
      id: camera.id,
      camId: camera.camId ?? null,
      name: camera.name,
    },
  });
}

export async function updateCompanyCameraAuthorizedEmployees(
  companyId: string,
  anyId: string,
  employeeIds: string[]
) {
  const camera = await findCameraByAnyId(anyId, companyId);
  if (!camera) return null;

  const normalizedIds = normalizeDistinctEmployeeIds(employeeIds);

  if (normalizedIds.length > 0) {
    const validEmployees = await prisma.employee.findMany({
      where: {
        companyId,
        id: { in: normalizedIds },
        templates: { some: {} },
      },
      select: { id: true },
    });

    const validSet = new Set(validEmployees.map((row) => row.id));
    const invalidEmployeeIds = normalizedIds.filter((id) => !validSet.has(id));
    if (invalidEmployeeIds.length > 0) {
      throw new CameraAuthorizedEmployeesValidationError(invalidEmployeeIds);
    }
  }

  await prisma.$transaction(async (tx) => {
    if (normalizedIds.length === 0) {
      await tx.cameraAuthorizedEmployee.deleteMany({
        where: { cameraId: camera.id },
      });
      return;
    }

    await tx.cameraAuthorizedEmployee.deleteMany({
      where: {
        cameraId: camera.id,
        employeeId: { notIn: normalizedIds },
      },
    });

    await tx.cameraAuthorizedEmployee.createMany({
      data: normalizedIds.map((employeeId) => ({
        cameraId: camera.id,
        employeeId,
      })),
      skipDuplicates: true,
    });
  });

  return loadCameraAuthorizedEmployeesState({
    companyId,
    camera: {
      id: camera.id,
      camId: camera.camId ?? null,
      name: camera.name,
    },
  });
}

async function loadCameraBoundingBoxesState(params: {
  companyId: string;
  camera: {
    id: string;
    camId: string | null;
    name: string;
    isActive: boolean;
  };
}) {
  const { companyId, camera } = params;

  const [enrolledEmployees, boxes] = await Promise.all([
    prisma.employee.findMany({
      where: {
        companyId,
        templates: { some: {} },
      },
      select: {
        id: true,
        empId: true,
        name: true,
        unit: true,
        section: true,
        department: true,
        line: true,
      },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    }),
    prisma.cameraBoundingBox.findMany({
      where: { cameraId: camera.id },
      include: {
        employees: {
          include: {
            employee: {
              select: {
                id: true,
                empId: true,
              },
            },
          },
          orderBy: [{ employeeId: "asc" }],
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const employees = enrolledEmployees.map(toCameraEmployee);
  const stateBoxes: CameraBoundingBoxStateBox[] = boxes.map((box) => {
    const employeeIds = normalizeDistinctEmployeeIds(
      box.employees.map((row) => row.employeeId)
    );
    const employeePublicIds = normalizeDistinctEmployeeIds(
      box.employees.map((row) => employeePublicId(row.employee))
    );

    return {
      id: box.id,
      name: box.name,
      sortOrder: box.sortOrder,
      topLeft: toBoundingBoxPoint(box.topLeftX, box.topLeftY),
      topRight: toBoundingBoxPoint(box.topRightX, box.topRightY),
      bottomLeft: toBoundingBoxPoint(box.bottomLeftX, box.bottomLeftY),
      bottomRight: toBoundingBoxPoint(box.bottomRightX, box.bottomRightY),
      employeeIds,
      employeePublicIds,
      createdAt: box.createdAt,
      updatedAt: box.updatedAt,
    };
  });

  return {
    camera: toBoundingBoxStateCamera(camera),
    employees,
    boxes: stateBoxes,
  };
}

export async function listCompanyCameraBoundingBoxes(
  companyId: string,
  anyId: string
) {
  const camera = await findCameraByAnyId(anyId, companyId);
  if (!camera) return null;

  return loadCameraBoundingBoxesState({
    companyId,
    camera: {
      id: camera.id,
      camId: camera.camId ?? null,
      name: camera.name,
      isActive: Boolean(camera.isActive),
    },
  });
}

export async function replaceCompanyCameraBoundingBoxes(
  companyId: string,
  anyId: string,
  boxes: CameraBoundingBoxesUpdateInput["boxes"]
) {
  const camera = await findCameraByAnyId(anyId, companyId);
  if (!camera) return null;

  const normalizedBoxes = boxes.map((box, index) => ({
    id: String(box.id ?? "").trim() || null,
    name: box.name.trim(),
    geometry: normalizeBoundingBoxGeometry(box),
    employeeIds: normalizeDistinctEmployeeIds(box.employeeIds),
    sortOrder: index,
  }));

  const invalidBoxes = normalizedBoxes
    .filter((box) => !box.geometry)
    .map((box) => box.name || `Box ${box.sortOrder + 1}`);
  if (invalidBoxes.length > 0) {
    throw new CameraBoundingBoxesValidationError({ invalidBoxes });
  }

  const persistedIds = normalizeDistinctEmployeeIds(
    normalizedBoxes
      .map((box) => box.id)
      .filter((value): value is string => Boolean(value))
  );
  const duplicatePersistedIds = normalizedBoxes
    .map((box) => box.id)
    .filter((value): value is string => Boolean(value))
    .filter((id, index, values) => values.indexOf(id) !== index);
  if (duplicatePersistedIds.length > 0) {
    throw new CameraBoundingBoxesValidationError({
      invalidBoxIds: normalizeDistinctEmployeeIds(duplicatePersistedIds),
    });
  }

  if (persistedIds.length > 0) {
    const existingIds = new Set(
      (
        await prisma.cameraBoundingBox.findMany({
          where: {
            cameraId: camera.id,
            id: { in: persistedIds },
          },
          select: { id: true },
        })
      ).map((row) => row.id)
    );

    const invalidBoxIds = persistedIds.filter((id) => !existingIds.has(id));
    if (invalidBoxIds.length > 0) {
      throw new CameraBoundingBoxesValidationError({ invalidBoxIds });
    }
  }

  const requestedEmployeeIds = normalizeDistinctEmployeeIds(
    normalizedBoxes.flatMap((box) => box.employeeIds)
  );
  if (requestedEmployeeIds.length > 0) {
    const validEmployees = await prisma.employee.findMany({
      where: {
        companyId,
        id: { in: requestedEmployeeIds },
        templates: { some: {} },
      },
      select: { id: true },
    });

    const validSet = new Set(validEmployees.map((row) => row.id));
    const invalidEmployeeIds = requestedEmployeeIds.filter(
      (id) => !validSet.has(id)
    );
    if (invalidEmployeeIds.length > 0) {
      throw new CameraBoundingBoxesValidationError({ invalidEmployeeIds });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.cameraBoundingBox.deleteMany({
      where:
        persistedIds.length > 0
          ? {
              cameraId: camera.id,
              id: { notIn: persistedIds },
            }
          : { cameraId: camera.id },
    });

    for (const box of normalizedBoxes) {
      const geometry = box.geometry;
      if (!geometry) continue;

      let boundingBoxId = box.id;
      if (boundingBoxId) {
        await tx.cameraBoundingBox.update({
          where: { id: boundingBoxId },
          data: {
            name: box.name,
            sortOrder: box.sortOrder,
            ...geometry,
          },
        });
      } else {
        const created = await tx.cameraBoundingBox.create({
          data: {
            cameraId: camera.id,
            name: box.name,
            sortOrder: box.sortOrder,
            ...geometry,
          },
        });
        boundingBoxId = created.id;
      }

      await tx.cameraBoundingBoxEmployee.deleteMany({
        where: { boundingBoxId },
      });

      if (box.employeeIds.length > 0) {
        await tx.cameraBoundingBoxEmployee.createMany({
          data: box.employeeIds.map((employeeId) => ({
            boundingBoxId,
            employeeId,
          })),
          skipDuplicates: true,
        });
      }
    }
  });

  return loadCameraBoundingBoxesState({
    companyId,
    camera: {
      id: camera.id,
      camId: camera.camId ?? null,
      name: camera.name,
      isActive: Boolean(camera.isActive),
    },
  });
}

export async function listCameraAuthorizedEmployeePublicIds(cameraId: string) {
  const cameraKey = String(cameraId ?? "").trim();
  if (!cameraKey) return [];

  const rows = await prisma.cameraAuthorizedEmployee.findMany({
    where: { cameraId: cameraKey },
    include: {
      employee: {
        select: {
          id: true,
          empId: true,
        },
      },
    },
    orderBy: [{ employeeId: "asc" }],
  });

  return normalizeDistinctEmployeeIds(rows.map((row) => employeePublicId(row.employee)));
}
