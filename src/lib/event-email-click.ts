const trackableLinkVariables = [
  "ctaUrl",
  "declineUrl",
  "eventUrl",
  "invitationLink",
] as const;

export function trackEventEmailLinks({
  origin,
  token,
  variables,
}: {
  origin: string;
  token: string;
  variables: Record<string, string | number>;
}) {
  const appOrigin = new URL(origin).origin;
  const trackedVariables = { ...variables };

  for (const key of trackableLinkVariables) {
    const value = variables[key];
    if (typeof value !== "string") continue;

    let destination: URL;
    try {
      destination = new URL(value);
    } catch {
      continue;
    }
    if (destination.origin !== appOrigin || destination.pathname === "/email/click") continue;

    const trackedUrl = new URL("/email/click", appOrigin);
    trackedUrl.searchParams.set("token", token);
    trackedUrl.searchParams.set(
      "to",
      `${destination.pathname}${destination.search}${destination.hash}`,
    );
    trackedVariables[key] = trackedUrl.toString();
  }

  return trackedVariables;
}

export function eventEmailClickDestination(
  rawDestination: string,
  origin: string,
) {
  const fallback = new URL("/going-out", origin);
  if (!rawDestination.startsWith("/") || rawDestination.startsWith("//")) return fallback;

  try {
    const destination = new URL(rawDestination, origin);
    if (destination.origin !== new URL(origin).origin) return fallback;
    if (destination.pathname === "/email/click") return fallback;
    return destination;
  } catch {
    return fallback;
  }
}
