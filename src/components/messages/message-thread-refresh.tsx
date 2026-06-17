"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markConversationReadAction } from "@/lib/actions/messages";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function MessageThreadRefresh({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function markReadAndRefresh() {
      const result = await markConversationReadAction(conversationId);
      if (active && result.ok && result.changed) {
        router.refresh();
      }
    }

    void markReadAndRefresh();

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void markReadAndRefresh();
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  return null;
}
