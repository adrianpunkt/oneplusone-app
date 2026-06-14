import { z } from "zod";

export const profileFieldSchema = z.object({
  firstName: z.string().trim().max(80).optional(),
  age: z.string().trim().max(3).optional(),
  eventLocation: z.string().trim().max(160).optional(),
  dateLanguages: z.string().trim().max(160).optional(),
  relationshipStatus: z.string().trim().max(120).optional(),
  availableRelationships: z.string().trim().max(160).optional(),
  anythingElse: z.string().trim().max(1200).optional(),
});

export const preferencesSchema = z.object({
  prefersSaturdayDinner: z.boolean(),
  prefersSundayBrunch: z.boolean(),
  dietaryRestrictions: z.string().trim().max(1000).optional(),
  wantsToHost: z.boolean(),
  hostNotes: z.string().trim().max(1000).optional(),
});

export const messageSchema = z.object({
  body: z.string().trim().min(1, "Write a short message first.").max(2000),
});

export const emailSchema = z.string().trim().email().max(320);

export const otpCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ""))
  .pipe(z.string().min(6).max(12).regex(/^[A-Za-z0-9]+$/));
