import fs from "fs";
import path from "path";

const LOGS_DIR = path.resolve(__dirname, "../../logs");

function ensureLogsDirExists() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const copy: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" && (val.startsWith("data:image") || val.length > 5000)) {
      copy[key] = `[Base64/Large Data: ${val.length} bytes]`;
    } else if (typeof val === "object" && val !== null) {
      copy[key] = sanitizeObject(val);
    } else {
      copy[key] = val;
    }
  }
  return copy;
}

export function logSubmission(
  type: "gatepass" | "visitor",
  data: {
    payload: any;
    status: string;
    response: any;
  }
) {
  try {
    ensureLogsDirExists();
    const logFilePath = path.join(LOGS_DIR, `${type}-submissions.log`);
    const timestamp = new Date().toISOString();

    const sanitizedPayload = sanitizeObject(data.payload);
    const sanitizedResponse = sanitizeObject(data.response);

    const separator = "================================================================================";
    const logMessage = [
      separator,
      `TIMESTAMP: ${timestamp}`,
      `TYPE: ${type.toUpperCase()}`,
      `STATUS: ${data.status}`,
      `REQUEST PAYLOAD:`,
      JSON.stringify(sanitizedPayload, null, 2),
      `RESPONSE:`,
      JSON.stringify(sanitizedResponse, null, 2),
      separator,
      "",
    ].join("\n");

    fs.appendFileSync(logFilePath, logMessage, "utf8");
  } catch (error) {
    console.error(`[Logger] Failed to write to log file:`, error);
  }
}
