import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export function wakeBackgroundJobs() {
  try {
    const { ctx, env } = getCloudflareContext();
    ctx.waitUntil(env.BACKGROUND_JOBS_QUEUE.send({ type: "wake" }).catch(() => {
      console.warn("Background-job wake failed; scheduled recovery will retry.");
    }));
  } catch {
    // `next dev` may not expose Cloudflare bindings. The Worker's one-minute
    // database sweep is the durable fallback in every deployed environment.
  }
}
