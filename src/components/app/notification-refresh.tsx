"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createSupabaseBrowserClient,
  type SupabaseBrowserConfig,
} from "@/lib/supabase/client";

export function NotificationRefresh({
  memberId,
  supabaseConfig,
}: {
  memberId: string;
  supabaseConfig: SupabaseBrowserConfig;
}) {
  const router = useRouter();
  const { supabaseAnonKey, supabaseUrl } = supabaseConfig;

  useEffect(() => {
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
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [memberId, router, supabaseAnonKey, supabaseUrl]);

  return null;
}
