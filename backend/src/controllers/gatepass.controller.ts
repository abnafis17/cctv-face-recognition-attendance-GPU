import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../prisma";
import { listCompanyGatepassTypes } from "../services/gatepassTypes.service";
import { submitGatepassToErp } from "../services/gatepassSubmit.service";
import { updateGatepassReturnToErp } from "../services/gatepassUpdate.service";
import {
  GatepassCreateInput,
  GatepassListQueryInput,
  GatepassReturnInput,
  gatepassCreateSchema,
  gatepassListQuerySchema,
  gatepassReturnSchema,
} from "../validators/gatepass.validators";
import { findEmployeeByAnyId } from "../utils/employee";
import { findCameraByAnyId } from "../utils/camera";

type GatepassJoinedRow = {
  id: string;
  companyId: string;
  employeeId: string;
  leaveTypeId: string | null;
  leaveType: string;
  purpose: string;
  destination: string | null;
  outTime: Date;
  inTime: Date | null;
  status: string;
  requestCameraId: string | null;
  returnCameraId: string | null;
  externalSubmitAckAt: Date | null;
  externalReturnAckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employeePkId: string;
  employeeEmpId: string | null;
  employeeName: string;
  employeeDepartment: string | null;
  employeeUnit: string | null;
  employeeLine: string | null;
  employeeSection: string | null;
  requestCameraName: string | null;
  returnCameraName: string | null;
};

function getCompanyId(req: Request): string {
  return String((req as any).companyId ?? "").trim();
}

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function dhakaDayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00+06:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function parseInputDate(value: string | undefined, field: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} must be a valid datetime`);
  }
  return parsed;
}

function respondValidationError(res: Response, error: ZodError) {
  const first = error.issues?.[0];
  const message =
    first?.message ||
    (first?.path?.length ? `${first.path.join(".")} is invalid` : "Invalid input");

  return res.status(400).json({
    error: message,
    issues: error.issues,
  });
}

function sqlLikePattern(value: string) {
  return `%${String(value ?? "").trim()}%`;
}

const GATEPASS_SELECT = Prisma.sql`
SELECT
  gp."id",
  gp."companyId",
  gp."employeeId",
  gp."leaveTypeId",
  gp."leaveType",
  gp."purpose",
  gp."destination",
  gp."outTime",
  gp."inTime",
  gp."status",
  gp."requestCameraId",
  gp."returnCameraId",
  gp."externalSubmitAckAt",
  gp."externalReturnAckAt",
  gp."createdAt",
  gp."updatedAt",
  e."id" AS "employeePkId",
  e."emp_id" AS "employeeEmpId",
  e."name" AS "employeeName",
  e."department" AS "employeeDepartment",
  e."unit" AS "employeeUnit",
  e."line" AS "employeeLine",
  e."section" AS "employeeSection",
  reqCam."name" AS "requestCameraName",
  retCam."name" AS "returnCameraName"
FROM "GatepassTable" gp
JOIN "Employee" e ON e."id" = gp."employeeId"
LEFT JOIN "Camera" reqCam ON reqCam."id" = gp."requestCameraId"
LEFT JOIN "Camera" retCam ON retCam."id" = gp."returnCameraId"
`;

function serializeLeaveTypeLabel(
  leaveType: string,
  leaveTypeId: string | null,
): string {
  const normalizedValue = String(leaveType ?? "").trim();
  if (!normalizedValue) return "Unknown Leave Type";

  if (!leaveTypeId) {
    const legacy = normalizedValue.toLowerCase().replace(/\s+/g, "_");
    if (legacy === "short" || legacy === "short_leave") {
      return "Short Leave";
    }
    if (legacy === "long" || legacy === "long_leave") {
      return "Long Leave";
    }
  }

  return normalizedValue;
}

function serializeGatepass(row: GatepassJoinedRow) {
  const employeeCode = String(row.employeeEmpId ?? "").trim() || row.employeePkId;
  const designation =
    String((row as any)?.employeeDesignation ?? "").trim() ||
    String(row.employeeLine ?? "").trim() ||
    String(row.employeeSection ?? "").trim() ||
    null;

  return {
    id: row.id,
    companyId: row.companyId,
    employeePkId: row.employeePkId,
    employeeId: employeeCode,
    employeeName: row.employeeName,
    department: row.employeeDepartment,
    designation,
    unit: row.employeeUnit,
    leaveTypeId: row.leaveTypeId,
    leaveType: serializeLeaveTypeLabel(row.leaveType, row.leaveTypeId),
    purpose: row.purpose,
    destination: row.destination,
    status: row.status === "returned" ? "returned" : "out",
    outTime: row.outTime.toISOString(),
    inTime: row.inTime ? row.inTime.toISOString() : null,
    requestedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    requestCameraId: row.requestCameraId,
    requestCameraName: row.requestCameraName,
    returnCameraId: row.returnCameraId,
    returnCameraName: row.returnCameraName,
    externalSubmitAckAt: row.externalSubmitAckAt
      ? row.externalSubmitAckAt.toISOString()
      : null,
    externalReturnAckAt: row.externalReturnAckAt
      ? row.externalReturnAckAt.toISOString()
      : null,
  };
}

async function loadGatepassById(companyId: string, gatepassId: string) {
  const rows = await prisma.$queryRaw<GatepassJoinedRow[]>(
    Prisma.sql`${GATEPASS_SELECT}
      WHERE gp."companyId" = ${companyId}
        AND gp."id" = ${gatepassId}
      LIMIT 1`,
  );
  return rows[0] ?? null;
}

function normalizeCreateInput(req: Request): GatepassCreateInput {
  return gatepassCreateSchema.parse({
    employeeId: req.body?.employeeId,
    leaveTypeId: req.body?.leaveTypeId,
    leaveType: req.body?.leaveType,
    purpose: req.body?.purpose,
    destination: req.body?.destination,
    cameraId: req.body?.cameraId,
    recognizedAt: req.body?.recognizedAt,
  });
}

function normalizeReturnInput(req: Request): GatepassReturnInput {
  return gatepassReturnSchema.parse({
    employeeId: req.body?.employeeId,
    cameraId: req.body?.cameraId,
    recognizedAt: req.body?.recognizedAt,
  });
}

function normalizeListQuery(req: Request): GatepassListQueryInput {
  return gatepassListQuerySchema.parse({
    date: req.query?.date,
    fromDate: req.query?.fromDate ?? req.query?.from,
    toDate: req.query?.toDate ?? req.query?.to,
    leaveType: req.query?.leaveType,
    leaveTypeId: req.query?.leaveTypeId ?? req.query?.leave_type_id,
    status: req.query?.status,
    q: req.query?.q,
    limit: req.query?.limit,
  });
}

export async function listGatepassTypes(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const types = await listCompanyGatepassTypes(companyId);
    return res.json(types);
  } catch (error: unknown) {
    return res.status(500).json({
      error: "Failed to load gatepass leave types",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listGatepassRecords(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const query = normalizeListQuery(req);
    const fromDateStr =
      query.fromDate || query.date || query.toDate || dhakaTodayYYYYMMDD();
    const toDateStr =
      query.toDate || query.date || query.fromDate || dhakaTodayYYYYMMDD();

    if (fromDateStr > toDateStr) {
      return res.status(400).json({
        error: "fromDate must be earlier than or equal to toDate",
      });
    }

    const { start } = dhakaDayRange(fromDateStr);
    const { end } = dhakaDayRange(toDateStr);
    const limit = query.limit || 300;

    const whereClauses: Prisma.Sql[] = [
      Prisma.sql`gp."companyId" = ${companyId}`,
      Prisma.sql`gp."outTime" >= ${start}`,
      Prisma.sql`gp."outTime" < ${end}`,
    ];

    if (query.leaveTypeId) {
      whereClauses.push(Prisma.sql`gp."leaveTypeId" = ${query.leaveTypeId}`);
    } else if (query.leaveType) {
      whereClauses.push(Prisma.sql`gp."leaveType" = ${query.leaveType}`);
    }
    if (query.status) {
      whereClauses.push(Prisma.sql`gp."status" = ${query.status}`);
    }
    if (query.q) {
      const like = sqlLikePattern(query.q);
      whereClauses.push(
        Prisma.sql`(
          e."name" ILIKE ${like}
          OR COALESCE(e."emp_id", '') ILIKE ${like}
          OR e."id" ILIKE ${like}
        )`,
      );
    }

    const rows = await prisma.$queryRaw<GatepassJoinedRow[]>(
      Prisma.sql`${GATEPASS_SELECT}
        WHERE ${Prisma.join(whereClauses, " AND ")}
        ORDER BY gp."outTime" ASC, gp."createdAt" ASC
        LIMIT ${limit}`,
    );

    return res.json(rows.map(serializeGatepass));
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to load gatepass records",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createGatepassRecord(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const payload = normalizeCreateInput(req);
    const trimmedPurpose = payload.purpose.trim();
    const normalizedDestination = payload.destination ?? null;
    const recognizedAt =
      parseInputDate(payload.recognizedAt ?? undefined, "recognizedAt") ?? new Date();

    const employee = await findEmployeeByAnyId(payload.employeeId, companyId);
    if (!employee) {
      return res.status(404).json({ error: "Employee not found for this company" });
    }

    const camera = payload.cameraId
      ? await findCameraByAnyId(payload.cameraId, companyId)
      : null;
    if (payload.cameraId && !camera) {
      return res.status(404).json({ error: "Camera not found for this company" });
    }

    const gatepassId = randomUUID();
    const createdAt = new Date();

    await prisma.$executeRaw(
      Prisma.sql`
      INSERT INTO "GatepassTable" (
        "id",
        "companyId",
        "employeeId",
        "leaveTypeId",
        "leaveType",
        "purpose",
        "destination",
        "outTime",
        "inTime",
        "status",
        "requestCameraId",
        "returnCameraId",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${gatepassId},
        ${companyId},
        ${employee.id},
        ${payload.leaveTypeId},
        ${payload.leaveType},
        ${trimmedPurpose},
        ${normalizedDestination},
        ${recognizedAt},
        ${null},
        ${"out"},
        ${camera?.id ?? null},
        ${null},
        ${createdAt},
        ${createdAt}
      )`,
    );

    const erpSubmit = await submitGatepassToErp(companyId, {
      empId: employee.empId,
      passTitle: payload.leaveType,
      passTitleId: payload.leaveTypeId,
      destination: normalizedDestination,
      outTime: recognizedAt,
      remarks: trimmedPurpose,
    });

    try {
      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE "GatepassTable"
          SET
            "externalSubmitAckAt" = ${erpSubmit.ackAt},
            "externalSubmitPayload" = CAST(${JSON.stringify(erpSubmit.payload)} AS jsonb),
            "updatedAt" = ${new Date()}
          WHERE "id" = ${gatepassId}
            AND "companyId" = ${companyId}
        `,
      );
    } catch {
      // Local gatepass creation already succeeded. Keep the request successful.
    }

    const row = await loadGatepassById(companyId, gatepassId);
    if (!row) return res.status(404).json({ error: "Gatepass record not found" });

    return res.status(201).json({
      ok: true,
      gatepass: serializeGatepass(row),
      externalApiCalled: erpSubmit.attempted,
      externalApiAcknowledged: erpSubmit.acknowledged,
      externalApiError: erpSubmit.errorMessage,
      externalApi: erpSubmit.payload,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof Error && error.message.includes("recognizedAt")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({
      error: "Failed to create gatepass request",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function markGatepassReturn(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const payload = normalizeReturnInput(req);
    const recognizedAt =
      parseInputDate(payload.recognizedAt ?? undefined, "recognizedAt") ?? new Date();

    const employee = await findEmployeeByAnyId(payload.employeeId, companyId);
    if (!employee) {
      return res.status(404).json({ error: "Employee not found for this company" });
    }

    const camera = payload.cameraId
      ? await findCameraByAnyId(payload.cameraId, companyId)
      : null;
    if (payload.cameraId && !camera) {
      return res.status(404).json({ error: "Camera not found for this company" });
    }

    const openRows = await prisma.$queryRaw<
      Array<{
        id: string;
        outTime: Date;
        outTimeClock: string | null;
        leaveTypeId: string | null;
        leaveType: string;
      }>
    >(
      Prisma.sql`
        SELECT
          "id",
          "outTime",
          TO_CHAR("outTime", 'HH24:MI:SS') AS "outTimeClock",
          "leaveTypeId",
          "leaveType"
        FROM "GatepassTable"
        WHERE "companyId" = ${companyId}
          AND "employeeId" = ${employee.id}
          AND "status" = ${"out"}
          AND "inTime" IS NULL
        ORDER BY "outTime" DESC
        LIMIT 1
      `,
    );
    const openGatepass = openRows[0];

    if (!openGatepass) {
      return res.json({ ok: true, updated: false, reason: "no_open_gatepass" });
    }

    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "GatepassTable"
        SET
          "inTime" = ${recognizedAt},
          "status" = ${"returned"},
          "returnCameraId" = ${camera?.id ?? null},
          "updatedAt" = ${new Date()}
        WHERE "id" = ${openGatepass.id}
          AND "companyId" = ${companyId}
      `,
    );

    const updatedClockRows = await prisma.$queryRaw<
      Array<{
        outTimeClock: string | null;
        inTimeClock: string | null;
        inDateDDMMYYYY: string | null;
      }>
    >(
      Prisma.sql`
        SELECT
          TO_CHAR("outTime", 'HH24:MI:SS') AS "outTimeClock",
          TO_CHAR("inTime", 'HH24:MI:SS') AS "inTimeClock",
          TO_CHAR("inTime", 'DD/MM/YYYY') AS "inDateDDMMYYYY"
        FROM "GatepassTable"
        WHERE "id" = ${openGatepass.id}
          AND "companyId" = ${companyId}
        LIMIT 1
      `,
    );
    const updatedClockRow = updatedClockRows[0] ?? null;

    const erpReturnUpdate = await updateGatepassReturnToErp(companyId, {
      empId: employee.empId,
      outTime: openGatepass.outTime,
      inTime: recognizedAt,
      outTimeClock: updatedClockRow?.outTimeClock ?? openGatepass.outTimeClock,
      inTimeClock: updatedClockRow?.inTimeClock ?? null,
      inDateDDMMYYYY: updatedClockRow?.inDateDDMMYYYY ?? null,
    });

    try {
      await prisma.$executeRaw(
        Prisma.sql`
          UPDATE "GatepassTable"
          SET
            "externalReturnAckAt" = ${erpReturnUpdate.ackAt},
            "externalReturnPayload" = CAST(${JSON.stringify(erpReturnUpdate.payload)} AS jsonb),
            "updatedAt" = ${new Date()}
          WHERE "id" = ${openGatepass.id}
            AND "companyId" = ${companyId}
        `,
      );
    } catch {
      // Local gatepass return already succeeded. Keep the request successful.
    }

    const updated = await loadGatepassById(companyId, openGatepass.id);
    if (!updated) {
      return res.status(404).json({ error: "Updated gatepass record not found" });
    }

    return res.json({
      ok: true,
      updated: true,
      gatepass: serializeGatepass(updated),
      externalApiCalled: erpReturnUpdate.attempted,
      externalApiAcknowledged: erpReturnUpdate.acknowledged,
      externalApiError: erpReturnUpdate.errorMessage,
      externalApi: erpReturnUpdate.payload,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof Error && error.message.includes("recognizedAt")) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({
      error: "Failed to mark gatepass return",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
