import { z } from "zod";

const shortStoryText = z.string().trim().max(320).optional();
const mediumStoryText = z.string().trim().max(600).optional();
const longStoryText = z.string().trim().max(1200).optional();

export const profileTextFieldNames = [
  "profile.first_name",
  "profile.email",
  "profile.age",
  "profile.height",
  "profile.gender",
  "profile.gender.details",
  "profile.gender.pronouns",
  "profile.sexual_orientation",
  "profile.sexual_orientation.details",
  "profile.home_base",
  "profile.event_location",
  "profile.geographic_setup",
  "profile.relocation",
  "profile.date_languages",
  "profile.age_matters",
  "profile.age_matters.preferred_range.min",
  "profile.age_matters.preferred_range.max",
  "profile.height_important",
  "profile.height_important.preferred_range.min",
  "profile.height_important.preferred_range.max",
  "profile.relationship_status",
  "profile.available_relationships",
  "profile.children_position",
  "profile.religion_identity",
  "profile.religion_alignment_importance",
  "profile.religion_identity.central_religion",
  "profile.religion_identity.central_religion.details",
  "profile.political_alignment_importance",
  "profile.politics_worldview",
  "profile.financial_alignment_importance",
  "profile.financial_philosophy",
  "profile.fitness_priority",
  "profile.lifestyle_pace",
  "profile.deal_breakers.details",
  "profile.anything_else",
] as const;

export const profileFieldSchema = z.object({
  "profile.first_name": z.string().trim().max(80).optional(),
  "profile.email": z.string().trim().max(320).optional(),
  "profile.age": z.string().trim().max(3).optional(),
  "profile.height": z.string().trim().max(3).optional(),
  "profile.gender": shortStoryText,
  "profile.gender.details": mediumStoryText,
  "profile.gender.pronouns": shortStoryText,
  "profile.sexual_orientation": shortStoryText,
  "profile.sexual_orientation.details": mediumStoryText,
  "profile.home_base": shortStoryText,
  "profile.event_location": mediumStoryText,
  "profile.geographic_setup": shortStoryText,
  "profile.relocation": shortStoryText,
  "profile.date_languages": mediumStoryText,
  "profile.age_matters": shortStoryText,
  "profile.age_matters.preferred_range.min": z.string().trim().max(3).optional(),
  "profile.age_matters.preferred_range.max": z.string().trim().max(3).optional(),
  "profile.height_important": shortStoryText,
  "profile.height_important.preferred_range.min": z.string().trim().max(3).optional(),
  "profile.height_important.preferred_range.max": z.string().trim().max(3).optional(),
  "profile.relationship_status": shortStoryText,
  "profile.available_relationships": shortStoryText,
  "profile.children_position": shortStoryText,
  "profile.religion_identity": shortStoryText,
  "profile.religion_alignment_importance": shortStoryText,
  "profile.religion_identity.central_religion": shortStoryText,
  "profile.religion_identity.central_religion.details": mediumStoryText,
  "profile.political_alignment_importance": shortStoryText,
  "profile.politics_worldview": shortStoryText,
  "profile.financial_alignment_importance": shortStoryText,
  "profile.financial_philosophy": shortStoryText,
  "profile.fitness_priority": shortStoryText,
  "profile.lifestyle_pace": shortStoryText,
  "profile.deal_breakers": z.array(z.string().trim().max(140)).max(5).optional(),
  "profile.deal_breakers.details": mediumStoryText,
  "profile.anything_else": longStoryText,
});

export const preferencesSchema = z.object({
  prefersSaturdayDinner: z.boolean(),
  prefersSundayBrunch: z.boolean(),
  interestedInOtherEvents: z.boolean(),
  otherEventIdeas: z.string().trim().max(1000).optional(),
  prefersAffordableRelaxedLocations: z.boolean(),
  prefersMichelinGuideLocations: z.boolean(),
  dietaryRestrictions: z.string().trim().max(1000).optional(),
  wantsToHost: z.boolean(),
  otherPreferences: z.string().trim().max(1000).optional(),
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
