import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { ZodError } from "zod";
import axios from "axios";
import { prisma } from "../../../prisma";
import {
  getCompanyErpSettings,
  resolveConfiguredErpUrl,
} from "../settings/erp.service";
import { listCompanyGatepassTypes } from "./types.service";
import { submitGatepassToErp } from "./submit.service";
import { updateGatepassReturnToErp } from "./update.service";
import {
  GatepassCreateInput,
  GatepassListQueryInput,
  GatepassReturnInput,
  gatepassCreateSchema,
  gatepassListQuerySchema,
  gatepassReturnSchema,
} from "./dto";
import { findEmployeeByAnyId } from "../../../utils/employee";
import { findCameraByAnyId } from "../../../utils/camera";

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
  passType: string | null;
  remarks: string | null;
  returnTime: number | null;
  externalGatepassId: string | null;
  erpStatus: string | null;
  approvedByName: string | null;
  approvedByDesignation: string | null;
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
    (first?.path?.length
      ? `${first.path.join(".")} is invalid`
      : "Invalid input");

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
  gp."passType",
  gp."remarks",
  gp."returnTime",
  gp."externalGatepassId",
  gp."erpStatus",
  gp."approvedByName",
  gp."approvedByDesignation",
  e."id" AS "employeePkId",
  e."emp_id" AS "employeeEmpId",
  e."name" AS "employeeName",
  e."department" AS "employeeDepartment",
  e."unit" AS "employeeUnit",
  e."line" AS "employeeLine",
  e."section" AS "employeeSection",
  e."designation" AS "employeeDesignation",
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
  const employeeCode =
    String(row.employeeEmpId ?? "").trim() || row.employeePkId;
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
    passType: row.passType,
    remarks: row.remarks,
    returnTime: row.returnTime,
    externalGatepassId: row.externalGatepassId,
    erpStatus: row.erpStatus,
    approvedByName: row.approvedByName,
    approvedByDesignation: row.approvedByDesignation,
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
    passType: req.body?.passType,
    remarks: req.body?.remarks,
    returnTime: req.body?.returnTime,
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
    if (!companyId)
      return res.status(400).json({ error: "Missing company id" });

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
    if (!companyId)
      return res.status(400).json({ error: "Missing company id" });

    const query = normalizeListQuery(req);
    const limit = query.limit || 300;

    const whereClauses: Prisma.Sql[] = [
      Prisma.sql`gp."companyId" = ${companyId}`,
    ];

    if (query.fromDate || query.toDate) {
      const fromDateStr =
        query.fromDate || query.toDate || dhakaTodayYYYYMMDD();
      const toDateStr = query.toDate || query.fromDate || dhakaTodayYYYYMMDD();
      if (fromDateStr > toDateStr) {
        return res.status(400).json({
          error: "fromDate must be earlier than or equal to toDate",
        });
      }
      const { start } = dhakaDayRange(fromDateStr);
      const { end } = dhakaDayRange(toDateStr);
      whereClauses.push(
        Prisma.sql`gp."outTime" >= ${start} AND gp."outTime" < ${end}`,
      );
    } else if (query.date) {
      const { start } = dhakaDayRange(query.date);
      const { end } = dhakaDayRange(query.date);
      whereClauses.push(
        Prisma.sql`((gp."outTime" >= ${start} AND gp."outTime" < ${end}) OR (gp."status" = 'out' AND gp."inTime" IS NULL))`,
      );
    } else {
      const todayStr = dhakaTodayYYYYMMDD();
      const { start } = dhakaDayRange(todayStr);
      const { end } = dhakaDayRange(todayStr);
      whereClauses.push(
        Prisma.sql`((gp."outTime" >= ${start} AND gp."outTime" < ${end}) OR (gp."status" = 'out' AND gp."inTime" IS NULL))`,
      );
    }

    if (query.leaveTypeId) {
      if (query.leaveTypeId === "Long Leave") {
        whereClauses.push(
          Prisma.sql`(gp."leaveTypeId" = 'Long Leave' OR gp."leaveType" ILIKE 'long%' OR gp."leaveType" = 'Long Leave' OR gp."passType" = 'Long Leave')`,
        );
      } else if (query.leaveTypeId === "short leave") {
        whereClauses.push(
          Prisma.sql`(
            (gp."leaveTypeId" IS NULL OR (gp."leaveTypeId" <> 'Long Leave' AND gp."leaveType" NOT ILIKE 'long%' AND gp."leaveType" <> 'Long Leave'))
            AND (gp."passType" IS NULL OR gp."passType" <> 'Long Leave')
          )`,
        );
      } else {
        whereClauses.push(Prisma.sql`gp."leaveTypeId" = ${query.leaveTypeId}`);
      }
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
    if (!companyId)
      return res.status(400).json({ error: "Missing company id" });

    const payload = normalizeCreateInput(req);
    const trimmedPurpose = payload.purpose.trim();
    const normalizedDestination = payload.destination ?? null;
    const recognizedAt =
      parseInputDate(payload.recognizedAt ?? undefined, "recognizedAt") ??
      new Date();

    const employee = await findEmployeeByAnyId(payload.employeeId, companyId);
    if (!employee) {
      return res
        .status(404)
        .json({ error: "Employee not found for this company" });
    }

    let camera = payload.cameraId
      ? await findCameraByAnyId(payload.cameraId, companyId)
      : null;
    if (payload.cameraId && !camera) {
      if (
        payload.cameraId.startsWith("laptop-") ||
        payload.cameraId === "cmkdpsq300000j7284bwluxh2"
      ) {
        camera = await prisma.camera.findFirst({
          where: {
            companyId,
            camId: { startsWith: "laptop-" },
          },
        });
      }
      if (
        !camera &&
        !(
          payload.cameraId.startsWith("laptop-") ||
          payload.cameraId === "cmkdpsq300000j7284bwluxh2"
        )
      ) {
        return res
          .status(404)
          .json({ error: "Camera not found for this company" });
      }
    }

    const gatepassId = randomUUID();
    const createdAt = new Date();

    const erpSubmit = await submitGatepassToErp(companyId, {
      empId: employee.empId,
      passTitle: payload.leaveType,
      passTitleId: payload.leaveTypeId,
      destination: normalizedDestination,
      outTime: recognizedAt,
      remarks: trimmedPurpose,
      passType: payload.passType,
    });

    if (!erpSubmit.gatePassId) {
      const responseMessage = (erpSubmit.payload?.responseData as any)?.message;
      const errorMsg = responseMessage
        ? `Submission unsuccessful. Please try again. ERP Error: (${responseMessage})`
        : "Submission unsuccessful. Please try again.";

      return res.status(400).json({
        error: errorMsg,
        externalApiCalled: erpSubmit.attempted,
        externalApiAcknowledged: erpSubmit.acknowledged,
        externalApiError: erpSubmit.errorMessage,
        externalApi: erpSubmit.payload,
      });
    }

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
        "updatedAt",
        "passType",
        "remarks",
        "returnTime",
        "externalSubmitAckAt",
        "externalSubmitPayload",
        "externalGatepassId",
        "erpStatus",
        "approvedByName",
        "approvedByDesignation"
      ) VALUES (
        ${gatepassId},
        ${companyId},
        ${employee.id},
        ${payload.leaveTypeId},
        ${payload.leaveType},
        ${trimmedPurpose},
        ${normalizedDestination},
        ${recognizedAt},
        null,
        'out',
        ${camera?.id ?? null},
        null,
        ${createdAt},
        ${createdAt},
        ${payload.passType ?? null},
        ${payload.remarks ?? null},
        ${payload.returnTime ?? null},
        ${erpSubmit.ackAt},
        CAST(${JSON.stringify(erpSubmit.payload)} AS jsonb),
        ${erpSubmit.gatePassId},
        ${erpSubmit.acknowledged ? "pending" : "failed"},
        ${erpSubmit.approvedByName ?? null},
        ${erpSubmit.approvedByDesignation ?? null}
      )`,
    );

    const row = await loadGatepassById(companyId, gatepassId);
    if (!row)
      return res.status(404).json({ error: "Gatepass record not found" });

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
    if (!companyId)
      return res.status(400).json({ error: "Missing company id" });

    const payload = normalizeReturnInput(req);
    const recognizedAt =
      parseInputDate(payload.recognizedAt ?? undefined, "recognizedAt") ??
      new Date();

    const employee = await findEmployeeByAnyId(payload.employeeId, companyId);
    if (!employee) {
      return res
        .status(404)
        .json({ error: "Employee not found for this company" });
    }

    let camera = payload.cameraId
      ? await findCameraByAnyId(payload.cameraId, companyId)
      : null;
    if (payload.cameraId && !camera) {
      if (
        payload.cameraId.startsWith("laptop-") ||
        payload.cameraId === "cmkdpsq300000j7284bwluxh2"
      ) {
        camera = await prisma.camera.findFirst({
          where: {
            companyId,
            camId: { startsWith: "laptop-" },
          },
        });
      }
      if (
        !camera &&
        !(
          payload.cameraId.startsWith("laptop-") ||
          payload.cameraId === "cmkdpsq300000j7284bwluxh2"
        )
      ) {
        return res
          .status(404)
          .json({ error: "Camera not found for this company" });
      }
    }

    const openRows = await prisma.$queryRaw<
      Array<{
        id: string;
        outTime: Date;
        outTimeClock: string | null;
        leaveTypeId: string | null;
        leaveType: string;
        returnTime: number | null;
      }>
    >(
      Prisma.sql`
        SELECT
          "id",
          "outTime",
          TO_CHAR("outTime", 'HH24:MI:SS') AS "outTimeClock",
          "leaveTypeId",
          "leaveType",
          "returnTime"
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

    if (openGatepass.returnTime !== null) {
      const outTimeMs = new Date(openGatepass.outTime).getTime();
      const limitMs = outTimeMs + (openGatepass.returnTime + 60) * 60 * 1000;
      const recognizedTimeMs = new Date(recognizedAt).getTime();

      if (recognizedTimeMs > limitMs) {
        return res.json({
          ok: true,
          updated: false,
          reason: "no_open_gatepass",
        });
      }
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
      outTimeClock: null,
      inTimeClock: null,
      inDateDDMMYYYY: null,
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
      return res
        .status(404)
        .json({ error: "Updated gatepass record not found" });
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

export async function updateGatepassErpStatus(req: Request, res: Response) {
  try {
    const { refid, status } = req.body;
    if (!refid) {
      return res.status(400).json({ error: "Missing refid parameter" });
    }
    if (!status) {
      return res.status(400).json({ error: "Missing status parameter" });
    }

    const normalizedRefId = String(refid).trim();
    const normalizedStatus = String(status).trim().toLowerCase();

    // Support flexible naming patterns for approvedByName and approvedByDesignation
    const finalApprovedByName =
      req.body.approvedByName ??
      req.body.approved_by_name ??
      req.body.approverName ??
      req.body.approver_name ??
      req.body.submittedToName ??
      req.body.submitted_to_name ??
      req.body.name ??
      null;

    const finalApprovedByDesignation =
      req.body.approvedByDesignation ??
      req.body.approved_by_designation ??
      req.body.approverDesignation ??
      req.body.approver_designation ??
      req.body.submittedToDesignation ??
      req.body.submitted_to_designation ??
      req.body.designation ??
      null;

    const record = await prisma.gatepassTable.findFirst({
      where: { externalGatepassId: normalizedRefId },
    });

    if (!record) {
      return res
        .status(404)
        .json({ error: `Gatepass record with refid ${refid} not found` });
    }

    await prisma.gatepassTable.update({
      where: { id: record.id },
      data: {
        erpStatus: normalizedStatus,
        approvedByName: finalApprovedByName
          ? String(finalApprovedByName).trim()
          : null,
        approvedByDesignation: finalApprovedByDesignation
          ? String(finalApprovedByDesignation).trim()
          : null,
        updatedAt: new Date(),
      },
    });

    return res.status(200).json({
      ok: true,
      message: `Status updated to ${normalizedStatus} for refid ${refid}`,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: "Failed to update gatepass ERP status",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getGatepassExternalDetails(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId)
      return res.status(400).json({ error: "Missing company id" });

    const { id } = req.params;
    if (!id || typeof id !== "string")
      return res.status(400).json({ error: "Missing gatepass id" });

    const record = await prisma.gatepassTable.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!record) {
      return res.status(404).json({ error: "Gatepass record not found" });
    }

    let targetExtId: string | null = record.externalGatepassId ?? null;
    if (!targetExtId && record.externalSubmitPayload) {
      try {
        const payload =
          typeof record.externalSubmitPayload === "string"
            ? JSON.parse(record.externalSubmitPayload)
            : (record.externalSubmitPayload as any);
        const respData = payload?.responseData || payload;
        const firstItem = Array.isArray(respData?.data)
          ? respData.data[0]
          : respData?.data || respData;
        if (firstItem && typeof firstItem === "object") {
          const val =
            firstItem.reqMasterId ??
            firstItem.reqMasterID ??
            firstItem.gatePassId ??
            firstItem.gatepassId ??
            firstItem.masterId ??
            firstItem.id;
          if (val) targetExtId = String(val);
        }
      } catch {
        // Ignored
      }
    }

    if (!targetExtId) {
      targetExtId = record.id;
    }

    const settings = await getCompanyErpSettings(
      companyId,
      "getgatepassdetails",
    );
    const url = resolveConfiguredErpUrl(settings);

    if (!url) {
      console.log(`[GATEPASS REPORT] ERP URL for 'getgatepassdetails' is NOT CONFIGURED.`);
      return res.status(400).json({
        error: "ERP endpoint URL for getgatepassdetails is not configured in ERP Settings.",
      });
    }

    if (!targetExtId) {
      console.log(`[GATEPASS REPORT] No externalGatepassId found for record ID: ${id}`);
      return res.status(404).json({
        error: `No externalGatepassId found for gatepass record ${id}. ERP report view requires a valid external gatepass ID.`,
      });
    }

    const erpPayload = { reqMasterId: targetExtId };

    console.log(`\n=================== [GATEPASS REPORT VIEW API CALL] ===================`);
    console.log(`[GATEPASS REPORT] Internal Record ID : ${id}`);
    console.log(`[GATEPASS REPORT] Target reqMasterId  : ${targetExtId}`);
    console.log(`[GATEPASS REPORT] ERP Target Endpoint: ${url}`);
    console.log(`[GATEPASS REPORT] ERP Request Payload :`, JSON.stringify(erpPayload, null, 2));

    try {
      const response = await axios.post(
        url,
        erpPayload,
        {
          headers: {
            Accept: "*/*",
            "Content-Type": "application/json",
            "x-api-version": "2.0",
          },
          timeout: 10000,
          validateStatus: () => true,
        },
      );

      console.log(`[GATEPASS REPORT] ERP Response Status : ${response.status}`);
      console.log(`[GATEPASS REPORT] ERP Response Body   :`, JSON.stringify(response.data, null, 2));
      console.log(`=======================================================================\n`);

      if (response.status >= 200 && response.status < 300 && response.data) {
        const resData = response.data;
        if (
          resData &&
          typeof resData === "object" &&
          !resData.data &&
          !resData.error
        ) {
          return res.json({ ok: true, data: resData });
        }
        return res.json(resData);
      } else {
        return res.status(response.status || 500).json({
          error: `ERP API returned status ${response.status}`,
          status: response.status,
          erpData: response.data,
        });
      }
    } catch (axiosErr) {
      console.error(`[GATEPASS REPORT] ERP request threw exception:`, axiosErr);
      return res.status(502).json({
        error: "Failed to connect to ERP API",
        detail: axiosErr instanceof Error ? axiosErr.message : String(axiosErr),
      });
    }
  } catch (error: unknown) {
    console.error(`[ERP GET DETAILS] Error occurred:`, error);
    return res.status(500).json({
      error: "Failed to get gatepass details from ERP",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
