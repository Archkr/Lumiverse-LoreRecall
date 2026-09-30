import { describe, expect, test } from "bun:test";
import type { LlmMessageDTO, WorldBookEntryDTO } from "lumiverse-spindle-types";
import type { RetrievalPreview } from "../types";
import type { RuntimeBook } from "./contracts";
import { finalizeRecallActivation, injectPreparedRecall, injectRecallEntries, markRecallNativeFallback, RecallRunStore, restoreLumiBooksStoredFlags, suppressedNativeEntryIds, type PreparedRecallRun } from "./activation";

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
  function summary(id: string, patch: Partial<WorldBookEntryDTO> = {}): WorldBookEntryDTO {
    return { ...entry(id), disabled: false, extensions: { lumibooks: { chatId: "chat", tier: 1, msgIds: [id + "-source"] } }, ...patch };
  }

  test("LumiBooks handoff removes unselected automatic summaries, replaces selected ones once, and protects unrelated messages", () => {
    const picked = summary("picked");
    const rejected = summary("rejected");
    const nativeBook = { ...summary("native"), world_book_id: "unselected" };
    const prepared = { ...run("summaries", [picked]), lumiBooksEntries: [picked, rejected],
      sourceMessageIndexes: { "picked-source": 0, "rejected-source": 1, "latest": 2 } };
    const protectedHistory = { role: "assistant" as const, content: rejected.content, __isChatHistory: true, sourceMessageId: "history" };
    const protectedWorldInfo = { role: "assistant" as const, content: rejected.content, __isWorldInfoEntry: true };
    const protectedNote = { role: "system" as const, content: rejected.content };
    const result = injectPreparedRecall([
      { role: "system", content: "Preset" },
      { role: "assistant", content: picked.content },
      { role: "assistant", content: rejected.content },
      { role: "assistant", content: nativeBook.content },
      protectedHistory, protectedWorldInfo, protectedNote,
      { role: "user", content: "Latest", __isChatHistory: true, sourceMessageId: "latest", sourceIndexInChat: 2 },
    ] as LlmMessageDTO[], prepared);
    expect(result.removedLumiBooksCount).toBe(2);
    expect(result.messages.filter((message) => message.content === picked.content)).toEqual([{ role: "assistant", content: picked.content }]);
    expect(result.messages).toContain(protectedHistory);
    expect(result.messages).toContain(protectedWorldInfo);
    expect(result.messages).toContain(protectedNote);
    expect(result.messages.map((message) => message.content)).toContain(nativeBook.content);
    expect(result.breakdown).toEqual([{ messageIndex: 1, name: "Lore Recall: Entry picked [LumiBooks timeline]" }]);
  });

  test("a valid empty selection removes automatic summaries from handled books and leaves other books alone", () => {
    const picked = summary("picked");
    const prepared = { ...run("empty", []), lumiBooksEntries: [picked] };
    const history = { role: "user" as const, content: "Latest", __isChatHistory: true };
    const result = injectPreparedRecall([
      { role: "assistant", content: picked.content }, { role: "assistant", content: "Unselected book summary" }, history,
    ] as LlmMessageDTO[], prepared);
    expect(result.messages).toEqual([{ role: "assistant", content: "Unselected book summary" }, history]);
    expect(result.breakdown).toEqual([]);
    expect(result.removedLumiBooksCount).toBe(1);
  });

  test("selected summaries absent from native activation replace their covered turns at the timeline position", () => {
    const child = summary("child", { disabled: true });
    const arc = summary("arc", { extensions: { lumibooks: { chatId: "chat", tier: 2,
      msgIds: [], sourceChapterEntryIds: ["child", "arc"] } } });
    const prepared = { ...run("arc", [arc]), lumiBooksEntries: [child, arc],
      sourceMessageIndexes: { "child-source": 0, "latest": 1 } };
    const result = injectPreparedRecall([
      { role: "system", content: "Preset" },
      { role: "user", content: "Covered old turn", __isChatHistory: true, sourceMessageId: "child-source", sourceIndexInChat: 0 },
      { role: "user", content: "Latest", __isChatHistory: true, sourceMessageId: "latest", sourceIndexInChat: 1 },
      { role: "system", content: "Suffix" },
    ] as LlmMessageDTO[], prepared);
    expect(result.messages.map((message) => message.content)).toEqual(["Preset", arc.content, "Latest", "Suffix"]);
    expect(result.messages[1].role).toBe("assistant");
    expect(result.removedLumiBooksCount).toBe(0);
  });

  test("summary snapshots reject persisted disables, content changes, new summaries, and stale metadata before native suppression", () => {
    for (const change of ["disabled", "content", "metadata", "new"]) {
      const picked = summary("picked");
      const store = new RecallRunStore();
      store.put({ ...run(change, [picked]), lumiBooksEntries: [structuredClone(picked)] });
      const current = structuredClone(picked);
      if (change === "disabled") current.disabled = true;
      if (change === "content") current.content = "Changed summary";
      if (change === "metadata") (current.extensions!.lumibooks as any).msgIds = ["changed-source"];
      const claim = store.claim("user", "chat", [current, ...(change === "new" ? [summary("new")] : [])]);
      expect(claim.run).toBeNull();
      expect(claim.reason).toBe("A LumiBooks summary changed before Recall could take over.");
    }
    const picked = summary("picked");
    const store = new RecallRunStore();
    store.put({ ...run("valid", [picked]), lumiBooksEntries: [picked] });
    expect(store.claim("user", "chat", [picked]).run?.status).toBe("claimed");
  });

  test("saved flags restore only LumiBooks' temporary suppression, preserving Codex and other interceptor disables", () => {
    const picked = summary("picked");
    const ghost = summary("ghost", { disabled: true });
    const prepared = { ...run("flags", [picked]), lumiBooksEntries: [picked, ghost] };
    const incoming = [
      { ...picked, disabled: true }, ghost,
      { ...entry("codex"), disabled: true, extensions: { lumibooks_codex: { record: "character:alice" } } },
      { ...entry("other"), disabled: true },
    ];
    const restored = restoreLumiBooksStoredFlags(prepared, incoming, [picked, ghost]);
    expect(restored.map((entry) => entry.disabled)).toEqual([false, true, true, true]);
    expect(incoming[0].disabled).toBe(true);
    expect(() => restoreLumiBooksStoredFlags(prepared, incoming, [{ ...picked, disabled: true }, ghost])).toThrow("changed");
    expect(() => restoreLumiBooksStoredFlags(prepared, incoming, [{ ...picked, constant: true }, ghost])).toThrow("changed");
  });

  test("adjacent summaries retain timeline order even when the model selects them in reverse", () => {
    const early = summary("early");
    const late = summary("late");
    const prepared = { ...run("order", [late, early]), lumiBooksEntries: [early, late],
      sourceMessageIndexes: { "early-source": 0, "late-source": 1, "latest": 2 } };
    const result = injectPreparedRecall([
      { role: "assistant", content: early.content }, { role: "assistant", content: late.content },
      { role: "user", content: "Latest", __isChatHistory: true, sourceMessageId: "latest", sourceIndexInChat: 2 },
    ] as LlmMessageDTO[], prepared);
    expect(result.messages.map((message) => message.content)).toEqual([early.content, late.content, "Latest"]);
  });
  test("suppression includes LumiBooks summaries only in handled books", () => {
    expect(suppressedNativeEntryIds(run("mixed"), [
      { id: "chosen", world_book_id: "managed" },
      { id: "chapter", world_book_id: "managed", extensions: { lumibooks: { chatId: "chat", tier: 1 } } },
      { id: "codex", world_book_id: "managed", extensions: { lumibooks_codex: { record: "character:alice" } } },
      { id: "other", world_book_id: "unselected" },
    ])).toEqual(["chosen", "chapter", "codex"]);
  });
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
      entry("before", 0, "user"),
      entry("after", 1, "user"),
      entry("depth-one", 4, "assistant", 1),
      entry("depth-zero", 4, "system", 0),
    ]);
    expect(result.messages.map((message) => message.content)).toEqual([
      "Preset", "Content before", "Earlier", "Reply",
      "Content depth-one", "Latest", "Content after", "Content depth-zero",
    ]);
    expect(result.messages[1].role).toBe("user");
    expect(result.messages[4].role).toBe("assistant");
    expect(result.breakdown.map((item) => item.messageIndex)).toEqual([1, 4, 6, 7]);
  });

  test("AN and EM entries keep their role and native before/after-first-turn placement", () => {
    const messages = [
      { role: "system", content: "Preset" },
      { role: "user", content: "First", __chatHistorySource: true },
      { role: "system", content: "Existing depth note" },
      { role: "assistant", content: "Second", __chatHistorySource: true },
      { role: "system", content: "Suffix" },
    ] as LlmMessageDTO[];
    const result = injectRecallEntries(messages, [
      entry("an-before", 2, "assistant"), entry("an-after", 3, "assistant"),
      entry("em-before", 5, "user"), entry("em-after", 6, "system"),
      entry("after", 1, "assistant"),
    ]);
    expect(result.messages.map((message) => message.content)).toEqual([
      "Preset", "Content an-before", "Content em-before", "First", "Content an-after", "Content em-after",
      "Existing depth note", "Second", "Content after", "Suffix",
    ]);
    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[4].role).toBe("assistant");
    expect(result.breakdown[0].name).toContain("Lore Recall:");
    expect(result.breakdown[1].name).toContain("EM before");
    expect(result.breakdown[2].name).toContain("AN after");
    for (const item of result.breakdown) expect(result.messages[item.messageIndex].content).toStartWith("Content ");
    expect(messages.map((message) => message.content)).toEqual(["Preset", "First", "Existing depth note", "Second", "Suffix"]);
  });

  test("placement without chat history keeps before at the start and other entries at the end", () => {
    const result = injectRecallEntries([{ role: "system", content: "Preset" }], [
      entry("before", 0), entry("after", 1), entry("an-after", 3), entry("marker", 7),
    ]);
    expect(result.messages.map((message) => message.content)).toEqual([
      "Content before", "Preset", "Content after", "Content an-after", "Content marker",
    ]);
  });
});
