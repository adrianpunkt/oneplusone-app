export const posthogConfig = {
  consentStorageName: "oneplusoneclub_posthog_analytics_consent",
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://e.oneplusoneclub.com",
  projectToken:
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
    process.env.NEXT_PUBLIC_POSTHOG_KEY ||
    "",
  uiHost: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || "https://eu.posthog.com",
};

const defaultPostHogKey = "phc_xjFr8jciwE7Q6mD5DRB9PuqgbbjxgQTwZuPstiwY4cqy";
const defaultTrackingHostnames = new Set(["app.oneplusoneclub.com"]);

export function getPostHogProjectToken() {
  if (posthogConfig.projectToken) return posthogConfig.projectToken;
  if (typeof window === "undefined") return "";

  return defaultTrackingHostnames.has(window.location.hostname) ? defaultPostHogKey : "";
}

export function isPostHogConfigured() {
  return process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== "false" &&
    getPostHogProjectToken().length > 0;
}
