import { Request, Response } from "express";
import { prisma } from "../prisma";
import {
  employeePublicId,
  getOrCreateEmployeeByAnyId,
  normalizeEmployeeIdentifier,
} from "../utils/employee";

export async function createAttendance(req: Request, res: Response) {
  try {
    const { employeeId, timestamp, cameraId, confidence, snapshotPath } =
      req.body;
    const identifier = normalizeEmployeeIdentifier(employeeId);
    if (!identifier || !timestamp)
      return res
        .status(400)
        .json({ error: "employeeId and timestamp required" });

    const employee = await getOrCreateEmployeeByAnyId(identifier, {
      nameIfCreate: "Unknown",
    });

    const row = await prisma.attendance.create({
      data: {
        employeeId: employee.id,
        timestamp: new Date(timestamp),
        cameraId: cameraId ?? null,
        confidence: confidence ?? null,
      },
    });

    res.json({
      ok: true,
      attendance: row,
      employeeId: employeePublicId(employee),
      snapshotPath: snapshotPath ?? null,
    });
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to create attendance",
      detail: e?.message ?? String(e),
    });
  }
}

export async function listAttendance(req: Request, res: Response) {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);

    const rows = await prisma.attendance.findMany({
      include: { employee: true },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    res.json(
      rows.map((r) => ({
        id: r.id,
        employeeId: employeePublicId(r.employee),
        name: r.employee.name,
        timestamp: r.timestamp.toISOString(),
        cameraId: r.cameraId,
        confidence: r.confidence,
      }))
    );
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to load attendance",
      detail: e?.message ?? String(e),
    });
  }
}
