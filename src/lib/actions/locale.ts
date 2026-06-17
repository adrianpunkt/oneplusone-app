"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { localeCookieName, normalizeLocale } from "@/lib/i18n/locales";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/utils";

export async function setLocaleAction(formData: FormData) {
  const locale = normalizeLocale(String(formData.get("locale") || ""));
  const returnTo = safeInternalPath(String(formData.get("return_to") || "/dashboard"));
  const cookieStore = await cookies();

  cookieStore.set(localeCookieName, locale, {
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase.rpc("set_current_member_locale", { p_locale: locale });
    }
  } catch {
    // Cookie-level locale still applies before login or when Supabase is unavailable.
  }

  revalidatePath("/", "layout");
  redirect(returnTo);
}
