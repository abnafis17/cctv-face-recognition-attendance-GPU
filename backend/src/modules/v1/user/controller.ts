import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../../../prisma";

export async function getUsers(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    if (!companyId) {
      return res.status(400).json({ ok: false, message: "companyId is required" });
    }

    const users = await prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        companyId: true,
        profilePicture: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ ok: true, results: users });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch users",
      detail: e?.message ?? String(e),
    });
  }
}

export async function createUser(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    if (!companyId) {
      return res.status(400).json({ ok: false, message: "companyId is required" });
    }

    const { name, email, password, role } = req.body || {};
    const emailTrim = String(email ?? "").trim().toLowerCase();
    const nameTrim = String(name ?? "").trim();
    const passTrim = String(password ?? "").trim();
    const roleTrim = String(role ?? "OPERATOR").trim().toUpperCase();

    if (!emailTrim || !passTrim) {
      return res.status(400).json({ ok: false, message: "Email and password are required" });
    }

    const roleExists = await prisma.userRole.findFirst({
      where: { companyId, name: roleTrim },
    });
    if (!roleExists) {
      return res.status(400).json({ ok: false, message: `Role ${roleTrim} does not exist.` });
    }

    const existing = await prisma.user.findUnique({
      where: { email: emailTrim },
    });
    if (existing) {
      return res.status(409).json({ ok: false, message: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(passTrim, 12);

    const created = await prisma.user.create({
      data: {
        name: nameTrim || null,
        email: emailTrim,
        passwordHash,
        password: passTrim,
        role: roleTrim,
        companyId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        companyId: true,
        profilePicture: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ ok: true, results: created });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: "Failed to create user",
      detail: e?.message ?? String(e),
    });
  }
}

export async function updateUser(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const targetId = String(req.params.id ?? "").trim();

    if (!companyId || !targetId) {
      return res.status(400).json({ ok: false, message: "Missing companyId or target user id parameter" });
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: targetId, companyId },
    });
    if (!targetUser) {
      return res.status(404).json({ ok: false, message: "User not found under this company" });
    }

    const { name, email, password, role, profilePicture } = req.body || {};
    const emailTrim = email !== undefined ? String(email ?? "").trim().toLowerCase() : undefined;
    const nameTrim = name !== undefined ? String(name ?? "").trim() : undefined;
    const passTrim = password !== undefined ? String(password ?? "").trim() : undefined;
    const roleTrim = role !== undefined ? String(role ?? "OPERATOR").trim().toUpperCase() : undefined;

    if (emailTrim === "") {
      return res.status(400).json({ ok: false, message: "Email cannot be empty" });
    }

    if (emailTrim) {
      const existing = await prisma.user.findUnique({
        where: { email: emailTrim },
      });
      if (existing && existing.id !== targetId) {
        return res.status(409).json({ ok: false, message: "Email is already in use by another account" });
      }
    }

    const updateData: any = {};
    if (nameTrim !== undefined) updateData.name = nameTrim || null;
    if (emailTrim !== undefined) updateData.email = emailTrim;
    if (profilePicture !== undefined) updateData.profilePicture = profilePicture;
    if (roleTrim !== undefined) {
      const roleExists = await prisma.userRole.findFirst({
        where: { companyId, name: roleTrim },
      });
      if (!roleExists) {
        return res.status(400).json({ ok: false, message: `Role ${roleTrim} does not exist.` });
      }
      updateData.role = roleTrim;
    }
    if (passTrim) {
      updateData.passwordHash = await bcrypt.hash(passTrim, 12);
      updateData.password = passTrim;
    }

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isActive: true,
        companyId: true,
        profilePicture: true,
        updatedAt: true,
      },
    });

    return res.status(200).json({ ok: true, results: updated });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: "Failed to update user",
      detail: e?.message ?? String(e),
    });
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const currentUserId = String((req as any).userId ?? "");
    const targetId = String(req.params.id ?? "").trim();

    if (!companyId || !targetId) {
      return res.status(400).json({ ok: false, message: "Missing companyId or target user id parameter" });
    }

    if (targetId === currentUserId) {
      return res.status(400).json({ ok: false, message: "You cannot delete your own logged-in user account" });
    }

    const targetUser = await prisma.user.findFirst({
      where: { id: targetId, companyId },
    });
    if (!targetUser) {
      return res.status(404).json({ ok: false, message: "User not found under this company" });
    }

    await prisma.user.delete({
      where: { id: targetId },
    });

    return res.status(200).json({ ok: true, message: "User deleted successfully", id: targetId });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      message: "Failed to delete user",
      detail: e?.message ?? String(e),
    });
  }
}
