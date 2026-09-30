import { describe, expect, test } from "bun:test";
import type { LlmMessageDTO, WorldBookEntryDTO } from "lumiverse-spindle-types";
import type { RetrievalPreview } from "../types";
import type { RuntimeBook } from "./contracts";
import { finalizeRecallActivation, injectRecallEntries, markRecallNativeFallback, RecallRunStore, suppressedNativeEntryIds, type PreparedRecallRun } from "./activation";

function entry(id: string, position = 0, role: string | null = null, depth = 0): WorldBookEntryDTO {
  return {
    id, world_book_id: "managed", content: "Content " + id,
    comment: "Entry " + id, position, role, depth,
  } as WorldBookEntryDTO;
}

function run(id: string, entries: WorldBookEntryDTO[] = [entry("chosen")]): PreparedRecallRun {
  return {
    id, userId: "user", chatId: "chat", createdAt: Date.now(),
    handledBookIds: ["managed"], entries,
    sourceContents: Object.fromEntries(entries.map((item) => [item.id, item.content])),
    preview: {} as RetrievalPreview, runtimeBooks: [] as RuntimeBook[],
    sessionId: "session-" + id, status: "prepared",
  };
}

describe("extension-managed activation", () => {
  test("activation counts and text agree with surviving entries, and native fallback clears only activation", () => {
    const dynamic = { entryId: "dynamic", reasons: ["model_selected"] };
    const constant = { entryId: "constant", reasons: ["constant"] };
    const preview = { injectedNodes: [dynamic, constant], reservedConstantNodes: [constant],
      modelSelectedEntries: [dynamic], trace: [], steps: [] } as unknown as RetrievalPreview;
    finalizeRecallActivation(preview, [{ id: "dynamic", content: "Dynamic lore" }, { id: "constant", content: "Constant lore" }]);
    expect(preview.selectionSummary).toBe("Activated 1 dynamic, 1 constant entries.");
    expect(preview.injectedText).toBe("Dynamic lore\n\nConstant lore");
    expect(preview.injectedNodes).toHaveLength(2);
    expect(preview.trace.at(-1)?.label).toBe("Recall activation");
    markRecallNativeFallback(preview, "Model retrieval failed.");
    expect(preview.injectedNodes).toEqual([]);
    expect(preview.injectedText).toBe("");
    expect(preview.estimatedTokens).toBe(0);
    expect(preview.selectionSummary).toBe("Native fallback; Recall activated no entries.");
    expect(preview.preparedNodes).toHaveLength(2);
    expect(preview.modelSelectedEntries).toHaveLength(1);
  });
  test("a completed empty selection still suppresses managed books", () => {
    const store = new RecallRunStore();
    store.put(run("empty", []));
    const claim = store.claim("user", "chat", []);
    expect(claim.run?.status).toBe("claimed");
    expect(suppressedNativeEntryIds(claim.run!, [
      { id: "constant", world_book_id: "managed" },
      { id: "unselected", world_book_id: "managed" },
      { id: "native", world_book_id: "unreadable" },
    ])).toEqual(["constant", "unselected"]);
    expect(injectRecallEntries([{ role: "user", content: "Hello" }], []).messages)
      .toEqual([{ role: "user", content: "Hello" }]);
  });

  test("changed, disabled, or missing picks stay on the native path", () => {
    for (const available of [
      [],
      [{ id: "chosen", content: "Changed" }],
      [{ id: "chosen", content: "Content chosen", disabled: true }],
    ]) {
      const store = new RecallRunStore();
      store.put(run("changed"));
      const claim = store.claim("user", "chat", available);
      expect(claim.run).toBeNull();
      expect(claim.rejected[0]?.status).toBe("native");
    }
  });

  test("overlapping preparations cannot claim each other's selection", () => {
    const store = new RecallRunStore();
    store.put(run("first"));
    store.put(run("second"));
    const claim = store.claim("user", "chat", [{ id: "chosen", content: "Content chosen" }]);
    expect(claim.run).toBeNull();
    expect(claim.rejected.map((item) => item.status)).toEqual(["native", "native"]);
  });

  test("a failed turn cannot reuse a cancelled turn's prepared picks", () => {
    const store = new RecallRunStore();
    store.put(run("cancelled"));
    store.begin("failed", "user", "chat");
    store.stayNative("failed");
    expect(store.claim("user", "chat", [{ id: "chosen", content: "Content chosen" }]).run).toBeNull();
    store.put(run("next"));
    expect(store.claim("user", "chat", [{ id: "chosen", content: "Content chosen" }]).run?.id).toBe("next");
  });

  test("a late preparation cannot take over after native activation has started", () => {
    const store = new RecallRunStore();
    store.begin("late", "user", "chat");
    expect(store.claim("user", "chat", []).run).toBeNull();
    expect(store.put(run("late"))).toBe(false);
    expect(store.isPassThrough("late")).toBe(true);
  });

  test("resolved macro text is injected while the original content is validated", () => {
    const store = new RecallRunStore();
    const prepared = run("macros", [{ ...entry("chosen"), content: "Hello {{char}}" }]);
    prepared.entries = [{ ...prepared.entries[0], content: "Hello Alice" }];
    store.put(prepared);
    const claimed = store.claim("user", "chat", [{ id: "chosen", content: "Hello {{char}}" }]);
    expect(claimed.run).not.toBeNull();
    expect(injectRecallEntries([], claimed.run!.entries).messages[0].content).toBe("Hello Alice");
  });

  test("preserves stored roles and places chat-depth entries near history", () => {
    const messages = [
      { role: "system", content: "Preset" },
      { role: "user", content: "Earlier", __isChatHistory: true },
      { role: "assistant", content: "Reply", __isChatHistory: true },
      { role: "user", content: "Latest", __isChatHistory: true },
    ] as LlmMessageDTO[];
    const result = injectRecallEntries(messages, [
      entry("before", 0),
      entry("prehistory", 1, "user"),
      entry("depth-one", 4, "assistant", 1),
      entry("depth-zero", 4, "system", 0),
    ]);
    expect(result.messages.map((message) => message.content)).toEqual([
      "Content before", "Preset", "Content prehistory", "Earlier", "Reply",
      "Content depth-one", "Latest", "Content depth-zero",
    ]);
    expect(result.messages[2].role).toBe("user");
    expect(result.messages[5].role).toBe("assistant");
    expect(result.breakdown.map((item) => item.messageIndex)).toEqual([0, 2, 5, 7]);
  });
});
