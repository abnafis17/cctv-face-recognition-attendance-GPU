import { z } from "zod";

function requiredTrimmedString(maxLength: number, message: string) {
  return z
    .string()
    .trim()
    .min(1, message)
    .max(maxLength, `Must be within ${maxLength} characters`);
}

export const masterDataCreateSchema = z.object({
  name: requiredTrimmedString(255, "Name is required"),
});

export const masterDataUpdateSchema = z.object({
  name: requiredTrimmedString(255, "Name is required"),
});

export const masterDataListQuerySchema = z.object({
  page: z.preprocess(
    (val) => {
      const parsed = parseInt(String(val || 1), 10);
      return isNaN(parsed) ? 1 : parsed;
    },
    z.number().int().min(1).default(1)
  ),
  limit: z.preprocess(
    (val) => {
      const parsed = parseInt(String(val || 10), 10);
      return isNaN(parsed) ? 10 : parsed;
    },
    z.number().int().min(1).default(10)
  ),
  q: z.string().trim().optional(),
});
