import { Request, Response } from "express";
import axios from "axios";
import { prisma } from "../prisma";
import { ZodError } from "zod";
import {
  visitorCreateSchema,
  visitorListQuerySchema,
  visitorLookupSchema,
} from "../validators/visitor.validators";
import {
  getCompanyErpSettings,
  resolveConfiguredErpUrl,
} from "../services/erpSettings.service";

function getCompanyId(req: Request): string {
  return String((req as any).companyId ?? "").trim();
}

function respondValidationError(res: Response, error: ZodError) {
  const first = error.issues?.[0];
  const message =
    first?.message ||
    (first?.path?.length ? `${first.path.join(".")} is invalid` : "Invalid input");

  return res.status(400).json({
    error: message,
    issues: error.issues,
  });
}

function mapErpEmployee(item: any) {
  const employeeId =
    item?.employeeId ??
    item?.EmployeeId ??
    item?.empId ??
    item?.EmpId ??
    item?.employeeCode ??
    item?.EmployeeCode ??
    item?.code ??
    item?.Code ??
    item?.id ??
    item?.Id;

  const employeeName =
    item?.employeeName ??
    item?.EmployeeName ??
    item?.empName ??
    item?.EmpName ??
    item?.name ??
    item?.Name ??
    item?.fullName ??
    item?.FullName;

  const departmentName =
    item?.department ??
    item?.Department ??
    item?.departmentName ??
    item?.DepartmentName ??
    item?.deptName ??
    item?.DeptName ??
    item?.dept ??
    item?.Dept;

  const unitName =
    item?.unit ??
    item?.Unit ??
    item?.unitName ??
    item?.UnitName;

  const mobile =
    item?.mobile ??
    item?.Mobile ??
    item?.phone ??
    item?.Phone ??
    item?.contactNo ??
    item?.ContactNo;

  const email =
    item?.email ??
    item?.Email ??
    item?.emailAddress ??
    item?.EmailAddress;

  if (employeeId == null || employeeName == null) return null;

  return {
    employeeId: String(employeeId).trim(),
    employeeName: String(employeeName).trim(),
    department: String(departmentName ?? "").trim(),
    unit: String(unitName ?? "").trim(),
    contactNumber: String(mobile ?? "").trim(),
    emailAddress: String(email ?? "").trim(),
  };
}

export async function createVisitorRecord(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const payload = visitorCreateSchema.parse(req.body);

    let visitorPhoto: string | null = payload.visitorPhoto ?? null;
    const file = (req as any).file;
    if (file) {
      visitorPhoto = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    }

    const visitor = await prisma.visitor.create({
      data: {
        companyId,
        visitorName: payload.visitorName,
        contactNumber: payload.contactNumber,
        emailAddress: payload.emailAddress ?? null,
        companyAddress: payload.companyAddress,
        visitorType: payload.visitorType,
        purposeOfVisit: payload.purposeOfVisit,
        department: payload.department,
        hostEmployeeId: payload.hostEmployeeId,
        idProofType: payload.idProofType,
        idProofNumber: payload.idProofNumber ?? null,
        vehicleNumber: payload.vehicleNumber ?? null,
        extraGuest: payload.extraGuest ?? null,
        visitorPassNo: payload.visitorPassNo,
        dateOfVisit: payload.dateOfVisit,
        timeIn: payload.timeIn,
        entryAuthorizedBy: payload.entryAuthorizedBy ?? null,
        remarks: payload.remarks ?? null,
        visitorPhoto,
      },
    });

    return res.status(201).json({
      ok: true,
      visitor,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to save visitor record",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listVisitorRecords(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const query = visitorListQuerySchema.parse(req.query);
    const limit = query.limit || 100;

    const whereClauses: any = {
      companyId,
    };

    if (query.visitorType) {
      whereClauses.visitorType = query.visitorType;
    }

    if (query.fromDate || query.toDate) {
      whereClauses.dateOfVisit = {};
      if (query.fromDate) {
        whereClauses.dateOfVisit.gte = query.fromDate;
      }
      if (query.toDate) {
        whereClauses.dateOfVisit.lte = query.toDate;
      }
    }

    if (query.q) {
      whereClauses.OR = [
        { visitorName: { contains: query.q, mode: "insensitive" } },
        { contactNumber: { contains: query.q, mode: "insensitive" } },
        { visitorPassNo: { contains: query.q, mode: "insensitive" } },
        { companyAddress: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const visitors = await prisma.visitor.findMany({
      where: whereClauses,
      orderBy: [
        { dateOfVisit: "desc" },
        { timeIn: "desc" },
      ],
      take: limit,
    });

    return res.json(visitors);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to list visitor records",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function lookupVisitor(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const query = visitorLookupSchema.parse(req.query);
    const phone = query.phone;

    if (query.isEmployee) {
      // 1) Search Employee in Company ERP
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { organization_id: true },
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Find erp configuration for employee list
      const erpSettingsList = await prisma.companyErpSetting.findMany({
        where: { companyId },
      });

      const matchedSetting = erpSettingsList.find((r) => {
        const type = String(r.urlType || "").trim().toLowerCase();
        return (
          type === "employeelist" ||
          type === "employees" ||
          type === "employee" ||
          type === "employee_info" ||
          type === "employeeinfo" ||
          type === "employee_list"
        );
      });

      if (!matchedSetting) {
        return res.json({
          found: false,
          error: "ERP URL not configured for employee search.",
        });
      }

      const resolvedUrl = resolveConfiguredErpUrl(matchedSetting);
      if (!resolvedUrl) {
        return res.json({
          found: false,
          error: "ERP URL resolved to empty or invalid format.",
        });
      }

      const orgId = String(company.organization_id ?? "").trim();
      const payload = {
        pageNumber: 1,
        pageSize: 10,
        search: phone,
        organizationId: orgId,
      };

      try {
        const response = await axios.post(resolvedUrl, payload, {
          headers: {
            Accept: "*/*",
            "Content-Type": "application/json",
            "x-api-version": "2.0",
          },
          timeout: 8000,
        });

        const rawList =
          response?.data?.results ??
          response?.data?.data ??
          response?.data?.items ??
          response?.data?.result ??
          response?.data ??
          [];

        const list = Array.isArray(rawList) ? rawList : [];
        const mapped = list.map(mapErpEmployee).filter(Boolean) as any[];

        if (mapped.length > 0) {
          const emp = mapped[0];
          return res.json({
            found: true,
            type: "employee",
            data: {
              visitorName: emp.employeeName,
              contactNumber: emp.contactNumber,
              emailAddress: emp.emailAddress,
              companyAddress: emp.unit || "Own Company",
              department: emp.department || "",
              visitorType: "Official",
              hostEmployeeId: emp.employeeId,
            },
          });
        }
      } catch (err: any) {
        console.warn("Failed lookup from external ERP endpoint:", err.message);
      }

      return res.json({ found: false });
    } else {
      // 2) Search Local Visitor History
      const lastVisitorLog = await prisma.visitor.findFirst({
        where: {
          companyId,
          contactNumber: phone,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (lastVisitorLog) {
        return res.json({
          found: true,
          type: "visitor",
          data: lastVisitorLog,
        });
      }

      return res.json({ found: false });
    }
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to perform lookup",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function checkOutVisitor(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing visitor ID" });

    const visitor = await prisma.visitor.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!visitor) {
      return res.status(404).json({ error: "Visitor record not found" });
    }

    if (visitor.status === "checked_out") {
      return res.status(400).json({ error: "Visitor is already checked out" });
    }

    const today = new Date();
    const timeString = today.toTimeString().split(" ")[0].substring(0, 5); // HH:MM

    const updated = await prisma.visitor.update({
      where: { id },
      data: {
        status: "checked_out",
        timeOut: timeString,
      },
    });

    return res.json({
      ok: true,
      visitor: updated,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: "Failed to checkout visitor",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

