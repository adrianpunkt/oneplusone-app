import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRuntimeEnv } from "@/lib/env";
import { requireSupabaseUrl } from "@/lib/supabase/config";

let serviceClient: SupabaseClient | null = null;

export function getSupabaseServiceClient() {
  if (serviceClient) return serviceClient;

  const supabaseUrl = requireSupabaseUrl();
  const serverApiKey =
    getRuntimeEnv("SUPABASE_SECRET_KEY") ||
    getRuntimeEnv("SUPABASE_API_SECRET_KEY") ||
    getDefaultKeyFromJsonEnv(getRuntimeEnv("SUPABASE_SECRET_KEYS")) ||
    getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!serverApiKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY.");
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
