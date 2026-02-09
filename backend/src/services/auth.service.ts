import bcrypt from "bcrypt";
import { prisma } from "../prisma";
import { randomToken, sha256 } from "../utils/crypto";
import { signAccessToken } from "../utils/jwt";

const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS ?? 14);

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
  const existingCompany = await prisma.company.findFirst({
    where: { companyName: { equals: companyName, mode: "insensitive" } },
  });
  const company =
    existingCompany ??
    (await prisma.company.create({
      data: { companyName },
    }));

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
      name: "Laptop Camera",
      companyId: company.id,
      isActive: false,
      attendance: false,
    },
    update: {},
  });

  const user = await prisma.user.create({
    data: {
      name: input.name ?? null,
      email: input.email,
      passwordHash,
      companyId: company.id,
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

  if (!user.companyId) {
    const err = new Error("User is not assigned to a company");
    // @ts-ignore
    err.statusCode = 500;
    throw err;
  }

  // auto-login on register (optional)
  const tokens = await issueTokens(user);

  return { user, ...tokens };
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

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    companyId: user.companyId,
    oragnizationId: user?.company?.organization_id,
  };

  const tokens = await issueTokens(safeUser, meta);
  return { user: safeUser, ...tokens };
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
