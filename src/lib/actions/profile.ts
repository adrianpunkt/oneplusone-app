"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMemberContext } from "@/lib/data/member";
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

function selectedValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

export async function saveProfileAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { profile } = await requireMemberContext();

  if (!profile) {
    return { error: "No submitted story is linked to this account yet." };
  }

  const fields: Record<string, string | string[]> = Object.fromEntries(
    profileTextFieldNames.map((field) => [
      field,
      optionalText(formData, field),
    ]),
  );

  fields["profile.deal_breakers"] = selectedValues(
    formData,
    "profile.deal_breakers",
  );

  const parsed = profileFieldSchema.safeParse(fields);

  if (!parsed.success) {
    return { error: "Some story fields need attention." };
  }

  const nextProfile = {
    ...(profile.profile_json || {}),
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
    return { error: error.message };
  }

  revalidatePath("/my-story");
  revalidatePath("/my-story/edit");
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/me");
  redirect("/my-story?saved=1");
}

export async function savePreferencesAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { member } = await requireMemberContext();
  const parsed = preferencesSchema.safeParse({
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
    dietaryRestrictions: optionalText(formData, "dietary_restrictions"),
    wantsToHost: checkboxValue(formData, "wants_to_host"),
    otherPreferences: optionalText(formData, "other_preferences"),
  });

  if (!parsed.success) {
    return { error: "Some preference fields are too long." };
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
    return { error: error.message };
  }

  revalidatePath("/preferences");
  revalidatePath("/dashboard");
  redirect("/preferences?saved=1");
}
