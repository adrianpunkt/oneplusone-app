import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { requirePublicSupabaseConfig } from "@/lib/supabase/config";

export function requirePublicSupabaseEnv() {
  return requirePublicSupabaseConfig();
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { supabaseAnonKey, supabaseUrl } = requirePublicSupabaseEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Route handlers/actions can.
        }
      },
    },
  });
}
