"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  createSupabaseBrowserClient,
  type SupabaseBrowserConfig,
} from "@/lib/supabase/client";

const notificationRefreshDebounceMs = 1000;

export function NotificationRefresh({
  memberId,
  supabaseConfig,
}: {
  memberId: string;
  supabaseConfig: SupabaseBrowserConfig;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { supabaseAnonKey, supabaseUrl } = supabaseConfig;
  const refreshDisabled =
    pathname === "/going-out" || pathname.startsWith("/going-out/");

  useEffect(() => {
    // Going out is an invitation decision flow. Unrelated notification changes
    // can update the navigation badge after the user's next page transition.
    if (refreshDisabled) return;

    let refreshTimeout: number | null = null;
    let refreshDeferredUntilVisible = false;

    function clearRefreshTimeout() {
      if (!refreshTimeout) return;
      window.clearTimeout(refreshTimeout);
      refreshTimeout = null;
    }

    function queueRefresh() {
      if (document.visibilityState === "hidden") {
        refreshDeferredUntilVisible = true;
        clearRefreshTimeout();
        return;
      }

      if (refreshTimeout) return;

      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        router.refresh();
      }, notificationRefreshDebounceMs);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        if (refreshTimeout) {
          refreshDeferredUntilVisible = true;
          clearRefreshTimeout();
        }
        return;
      }

      if (!refreshDeferredUntilVisible) return;
      refreshDeferredUntilVisible = false;
      queueRefresh();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const supabase = createSupabaseBrowserClient({
      supabaseAnonKey,
      supabaseUrl,
    });
    const channel = supabase
      .channel(`notifications:${memberId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `member_id=eq.${memberId}`,
        },
        queueRefresh,
      )
      .subscribe();

    return () => {
      clearRefreshTimeout();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [memberId, refreshDisabled, router, supabaseAnonKey, supabaseUrl]);

  return null;
}
