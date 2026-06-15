import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getOptionalMemberContext } from "@/lib/data/member";
import {
  isMemberProfileImagePath,
  PROFILE_IMAGES_BUCKET,
  profileImagePath,
} from "@/lib/profile-image";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

const acceptedTypes = new Map([
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);
const maxUploadBytes = 1024 * 1024;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const context = await getOptionalMemberContext();
  if (!context) {
    return NextResponse.json({ ok: false, error: "Login required." }, { status: 401 });
  }

  if (!context.profile) {
    return NextResponse.json(
      { ok: false, error: "No submitted story is linked to this account yet." },
      { status: 400 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const image = formData?.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ ok: false, error: "Choose a profile image first." }, { status: 400 });
  }

  const extension = acceptedTypes.get(image.type);
  if (!extension) {
    return NextResponse.json(
      { ok: false, error: "Use a WEBP, JPG, or PNG image." },
      { status: 400 },
    );
  }

  if (image.size > maxUploadBytes) {
    return NextResponse.json(
      { ok: false, error: "The cropped image is too large." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServiceClient();
  const storagePath = `${context.member.id}/profile-${randomUUID()}.${extension}`;
  const imageBuffer = Buffer.from(await image.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_IMAGES_BUCKET)
    .upload(storagePath, imageBuffer, {
      cacheControl: "31536000",
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 502 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PROFILE_IMAGES_BUCKET).getPublicUrl(storagePath);
  const previousStoragePath = profileImagePath(context.profile.profile_json);
  const now = new Date().toISOString();
  const nextProfile = {
    ...(context.profile.profile_json || {}),
    "profile.photo_url": publicUrl,
    "profile.profile_image_url": publicUrl,
    "profile.profile_image_path": storagePath,
    "profile.profile_image_updated_at": now,
  };

  const { error: updateError } = await supabase
    .from("profile_registrations")
    .update({
      profile_json: nextProfile,
      last_seen_at: now,
      updated_at: now,
    })
    .eq("id", context.profile.id)
    .eq("user_id", context.user.id);

  if (updateError) {
    await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove([storagePath]);
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  if (
    previousStoragePath &&
    previousStoragePath !== storagePath &&
    isMemberProfileImagePath(previousStoragePath, context.member.id)
  ) {
    await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove([previousStoragePath]);
  }

  return NextResponse.json({ ok: true, imageUrl: publicUrl });
}
