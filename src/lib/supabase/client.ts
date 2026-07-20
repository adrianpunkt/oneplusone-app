"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseAuthCookieOptions } from "@/lib/supabase/auth-cookie";

export type SupabaseBrowserConfig = {
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export function createSupabaseBrowserClient({
  supabaseAnonKey,
  supabaseUrl,
}: SupabaseBrowserConfig) {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
  });
}
