import { Request, Response } from "express";
import { runErpManualAttendanceSync } from "../../../scripts/erp_manual_attendance/push_attendance";

export async function triggerErpAttendanceSync(req: Request, res: Response) {
  try {
    const { startDate, endDate, companyId, erpUrl, urlType } = req.body || {};

    // Run async sync in background or wait based on sync flag
    const isAsync = req.query.async === "true" || req.query.async === "1";

    if (isAsync) {
      runErpManualAttendanceSync({ startDate, endDate, companyId, erpUrl, urlType }).catch((err) => {
        console.error("[ERP MANUAL ATTENDANCE API] Background error:", err);
      });

      return res.json({
        ok: true,
        message: "ERP Manual Attendance re-push process launched in background.",
        startDate: startDate || "2026-09-01T00:00:00.000Z",
        endDate: endDate || new Date().toISOString(),
      });
    }

    await runErpManualAttendanceSync({ startDate, endDate, companyId, erpUrl, urlType });

    return res.json({
      ok: true,
      message: "ERP Manual Attendance re-push completed successfully.",
    });
  } catch (error: any) {
    console.error("[ERP MANUAL ATTENDANCE API] Error:", error);
    return res.status(500).json({
      error: "Failed to trigger ERP manual attendance sync",
      detail: error?.message ?? String(error),
    });
  }
}
