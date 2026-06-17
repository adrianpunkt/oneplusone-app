import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getOptionalMemberContext } from "@/lib/data/member";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeDbError } from "@/lib/i18n/errors";
import { getRequestLocaleFallback } from "@/lib/i18n/server";
import {
  isMemberProfileImagePath,
  PROFILE_IMAGES_BUCKET,
  profileImagePath,
  profileImageThumbnailPath,
  profileImageThumbnailUrlFields,
  profileImageUrlFields,
} from "@/lib/profile-image";
import { getSupabaseServiceClient } from "@/lib/supabase/admin";

const acceptedTypes = new Map([
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);
const maxUploadBytes = 1024 * 1024;
const maxThumbnailUploadBytes = 256 * 1024;

export const runtime = "nodejs";

async function getRouteDictionary() {
  return getDictionary(await getRequestLocaleFallback());
}

function memberImagePaths(memberId: string, paths: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      paths.filter(
        (path): path is string =>
          typeof path === "string" && isMemberProfileImagePath(path, memberId),
      ),
    ),
  );
}

export async function POST(request: NextRequest) {
  const context = await getOptionalMemberContext();
  const dictionary = context
    ? getDictionary(context.locale)
    : await getRouteDictionary();
  const copy = dictionary.imageUploader;
  if (!context) {
    return NextResponse.json({ ok: false, error: dictionary.checkout.loginRequired }, { status: 401 });
  }

  if (!context.profile) {
    return NextResponse.json(
      { ok: false, error: dictionary.actionErrors.noStory },
      { status: 400 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const image = formData?.get("image");
  const thumbnail = formData?.get("thumbnail");

  if (!(image instanceof File)) {
    return NextResponse.json({ ok: false, error: copy.chooseFirst }, { status: 400 });
  }

  if (thumbnail !== undefined && thumbnail !== null && !(thumbnail instanceof File)) {
    return NextResponse.json(
      { ok: false, error: copy.chooseValidThumbnail },
      { status: 400 },
    );
  }

  const extension = acceptedTypes.get(image.type);
  if (!extension) {
    return NextResponse.json(
      { ok: false, error: copy.useImage },
      { status: 400 },
    );
  }

  if (image.size > maxUploadBytes) {
    return NextResponse.json(
      { ok: false, error: copy.croppedTooLarge },
      { status: 400 },
    );
  }

  const thumbnailImage = thumbnail instanceof File ? thumbnail : null;
  const thumbnailExtension = thumbnailImage ? acceptedTypes.get(thumbnailImage.type) : extension;
  if (!thumbnailExtension) {
    return NextResponse.json(
      { ok: false, error: copy.useThumbnail },
      { status: 400 },
    );
  }

  if (thumbnailImage && thumbnailImage.size > maxThumbnailUploadBytes) {
    return NextResponse.json(
      { ok: false, error: copy.thumbnailTooLarge },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServiceClient();
  const storagePath = `${context.member.id}/profile-${randomUUID()}.${extension}`;
  const thumbnailStoragePath = thumbnailImage
    ? `${context.member.id}/profile-thumbnail-${randomUUID()}.${thumbnailExtension}`
    : storagePath;
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

  if (thumbnailImage) {
    const thumbnailBuffer = Buffer.from(await thumbnailImage.arrayBuffer());
    const { error: thumbnailUploadError } = await supabase.storage
      .from(PROFILE_IMAGES_BUCKET)
      .upload(thumbnailStoragePath, thumbnailBuffer, {
        cacheControl: "31536000",
        contentType: thumbnailImage.type,
        upsert: false,
      });

    if (thumbnailUploadError) {
      await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove([storagePath]);
      return NextResponse.json(
        { ok: false, error: thumbnailUploadError.message },
        { status: 502 },
      );
    }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PROFILE_IMAGES_BUCKET).getPublicUrl(storagePath);
  const {
    data: { publicUrl: thumbnailPublicUrl },
  } = supabase.storage.from(PROFILE_IMAGES_BUCKET).getPublicUrl(thumbnailStoragePath);
  const previousStoragePath = profileImagePath(context.profile.profile_json);
  const previousThumbnailStoragePath = profileImageThumbnailPath(context.profile.profile_json);
  const now = new Date().toISOString();
  const nextProfile = {
    ...(context.profile.profile_json || {}),
    "profile.photo_url": publicUrl,
    "profile.profile_image_url": publicUrl,
    "profile.profile_image_path": storagePath,
    "profile.profile_image_thumbnail_url": thumbnailPublicUrl,
    "profile.profile_image_thumbnail_path": thumbnailStoragePath,
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
    await supabase.storage
      .from(PROFILE_IMAGES_BUCKET)
      .remove(memberImagePaths(context.member.id, [storagePath, thumbnailStoragePath]));
    return NextResponse.json(
      { ok: false, error: localizeDbError(updateError.message, dictionary) },
      { status: 500 },
    );
  }

  const nextStoragePaths = new Set([storagePath, thumbnailStoragePath]);
  const previousPaths = memberImagePaths(context.member.id, [
    previousStoragePath,
    previousThumbnailStoragePath,
  ]).filter((path) => !nextStoragePaths.has(path));

  if (previousPaths.length) {
    await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove(previousPaths);
  }

  return NextResponse.json({ ok: true, imageUrl: publicUrl, thumbnailUrl: thumbnailPublicUrl });
}

export async function DELETE() {
  const context = await getOptionalMemberContext();
  const dictionary = context
    ? getDictionary(context.locale)
    : await getRouteDictionary();
  if (!context) {
    return NextResponse.json({ ok: false, error: dictionary.checkout.loginRequired }, { status: 401 });
  }

  if (!context.profile) {
    return NextResponse.json(
      { ok: false, error: dictionary.actionErrors.noStory },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServiceClient();
  const previousStoragePath = profileImagePath(context.profile.profile_json);
  const previousThumbnailStoragePath = profileImageThumbnailPath(context.profile.profile_json);
  const now = new Date().toISOString();
  const nextProfile: Record<string, unknown> = {
    ...(context.profile.profile_json || {}),
  };

  for (const field of profileImageUrlFields) {
    delete nextProfile[field];
  }
  for (const field of profileImageThumbnailUrlFields) {
    delete nextProfile[field];
  }
  delete nextProfile["profile.profile_image_path"];
  delete nextProfile["profile.profile_image_thumbnail_path"];
  delete nextProfile["profile.profile_image_updated_at"];

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
    return NextResponse.json(
      { ok: false, error: localizeDbError(updateError.message, dictionary) },
      { status: 500 },
    );
  }

  const previousPaths = memberImagePaths(context.member.id, [
    previousStoragePath,
    previousThumbnailStoragePath,
  ]);
  if (previousPaths.length) {
    await supabase.storage.from(PROFILE_IMAGES_BUCKET).remove(previousPaths);
  }

  return NextResponse.json({ ok: true });
}
