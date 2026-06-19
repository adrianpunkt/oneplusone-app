import { isPostHogConfigured, posthogConfig } from "@/lib/posthog/config";

type PostHogClient = typeof import("posthog-js").default;

let posthogPromise: Promise<PostHogClient | null> | null = null;

export function loadPostHog() {
  if (!isPostHogConfigured()) return Promise.resolve(null);

  posthogPromise ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(posthogConfig.projectToken, {
        api_host: posthogConfig.host,
        autocapture: true,
        capture_heatmaps: true,
        defaults: "2026-01-30",
        disable_session_recording: false,
        disable_surveys: true,
      });

      if (process.env.NODE_ENV === "development") {
        posthog.debug();
      }

      return posthog;
    })
    .catch(() => null);

  return posthogPromise;
}
