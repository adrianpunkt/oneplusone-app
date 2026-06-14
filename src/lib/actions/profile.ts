"use server";

import { revalidatePath } from "next/cache";

import { requireMemberContext } from "@/lib/data/member";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { preferencesSchema, profileFieldSchema } from "@/lib/validators/story";

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

export async function saveProfileAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { profile } = await requireMemberContext();

  if (!profile) {
    return { error: "No submitted story is linked to this account yet." };
  }

  const parsed = profileFieldSchema.safeParse({
    firstName: optionalText(formData, "profile.first_name"),
    age: optionalText(formData, "profile.age"),
    eventLocation: optionalText(formData, "profile.event_location"),
    dateLanguages: optionalText(formData, "profile.date_languages"),
    relationshipStatus: optionalText(formData, "profile.relationship_status"),
    availableRelationships: optionalText(formData, "profile.available_relationships"),
    anythingElse: optionalText(formData, "profile.anything_else"),
  });

  if (!parsed.success) {
    return { error: "Some profile fields are too long." };
  }

  const nextProfile = {
    ...(profile.profile_json || {}),
    "profile.first_name": parsed.data.firstName || "",
    "profile.age": parsed.data.age || "",
    "profile.event_location": parsed.data.eventLocation || "",
    "profile.date_languages": parsed.data.dateLanguages || "",
    "profile.relationship_status": parsed.data.relationshipStatus || "",
    "profile.available_relationships": parsed.data.availableRelationships || "",
    "profile.anything_else": parsed.data.anythingElse || "",
  };

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

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function savePreferencesAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const { member } = await requireMemberContext();
  const parsed = preferencesSchema.safeParse({
    prefersSaturdayDinner: checkboxValue(formData, "prefers_saturday_dinner"),
    prefersSundayBrunch: checkboxValue(formData, "prefers_sunday_brunch"),
    dietaryRestrictions: optionalText(formData, "dietary_restrictions"),
    wantsToHost: checkboxValue(formData, "wants_to_host"),
    hostNotes: optionalText(formData, "host_notes"),
  });

  if (!parsed.success) {
    return { error: "Some preference fields are too long." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("member_event_preferences").upsert({
    member_id: member.id,
    prefers_saturday_dinner: parsed.data.prefersSaturdayDinner,
    prefers_sunday_brunch: parsed.data.prefersSundayBrunch,
    dietary_restrictions: parsed.data.dietaryRestrictions || null,
    wants_to_host: parsed.data.wantsToHost,
    host_notes: parsed.data.hostNotes || null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/preferences");
  revalidatePath("/dashboard");
  return { ok: true };
}
