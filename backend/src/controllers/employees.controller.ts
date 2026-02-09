import { Request, Response } from "express";
import { prisma } from "../prisma";
import {
  findEmployeeByAnyId,
  normalizeEmployeeIdentifier,
} from "../utils/employee";

function normalizeOptionalString(v: any): string | null {
  if (v === null) return null;
  if (v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function normalizeHierarchyFilter(v: any): string | null {
  const value = normalizeOptionalString(v);
  if (!value) return null;

  const lower = value.toLowerCase();
  if (
    lower === "n/a" ||
    lower === "na" ||
    lower === "none" ||
    lower === "null" ||
    lower === "-"
  ) {
    return null;
  }

  return value;
}

function normalizeHierarchyWrite(v: any): string {
  if (v === undefined || v === null) return "";
  const value = String(v).trim();
  if (!value) return "";

  const lower = value.toLowerCase();
  if (
    lower === "n/a" ||
    lower === "na" ||
    lower === "none" ||
    lower === "null" ||
    lower === "-"
  ) {
    return "";
  }

  return value;
}

export async function getEmployees(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const employees = await prisma.employee.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    });
    res.json(employees);
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to load employees",
      detail: e?.message ?? String(e),
    });
  }
}

export async function listEmployeeGroupValues(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const fieldRaw = String(
      req.query?.field ?? req.query?.by ?? req.query?.groupBy ?? ""
    )
      .trim()
      .toLowerCase();

    const allowed = new Set(["unit", "section", "department", "line"]);
    if (!allowed.has(fieldRaw)) {
      return res.status(400).json({
        error: "Invalid field",
        allowed: Array.from(allowed),
        example: "/employees/group-values?field=department",
      });
    }

    const field = fieldRaw as "unit" | "section" | "department" | "line";
    const unit = normalizeHierarchyFilter(req.query?.unit);
    const department = normalizeHierarchyFilter(req.query?.department);
    const section = normalizeHierarchyFilter(req.query?.section);

    const where: any = {
      companyId,
      NOT: [{ [field]: null }, { [field]: "" }],
    };

    if (unit && field !== "unit") where.unit = unit;
    if (department && (field === "section" || field === "line")) {
      where.department = department;
    }
    if (section && field === "line") where.section = section;

    const rows = await prisma.employee.findMany({
      where,
      distinct: [field],
      orderBy: [{ [field]: "asc" } as any],
      select: { [field]: true } as any,
      take: 5000,
    });

    const values = rows
      .map((r: any) => normalizeHierarchyFilter(r?.[field]))
      .filter(Boolean);

    return res.json({ field, values });
  } catch (e: any) {
    return res.status(500).json({
      error: "Failed to load group values",
      detail: e?.message ?? String(e),
    });
  }
}

export async function upsertEmployee(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const unitRaw = req.body?.unit ?? req.body?.unit_name ?? undefined;
    const sectionRaw = req.body?.section ?? req.body?.section_name ?? undefined;
    const departmentRaw =
      req.body?.department ?? req.body?.department_name ?? undefined;
    const lineRaw = req.body?.line ?? req.body?.line_name ?? undefined;

    const groupData = {
      ...(unitRaw !== undefined ? { unit: normalizeHierarchyWrite(unitRaw) } : {}),
      ...(sectionRaw !== undefined
        ? { section: normalizeHierarchyWrite(sectionRaw) }
        : {}),
      ...(departmentRaw !== undefined
        ? { department: normalizeHierarchyWrite(departmentRaw) }
        : {}),
      ...(lineRaw !== undefined ? { line: normalizeHierarchyWrite(lineRaw) } : {}),
    } as any;

    const identifier =
      normalizeEmployeeIdentifier(
        req.body?.empId ??
          req.body?.emp_id ??
          req.body?.employeeId ??
          req.body?.id
      ) ?? null;

    if (identifier) {
      const existing = await findEmployeeByAnyId(identifier, companyId);
      if (existing) {
        const employee = await prisma.employee.update({
          where: { id: existing.id },
          data: {
            name,
            ...(existing.empId ? {} : { empId: identifier }),
            ...groupData,
          },
        });
        return res.json(employee);
      }

      const created = await prisma.employee.create({
        data: { name, empId: identifier, companyId, ...groupData },
      });
      return res.json(created);
    }

    const created = await prisma.employee.create({
      data: { name, companyId, ...groupData },
    });
    return res.json(created);
  } catch (e: any) {
    if (e?.code === "P2002") {
      return res.status(409).json({
        error: "Employee ID already exists",
        detail: e?.message ?? String(e),
      });
    }
    res.status(500).json({
      error: "Failed to upsert employee",
      detail: e?.message ?? String(e),
    });
  }
}

/**
 * Update/edit employee (only name and/or empId).
 * FaceTemplate relation stays as-is automatically.
 */
export async function updateEmployee(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const id = String(req.params?.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id param is required" });

    const existing = await findEmployeeByAnyId(id, companyId);
    if (!existing) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const nameRaw = req.body?.name;
    const empIdRaw =
      req.body?.empId ?? req.body?.emp_id ?? req.body?.employeeId ?? undefined;

    const unitRaw = req.body?.unit ?? req.body?.unit_name ?? undefined;
    const sectionRaw = req.body?.section ?? req.body?.section_name ?? undefined;
    const departmentRaw =
      req.body?.department ?? req.body?.department_name ?? undefined;
    const lineRaw = req.body?.line ?? req.body?.line_name ?? undefined;

    const data: {
      name?: string;
      empId?: string | null;
      unit?: string | null;
      section?: string | null;
      department?: string | null;
      line?: string | null;
    } = {};

    if (nameRaw !== undefined) {
      const name = String(nameRaw ?? "").trim();
      if (!name) return res.status(400).json({ error: "name cannot be empty" });
      data.name = name;
    }

    if (empIdRaw !== undefined) {
      // allow clearing empId by sending null/empty string
      const normalized = normalizeEmployeeIdentifier(empIdRaw);
      data.empId = normalized ?? null;
    }

    if (unitRaw !== undefined) {
      data.unit = normalizeHierarchyWrite(unitRaw);
    }

    if (sectionRaw !== undefined) {
      data.section = normalizeHierarchyWrite(sectionRaw);
    }

    if (departmentRaw !== undefined) {
      data.department = normalizeHierarchyWrite(departmentRaw);
    }

    if (lineRaw !== undefined) {
      data.line = normalizeHierarchyWrite(lineRaw);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await prisma.employee.update({
      where: { id: existing.id },
      data,
    });

    return res.json(updated);
  } catch (e: any) {
    // Prisma unique violation
    if (e?.code === "P2002") {
      return res.status(409).json({
        error: "Employee ID already exists",
        detail: e?.message ?? String(e),
      });
    }

    // Prisma not found
    if (e?.code === "P2025") {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.status(500).json({
      error: "Failed to update employee",
      detail: e?.message ?? String(e),
    });
  }
}

export async function deleteEmployee(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const id = String(req.params?.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id param is required" });

    const existing = await findEmployeeByAnyId(id, companyId);
    if (!existing) return res.status(404).json({ error: "Employee not found" });

    await prisma.employee.delete({ where: { id: existing.id } });

    return res.json({ success: true, id });
  } catch (e: any) {
    // Prisma not found
    if (e?.code === "P2025") {
      return res.status(404).json({ error: "Employee not found" });
    }

    // FK constraint, etc.
    res.status(500).json({
      error: "Failed to delete employee",
      detail: e?.message ?? String(e),
    });
  }
}
