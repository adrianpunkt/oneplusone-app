"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMemberContext } from "@/lib/data/member";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeDbError } from "@/lib/i18n/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  preferencesSchema,
  profileFieldSchema,
  profileTextFieldNames,
} from "@/lib/validators/story";

export type FormActionState = {
  error?: string;
  ok?: boolean;
};

function checkboxValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function optionalText(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function optionalProfileText(
  formData: FormData,
  profileJson: Record<string, unknown>,
  key: string,
) {
  if (formData.has(key)) return optionalText(formData, key);

  const existingValue = profileJson[key];
  return typeof existingValue === "string" ? existingValue.trim() : "";
}

function selectedValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function dietaryRestrictionsValue(formData: FormData) {
  const selectedOptions = new Set(selectedValues(formData, "dietary_options"));
  const otherDetails = optionalText(formData, "dietary_other");
  const hasSpecificDietaryNeed =
    selectedOptions.has("Vegetarian") ||
    selectedOptions.has("Vegan") ||
    selectedOptions.has("Other") ||
    Boolean(otherDetails);

  if (selectedOptions.has("Everything works") && !hasSpecificDietaryNeed) {
    return "Everything works";
  }

  const values = [
    selectedOptions.has("Vegetarian") ? "Vegetarian" : "",
    selectedOptions.has("Vegan") ? "Vegan" : "",
    selectedOptions.has("Other") || otherDetails
      ? otherDetails
        ? `Other: ${otherDetails}`
        : "Other"
      : "",
  ];

  return values.filter(Boolean).join(", ");
}

export async function saveProfileAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { locale, profile } = await requireMemberContext();
  const dictionary = getDictionary(locale);

  if (!profile) {
    return { error: dictionary.actionErrors.noStory };
  }

  const existingProfileJson = profile.profile_json || {};
  const fields: Record<string, string | string[]> = Object.fromEntries(
    profileTextFieldNames.map((field) => [
      field,
      optionalProfileText(formData, existingProfileJson, field),
    ]),
  );

  fields["profile.deal_breakers"] = selectedValues(
    formData,
    "profile.deal_breakers",
  );

  const parsed = profileFieldSchema.safeParse(fields);

  if (!parsed.success) {
    return { error: dictionary.profile.validation };
  }

  const nextProfile = {
    ...existingProfileJson,
  };

  profileTextFieldNames.forEach((field) => {
    nextProfile[field] = parsed.data[field] || "";
  });
  nextProfile["profile.deal_breakers"] =
    parsed.data["profile.deal_breakers"] || [];

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profile_registrations")
    .update({
      profile_json: nextProfile,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    return { error: localizeDbError(error.message, dictionary) };
  }

  revalidatePath("/my-story");
  revalidatePath("/dashboard");
  redirect("/my-story?saved=1");
}

export async function savePreferencesAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { locale, member } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const returnToDashboard = formData.get("return_to") === "dashboard";
  const parsed = preferencesSchema.safeParse({
    receivesEventInvitations: checkboxValue(
      formData,
      "receives_event_invitations",
    ),
    prefersSaturdayDinner: checkboxValue(formData, "prefers_saturday_dinner"),
    prefersSundayBrunch: checkboxValue(formData, "prefers_sunday_brunch"),
    interestedInOtherEvents: checkboxValue(
      formData,
      "interested_in_other_events",
    ),
    otherEventIdeas: optionalText(formData, "other_event_ideas"),
    prefersAffordableRelaxedLocations: checkboxValue(
      formData,
      "prefers_affordable_relaxed_locations",
    ),
    prefersMichelinGuideLocations: checkboxValue(
      formData,
      "prefers_michelin_guide_locations",
    ),
    dietaryRestrictions: dietaryRestrictionsValue(formData),
    wantsToHost: checkboxValue(formData, "wants_to_host"),
    otherPreferences: optionalText(formData, "other_preferences"),
  });

  if (!parsed.success) {
    return { error: dictionary.actionErrors.preferenceTooLong };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existingPreferences } = await supabase
    .from("member_event_preferences")
    .select("extra_preferences")
    .eq("member_id", member.id)
    .maybeSingle();
  const existingExtraPreferences =
    existingPreferences?.extra_preferences &&
    typeof existingPreferences.extra_preferences === "object" &&
    !Array.isArray(existingPreferences.extra_preferences)
      ? existingPreferences.extra_preferences
      : {};
  const { error } = await supabase.from("member_event_preferences").upsert({
    member_id: member.id,
    receives_event_invitations: parsed.data.receivesEventInvitations,
    prefers_saturday_dinner: parsed.data.prefersSaturdayDinner,
    prefers_sunday_brunch: parsed.data.prefersSundayBrunch,
    dietary_restrictions: parsed.data.dietaryRestrictions || null,
    wants_to_host: parsed.data.wantsToHost,
    extra_preferences: {
      ...existingExtraPreferences,
      interested_in_other_events: parsed.data.interestedInOtherEvents,
      other_event_ideas: parsed.data.interestedInOtherEvents
        ? parsed.data.otherEventIdeas || ""
        : "",
      prefers_affordable_relaxed_locations:
        parsed.data.prefersAffordableRelaxedLocations,
      prefers_michelin_guide_locations:
        parsed.data.prefersMichelinGuideLocations,
      other_preferences: parsed.data.otherPreferences || "",
    },
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { error: localizeDbError(error.message, dictionary) };
  }

  revalidatePath("/preferences");
  revalidatePath("/dashboard");
  revalidatePath("/going-out");
  redirect(
    returnToDashboard
      ? "/dashboard?preferences=saved"
      : "/going-out?preferences=saved",
  );
}
