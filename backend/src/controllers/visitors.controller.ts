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

  const companyName =
    item?.organizationName ??
    item?.OrganizationName ??
    item?.companyName ??
    item?.CompanyName ??
    item?.company ??
    item?.Company;

  const picUrl =
    item?.picUrl ??
    item?.PicUrl ??
    item?.photo ??
    item?.Photo ??
    item?.photoUrl ??
    item?.PhotoUrl ??
    item?.picture ??
    item?.Picture ??
    item?.image ??
    item?.Image;

  if (employeeId == null || employeeName == null) return null;

  return {
    employeeId: String(employeeId).trim(),
    employeeName: String(employeeName).trim(),
    department: String(departmentName ?? "").trim(),
    unit: String(unitName ?? "").trim(),
    contactNumber: String(mobile ?? "").trim(),
    emailAddress: String(email ?? "").trim(),
    companyName: String(companyName ?? "").trim(),
    picUrl: picUrl ? String(picUrl).trim() : "",
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
        hostEmployeeName: payload.hostEmployeeName,
        hostPicUrl: payload.hostPicUrl ?? null,
        host_designation_id: payload.hostDesignationId ?? null,
        host_designation_name: payload.hostDesignationName ?? null,
        idProofType: payload.idProofType || "NID",
        idProofNumber: payload.idProofNumber ?? null,
        vehicleNumber: payload.vehicleNumber ?? null,
        extraGuest: payload.extraGuest ?? null,
        visitorPassNo:
          payload.visitorPassNo ||
          `PASS-${Math.floor(100000 + Math.random() * 900000)}`,
        dateOfVisit: payload.dateOfVisit,
        timeIn: payload.timeIn,
        entryAuthorizedBy: payload.entryAuthorizedBy ?? null,
        remarks: payload.remarks ?? null,
        visitorPhoto,
      },
    });

    if (
      payload.faceEmbedding &&
      Array.isArray(payload.faceEmbedding) &&
      payload.faceEmbedding.length > 0
    ) {
      // Check if a face template already exists for a visitor with this contact number
      const existingTemplate = await prisma.visitorFaceTemplate.findFirst({
        where: {
          companyId,
          visitor: {
            contactNumber: payload.contactNumber,
          },
        },
      });

      if (existingTemplate) {
        // Update existing face template with the new high-quality photo & embedding
        await prisma.visitorFaceTemplate.update({
          where: { id: existingTemplate.id },
          data: {
            embedding: payload.faceEmbedding,
            photoUrl: visitorPhoto ?? existingTemplate.photoUrl,
            updatedAt: new Date(),
          },
        });
      } else {
        await prisma.visitorFaceTemplate.create({
          data: {
            visitorId: visitor.id,
            companyId,
            modelName: "face-api",
            embedding: payload.faceEmbedding,
            photoUrl: visitorPhoto ?? null,
          },
        });
      }

      // Update all past visitor records for this phone number with the latest high-quality photo
      if (visitorPhoto) {
        await prisma.visitor.updateMany({
          where: { companyId, contactNumber: payload.contactNumber },
          data: { visitorPhoto },
        });
      }
    }

    return res.status(201).json({
      ok: true,
      visitor,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to create visitor record",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteVisitorRecord(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Visitor ID is required" });

    const visitor = await prisma.visitor.findFirst({
      where: { id, companyId },
    });

    if (!visitor) {
      return res.status(404).json({ error: "Visitor record not found" });
    }

    // 1. Delete all associated VisitorFaceTemplate records (Cascade delete)
    await prisma.visitorFaceTemplate.deleteMany({
      where: { visitorId: id },
    });

    // 2. Delete the Visitor record itself
    await prisma.visitor.delete({
      where: { id },
    });

    return res.json({
      ok: true,
      message: "Visitor record and corresponding face template deleted successfully",
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: "Failed to delete visitor record",
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

    const visitorsWithHostName = visitors.map((visitor) => {
      return {
        ...visitor,
        hostName: visitor.hostEmployeeName,
      };
    });

    return res.json(visitorsWithHostName);
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
      let erpSettingsList = await prisma.companyErpSetting.findMany({
        where: { companyId },
      });

      if (erpSettingsList.length === 0) {
        erpSettingsList = await prisma.companyErpSetting.findMany();
      }

      let matchedSetting = erpSettingsList.find((r) => {
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
        const fallbackDto = await getCompanyErpSettings(companyId, "employee_info");
        if (fallbackDto && fallbackDto.erpBaseUrl && fallbackDto.erpAttendanceEndpoint) {
          matchedSetting = {
            id: fallbackDto.id || "fallback",
            companyId,
            urlType: fallbackDto.urlType || "employee_info",
            erpBaseUrl: fallbackDto.erpBaseUrl,
            erpPrefix: fallbackDto.erpPrefix,
            erpAttendanceEndpoint: fallbackDto.erpAttendanceEndpoint,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
      }

      if (matchedSetting) {
        const resolvedUrl = resolveConfiguredErpUrl(matchedSetting);
        if (resolvedUrl) {
          const payload = {
            pageNumber: 1,
            pageSize: 10,
            search: phone,
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
                  companyAddress: emp.companyName || emp.unit || "Own Company",
                  department: emp.department || "",
                  visitorType: "Official",
                  hostEmployeeId: emp.employeeId,
                  visitorPhoto: emp.picUrl || "",
                },
              });
            }
          } catch (err: any) {
            console.warn("Failed lookup from external ERP endpoint:", err.message);
          }
        }
      }

      // Fallback: Search Local Employee Database
      const localEmp = await prisma.employee.findFirst({
        where: {
          OR: [
            { empId: phone },
            { id: phone },
            { name: { contains: phone, mode: "insensitive" } },
          ],
        },
      });

      if (localEmp) {
        return res.json({
          found: true,
          type: "employee",
          data: {
            visitorName: localEmp.name,
            contactNumber: "",
            emailAddress: "",
            companyAddress: localEmp.unit || localEmp.department || "Own Company",
            department: localEmp.department || "",
            visitorType: "Official",
            hostEmployeeId: localEmp.empId || localEmp.id,
            visitorPhoto: localEmp.empPicUrl || "",
          },
        });
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

    // Ensure BD time (UTC+6) is saved regardless of server environment timezone
    const localToday = new Date();
    const dhakaOffsetMs = 6 * 60 * 60 * 1000;
    const dhakaTime = new Date(localToday.getTime() + dhakaOffsetMs);
    const hours = String(dhakaTime.getUTCHours()).padStart(2, "0");
    const minutes = String(dhakaTime.getUTCMinutes()).padStart(2, "0");
    const timeString = `${hours}:${minutes}`; // HH:MM

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

export async function getEmployeeWiseReport(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const { fromDate, toDate, q } = req.query;

    const whereClauses: any = {
      companyId,
    };

    if (fromDate || toDate) {
      whereClauses.dateOfVisit = {};
      if (fromDate) {
        whereClauses.dateOfVisit.gte = String(fromDate);
      }
      if (toDate) {
        whereClauses.dateOfVisit.lte = String(toDate);
      }
    }

    // Fetch matching visitors
    const visitors = await prisma.visitor.findMany({
      where: whereClauses,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Extract all unique hostEmployeeId values
    let filteredVisitors = visitors;
    if (q) {
      const searchStr = String(q).trim().toLowerCase();
      filteredVisitors = visitors.filter((v) =>
        (v.hostEmployeeName && v.hostEmployeeName.toLowerCase().includes(searchStr)) ||
        (v.hostEmployeeId && v.hostEmployeeId.toLowerCase().includes(searchStr))
      );
    }

    if (filteredVisitors.length === 0) {
      return res.json([]);
    }

    // Group visitors by hostEmployeeId
    const reportMap = new Map<string, any>();

    for (const visitor of filteredVisitors) {
      const hostId = visitor.hostEmployeeId;
      const employeeName = visitor.hostEmployeeName || `Employee (${hostId})`;
      const department = visitor.department || "N/A";
      const hostPicUrl = visitor.hostPicUrl || null;

      if (!reportMap.has(hostId)) {
        reportMap.set(hostId, {
          employeeId: hostId,
          employeeName,
          department,
          hostPicUrl,
          visits: [],
        });
      }

      reportMap.get(hostId).visits.push(visitor);
    }

    // Build the reporting array
    const reportList = Array.from(reportMap.values()).map((group) => {
      const visits = group.visits;
      const totalVisits = visits.length;

      const visitorMap = new Map<string, any>();
      for (const visit of visits) {
        const contact = visit.contactNumber;
        if (!visitorMap.has(contact)) {
          visitorMap.set(contact, {
            visitorName: visit.visitorName,
            contactNumber: visit.contactNumber,
            companyAddress: visit.companyAddress,
            visitorPhoto: visit.visitorPhoto ?? null,
            visitCount: 0,
            lastVisit: visit.dateOfVisit,
            purposes: new Set<string>(),
            history: [],
          });
        }

        const vData = visitorMap.get(contact);
        vData.visitCount += 1;
        if (!vData.visitorPhoto && visit.visitorPhoto) {
          vData.visitorPhoto = visit.visitorPhoto;
        }
        if (vData.history.length === 0) {
          vData.lastVisit = visit.dateOfVisit;
        }
        if (visit.purposeOfVisit) {
          vData.purposes.add(visit.purposeOfVisit);
        }
        vData.history.push({
          id: visit.id,
          date: visit.dateOfVisit,
          timeIn: visit.timeIn,
          timeOut: visit.timeOut,
          purpose: visit.purposeOfVisit,
          status: visit.status,
          visitorPassNo: visit.visitorPassNo,
        });
      }

      const visitorList = Array.from(visitorMap.values()).map((v) => ({
        ...v,
        purposes: Array.from(v.purposes),
      }));

      // Sort visitors by their lastVisit date descending
      visitorList.sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));

      const lastVisit = visits.length > 0 ? visits[0].dateOfVisit : "";
      const uniqueVisitors = visitorMap.size;

      return {
        employeeId: group.employeeId,
        employeeName: group.employeeName,
        department: group.department,
        hostPicUrl: group.hostPicUrl,
        totalVisits,
        uniqueVisitors,
        lastVisit,
        visitors: visitorList,
      };
    });

    // Sort report list by totalVisits descending
    reportList.sort((a, b) => b.totalVisits - a.totalVisits);

    return res.json(reportList);
  } catch (error: unknown) {
    return res.status(500).json({
      error: "Failed to generate employee-wise report",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getVisitorWiseReport(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const { fromDate, toDate, q } = req.query;

    const whereClauses: any = {
      companyId,
    };

    if (fromDate || toDate) {
      whereClauses.dateOfVisit = {};
      if (fromDate) {
        whereClauses.dateOfVisit.gte = String(fromDate);
      }
      if (toDate) {
        whereClauses.dateOfVisit.lte = String(toDate);
      }
    }

    if (q) {
      const searchStr = String(q).trim().toLowerCase();
      whereClauses.OR = [
        { visitorName: { contains: searchStr, mode: "insensitive" } },
        { contactNumber: { contains: searchStr, mode: "insensitive" } },
        { companyAddress: { contains: searchStr, mode: "insensitive" } },
      ];
    }

    const visitors = await prisma.visitor.findMany({
      where: whereClauses,
      orderBy: {
        dateOfVisit: "desc",
      },
    });

    if (visitors.length === 0) {
      return res.json([]);
    }

    // Group visitor records by contactNumber
    const visitorMap = new Map<string, any>();

    for (const visit of visitors) {
      const contact = visit.contactNumber;
      if (!visitorMap.has(contact)) {
        visitorMap.set(contact, {
          visitorName: visit.visitorName,
          contactNumber: visit.contactNumber,
          companyAddress: visit.companyAddress,
          visitorPhoto: visit.visitorPhoto ?? null,
          totalVisits: 0,
          hostsMetSet: new Set<string>(),
          lastVisit: visit.dateOfVisit,
          history: [],
        });
      }

      const vData = visitorMap.get(contact);
      vData.totalVisits += 1;
      
      if (!vData.visitorPhoto && visit.visitorPhoto) {
        vData.visitorPhoto = visit.visitorPhoto;
      }

      if (visit.dateOfVisit > vData.lastVisit) {
        vData.lastVisit = visit.dateOfVisit;
      }

      if (visit.hostEmployeeId) {
        vData.hostsMetSet.add(visit.hostEmployeeId);
      }

      const hostName = visit.hostEmployeeName || `Employee (${visit.hostEmployeeId || "N/A"})`;
      const hostDepartment = visit.department || "N/A";

      vData.history.push({
        id: visit.id,
        date: visit.dateOfVisit,
        timeIn: visit.timeIn,
        timeOut: visit.timeOut,
        purpose: visit.purposeOfVisit,
        status: visit.status,
        visitorPassNo: visit.visitorPassNo,
        hostName,
        hostDepartment,
        hostPicUrl: visit.hostPicUrl,
      });
    }

    const reportList = Array.from(visitorMap.values()).map((v) => {
      const { hostsMetSet, ...rest } = v;
      rest.history.sort((a: any, b: any) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return (b.timeIn || "").localeCompare(a.timeIn || "");
      });
      return {
        ...rest,
        hostsMet: hostsMetSet.size,
      };
    });

    reportList.sort((a, b) => b.totalVisits - a.totalVisits);

    return res.json(reportList);
  } catch (error: unknown) {
    return res.status(500).json({
      error: "Failed to generate visitor-wise report",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function computeEuclideanDistance(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export async function recognizeVisitorFace(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const { embedding } = req.body || {};
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return res.status(400).json({ error: "embedding array is required" });
    }

    const templates = await prisma.visitorFaceTemplate.findMany({
      where: { companyId },
      include: {
        visitor: true,
      },
      orderBy: { createdAt: "desc" },
    });

    let bestMatch: any = null;
    let minDistance = Infinity;

    for (const t of templates) {
      if (!t.embedding || t.embedding.length !== embedding.length) continue;
      const dist = computeEuclideanDistance(embedding, t.embedding);
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = t.visitor;
      }
    }

    // Threshold for face-api.js descriptors (standard ~0.55)
    const THRESHOLD = 0.55;

    if (bestMatch && minDistance <= THRESHOLD) {
      return res.json({
        recognized: true,
        type: "visitor",
        distance: minDistance,
        visitor: {
          id: bestMatch.id,
          visitorName: bestMatch.visitorName,
          contactNumber: bestMatch.contactNumber,
          emailAddress: bestMatch.emailAddress,
          companyAddress: bestMatch.companyAddress,
          visitorType: bestMatch.visitorType,
          purposeOfVisit: bestMatch.purposeOfVisit,
          department: bestMatch.department,
          hostEmployeeId: bestMatch.hostEmployeeId,
          hostEmployeeName: bestMatch.hostEmployeeName,
          hostPicUrl: bestMatch.hostPicUrl,
          idProofType: bestMatch.idProofType,
          idProofNumber: bestMatch.idProofNumber,
          vehicleNumber: bestMatch.vehicleNumber,
          extraGuest: bestMatch.extraGuest,
          visitorPassNo: bestMatch.visitorPassNo,
          visitorPhoto: bestMatch.visitorPhoto,
          remarks: bestMatch.remarks,
        },
      });
    }

    return res.json({
      recognized: false,
      distance: minDistance < Infinity ? minDistance : null,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: "Failed to recognize visitor face",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}



