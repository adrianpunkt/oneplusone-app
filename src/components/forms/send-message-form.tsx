"use client";

import {
  type KeyboardEvent,
  useActionState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { Send } from "lucide-react";

import { ActionStatus } from "@/components/forms/action-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessageAction, type MessageActionState } from "@/lib/actions/messages";

const initialState: MessageActionState = {};
const maxComposerRows = 5;

export function SendMessageForm({ conversationId }: { conversationId: string }) {
  const [state, action] = useActionState(sendMessageAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeComposer = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const styles = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(styles.lineHeight) || 24;
    const verticalPadding =
      parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const verticalBorder =
      parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
    const maxHeight = lineHeight * maxComposerRows + verticalPadding + verticalBorder;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [resizeComposer]);

  useEffect(() => {
    if (!state.ok) return;

    formRef.current?.reset();
    window.requestAnimationFrame(resizeComposer);
  }, [resizeComposer, state]);

  const submitWithShortcut = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    const shouldSubmit =
      (event.metaKey || event.ctrlKey) &&
      (event.key === "Enter" || event.key === "NumpadEnter" || event.code === "NumpadEnter");

    if (!shouldSubmit) return;

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }, []);

  return (
    <form action={action} className="grid shrink-0 gap-0" ref={formRef}>
      <input type="hidden" name="conversation_id" value={conversationId} />
      <div className="relative">
        <Textarea
          className="min-h-14 resize-none overflow-hidden !rounded-none !border-0 !bg-transparent pb-3 pl-4 pr-16 pt-3 text-base leading-6 !shadow-none focus-visible:!border-transparent focus-visible:!ring-0"
          maxLength={2000}
          name="body"
          onKeyDown={submitWithShortcut}
          onInput={resizeComposer}
          placeholder="Write a message..."
          ref={textareaRef}
          required
          rows={1}
        />
        <SubmitButton
          aria-label="Send message"
          className="absolute bottom-2 right-3 h-10 w-10 rounded-full p-0 shadow-sm"
          pendingLabel={<Send className="h-4 w-4" />}
          size="icon"
          title="Send message"
        >
          <Send className="h-4 w-4" />
        </SubmitButton>
      </div>
      <ActionStatus
        error={state.error}
        ok={state.ok}
        successMessage="Message sent."
        toastKey={state}
      />
    </form>
  );
}
