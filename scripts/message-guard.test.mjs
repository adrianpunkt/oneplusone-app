import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { isConversationWaitingForReply } from "../src/lib/message-conversation.ts";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const messageActionsSource = await readFile(
  new URL("../src/lib/actions/messages.ts", import.meta.url),
  "utf8",
);
const messageEmailDeliverySource = await readFile(
  new URL("../src/lib/message-email-delivery.ts", import.meta.url),
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
    /exists\s*\([\s\S]*from public\.messages[\s\S]*conversation_id = conversation_record\.id[\s\S]*sender_member_id = current_member_id_value[\s\S]*deleted_at is null[\s\S]*\)/i,
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

test("send_message opens a pending conversation when the recipient replies", () => {
  assert.match(
    definition,
    /else[\s\S]*update public\.conversations\s+set status = 'open'[\s\S]*conversation_record\.status := 'open'/i,
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
