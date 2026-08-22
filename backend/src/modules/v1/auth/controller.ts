import { Request, Response } from "express";
import { ZodError } from "zod";
import axios from "axios";
import { prisma } from "../../../prisma";
import { verifyAccessToken } from "../../../utils/jwt";
import { registerSchema, loginSchema } from "./dto";
import {
  loginUser,
  registerUser,
  refreshAccessToken,
  logoutRefreshToken,
} from "./service";

function sendError(
  res: Response,
  e: unknown,
  fallbackMessage: string,
  fallbackStatus = 400
) {
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
      issues: e.issues,
    });
  }

  const anyErr = e as { statusCode?: number; message?: string };
  const status =
    typeof anyErr?.statusCode === "number" ? anyErr.statusCode : fallbackStatus;
  const message = anyErr?.message || fallbackMessage;

  return res.status(status).json({ ok: false, message });
}

export async function register(req: Request, res: Response) {
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
}

export async function getRoles(req: Request, res: Response) {
  try {
    const auth = String(req.headers.authorization ?? "").trim();
    let companyId: string | null = null;

    if (auth.startsWith("Bearer ")) {
      const token = auth.slice("Bearer ".length).trim();
      if (token) {
        try {
          const payload = verifyAccessToken(token);
          if (payload.companyId) {
            companyId = payload.companyId;
          }
        } catch (e) {
          // ignore token decode errors and fall back to public/global
        }
      }
    }

    if (companyId) {
      let dbRoles = await prisma.userRole.findMany({
        where: { companyId },
        orderBy: { name: "asc" },
      });

      if (dbRoles.length === 0) {
        const defaults = ["ADMIN", "GENERAL_USER", "OPERATOR"];
        await prisma.userRole.createMany({
          data: defaults.map((name) => ({ companyId: companyId!, name })),
          skipDuplicates: true,
        });
        dbRoles = await prisma.userRole.findMany({
          where: { companyId },
          orderBy: { name: "asc" },
        });
      }

      return res.status(200).json({
        ok: true,
        results: dbRoles.map((r) => r.name),
      });
    }

    const roles = await prisma.user.findMany({
      select: { role: true },
      distinct: ["role"],
    });

    const list = roles.map((r) => r.role).filter(Boolean);
    const defaults = ["ADMIN", "GENERAL_USER", "OPERATOR"];
    const unique = Array.from(new Set([...defaults, ...list]));

    return res.status(200).json({
      ok: true,
      results: unique,
    });
  } catch (e) {
    return sendError(res, e, "Failed to fetch roles", 500);
  }
}

export async function getCompanies(req: Request, res: Response) {
  try {
    const response = await axios.post(
      "http://172.20.60.101:7001/api/v2/Organization/GetAllHrOrginationRecord",
      "",
      {
        headers: {
          accept: "*/*",
        },
        timeout: 5000,
      }
    );

    const erpData = response.data;
    if (erpData && Array.isArray(erpData.data)) {
      const list = erpData.data
        .map((c: any) => ({
          id: c.id,
          name: c.name,
        }))
        .filter((c: any) => c.id && c.name);

      return res.status(200).json({
        ok: true,
        results: list,
      });
    }

    return res.status(200).json({
      ok: true,
      results: [],
    });
  } catch (e) {
    console.error("Failed to fetch ERP companies:", e);
    return res.status(200).json({
      ok: true,
      results: [],
    });
  }
}

export async function getModules(req: Request, res: Response) {
  try {
    const modules = await prisma.module.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        subModules: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const topLevel = modules.filter((m) => !m.parentId);

    return res.status(200).json({
      ok: true,
      results: topLevel,
    });
  } catch (e) {
    return sendError(res, e, "Failed to fetch modules", 500);
  }
}

export async function login(req: Request, res: Response) {
  try {
    const parsed = loginSchema.parse(req.body);

    const result = await loginUser(parsed, {
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
}

export async function refresh(req: Request, res: Response) {
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
}

export async function logout(req: Request, res: Response) {
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
}

export async function getMe(req: Request, res: Response) {
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

    const dbPermissions = await prisma.permission.findMany({
      where: {
        companyId: user.companyId,
        role: user.role,
      },
    });

    const permissionsMap: Record<string, boolean> = {};
    const modulesList = await prisma.module.findMany({
      select: { route: true },
      where: { route: { not: null } }
    });
    const ALL_MODULES = modulesList.map(m => m.route as string);
    for (const mod of ALL_MODULES) {
      permissionsMap[mod] = true;
    }
    for (const p of dbPermissions) {
      permissionsMap[p.module] = p.allowed;
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
        profilePicture: user.profilePicture ?? null,
        permissions: permissionsMap,
      },
    });
  } catch (e) {
    return sendError(res, e, "Unauthorized", 401);
  }
}

export async function getPermissions(req: Request, res: Response) {
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const role = String(req.query.role ?? "").trim();
    if (!role) {
      return res.status(400).json({ ok: false, message: "role is required" });
    }

    const dbPermissions = await prisma.permission.findMany({
      where: {
        companyId: user.companyId,
        role: role,
      },
    });

    const permissionsMap: Record<string, boolean> = {};
    const modulesList = await prisma.module.findMany({
      select: { route: true },
      where: { route: { not: null } }
    });
    const ALL_MODULES = modulesList.map(m => m.route as string);
    for (const mod of ALL_MODULES) {
      permissionsMap[mod] = true;
    }
    for (const p of dbPermissions) {
      permissionsMap[p.module] = p.allowed;
    }

    const results = ALL_MODULES.map((mod) => ({
      module: mod,
      allowed: permissionsMap[mod],
    }));

    return res.status(200).json({
      ok: true,
      results,
    });
  } catch (e) {
    return sendError(res, e, "Failed to fetch permissions", 500);
  }
}

export async function updatePermissions(req: Request, res: Response) {
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    if (!user.companyId) {
      return res.status(400).json({ ok: false, message: "User must be associated with a company" });
    }

    const role = String(req.body.role ?? "").trim();
    const permissions = req.body.permissions;

    if (!role) {
      return res.status(400).json({ ok: false, message: "role is required" });
    }
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ ok: false, message: "permissions array is required" });
    }

    for (const p of permissions) {
      const module = String(p.module ?? "").trim();
      const allowed = !!p.allowed;

      if (!module) continue;

      await prisma.permission.upsert({
        where: {
          companyId_role_module: {
            companyId: user.companyId,
            role: role,
            module: module,
          },
        },
        update: {
          allowed: allowed,
        },
        create: {
          companyId: user.companyId,
          role: role,
          module: module,
          allowed: allowed,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Permissions updated successfully",
    });
  } catch (e) {
    return sendError(res, e, "Failed to update permissions", 500);
  }
}
