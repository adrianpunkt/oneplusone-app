import { getRuntimeEnv } from "@/lib/env";

export type PublicSupabaseConfig = {
  supabaseAnonKey: string;
  supabaseUrl: string;
};

const supabaseHostSuffix = ".supabase.co";

export function getPublicSupabaseConfig() {
  const supabaseUrl = resolveSupabaseUrl();
  const supabaseAnonKey = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) return null;

  return { supabaseAnonKey, supabaseUrl };
}

export function requirePublicSupabaseConfig() {
  const config = getPublicSupabaseConfig();

  if (!config) {
    throw new Error(
      "Missing SUPABASE_PROJECT_REF/NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return config;
}

export function requireSupabaseUrl() {
  const supabaseUrl = resolveSupabaseUrl();

  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL.");
  }

  return supabaseUrl;
}

function resolveSupabaseUrl() {
  const projectRef =
    getRuntimeEnv("SUPABASE_PROJECT_REF") || getRuntimeEnv("NEXT_PUBLIC_SUPABASE_PROJECT_REF");

  if (projectRef) {
    if (!/^[a-z0-9]+$/.test(projectRef)) {
      throw new Error("Invalid SUPABASE_PROJECT_REF.");
    }

    return `https://${projectRef}${supabaseHostSuffix}`;
  }

  return normalizeSupabaseUrl(
    getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL") || getRuntimeEnv("SUPABASE_URL"),
  );
}

function normalizeSupabaseUrl(value: string) {
  if (!value) return "";

  try {
    return new URL(value).origin;
  } catch {
    throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL.");
  }
}
