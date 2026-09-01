import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../prisma";
import { randomToken, sha256 } from "../../../utils/crypto";
import { signAccessToken } from "../../../utils/jwt";

const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS ?? 14);
const cameraHasAttendanceField = Prisma.dmmf.datamodel.models
  .find((m) => m.name === "Camera")
  ?.fields.some((f) => f.name === "attendance");

function refreshExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_DAYS);
  return d;
}

export async function registerUser(input: {
  name?: string;
  email: string;
  password: string;
  companyName: string;
  organization_id?: string;
  role?: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    const err = new Error("Email already exists");
    // @ts-ignore
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  const companyName = input.companyName.trim();
  const organization_id = input.organization_id?.trim() || null;

  let company;
  if (organization_id) {
    let existingCompany = await prisma.company.findFirst({
      where: { organization_id },
    });
    if (!existingCompany) {
      existingCompany = await prisma.company.findFirst({
        where: { companyName: { equals: companyName, mode: "insensitive" } },
      });
      if (existingCompany) {
        existingCompany = await prisma.company.update({
          where: { id: existingCompany.id },
          data: { organization_id },
        });
      }
    } else if (existingCompany.companyName !== companyName) {
      existingCompany = await prisma.company.update({
        where: { id: existingCompany.id },
        data: { companyName },
      });
    }

    if (existingCompany) {
      company = existingCompany;
    } else {
      company = await prisma.company.create({
        data: { companyName, organization_id },
      });
    }
  } else {
    const existingCompany = await prisma.company.findFirst({
      where: { companyName: { equals: companyName, mode: "insensitive" } },
    });
    company =
      existingCompany ??
      (await prisma.company.create({
        data: { companyName },
      }));
  }

  // Seed default roles for the company
  const defaults = ["ADMIN", "GENERAL_USER", "OPERATOR"];
  const registerRoleName = String(input.role ?? "ADMIN").trim().toUpperCase();
  if (registerRoleName && !defaults.includes(registerRoleName)) {
    defaults.push(registerRoleName);
  }

  await prisma.userRole.createMany({
    data: defaults.map((name) => ({ companyId: company.id, name })),
    skipDuplicates: true,
  });

  const laptopCamId = `laptop-${company.id}`;
  await prisma.camera.upsert({
    where: {
      companyId_camId: {
        companyId: company.id,
        camId: laptopCamId,
      },
    },
    create: {
      camId: laptopCamId,
      name: "Shapno Camera",
      companyId: company.id,
      isActive: false,
      ...(cameraHasAttendanceField ? { attendance: false } : {}),
    },
    update: {},
  });

  const user = await prisma.user.create({
    data: {
      name: input.name ?? null,
      email: input.email,
      passwordHash,
      password: input.password,
      companyId: company.id,
      role: input.role ?? "ADMIN",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      companyId: true,
    },
  });

  const safeUser = {
    ...user,
    companyName: company.companyName,
    organizationId: company.organization_id ?? null,
    oragnizationId: company.organization_id ?? null,
  };

  if (!safeUser.companyId) {
    const err = new Error("User is not assigned to a company");
    // @ts-ignore
    err.statusCode = 500;
    throw err;
  }

  const dbPermissions = await prisma.permission.findMany({
    where: {
      companyId: safeUser.companyId,
      role: safeUser.role,
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

  const safeUserWithPerms = {
    ...safeUser,
    permissions: permissionsMap,
  };

  // auto-login on register (optional)
  const tokens = await issueTokens(safeUserWithPerms);

  return { user: safeUserWithPerms, ...tokens };
}

export async function loginUser(
  input: { email: string; password: string },
  meta?: { ip?: string; userAgent?: string }
) {
  const user = await prisma.user.findUnique({
    include: {
      company: true,
    },
    where: { email: input.email },
  });
  if (!user || !user.isActive) {
    const err = new Error("Invalid credentials");
    // @ts-ignore
    err.statusCode = 401;
    throw err;
  }

  if (!user.companyId) {
    const err = new Error("User is not assigned to a company");
    // @ts-ignore
    err.statusCode = 403;
    throw err;
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    const err = new Error("Invalid credentials");
    // @ts-ignore
    err.statusCode = 401;
    throw err;
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

  const safeUserWithPerms = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    companyId: user.companyId,
    companyName: user?.company?.companyName ?? null,
    organizationId: user?.company?.organization_id ?? null,
    oragnizationId: user?.company?.organization_id,
    permissions: permissionsMap,
  };

  const tokens = await issueTokens(safeUserWithPerms, meta);
  return { user: safeUserWithPerms, ...tokens };
}

export async function refreshAccessToken(refreshTokenRaw: string) {
  const tokenHash = sha256(refreshTokenRaw);

  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!row || row.revokedAt) {
    const err = new Error("Invalid refresh token");
    // @ts-ignore
    err.statusCode = 401;
    throw err;
  }

  if (row.expiresAt.getTime() < Date.now()) {
    // revoke expired token
    await prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const err = new Error("Refresh token expired");
    // @ts-ignore
    err.statusCode = 401;
    throw err;
  }

  if (!row.user.isActive) {
    const err = new Error("User disabled");
    // @ts-ignore
    err.statusCode = 403;
    throw err;
  }

  if (!row.user.companyId) {
    const err = new Error("User is not assigned to a company");
    // @ts-ignore
    err.statusCode = 403;
    throw err;
  }

  const accessToken = signAccessToken({
    sub: row.user.id,
    email: row.user.email,
    role: row.user.role,
    companyId: row.user.companyId,
  });

  return { accessToken };
}

export async function logoutRefreshToken(refreshTokenRaw: string) {
  const tokenHash = sha256(refreshTokenRaw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function issueTokens(
  user: { id: string; email: string; role: any; companyId: string | null },
  meta?: { ip?: string; userAgent?: string }
) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: String(user.role),
    companyId: user.companyId ?? "",
  });

  const refreshToken = randomToken(48);
  const tokenHash = sha256(refreshToken);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: user.id,
      companyId: user.companyId,
      expiresAt: refreshExpiryDate(),
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  });

  return { accessToken, refreshToken };
}
