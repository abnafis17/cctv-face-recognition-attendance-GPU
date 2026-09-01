import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";

export function requireCompany(req: Request, res: Response, next: NextFunction) {
  const authHeader = String(req.headers["authorization"] ?? "");
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({ error: "Missing access token" });
    }
    try {
      const payload = verifyAccessToken(token);
      if (!payload.companyId) {
        return res.status(401).json({ error: "Missing company in token" });
      }
      (req as any).companyId = payload.companyId;
      (req as any).userId = payload.sub;
      return next();
    } catch {
      return res.status(401).json({ error: "Invalid access token" });
    }
  }

  const headerCompanyId = String(req.headers["x-company-id"] ?? "").trim();
  if (headerCompanyId) {
    (req as any).companyId = headerCompanyId;
    return next();
  }

  return res.status(400).json({ error: "companyId is required" });
}
