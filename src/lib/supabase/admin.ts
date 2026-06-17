import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

export function getSupabaseServiceClient() {
  if (serviceClient) return serviceClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverApiKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_API_SECRET_KEY ||
    getDefaultKeyFromJsonEnv(process.env.SUPABASE_SECRET_KEYS) ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serverApiKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  }

  serviceClient = createClient(supabaseUrl, serverApiKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serviceClient;
}

function getDefaultKeyFromJsonEnv(value?: string) {
  if (!value) return "";

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.default === "string" && parsed.default.trim()) return parsed.default.trim();
    const firstKey = Object.values(parsed).find((candidate) => typeof candidate === "string" && candidate.trim());
    return typeof firstKey === "string" ? firstKey.trim() : "";
  } catch {
    return "";
  }
}
