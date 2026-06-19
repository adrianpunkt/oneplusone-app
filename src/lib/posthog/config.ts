export const posthogConfig = {
  enabled: process.env.NEXT_PUBLIC_POSTHOG_ENABLED === "true",
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
  projectToken: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || "",
};

export function isPostHogConfigured() {
  return posthogConfig.enabled && posthogConfig.projectToken.length > 0;
}
