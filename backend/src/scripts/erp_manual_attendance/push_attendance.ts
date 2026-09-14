import axios from "axios";
import { prisma, disconnectPrisma } from "../../prisma";

/**
 * Script to re-push DB Attendance records to ERP API within a given date range.
 * Defaults: From '07/09/2026' (07 Sep 2026 00:00:00) to current time.
 */

// Default Configuration
const DEFAULT_START_DATE = "2026-09-07T00:00:00.000Z";
const FALLBACK_ERP_URL = "http://172.20.60.101:7001/api/v2/Attendance/manual-attendance";

// Format Date as DD/MM/YYYY (Asia/Dhaka time zone)
function toDDMMYYYY(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);

  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  const mm = parts.find((p) => p.type === "month")?.value ?? "01";
  const yyyy = parts.find((p) => p.type === "year")?.value ?? "2026";
  return `${dd}/${mm}/${yyyy}`;
}

// Format Time as HH:MM:SS (Asia/Dhaka time zone)
function toHHMMSS(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);

  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mi = parts.find((p) => p.type === "minute")?.value ?? "00";
  const ss = parts.find((p) => p.type === "second")?.value ?? "00";
  return `${hh}:${mi}:${ss}`;
}

async function resolveErpEndpoint(companyId?: string | null): Promise<string> {
  try {
    const row = await prisma.companyErpSetting.findFirst({
      where: {
        urlType: { equals: "attendance", mode: "insensitive" },
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (row && row.erpBaseUrl && row.erpAttendanceEndpoint) {
      const baseUrl = row.erpBaseUrl.replace(/\/+$/, "");
      const prefix = (row.erpPrefix || "").replace(/^\/+|\/+$/g, "");
      const endpoint = row.erpAttendanceEndpoint.replace(/^\/+/, "");
      
      if (prefix) {
        return `${baseUrl}/${prefix}/${endpoint}`;
      }
      return `${baseUrl}/${endpoint}`;
    }
  } catch (err) {
    console.warn("[ERP SCRIPT] Failed to load ERP config from DB, using fallback URL.");
  }
  return FALLBACK_ERP_URL;
}

export async function runErpManualAttendanceSync(params?: {
  startDate?: string;
  endDate?: string;
}) {
  const startTime = params?.startDate ? new Date(params.startDate) : new Date(DEFAULT_START_DATE);
  const endTime = params?.endDate ? new Date(params.endDate) : new Date();

  console.log("==========================================================================");
  console.log(" [ERP MANUAL ATTENDANCE RE-PUSH SCRIPT]");
  console.log(` Date Range Filter: From ${startTime.toISOString()} to ${endTime.toISOString()}`);
  console.log("==========================================================================");

  // Fetch Attendance records joined with Employee and Camera
  const records = await prisma.attendance.findMany({
    where: {
      timestamp: {
        gte: startTime,
        lte: endTime,
      },
    },
    include: {
      employee: true,
      camera: true,
    },
    orderBy: {
      timestamp: "asc",
    },
  });

  console.log(`[DB QUERY] Found ${records.length} attendance record(s) matching criteria.`);

  if (records.length === 0) {
    console.log("[INFO] No attendance records found in the specified range. Exiting.");
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const empCode = rec.employee.empId || rec.employee.id;

    if (!empCode) {
      console.warn(`[SKIP] Record ID ${rec.id} has no employee code.`);
      skippedCount++;
      continue;
    }

    const attendanceDate = toDDMMYYYY(rec.timestamp);
    const inTime = toHHMMSS(rec.timestamp);
    const inLocation = rec.camera?.name || rec.camera?.camId || rec.cameraId || "Reception_Camera";

    const payload = {
      attendanceDate,
      empId: empCode,
      inTime,
      inLocation,
    };

    const erpUrl = await resolveErpEndpoint(rec.companyId);

    try {
      console.log(`\n[${i + 1}/${records.length}] Pushing ERP Payload for Emp: ${rec.employee.name} (${empCode}) ...`);
      console.log(` Payload:`, JSON.stringify(payload));
      
      const res = await axios.post(erpUrl, payload, {
        headers: {
          "Content-Type": "application/json",
          accept: "*/*",
        },
        timeout: 10000,
      });

      if (res.status === 200 || res.status === 201) {
        console.log(` [SUCCESS] ERP Response:`, JSON.stringify(res.data));
        successCount++;
      } else {
        console.error(` [FAILED] ERP HTTP ${res.status}:`, res.data);
        failCount++;
      }
    } catch (err: any) {
      const errMsg = err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;
      console.error(` [FAILED] Error pushing to ERP (${erpUrl}): ${errMsg}`);
      failCount++;
    }
  }

  console.log("\n==========================================================================");
  console.log(" [SYNC COMPLETE SUMMARY]");
  console.log(` Total Found : ${records.length}`);
  console.log(` Pushed OK   : ${successCount}`);
  console.log(` Failed      : ${failCount}`);
  console.log(` Skipped     : ${skippedCount}`);
  console.log("==========================================================================");
}

// Execute directly if run via CLI: `ts-node src/scripts/erp_manual_attendance/push_attendance.ts`
if (require.main === module) {
  runErpManualAttendanceSync()
    .then(async () => {
      await disconnectPrisma();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error("[FATAL ERROR]", e);
      await disconnectPrisma();
      process.exit(1);
    });
}
