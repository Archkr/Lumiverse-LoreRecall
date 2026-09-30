import assert from "node:assert/strict";
import type { LlmMessageDTO, WorldBookEntryDTO } from "lumiverse-spindle-types";
import { RecallRunStore, injectPreparedRecall, restoreLumiBooksStoredFlags, type PreparedRecallRun } from "../src/backend/activation";

// Optional integration check against an actual LumiBooks checkout. The normal
// test suite stays independent of whether that separate repository is installed.
const source = process.argv[2] ?? new URL("../../LumiBooks/src/backend/injection.ts", import.meta.url).pathname;
if (!await Bun.file(source).exists()) throw new Error("Pass the path to LumiBooks/src/backend/injection.ts.");
const { buildInjection } = await import(source);
const rows = ["a", "b", "ghost"].map((id, index) => ({
  id, world_book_id: "book", comment: id, content: "Summary " + id, key: ["query"],
  disabled: id === "ghost", constant: false, position: 0, role: "system", depth: 0,
  extensions: { lumibooks: { chatId: "chat", tier: 1, msgIds: [id + "-source"], firstMsgIdx: index, lastMsgIdx: index } },
})) as WorldBookEntryDTO[];
const book = { id: "book", metadata: { lumibooks_chat_id: "chat" } };
const history = ["a", "b", "ghost", "latest"].map((id, index) => ({
  role: "user", content: "Original " + id, __isChatHistory: true, sourceMessageId: id + "-source",
  sourceIndexInChat: index, sourceMessageMetadata: {},
})) as LlmMessageDTO[];
const messages: LlmMessageDTO[] = [{ role: "system", content: "Preset" }, ...history, { role: "system", content: "Suffix" }];
const previous = (globalThis as any).spindle;
(globalThis as any).spindle = {
  chats: { get: async () => ({ metadata: { lumibooks_book_id: "book" } }) },
  chat: { getMessages: async () => history.map((message: any) => ({ ...message, id: message.sourceMessageId, metadata: {} })) },
  world_books: {
    get: async () => book,
    entries: { list: async () => ({ data: rows, total: rows.length }) },
  },
};

function prepared(ids: string[]): PreparedRecallRun {
  return { id: "run", userId: "user", chatId: "chat", createdAt: Date.now(), handledBookIds: ["book"],
    entries: rows.filter((entry) => ids.includes(entry.id)),
    sourceContents: Object.fromEntries(rows.filter((entry) => ids.includes(entry.id)).map((entry) => [entry.id, entry.content])),
    lumiBooksEntries: structuredClone(rows), sourceMessageIndexes: Object.fromEntries(history.map((message: any, index) => [message.sourceMessageId, index])),
    preview: {} as any, runtimeBooks: [], sessionId: "session", status: "prepared" };
}

try {
  const native = await buildInjection("chat", messages, "user", {
    capturedWorldInfo: rows.map((entry) => ({ id: entry.id })), worldInfoActivationCapture: true,
  });
  assert.deepEqual(native.messages.map((message: any) => message.content), [
    "Preset", "Summary a", "Summary b", "Original ghost", "Original latest", "Suffix",
  ]);
  const run = prepared(["a"]);
  const store = new RecallRunStore();
  store.put(run);
  const temporaryVote = rows.map((entry) => ({ ...entry, disabled: true }));
  assert.equal(store.claim("user", "chat", restoreLumiBooksStoredFlags(run, temporaryVote, rows)).run?.status, "claimed");
  const controlled = injectPreparedRecall(native.messages, run);
  assert.deepEqual(controlled.messages.map((message) => message.content), [
    "Preset", "Summary a", "Original ghost", "Original latest", "Suffix",
  ]);
  assert.equal(controlled.removedLumiBooksCount, 2);
  assert.equal(controlled.messages[1].role, "assistant");
  assert.equal(controlled.breakdown.length, 1);
  assert.deepEqual(injectPreparedRecall(native.messages, prepared([])).messages.map((message) => message.content), [
    "Preset", "Original ghost", "Original latest", "Suffix",
  ]);
  const partial = await buildInjection("chat", messages, "user", {
    capturedWorldInfo: [{ id: "a" }], worldInfoActivationCapture: true,
  });
  assert.deepEqual(injectPreparedRecall(partial.messages, prepared(["b"])).messages.map((message) => message.content), [
    "Preset", "Summary b", "Original ghost", "Original latest", "Suffix",
  ]);
  assert.throws(() => restoreLumiBooksStoredFlags(run, temporaryVote, rows.map((entry) => entry.id === "a" ? { ...entry, disabled: true } : entry)), /changed/);
  console.log("Actual LumiBooks injector verified: selected and empty results, partial native activation, timeline placement, disabled entries, and temporary suppression.");
} finally {
  (globalThis as any).spindle = previous;
}
