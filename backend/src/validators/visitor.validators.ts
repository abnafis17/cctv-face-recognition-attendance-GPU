import { z } from "zod";

function requiredTrimmedString(maxLength: number, message: string) {
  return z
    .string()
    .trim()
    .min(1, message)
    .max(maxLength, `Must be within ${maxLength} characters`);
}

function optionalTrimmedString(maxLength: number) {
  return z.preprocess((value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }, z.string().max(maxLength).nullable());
}

export const visitorCreateSchema = z.object({
  visitorName: requiredTrimmedString(255, "Visitor name is required"),
  contactNumber: requiredTrimmedString(32, "Contact number is required"),
  emailAddress: optionalTrimmedString(255).optional(),
  companyAddress: requiredTrimmedString(500, "Company/address is required"),
  visitorType: requiredTrimmedString(100, "Visitor type is required"),
  purposeOfVisit: requiredTrimmedString(255, "Purpose of visit is required"),
  department: requiredTrimmedString(100, "Department is required"),
  hostEmployeeId: requiredTrimmedString(191, "Host employee is required"),
  hostEmployeeName: requiredTrimmedString(255, "Host employee name is required"),
  hostPicUrl: optionalTrimmedString(1000).optional(),
  hostDesignationId: optionalTrimmedString(255).optional(),
  hostDesignationName: optionalTrimmedString(255).optional(),
  idProofType: optionalTrimmedString(100).optional(),
  idProofNumber: optionalTrimmedString(100).optional(),
  vehicleNumber: optionalTrimmedString(100).optional(),
  extraGuest: optionalTrimmedString(32).optional(),
  visitorPassNo: requiredTrimmedString(1000, "Visitor pass number is required"),
  dateOfVisit: requiredTrimmedString(64, "Date of visit is required"),
  timeIn: requiredTrimmedString(32, "Time in is required"),
  entryAuthorizedBy: optionalTrimmedString(255).optional(),
  remarks: optionalTrimmedString(1000).optional(),
  visitorPhoto: z.string().optional().nullable(),
  faceEmbedding: z.preprocess((val) => {
    if (val === undefined || val === null || val === "") return undefined;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed.map(Number);
      } catch {
        return undefined;
      }
    }
    if (Array.isArray(val)) return val.map(Number);
    return undefined;
  }, z.array(z.number()).optional().nullable()),
});

export const visitorListQuerySchema = z.object({
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  visitorType: z.string().trim().optional(),
  q: z.string().trim().optional(),
  limit: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      const normalized = String(value).trim();
      return normalized.length > 0 ? normalized : undefined;
    },
    z.coerce.number().int().min(1).max(500).optional()
  ).optional(),
});

export const visitorLookupSchema = z.object({
  phone: z.string().trim().min(1, "Phone number is required"),
  isEmployee: z.preprocess(
    (v) => String(v).trim().toLowerCase() === "true",
    z.boolean()
  ),
});

export type VisitorCreateInput = z.infer<typeof visitorCreateSchema>;
export type VisitorListQueryInput = z.infer<typeof visitorListQuerySchema>;
export type VisitorLookupInput = z.infer<typeof visitorLookupSchema>;
