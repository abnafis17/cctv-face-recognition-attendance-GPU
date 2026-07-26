import { z } from "zod";

export const visitorSchema = z.object({
  visitorName: z.string().min(1, "Visitor name is required"),
  contactNumber: z
    .string()
    .min(1, "Contact number is required")
    .regex(/^(\+88)?01[3-9]\d{8}$/, "Invalid mobile number format"),
  emailAddress: z
    .string()
    .email("Invalid email address")
    .optional()
    .or(z.literal("")),
  companyAddress: z.string().min(1, "Company / address is required"),
  
  visitorType: z.string().min(1, "Visitor type is required"),
  purposeOfVisit: z.string().min(1, "Purpose of visit is required"),
  department: z.string().min(1, "Department is required"),
  hostEmployeeId: z.string().min(1, "Host / employee name is required"),
  hostEmployeeName: z.string().min(1, "Host name is required"),
  hostPicUrl: z.string().optional().or(z.literal("")),
  
  idProofType: z.string().min(1, "ID proof type is required"),
  idProofNumber: z.string().optional().or(z.literal("")),
  vehicleNumber: z.string().optional().or(z.literal("")),
  extraGuest: z.string().optional().or(z.literal("")),
  visitorPassNo: z.string().min(1, "Visitor pass number is required"),
  
  dateOfVisit: z.string().min(1, "Date of visit is required"),
  timeIn: z.string().min(1, "Time in is required"),
  entryAuthorizedBy: z.string().optional().or(z.literal("")),
  remarks: z.string().optional().or(z.literal("")),
  
  visitorPhoto: z.string().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  const extraCount = data.extraGuest ? parseInt(data.extraGuest, 10) : 0;
  if (extraCount > 0) {
    const passes = data.visitorPassNo
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const expectedCount = extraCount + 1;
    if (passes.length !== expectedCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Please enter exactly ${expectedCount} pass numbers (1 self + ${extraCount} extra guest${extraCount > 1 ? "s" : ""}) separated by commas.`,
        path: ["visitorPassNo"],
      });
    }
  }
});

export type VisitorFormValues = z.infer<typeof visitorSchema>;
