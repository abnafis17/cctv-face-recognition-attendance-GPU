// src/routes/auth.routes.ts
import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../prisma";
import { verifyAccessToken } from "../utils/jwt";

import { registerSchema, loginSchema } from "../validators/auth.validators";
import {
  loginUser,
  registerUser,
  refreshAccessToken,
  logoutRefreshToken,
} from "../services/auth.service";

export const authRouter = Router();

/**
 * Normalize API error responses (supports Zod + custom statusCode)
 */
function sendError(
  res: Response,
  e: unknown,
  fallbackMessage: string,
  fallbackStatus = 400
) {
  // ✅ Zod validation errors
  if (e instanceof ZodError) {
    const first = e.issues?.[0];
    const message =
      first?.message ||
      (first?.path?.length
        ? `${first.path.join(".")} is invalid`
        : "Invalid input");

    return res.status(400).json({
      ok: false,
      message,
      issues: e.issues, // helpful for forms
    });
  }

  // ✅ Custom service errors (you set err.statusCode in service)
  const anyErr = e as { statusCode?: number; message?: string };

  const status =
    typeof anyErr?.statusCode === "number" ? anyErr.statusCode : fallbackStatus;

  const message = anyErr?.message || fallbackMessage;

  return res.status(status).json({ ok: false, message });
}

authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.parse(req.body);
    const result = await registerUser(parsed);

    return res.status(201).json({
      ok: true,
      results: result,
    });
  } catch (e) {
    return sendError(res, e, "Register failed", 400);
  }
});

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.parse(req.body);

    const result = await loginUser(parsed, {
      // If behind proxy: app.set("trust proxy", 1)
      ip: req.ip,
      userAgent: String(req.headers["user-agent"] ?? ""),
    });

    return res.status(200).json({
      ok: true,
      results: result,
    });
  } catch (e) {
    return sendError(res, e, "Login failed", 400);
  }
});

/**
 * ✅ Must match axiosInstance.ts:
 * GET /api/auth/refresh
 * Header: refreshtoken: Bearer <token>
 * Response: { results: { accessToken } }
 */
authRouter.get("/refresh", async (req: Request, res: Response) => {
  try {
    const header = String(req.headers["refreshtoken"] ?? "");
    const token = header.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : "";

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: "Missing refresh token",
      });
    }

    const result = await refreshAccessToken(token);

    return res.status(200).json({
      ok: true,
      results: result,
    });
  } catch (e) {
    return sendError(res, e, "Refresh failed", 401);
  }
});

authRouter.post("/logout", async (req: Request, res: Response) => {
  try {
    const refreshToken = String(req.body?.refreshToken ?? "").trim();

    if (!refreshToken) {
      return res.status(400).json({
        ok: false,
        message: "Missing refreshToken",
      });
    }

    await logoutRefreshToken(refreshToken);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return sendError(res, e, "Logout failed", 400);
  }
});

authRouter.get("/me", async (req: Request, res: Response) => {
  try {
    const auth = String(req.headers.authorization ?? "").trim();
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const token = auth.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const payload = verifyAccessToken(token);
    const userId = String(payload.sub ?? "").trim();
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    return res.status(200).json({
      ok: true,
      results: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        companyId: user.companyId,
        companyName: user?.company?.companyName ?? null,
        organizationId: user?.company?.organization_id ?? null,
        oragnizationId: user?.company?.organization_id ?? null,
      },
    });
  } catch (e) {
    return sendError(res, e, "Unauthorized", 401);
  }
});
