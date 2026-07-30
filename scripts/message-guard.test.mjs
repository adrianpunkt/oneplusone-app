import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { isConversationWaitingForReply } from "../src/lib/message-conversation.ts";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);

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

  assert.ok(rejection >= 0, "Pending initiator rejection is missing");
  assert.ok(
    rejection < messageInsert,
    "A second initiator message must be rejected before insertion",
  );
});

test("send_message opens a pending conversation when the recipient replies", () => {
  assert.match(
    definition,
    /else[\s\S]*update public\.conversations set status = 'open'[\s\S]*conversation_record\.status := 'open'/i,
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
