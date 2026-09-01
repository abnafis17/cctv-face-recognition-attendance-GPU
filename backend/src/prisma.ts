import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

const envPath = path.join(__dirname, "../.env");
const result = dotenv.config({ path: envPath });

if (result.parsed && result.parsed.DATABASE_URL) {
  process.env.DATABASE_URL = result.parsed.DATABASE_URL;
}

console.log("[PRISMA-INIT] Resolved DATABASE_URL:", process.env.DATABASE_URL ? (process.env.DATABASE_URL.split("@")[1] || "loaded") : "undefined");

export const prisma = new PrismaClient();

