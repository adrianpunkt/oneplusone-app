import { storyValue } from "@/lib/utils";

export const PROFILE_IMAGES_BUCKET = "profile-images";

export const profileImageUrlFields = [
  "profile.photo_url",
  "profile.profile_image_url",
  "profile.avatar_url",
  "profile.image_url",
] as const;

export function profileImageUrl(profileJson: Record<string, unknown> | null | undefined) {
  return profileImageUrlFields
    .map((field) => storyValue(profileJson, field))
    .find(Boolean) || "";
}

export function profileImagePath(profileJson: Record<string, unknown> | null | undefined) {
  return storyValue(profileJson, "profile.profile_image_path");
}

export function isMemberProfileImagePath(path: string, memberId: string) {
  return path.startsWith(`${memberId}/`);
}
