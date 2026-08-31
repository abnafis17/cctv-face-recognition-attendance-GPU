import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

const envPath = path.join(__dirname, "../.env");
const result = dotenv.config({ path: envPath });

if (result.parsed && result.parsed.DATABASE_URL) {
  process.env.DATABASE_URL = result.parsed.DATABASE_URL;
}

// Ensure connection limit is tuned for Jetson edge environment if using URL params
let dbUrl = process.env.DATABASE_URL || "";
if (dbUrl && !dbUrl.includes("connection_limit")) {
  const separator = dbUrl.includes("?") ? "&" : "?";
  dbUrl = `${dbUrl}${separator}connection_limit=5`;
  process.env.DATABASE_URL = dbUrl;
}

console.log(
  "[PRISMA-INIT] Resolved DATABASE_URL:",
  process.env.DATABASE_URL
    ? process.env.DATABASE_URL.split("@")[1] || "loaded"
    : "undefined"
);

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log("[PRISMA] Disconnected database client cleanly.");
  } catch (error) {
    console.error("[PRISMA] Error disconnecting:", error);
  }
}
