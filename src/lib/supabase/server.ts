import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseAuthCookieOptions } from "@/lib/supabase/auth-cookie";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";

export function requirePublicSupabaseEnv() {
  return requirePublicSupabaseConfig();
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { supabaseAnonKey, supabaseUrl } = requirePublicSupabaseEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
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

export function createSupabaseRouteClient(
  request: NextRequest,
  response: NextResponse,
) {
  const { supabaseAnonKey, supabaseUrl } = requirePublicSupabaseEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: getSupabaseAuthCookieOptions(supabaseUrl),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
