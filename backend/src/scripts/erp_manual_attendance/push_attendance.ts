import axios from "axios";
import { prisma, disconnectPrisma } from "../../prisma";

/**
 * Unified script to re-push DB Attendance records to ERP APIs within a given date range.
 * Supported URL Types: "attendance_live" | "attendance_two_log" | "attendance_two" | "attendance"
 */

// Filter & Endpoint Configuration (Edit hardcoded values here)
export type ErpUrlType = "attendance_live" | "attendance_two_log" | "attendance_two" | "attendance";

const START_DATE = "2026-09-01T00:00:00.000Z";
const END_DATE = ""; // Leave empty to query up to current time (e.g. "2026-09-14T23:59:59.000Z")
const COMPANY_ID = "cmk9dp01a0000vpskicoq1gj0";

// Active ERP URL Type to use by default when running via CLI
const DEFAULT_URL_TYPE: ErpUrlType = "attendance_live";

// Optional direct URL override (leave empty to resolve dynamically from DB or defaults)
const OVERRIDE_ERP_URL = "";

// Default Fallback ERP URLs
const DEFAULT_ERP_URLS: Record<ErpUrlType, string> = {
  attendance_live: "http://pakizaknit.pakizasoftware.com:9070/api/v1/hrm/attendance/attendance-log/create",
  attendance_two_log: "http://172.16.61.229:9070/api/v1/attendance/attendance-log/create",
  attendance_two: "http://10.81.100.38:8111/api/v1/attendance/log/create",
  attendance: "http://172.20.60.101:7001/api/v2/Attendance/manual-attendance",
};

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

// Format Date as YYYY-MM-DD (Asia/Dhaka time zone)
function toYYYYMMDD(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const yyyy = parts.find((p) => p.type === "year")?.value ?? "2026";
  const mm = parts.find((p) => p.type === "month")?.value ?? "01";
  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${yyyy}-${mm}-${dd}`;
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

export async function runErpManualAttendanceSync(params?: {
  startDate?: string;
  endDate?: string;
  companyId?: string;
  erpUrl?: string;
  urlType?: ErpUrlType | string;
}) {
  const startTime = new Date(params?.startDate || START_DATE);
  const endTime = params?.endDate ? new Date(params.endDate) : (END_DATE ? new Date(END_DATE) : new Date());
  const companyId = params?.companyId || COMPANY_ID;
  const urlType = (params?.urlType || DEFAULT_URL_TYPE) as ErpUrlType;

  let targetErpUrl = params?.erpUrl || OVERRIDE_ERP_URL;

  // Dynamically query DB setting if URL is not explicitly passed
  if (!targetErpUrl && companyId) {
    try {
      const erpSetting = await prisma.companyErpSetting.findUnique({
        where: {
          companyId_urlType: {
            companyId,
            urlType,
          },
        },
      });

      if (erpSetting && erpSetting.isActive && erpSetting.erpBaseUrl) {
        let baseUrl = erpSetting.erpBaseUrl.replace(/\/+$/, "");
        if (baseUrl.includes("pakizaknit.pakizasoftware.com")) {
          baseUrl = "http://pakizaknit.pakizasoftware.com:9070";
        }
        const prefix = (erpSetting.erpPrefix || "").startsWith("/")
          ? erpSetting.erpPrefix
          : `/${erpSetting.erpPrefix || ""}`;
        const endpoint = (erpSetting.erpAttendanceEndpoint || "").startsWith("/")
          ? erpSetting.erpAttendanceEndpoint
          : `/${erpSetting.erpAttendanceEndpoint || ""}`;

        targetErpUrl = `${baseUrl}${prefix}${endpoint}`;
      }
    } catch (e) {
      console.warn(`[ERP MANUAL ATTENDANCE] Failed to load erpSetting from DB for urlType=${urlType}:`, e);
    }
  }

  if (!targetErpUrl) {
    targetErpUrl = DEFAULT_ERP_URLS[urlType] || DEFAULT_ERP_URLS.attendance_live;
  }

  // Safety override for pakizaknit domain: force HTTP + port 9070
  if (targetErpUrl.includes("pakizaknit.pakizasoftware.com")) {
    targetErpUrl = targetErpUrl
      .replace(/^https:\/\//i, "http://")
      .replace("pakizaknit.pakizasoftware.com:9070", "pakizaknit.pakizasoftware.com")
      .replace("pakizaknit.pakizasoftware.com", "pakizaknit.pakizasoftware.com:9070");
  }

  console.log("==========================================================================");
  console.log(" [UNIFIED ERP MANUAL ATTENDANCE RE-PUSH SCRIPT]");
  console.log(` URL Type          : ${urlType}`);
  console.log(` Date Range Filter : From ${startTime.toISOString()} to ${endTime.toISOString()}`);
  console.log(` Company ID Filter : ${companyId}`);
  console.log(` Target ERP URL    : ${targetErpUrl}`);
  console.log("==========================================================================");

  // Fetch Attendance records joined with Employee and Camera
  const records = await prisma.attendance.findMany({
    where: {
      companyId: companyId,
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

    const inTime = toHHMMSS(rec.timestamp);
    const source = rec.camera?.name || rec.camera?.camId || rec.cameraId || "Reception_Camera";

    let payload: any;
    if (urlType === "attendance") {
      payload = {
        attendanceDate: toDDMMYYYY(rec.timestamp),
        empId: empCode,
        inTime,
        inLocation: source,
      };
    } else {
      const status = urlType === "attendance_two" ? "Present" : "present";
      payload = {
        employee_id: empCode,
        attendance_date: toYYYYMMDD(rec.timestamp),
        time: inTime,
        status,
        source,
      };
    }

    try {
      console.log(`\n[${i + 1}/${records.length}] Pushing ERP [${urlType}] for Emp: ${rec.employee.name} (${empCode}) ...`);
      console.log(` Payload:`, JSON.stringify(payload));

      const res = await axios.post(targetErpUrl, payload, {
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
      console.error(` [FAILED] Error pushing to ERP (${targetErpUrl}): ${errMsg}`);
      failCount++;
    }
  }

  console.log("\n==========================================================================");
  console.log(" [SYNC COMPLETE SUMMARY]");
  console.log(` URL Type    : ${urlType}`);
  console.log(` Total Found : ${records.length}`);
  console.log(` Pushed OK   : ${successCount}`);
  console.log(` Failed      : ${failCount}`);
  console.log(` Skipped     : ${skippedCount}`);
  console.log("==========================================================================");
}

// Execute directly if run via CLI: `npm run sync:erp` or `ts-node src/scripts/erp_manual_attendance/push_attendance.ts`
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
