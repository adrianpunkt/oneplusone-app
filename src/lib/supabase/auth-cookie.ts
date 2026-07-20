const explicitCookieNamePattern = /^[A-Za-z0-9._-]{1,128}$/;

export function getSupabaseAuthCookieOptions(supabaseUrl: string) {
  const name = resolveSupabaseAuthCookieName({
    environment: process.env.NODE_ENV,
    explicitName: process.env.NEXT_PUBLIC_SUPABASE_AUTH_COOKIE_NAME,
    scope: "app",
    supabaseUrl,
  });

  return name ? { name } : undefined;
}

export function resolveSupabaseAuthCookieName({
  environment,
  explicitName,
  scope,
  supabaseUrl,
}: {
  environment?: string;
  explicitName?: string;
  scope: "app" | "ops";
  supabaseUrl: string;
}) {
  const configuredName = explicitName?.trim() || "";
  if (configuredName) {
    if (!explicitCookieNamePattern.test(configuredName)) {
      throw new Error("Invalid NEXT_PUBLIC_SUPABASE_AUTH_COOKIE_NAME.");
    }
    return configuredName;
  }

  if (environment !== "development") return undefined;

  return `opo-${scope}-${projectScope(supabaseUrl)}-auth`;
}

function projectScope(supabaseUrl: string) {
  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    const projectRef = hostname.endsWith(".supabase.co")
      ? hostname.slice(0, -".supabase.co".length)
      : "local";
    return projectRef.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "local";
  } catch {
    return "local";
  }
}
