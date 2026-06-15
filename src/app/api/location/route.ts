const LOCAL_FALLBACK_LOCATION = {
  city: "Valencia",
  countryCode: "ES",
  latitude: 39.4699,
  longitude: -0.3763,
  region: "Valencia",
  source: "local-fallback",
};

export async function GET(request: Request) {
  const countryCode = normalizeCountry(
    readHeaderString(request, "x-vercel-ip-country") ||
      readHeaderString(request, "cf-ipcountry"),
  );
  const city =
    readHeaderString(request, "x-vercel-ip-city") || readHeaderString(request, "cf-ipcity");
  const region =
    readHeaderString(request, "x-vercel-ip-country-region") ||
    readHeaderString(request, "cf-region");
  const latitude = readCoordinate(
    readHeaderString(request, "x-vercel-ip-latitude") ||
      readHeaderString(request, "cf-iplatitude"),
  );
  const longitude = readCoordinate(
    readHeaderString(request, "x-vercel-ip-longitude") ||
      readHeaderString(request, "cf-iplongitude"),
  );
  const location = isLocalRequest(request)
    ? LOCAL_FALLBACK_LOCATION
    : {
        city,
        countryCode,
        latitude,
        longitude,
        region,
        source: countryCode || city ? "edge" : "unavailable",
      };

  return Response.json(location, {
    headers: {
      "cache-control": "private, max-age=300",
    },
  });
}

function readString(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function readHeaderString(request: Request, name: string) {
  const value = readString(request.headers.get(name));
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeCountry(value: unknown) {
  const countryCode = readString(value).toUpperCase();
  return /^[A-Z]{2}$/.test(countryCode) ? countryCode : "";
}

function readCoordinate(value: unknown) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function isLocalRequest(request: Request) {
  const hostname = safeHostname(request.url) || readHostName(request.headers.get("host"));
  if (isLocalHost(hostname)) return true;

  return readRequestIps(request.headers).some(isLocalIp);
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function readHostName(host: string | null) {
  const value = readString(host);
  const bracketedIpv6 = value.match(/^\[([^\]]+)\]/);
  if (bracketedIpv6) return bracketedIpv6[1];
  return value.split(":")[0];
}

function readRequestIps(headers: Headers) {
  const forwardedFor = readString(headers.get("x-forwarded-for"))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const forwarded = readString(headers.get("forwarded"))
    .split(",")
    .map((value) => value.match(/for="?([^";,\s]+)"?/i)?.[1] || "")
    .filter(Boolean);

  return [
    readString(headers.get("cf-connecting-ip")),
    readString(headers.get("x-real-ip")),
    ...forwardedFor,
    ...forwarded,
  ]
    .map(cleanIpValue)
    .filter(Boolean);
}

function cleanIpValue(value: string) {
  const trimmed = readString(value).replace(/^"|"$/g, "");
  const bracketedIpv6 = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketedIpv6) return bracketedIpv6[1].replace(/^::ffff:/i, "");

  const ipv4WithPort = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort) return ipv4WithPort[1];

  return trimmed.replace(/^::ffff:/i, "");
}

function isLocalHost(hostname: string) {
  const host = readString(hostname).toLowerCase();
  return host === "localhost" || host === "::1" || isLocalIp(host);
}

function isLocalIp(value: string) {
  const ip = readString(value).toLowerCase();
  if (!ip) return false;
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;

  const parts = ip.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
