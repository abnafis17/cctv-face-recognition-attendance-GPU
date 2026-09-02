import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { findCameraByAnyId } from "../utils/camera";
import { employeePublicId, findEmployeeByAnyId } from "../utils/employee";
import type {
  CameraBoundingBoxTrackingEventInput,
  CameraBoundingBoxTrackingListQueryInput,
} from "../modules/v1/cameras/dto";

type TrackingJoinedRow = {
  id: string;
  companyId: string;
  cameraId: string;
  cameraName: string;
  boundingBoxId: string;
  boundingBoxName: string;
  employeePkId: string;
  employeeEmpId: string | null;
  employeeName: string;
  outTime: Date;
  inTime: Date | null;
  durationSeconds: number | null;
  status: string;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type TrackingOpenRow = {
  id: string;
  outTime: Date;
};

type TrackingBoxOption = {
  id: string;
  name: string;
  sortOrder: number;
};

type TrackingCamera = {
  id: string;
  camId: string | null;
  name: string;
};

export class BoundingBoxTrackingValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BoundingBoxTrackingValidationError";
    this.statusCode = statusCode;
  }
}

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function isYYYYMMDD(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dhakaDayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00+06:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function parseOccurredAt(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return new Date();

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new BoundingBoxTrackingValidationError("occurredAt must be a valid datetime");
  }

  return parsed;
}

function sqlLikePattern(value: string) {
  return `%${String(value ?? "").trim()}%`;
}

function serializeTrackingRow(row: TrackingJoinedRow) {
  const employeeId = employeePublicId({
    id: row.employeePkId,
    empId: row.employeeEmpId,
  });

  return {
    id: row.id,
    companyId: row.companyId,
    cameraId: row.cameraId,
    cameraName: row.cameraName,
    boundingBoxId: row.boundingBoxId,
    boundingBoxName: row.boundingBoxName,
    employeePkId: row.employeePkId,
    employeeId,
    employeeName: row.employeeName,
    outTime: row.outTime.toISOString(),
    inTime: row.inTime ? row.inTime.toISOString() : null,
    durationSeconds: row.durationSeconds,
    status: row.status,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadTrackingById(companyId: string, id: string) {
  const rows = await prisma.$queryRaw<TrackingJoinedRow[]>(
    Prisma.sql`
      SELECT
        t."id",
        t."companyId",
        t."cameraId",
        c."name" AS "cameraName",
        t."boundingBoxId",
        b."name" AS "boundingBoxName",
        e."id" AS "employeePkId",
        e."emp_id" AS "employeeEmpId",
        e."name" AS "employeeName",
        t."outTime",
        t."inTime",
        t."durationSeconds",
        t."status",
        t."confidence",
        t."createdAt",
        t."updatedAt"
      FROM "CameraBoundingBoxTracking" t
      JOIN "Camera" c ON c."id" = t."cameraId"
      JOIN "CameraBoundingBox" b ON b."id" = t."boundingBoxId"
      JOIN "Employee" e ON e."id" = t."employeeId"
      WHERE t."companyId" = ${companyId}
        AND t."id" = ${id}
      LIMIT 1
    `,
  );

  return rows[0] ?? null;
}

async function loadCameraBoxes(cameraId: string): Promise<TrackingBoxOption[]> {
  return prisma.cameraBoundingBox.findMany({
    where: { cameraId },
    select: { id: true, name: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

function toTrackingCamera(camera: {
  id: string;
  camId?: string | null;
  name: string;
}): TrackingCamera {
  return {
    id: camera.id,
    camId: camera.camId ?? null,
    name: camera.name,
  };
}

export async function listCompanyCameraBoundingBoxTracking(
  companyId: string,
  anyId: string,
  query: CameraBoundingBoxTrackingListQueryInput,
) {
  const camera = await findCameraByAnyId(anyId, companyId);
  if (!camera) return null;

  const fromDateStr = String(
    query.fromDate || query.date || query.toDate || dhakaTodayYYYYMMDD(),
  ).trim();
  const toDateStr = String(
    query.toDate || query.date || query.fromDate || dhakaTodayYYYYMMDD(),
  ).trim();

  if (!isYYYYMMDD(fromDateStr) || !isYYYYMMDD(toDateStr)) {
    throw new BoundingBoxTrackingValidationError(
      "Invalid date. Expected YYYY-MM-DD",
    );
  }

  if (fromDateStr > toDateStr) {
    throw new BoundingBoxTrackingValidationError(
      "fromDate must be earlier than or equal to toDate",
    );
  }

  const { start } = dhakaDayRange(fromDateStr);
  const { end } = dhakaDayRange(toDateStr);
  const whereClauses: Prisma.Sql[] = [
    Prisma.sql`t."companyId" = ${companyId}`,
    Prisma.sql`t."cameraId" = ${camera.id}`,
    Prisma.sql`t."outTime" >= ${start}`,
    Prisma.sql`t."outTime" < ${end}`,
  ];

  const boundingBoxId = String(query.boundingBoxId ?? "").trim();
  if (boundingBoxId) {
    whereClauses.push(Prisma.sql`t."boundingBoxId" = ${boundingBoxId}`);
  }

  if (query.status) {
    whereClauses.push(Prisma.sql`t."status" = ${query.status}`);
  }

  const q = String(query.q ?? "").trim();
  if (q) {
    const like = sqlLikePattern(q);
    whereClauses.push(
      Prisma.sql`(
        e."name" ILIKE ${like}
        OR COALESCE(e."emp_id", '') ILIKE ${like}
        OR e."id" ILIKE ${like}
      )`,
    );
  }

  const [boxes, records] = await Promise.all([
    loadCameraBoxes(camera.id),
    prisma.$queryRaw<TrackingJoinedRow[]>(
      Prisma.sql`
        SELECT
          t."id",
          t."companyId",
          t."cameraId",
          c."name" AS "cameraName",
          t."boundingBoxId",
          b."name" AS "boundingBoxName",
          e."id" AS "employeePkId",
          e."emp_id" AS "employeeEmpId",
          e."name" AS "employeeName",
          t."outTime",
          t."inTime",
          t."durationSeconds",
          t."status",
          t."confidence",
          t."createdAt",
          t."updatedAt"
        FROM "CameraBoundingBoxTracking" t
        JOIN "Camera" c ON c."id" = t."cameraId"
        JOIN "CameraBoundingBox" b ON b."id" = t."boundingBoxId"
        JOIN "Employee" e ON e."id" = t."employeeId"
        WHERE ${Prisma.join(whereClauses, " AND ")}
        ORDER BY t."outTime" DESC, t."createdAt" DESC
        LIMIT ${query.limit}
      `,
    ),
  ]);

  return {
    camera: toTrackingCamera(camera),
    boxes,
    records: records.map(serializeTrackingRow),
  };
}

export async function recordCompanyCameraBoundingBoxTrackingEvent(
  companyId: string,
  anyId: string,
  payload: CameraBoundingBoxTrackingEventInput,
) {
  const camera = await findCameraByAnyId(anyId, companyId);
  if (!camera) return null;

  const employee = await findEmployeeByAnyId(payload.employeeId, companyId);
  if (!employee) {
    throw new BoundingBoxTrackingValidationError(
      "Employee not found for this company",
      404,
    );
  }

  const box = await prisma.cameraBoundingBox.findFirst({
    where: {
      id: payload.boundingBoxId,
      cameraId: camera.id,
    },
    select: { id: true },
  });
  if (!box) {
    throw new BoundingBoxTrackingValidationError(
      "Bounding box not found for this camera",
      404,
    );
  }

  const assignment = await prisma.cameraBoundingBoxEmployee.findFirst({
    where: {
      boundingBoxId: box.id,
      employeeId: employee.id,
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new BoundingBoxTrackingValidationError(
      "Employee is not assigned to this bounding box",
    );
  }

  const occurredAt = parseOccurredAt(payload.occurredAt);
  const openRows = await prisma.$queryRaw<TrackingOpenRow[]>(
    Prisma.sql`
      SELECT "id", "outTime"
      FROM "CameraBoundingBoxTracking"
      WHERE "companyId" = ${companyId}
        AND "cameraId" = ${camera.id}
        AND "boundingBoxId" = ${box.id}
        AND "employeeId" = ${employee.id}
        AND "status" = ${"out"}
        AND "inTime" IS NULL
      ORDER BY "outTime" DESC
      LIMIT 1
    `,
  );
  const openRow = openRows[0] ?? null;

  if (payload.eventType === "out") {
    if (openRow) {
      const existing = await loadTrackingById(companyId, openRow.id);
      return {
        ok: true,
        updated: false,
        reason: "already_out",
        record: existing ? serializeTrackingRow(existing) : null,
      };
    }

    const id = randomUUID();
    const now = new Date();
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "CameraBoundingBoxTracking" (
          "id",
          "companyId",
          "cameraId",
          "boundingBoxId",
          "employeeId",
          "outTime",
          "inTime",
          "durationSeconds",
          "status",
          "confidence",
          "createdAt",
          "updatedAt"
        ) VALUES (
          ${id},
          ${companyId},
          ${camera.id},
          ${box.id},
          ${employee.id},
          ${occurredAt},
          ${null},
          ${null},
          ${"out"},
          ${payload.confidence ?? null},
          ${now},
          ${now}
        )
      `,
    );

    const created = await loadTrackingById(companyId, id);
    return {
      ok: true,
      updated: true,
      eventType: "out",
      record: created ? serializeTrackingRow(created) : null,
    };
  }

  if (!openRow) {
    return {
      ok: true,
      updated: false,
      reason: "no_open_tracking_record",
      record: null,
    };
  }

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "CameraBoundingBoxTracking"
      SET
        "inTime" = ${occurredAt},
        "status" = ${"in"},
        "confidence" = COALESCE(${payload.confidence ?? null}, "confidence"),
        "updatedAt" = ${new Date()}
      WHERE "id" = ${openRow.id}
        AND "companyId" = ${companyId}
    `,
  );
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "CameraBoundingBoxTracking"
      SET
        "durationSeconds" = GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM ("inTime" - "outTime")))::integer
        ),
        "updatedAt" = ${new Date()}
      WHERE "id" = ${openRow.id}
        AND "companyId" = ${companyId}
        AND "inTime" IS NOT NULL
    `,
  );

  const updated = await loadTrackingById(companyId, openRow.id);
  return {
    ok: true,
    updated: true,
    eventType: "in",
    record: updated ? serializeTrackingRow(updated) : null,
  };
}
