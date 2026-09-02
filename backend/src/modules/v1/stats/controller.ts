import { Request, Response } from "express";
import { prisma } from "../../../prisma";

export async function getStats(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const [employees, attendance] = await Promise.all([
      prisma.employee.count({ where: { companyId } }),
      prisma.attendance.count({ where: { companyId } }),
    ]);
    res.json({ employees, attendance });
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to load stats",
      detail: e?.message ?? String(e),
    });
  }
}
