import { z } from "zod";

const optionalName = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .refine(
    (v) => v === undefined || v.length >= 2,
    "Name must be at least 2 characters"
  )
  .refine(
    (v) => v === undefined || v.length <= 60,
    "Name must be at most 60 characters"
  );

export const registerSchema = z.object({
  name: optionalName.optional(),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
  companyName: z.string().trim().min(2).max(120),
  organization_id: z.string().trim().optional(),
  role: z.string().trim().min(1).optional().default("ADMIN"),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
