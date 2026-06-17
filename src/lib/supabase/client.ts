"use client";

import { createBrowserClient } from "@supabase/ssr";

export type SupabaseBrowserConfig = {
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export function createSupabaseBrowserClient({
  supabaseAnonKey,
  supabaseUrl,
}: SupabaseBrowserConfig) {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
