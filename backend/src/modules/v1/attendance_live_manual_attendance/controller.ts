import { Request, Response } from "express";
import { runErpManualAttendanceSync } from "../../../scripts/erp_manual_attendance/push_attendance";

export async function triggerErpAttendanceLiveSync(req: Request, res: Response) {
  try {
    const { startDate, endDate, companyId, erpUrl } = req.body || {};

    // Run async sync in background or wait based on sync flag
    const isAsync = req.query.async === "true" || req.query.async === "1";

    if (isAsync) {
      runErpManualAttendanceSync({
        startDate,
        endDate,
        companyId,
        erpUrl,
        urlType: "attendance_live",
      }).catch((err) => {
        console.error("[ERP ATTENDANCE LIVE API] Background error:", err);
      });

      return res.json({
        ok: true,
        message: "ERP Live Attendance re-push process launched in background.",
        startDate: startDate || "2026-09-01T00:00:00.000Z",
        endDate: endDate || new Date().toISOString(),
      });
    }

    await runErpManualAttendanceSync({
      startDate,
      endDate,
      companyId,
      erpUrl,
      urlType: "attendance_live",
    });

    return res.json({
      ok: true,
      message: "ERP Live Attendance re-push completed successfully.",
    });
  } catch (error: any) {
    console.error("[ERP ATTENDANCE LIVE API] Error:", error);
    return res.status(500).json({
      error: "Failed to trigger ERP live attendance sync",
      detail: error?.message ?? String(error),
    });
  }
}
