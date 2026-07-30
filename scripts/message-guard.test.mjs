import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  isConversationWaitingForReply,
  shouldShowIncomingFirstMessageNotice,
} from "../src/lib/message-conversation.ts";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const messageActionsSource = await readFile(
  new URL("../src/lib/actions/messages.ts", import.meta.url),
  "utf8",
);
const messageEmailDeliverySource = await readFile(
  new URL("../src/lib/message-email-delivery.ts", import.meta.url),
  "utf8",
);
const incomingFirstMessageDialogSource = await readFile(
  new URL(
    "../src/components/messages/incoming-first-message-dialog.tsx",
    import.meta.url,
  ),
  "utf8",
);
const firstMessageResponseActionsSource = await readFile(
  new URL(
    "../src/components/messages/first-message-response-actions.tsx",
    import.meta.url,
  ),
  "utf8",
);
const reportConversationMemberButtonSource = await readFile(
  new URL(
    "../src/components/messages/report-conversation-member-button.tsx",
    import.meta.url,
  ),
  "utf8",
);
const conversationPageSource = await readFile(
  new URL(
    "../src/app/(app)/messages/[conversationId]/page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const eventConnectPageSource = await readFile(
  new URL(
    "../src/app/(app)/events/[id]/connect/page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const firstMessageInfoDialogSource = await readFile(
  new URL(
    "../src/components/messages/first-message-info-dialog.tsx",
    import.meta.url,
  ),
  "utf8",
);
const newMessagePageSource = await readFile(
  new URL("../src/app/(app)/messages/new/page.tsx", import.meta.url),
  "utf8",
);
const messagesPageSource = await readFile(
  new URL("../src/app/(app)/messages/page.tsx", import.meta.url),
  "utf8",
);
const portalDataSource = await readFile(
  new URL("../src/lib/data/portal.ts", import.meta.url),
  "utf8",
);
const loopsSource = await readFile(
  new URL("../src/lib/loops.ts", import.meta.url),
  "utf8",
);
const messageEmailLmx = await Promise.all(
  ["en", "es"].map(async (locale) => ({
    locale,
    source: await readFile(
      new URL(
        `../docs/messages/loops-lmx/new-message-${locale}.lmx`,
        import.meta.url,
      ),
      "utf8",
    ),
  })),
);

async function latestSendMessageDefinition() {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  let latestDefinition = "";
  let latestFilename = "";
  let migrationCorpus = "";

  for (const filename of filenames) {
    const migration = await readFile(
      new URL(filename, migrationsDirectory),
      "utf8",
    );
    migrationCorpus += `\n${migration}`;
    const starts = [
      ...migration.matchAll(
        /create or replace function public\.send_message\s*\(/gi,
      ),
    ];

    for (const match of starts) {
      const start = match.index;
      const end = migration.indexOf("\n$$;", start);
      assert.ok(end > start, `${filename} has an incomplete send_message definition`);
      latestDefinition = migration.slice(start, end);
      latestFilename = filename;
    }
  }

  assert.ok(latestDefinition, "No send_message database function was found");
  return {
    definition: latestDefinition,
    filename: latestFilename,
    migrationCorpus,
  };
}

const { definition, filename, migrationCorpus } =
  await latestSendMessageDefinition();
const hardeningMigration = await readFile(
  new URL(
    "../supabase/migrations/20260730235930_harden_member_messaging.sql",
    import.meta.url,
  ),
  "utf8",
);
const recipientSafetyMigration = await readFile(
  new URL(
    "../supabase/migrations/20260731000000_first_message_recipient_safety.sql",
    import.meta.url,
  ),
  "utf8",
);
const recipientAccessMigration = await readFile(
  new URL(
    "../supabase/migrations/20260731001000_allow_first_message_recipient_access.sql",
    import.meta.url,
  ),
  "utf8",
);
const feedbackGateMigration = await readFile(
  new URL(
    "../supabase/migrations/20260731002000_restore_message_feedback_gate.sql",
    import.meta.url,
  ),
  "utf8",
);
const conversationReportingMigration = await readFile(
  new URL(
    "../supabase/migrations/20260731003000_persistent_conversation_reporting.sql",
    import.meta.url,
  ),
  "utf8",
);
const archiveConversationMigration = await readFile(
  new URL(
    "../supabase/migrations/20260731011000_archive_unanswered_conversations.sql",
    import.meta.url,
  ),
  "utf8",
);
const deliveryTableStart = migrationCorpus.lastIndexOf(
  "create table if not exists public.message_email_deliveries",
);
const deliveryTableEnd = migrationCorpus.indexOf("\n);", deliveryTableStart);
const deliveryTableDefinition = migrationCorpus.slice(
  deliveryTableStart,
  deliveryTableEnd,
);

test(`send_message in ${filename} locks the conversation before enforcing limits`, () => {
  const conversationLookup = definition.indexOf("from public.conversations");
  const conversationLock = definition.indexOf("for update", conversationLookup);
  const messageInsert = definition.indexOf("insert into public.messages");

  assert.ok(conversationLookup >= 0, "Conversation lookup is missing");
  assert.ok(conversationLock > conversationLookup, "Conversation row must be locked");
  assert.ok(
    conversationLock < messageInsert,
    "Conversation must be locked before inserting a message",
  );
});

test("send_message rejects a forged second message from the pending initiator", () => {
  assert.match(
    definition,
    /conversation_record\.status = 'pending'[\s\S]*conversation_record\.initiated_by_member_id = current_member_id_value/i,
  );
  assert.match(
    definition,
    /exists\s*\([\s\S]*from public\.conversations as pending_conversations[\s\S]*join public\.messages as initial_messages[\s\S]*pending_conversations\.status = 'pending'[\s\S]*pending_conversations\.initiated_by_member_id\s*= current_member_id_value[\s\S]*pending_conversations\.recipient_member_id\s*= conversation_record\.recipient_member_id[\s\S]*initial_messages\.sender_member_id = current_member_id_value[\s\S]*\)/i,
  );
  assert.doesNotMatch(
    definition,
    /sender_member_id = current_member_id_value\s+and deleted_at is null/i,
  );

  const rejection = definition.indexOf(
    "You can send one first message. If they reply, the conversation opens.",
  );
  const messageInsert = definition.indexOf("insert into public.messages");
  const deliveryInsert = definition.indexOf(
    "insert into public.message_email_deliveries",
  );

  assert.ok(rejection >= 0, "Pending initiator rejection is missing");
  assert.ok(
    rejection < messageInsert,
    "A second initiator message must be rejected before insertion",
  );
  assert.ok(
    rejection < deliveryInsert,
    "A rejected message must not queue an email delivery",
  );
});

test("send_message rechecks attended feedback and explicit conversation membership", () => {
  assert.match(
    definition,
    /current_member_id_value in \(\s*conversations\.initiated_by_member_id,\s*conversations\.recipient_member_id\s*\)/i,
  );
  assert.match(
    definition,
    /not public\.member_attended_past_event\(\s*current_member_id_value,\s*conversation_record\.event_id\s*\)/i,
  );
});

test("send_message serializes the member pair across different shared events", () => {
  const pairLock = definition.indexOf("pg_catalog.pg_advisory_xact_lock");
  const conversationLock = definition.indexOf("for update");
  const pendingPairCheck = definition.indexOf(
    "from public.conversations as pending_conversations",
  );

  assert.ok(pairLock >= 0, "The unordered member-pair lock is missing");
  assert.ok(
    pairLock < conversationLock,
    "The pair must be locked before the conversation row",
  );
  assert.ok(
    conversationLock < pendingPairCheck,
    "The pair-wide unanswered-message check must run after both locks",
  );
});

test("send_message opens a pending conversation when the recipient replies", () => {
  assert.match(
    definition,
    /else[\s\S]*update public\.conversations\s+set status = 'open'[\s\S]*conversation_record\.status := 'open'/i,
  );
});

test("attendee discovery requires the caller's attended feedback", () => {
  assert.match(
    hardeningMigration,
    /create or replace function public\.get_past_event_attendees[\s\S]*public\.member_attended_past_event\(\s*public\.current_active_member_id\(\),\s*p_event_id\s*\)/i,
  );
  assert.doesNotMatch(
    hardeningMigration,
    /split_part\(members\.email/i,
  );
});

test("conversation reads remain locked until attended feedback", () => {
  assert.match(
    hardeningMigration,
    /create or replace function public\.is_conversation_participant[\s\S]*participants\.member_id in \(\s*conversations\.initiated_by_member_id,\s*conversations\.recipient_member_id\s*\)[\s\S]*public\.member_attended_past_event/i,
  );
  assert.match(
    recipientAccessMigration,
    /conversations\.recipient_member_id = p_member_id[\s\S]*invitations\.seat_status = 'confirmed'[\s\S]*initial_messages\.sender_member_id\s*= conversations\.initiated_by_member_id/i,
  );
  assert.match(
    feedbackGateMigration,
    /create or replace function public\.member_can_access_received_conversation[\s\S]*select false;/i,
  );
});

test("the locked message page explains the feedback requirement without exposing content", () => {
  assert.match(
    definition,
    /if not public\.member_attended_past_event[\s\S]*and not public\.member_can_access_received_conversation/i,
  );
  assert.match(
    portalDataSource,
    /getConversationFeedbackGate[\s\S]*conversation\.initiated_by_member_id !== memberId[\s\S]*conversation\.recipient_member_id !== memberId[\s\S]*event_feedback[\s\S]*event_invitations/i,
  );
  assert.match(
    conversationPageSource,
    /getConversationFeedbackGate[\s\S]*feedbackRequiredMessageDescription[\s\S]*feedbackAction/i,
  );
  assert.match(
    conversationPageSource,
    /href=\{`\/events\/\$\{encodeURIComponent\(feedbackGate\.eventId\)\}\/feedback`\}/,
  );
});

test("feedback-locked incoming messages remain in the navigation badge", () => {
  assert.match(
    portalDataSource,
    /getRecipientConversationFeedbackState[\s\S]*recipient_member_id[\s\S]*event_feedback[\s\S]*event_invitations/i,
  );
  assert.match(
    portalDataSource,
    /feedbackLockedConversationIds\.has\(conversationId\)[\s\S]*wasReadBeforeFeedback[\s\S]*new Date\(latestMessage\.created_at\)/i,
  );
  assert.match(
    portalDataSource,
    /recipientConversationHrefs[\s\S]*\.in\("href", recipientConversationHrefs\)/i,
  );
});

test("feedback submission does not clear a message read only before it unlocked", () => {
  assert.match(
    portalDataSource,
    /feedbackSubmittedAtByConversationId[\s\S]*feedback\.submitted_at/i,
  );
  assert.match(
    portalDataSource,
    /wasReadBeforeFeedback[\s\S]*new Date\(lastReadAt\) < new Date\(feedbackSubmittedAt\)/i,
  );
  assert.match(
    portalDataSource,
    /attachLastMessages[\s\S]*isIncomingMessageUnread/i,
  );
});

test("event attendee cards identify received messages and link to the conversation", () => {
  assert.match(
    eventConnectPageSource,
    /getConversations\(member\.id,\s*\{\s*includeLastMessage:\s*true\s*\}\)/i,
  );
  assert.match(
    eventConnectPageSource,
    /lastMessage\?\.direction === "received"[\s\S]*messageReceivedOn[\s\S]*respondToMessage/i,
  );
  assert.match(
    eventConnectPageSource,
    /conversation\s*\?\s*`\/messages\/\$\{conversation\.id\}`/i,
  );
});

test("authenticated members cannot rewrite participant keys or message rows", () => {
  assert.match(
    hardeningMigration,
    /revoke update on table public\.conversation_participants from authenticated/i,
  );
  assert.match(
    hardeningMigration,
    /grant update \(last_read_at\)\s+on table public\.conversation_participants\s+to authenticated/i,
  );
  assert.match(
    hardeningMigration,
    /revoke update on table public\.messages from authenticated/i,
  );
  assert.match(
    hardeningMigration,
    /drop policy if exists "Members can update own messages" on public\.messages/i,
  );
});

test("start_conversation serializes concurrent attempts and rechecks the event relationship", () => {
  assert.match(
    hardeningMigration,
    /create or replace function public\.start_conversation[\s\S]*member_attended_past_event\(\s*current_member_id_value,\s*p_event_id\s*\)[\s\S]*member_has_confirmed_event_seat\(\s*p_recipient_member_id,\s*p_event_id\s*\)/i,
  );
  assert.match(
    hardeningMigration,
    /pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended/i,
  );
  assert.doesNotMatch(
    hardeningMigration,
    /p_event_id::text\s*\|\|\s*':'\s*\|\|\s*least\(current_member_id_value,\s*p_recipient_member_id\)/i,
  );
});

test("member-id attendance helper is not directly callable by authenticated clients", () => {
  assert.match(
    hardeningMigration,
    /revoke all on function public\.member_attended_past_event\(uuid, uuid\)\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    hardeningMigration,
    /grant execute on function public\.member_attended_past_event\(uuid, uuid\)\s+to authenticated/i,
  );
});

test("authenticated clients cannot bypass send_message with a direct table insert", () => {
  assert.doesNotMatch(
    migrationCorpus,
    /grant\s+(?:all|[^;]*\binsert\b)[^;]*on\s+(?:table\s+)?public\.messages\s+to\s+authenticated\b/i,
  );
  assert.doesNotMatch(
    migrationCorpus,
    /create policy[^;]*on\s+public\.messages[^;]*for\s+insert[^;]*to\s+authenticated\b/i,
  );
  assert.match(
    migrationCorpus,
    /grant\s+execute\s+on\s+function\s+public\.send_message\(uuid,\s*text\)\s+to\s+authenticated\b/i,
  );
});

test("every successful message queues exactly one content-free email delivery", () => {
  const messageInsert = definition.indexOf("insert into public.messages");
  const notificationInsert = definition.indexOf(
    "insert into public.notifications",
  );
  const deliveryInserts = [
    ...definition.matchAll(
      /insert into public\.message_email_deliveries/gi,
    ),
  ];
  const deliveryInsert = deliveryInserts[0]?.index ?? -1;
  const returnValue = definition.indexOf("return jsonb_build_object");

  assert.ok(deliveryTableStart >= 0, "Message email delivery table is missing");
  assert.ok(deliveryTableEnd > deliveryTableStart, "Delivery table definition is incomplete");
  assert.equal(deliveryInserts.length, 1, "Each message must queue one delivery");
  assert.ok(messageInsert >= 0, "Message insertion is missing");
  assert.ok(notificationInsert > messageInsert, "In-app notification must follow the message");
  assert.ok(deliveryInsert > notificationInsert, "Email delivery must follow the in-app notification");
  assert.ok(returnValue > deliveryInsert, "Delivery must be queued before the RPC returns");
  assert.match(definition, /'deliveryId',\s*delivery_id/i);
  assert.match(
    deliveryTableDefinition,
    /message_id uuid not null unique references public\.messages/i,
  );
  assert.match(
    deliveryTableDefinition,
    /idempotency_key text not null unique/i,
  );
  assert.doesNotMatch(deliveryTableDefinition, /\bbody\b/i);
  assert.doesNotMatch(deliveryTableDefinition, /\bsender(?:_member_id)?\b/i);
});

test("message email deliveries are service-only", () => {
  assert.match(
    migrationCorpus,
    /revoke all on table public\.message_email_deliveries\s+from public, anon, authenticated/i,
  );
  assert.match(
    migrationCorpus,
    /grant all on table public\.message_email_deliveries to service_role/i,
  );
  assert.doesNotMatch(
    migrationCorpus,
    /grant\s+[^;]*on\s+(?:table\s+)?public\.message_email_deliveries\s+to\s+authenticated\b/i,
  );
  assert.match(
    migrationCorpus,
    /grant execute on function public\.claim_message_email_delivery\(uuid, text\)\s+to service_role/i,
  );
  assert.match(
    migrationCorpus,
    /grant execute on function public\.record_message_email_delivery_result\(uuid, boolean, text, text\)\s+to service_role/i,
  );
});

test("both message actions trigger the same delivery helper", () => {
  assert.equal(
    (
      messageActionsSource.match(
        /await deliverMessageEmailFromResult\(data\);/g,
      ) || []
    ).length,
    2,
  );
  assert.match(
    messageActionsSource,
    /start_conversation[\s\S]*await deliverMessageEmailFromResult\(data\);/i,
  );
  assert.match(
    messageActionsSource,
    /send_message[\s\S]*await deliverMessageEmailFromResult\(data\);/i,
  );
});

test("message email sends are localized, authenticated, recipient-only, and idempotent", () => {
  assert.match(
    messageEmailDeliverySource,
    /normalizeLocale\(data\.locale\)/,
  );
  assert.match(
    messageEmailDeliverySource,
    /LOOPS_TRANSACTIONAL_MESSAGE_NOTIFICATION_EN/,
  );
  assert.match(
    messageEmailDeliverySource,
    /LOOPS_TRANSACTIONAL_MESSAGE_NOTIFICATION_ES/,
  );
  assert.match(
    messageEmailDeliverySource,
    /createMemberLoginLink\(\{\s*autoSubmit:\s*true,\s*email:\s*recipientEmail,\s*locale,\s*next:\s*`\/messages\/\$\{conversationId\}`,\s*origin:\s*resolveAppOrigin\(\),\s*\}\)/m,
  );
  assert.match(
    messageEmailDeliverySource,
    /const \{\s*loginUrl:\s*ctaUrl\s*\}\s*=\s*await createMemberLoginLink/,
  );
  assert.match(
    messageEmailDeliverySource,
    /addToAudience:\s*false/,
  );
  assert.match(
    messageEmailDeliverySource,
    /dataVariables:\s*\{\s*ctaUrl,\s*firstName,\s*\}/m,
  );
  assert.match(
    messageEmailDeliverySource,
    /email:\s*recipientEmail/,
  );
  assert.match(
    messageEmailDeliverySource,
    /idempotencyKey,/,
  );
  assert.doesNotMatch(messageEmailDeliverySource, /p_body|sender_member_id/i);
  assert.match(loopsSource, /response\.status === 409[\s\S]*success:\s*true/);
});

test("message email failures are recorded without changing the message result", () => {
  assert.match(
    messageEmailDeliverySource,
    /record_message_email_delivery_result/,
  );
  assert.match(
    migrationCorpus,
    /next_status := case when coalesce\(p_succeeded, false\) then 'sent' else 'failed' end/i,
  );
  assert.match(messageEmailDeliverySource, /\[redacted-email\]/);
  assert.doesNotMatch(
    messageActionsSource,
    /const\s+\{[^}]*error[^}]*\}\s*=\s*await deliverMessageEmailFromResult/i,
  );
});

test("localized LMX exposes only firstName and ctaUrl", () => {
  for (const { locale, source } of messageEmailLmx) {
    const variables = [
      ...new Set(
        [...source.matchAll(/\{data\.([A-Za-z0-9_]+)\}/g)].map(
          (match) => match[1],
        ),
      ),
    ].sort();

    assert.deepEqual(
      variables,
      ["ctaUrl", "firstName"],
      `${locale} LMX has an unexpected variable`,
    );
    assert.doesNotMatch(source, /\{data\.(?:body|message|sender)[^}]*\}/i);
  }
});

test("the unanswered first-message notice is recipient-only and shown on every visit", () => {
  const baseInput = {
    conversation: {
      initiated_by_member_id: "initiator",
      recipient_member_id: "recipient",
      status: "pending",
    },
    memberId: "recipient",
    messages: [
      {
        deleted_at: null,
        sender_member_id: "initiator",
      },
    ],
  };

  assert.equal(shouldShowIncomingFirstMessageNotice(baseInput), true);
  assert.equal(
    shouldShowIncomingFirstMessageNotice({
      ...baseInput,
      memberId: "initiator",
    }),
    false,
  );
  assert.equal(
    shouldShowIncomingFirstMessageNotice({
      ...baseInput,
      conversation: { ...baseInput.conversation, status: "open" },
    }),
    false,
  );
  assert.doesNotMatch(
    incomingFirstMessageDialogSource,
    /acknowledgeFirstMessageNoticeAction|useTransition/,
  );
  assert.match(
    incomingFirstMessageDialogSource,
    /onClick=\{\(\) => setOpen\(false\)\}/,
  );
});

test("the first-message recipient chooses Respond or Not interested before seeing the composer", () => {
  assert.match(
    conversationPageSource,
    /isIncomingFirstMessage[\s\S]*<FirstMessageResponseActions[\s\S]*<SendMessageForm/i,
  );
  assert.match(
    firstMessageResponseActionsSource,
    /setResponding\(true\)[\s\S]*copy\.respond/i,
  );
  assert.match(
    firstMessageResponseActionsSource,
    /copy\.archiveAction[\s\S]*copy\.archiveBody[\s\S]*copy\.archiveConfirm[\s\S]*copy\.archiveCancel/i,
  );
  assert.match(
    firstMessageResponseActionsSource,
    /archiveUnansweredConversationAction\(conversationId\)[\s\S]*router\.push\("\/messages"\)/i,
  );
});

test("Not interested privately archives only an unanswered first message", () => {
  assert.match(
    archiveConversationMigration,
    /add column if not exists archived_at timestamptz/i,
  );
  assert.match(
    archiveConversationMigration,
    /create or replace function public\.archive_unanswered_conversation[\s\S]*recipient_member_id = current_member_id_value[\s\S]*conversation_record\.status <> 'pending'[\s\S]*message_count_value <> 1/i,
  );
  assert.match(
    archiveConversationMigration,
    /update public\.conversation_participants[\s\S]*archived_at = coalesce\(archived_at, archived_at_value\)[\s\S]*last_read_at = archived_at_value/i,
  );
  assert.match(
    archiveConversationMigration,
    /update public\.notifications[\s\S]*member_id = current_member_id_value[\s\S]*href = '\/messages\/' \|\| conversation_record\.id::text/i,
  );
  assert.doesNotMatch(
    archiveConversationMigration,
    /insert into public\.notifications|update public\.conversations/i,
  );
  assert.match(
    archiveConversationMigration,
    /create trigger reject_archived_conversation_message[\s\S]*before insert on public\.messages/i,
  );
});

test("empty conversation records stay hidden until the first message exists", () => {
  assert.match(
    portalDataSource,
    /const lastMessage = latestByConversationId\.get\(conversation\.id\);\s*if \(!lastMessage\) return \[\];/,
  );
  assert.match(
    newMessagePageSource,
    /getConversations\(member\.id,\s*\{\s*includeLastMessage:\s*true\s*\}\)/,
  );
});

test("archived conversations are hidden in a collapsed Archive section", () => {
  assert.match(
    portalDataSource,
    /includeParticipantState[\s\S]*attachConversationParticipantState/i,
  );
  assert.match(
    conversationPageSource,
    /isArchived[\s\S]*archivedConversationTitle/i,
  );
  assert.match(
    messagesPageSource,
    /activeConversations = conversations\.filter[\s\S]*archivedConversations = conversations\.filter/i,
  );
  assert.match(
    messagesPageSource,
    /<details className="group\/archive[\s\S]*dictionary\.messages\.archiveSection/i,
  );
  assert.doesNotMatch(
    messagesPageSource,
    /<details[^>]*group\/archive[^>]*\sopen(?:=|\s|>)/i,
  );
});

test("the sender notice opens again after returning from the event page", () => {
  assert.match(
    firstMessageInfoDialogSource,
    /router\.replace\(dismissedHref,\s*\{\s*scroll:\s*false\s*\}\)/,
  );
  assert.match(
    newMessagePageSource,
    /dismissed=\{firstMessageIntro === "dismissed"\}/,
  );
  assert.match(
    newMessagePageSource,
    /first-message-intro-dismissed[\s\S]*first-message-intro-open/,
  );
});

test("opening the report form records nothing until Submit Report", () => {
  const reportInsert = conversationReportingMigration.indexOf(
    "insert into public.message_reports",
  );
  const staffQueueInsert = conversationReportingMigration.indexOf(
    "insert into public.support_requests",
  );
  const reportReturn = conversationReportingMigration.indexOf(
    "'reportId', report_record.id",
  );
  const startReport = reportConversationMemberButtonSource.slice(
    reportConversationMemberButtonSource.indexOf("function startReport()"),
    reportConversationMemberButtonSource.indexOf("function submitReport("),
  );
  const submitReportStart =
    reportConversationMemberButtonSource.indexOf("function submitReport(");
  const submitReport = reportConversationMemberButtonSource.slice(
    submitReportStart,
    reportConversationMemberButtonSource.indexOf("\n  return (", submitReportStart),
  );

  assert.ok(reportInsert >= 0, "Report persistence is missing");
  assert.ok(
    staffQueueInsert > reportInsert,
    "The durable report must exist before staff are notified",
  );
  assert.ok(
    reportReturn > staffQueueInsert,
    "The report action must not return before staff notification is queued",
  );
  assert.doesNotMatch(
    startReport,
    /reportConversationMemberAction|addMessageReportDetailsAction/,
  );
  assert.match(
    submitReport,
    /await reportConversationMemberAction\(conversationId\)/,
  );
  assert.match(
    reportConversationMemberButtonSource,
    /type="submit"[\s\S]*copy\.detailsSubmit[\s\S]*<Dialog\.Close asChild>[\s\S]*copy\.detailsSkip/i,
  );
});

test("the first-message popup is informational and reporting stays in the top bar", () => {
  assert.doesNotMatch(
    incomingFirstMessageDialogSource,
    /reportFirstMessageAction|reportMember|<Flag/i,
  );
  assert.match(
    conversationPageSource,
    /<h1[\s\S]*flex-1[\s\S]*<ReportConversationMemberButton/i,
  );
  assert.match(
    reportConversationMemberButtonSource,
    /<Flag[\s\S]*\{copy\.action\}/i,
  );
});

test("message reports are private, participant-authorized, and visible to staff", () => {
  assert.match(
    recipientSafetyMigration,
    /revoke all on table public\.message_reports\s+from public, anon, authenticated/i,
  );
  assert.match(
    recipientSafetyMigration,
    /grant all on table public\.message_reports to service_role/i,
  );
  assert.match(
    conversationReportingMigration,
    /current_member_id_value in \(\s*initiated_by_member_id,\s*recipient_member_id\s*\)/i,
  );
  assert.match(
    conversationReportingMigration,
    /reported_member_id_value := case[\s\S]*conversation_record\.recipient_member_id[\s\S]*conversation_record\.initiated_by_member_id/i,
  );
  assert.match(
    conversationReportingMigration,
    /alter table public\.message_reports\s+alter column message_id drop not null/i,
  );
  assert.match(
    conversationReportingMigration,
    /message_reports_conversation_reporter_key[\s\S]*conversation_id,\s*reporter_member_id/i,
  );
  assert.match(
    conversationReportingMigration,
    /from public\.messages[\s\S]*sender_member_id = reported_member_id_value[\s\S]*order by created_at desc/i,
  );
  assert.match(
    conversationReportingMigration,
    /'member_message_report'[\s\S]*'Member message report'/i,
  );
  assert.match(
    conversationReportingMigration,
    /grant execute on function public\.create_conversation_member_report\(uuid\)\s+to authenticated/i,
  );
  assert.doesNotMatch(
    migrationCorpus,
    /grant\s+[^;]*on\s+(?:table\s+)?public\.message_reports\s+to\s+authenticated\b/i,
  );
});

test("optional report details update the existing report and staff queue item", () => {
  assert.match(
    conversationReportingMigration,
    /create or replace function public\.add_message_report_details[\s\S]*report_record\.reporter_member_id <> current_member_id_value/i,
  );
  assert.match(
    conversationReportingMigration,
    /update public\.message_reports[\s\S]*details = clean_details[\s\S]*details_submitted_at = now\(\)/i,
  );
  assert.match(
    conversationReportingMigration,
    /update public\.support_requests[\s\S]*message = support_message/i,
  );
});

test("the pending initiator waits after sending the first message", () => {
  assert.equal(
    isConversationWaitingForReply({
      conversation: {
        initiated_by_member_id: "initiator",
        status: "pending",
      },
      memberId: "initiator",
      messages: [
        {
          deleted_at: null,
          sender_member_id: "initiator",
        },
      ],
    }),
    true,
  );
});

test("deleting an initial message does not restore the UI send allowance", () => {
  assert.equal(
    isConversationWaitingForReply({
      conversation: {
        initiated_by_member_id: "initiator",
        status: "pending",
      },
      memberId: "initiator",
      messages: [
        {
          deleted_at: "2026-07-30T12:00:00.000Z",
          sender_member_id: "initiator",
        },
      ],
    }),
    true,
  );
});

test("the pending recipient can reply and open the conversation", () => {
  assert.equal(
    isConversationWaitingForReply({
      conversation: {
        initiated_by_member_id: "initiator",
        status: "pending",
      },
      memberId: "recipient",
      messages: [
        {
          deleted_at: null,
          sender_member_id: "initiator",
        },
      ],
    }),
    false,
  );
});

test("the initiator can write again after the recipient opens the conversation", () => {
  assert.equal(
    isConversationWaitingForReply({
      conversation: {
        initiated_by_member_id: "initiator",
        status: "open",
      },
      memberId: "initiator",
      messages: [
        {
          deleted_at: null,
          sender_member_id: "initiator",
        },
        {
          deleted_at: null,
          sender_member_id: "recipient",
        },
      ],
    }),
    false,
  );
});
