import { expect, test } from "bun:test";
import { DEFAULT_BOOK_CONFIG, DEFAULT_CHARACTER_CONFIG, DEFAULT_GLOBAL_SETTINGS, EXTENSION_KEY } from "../shared";

test("public hooks register after permission grant and retrieve without exact-selection support", async () => {
  const previous = (globalThis as any).spindle;
  const granted = new Set(["generation", "context_handler"]);
  const hooks: Record<string, any> = {};
  let permissionChanged: (() => void) | undefined;
  let malformedSelection = false;
  let emptySelection = false;
  const modelPrompts: string[] = [];
  const bookMetadata: Record<string, Record<string, unknown>> = {};
  const selectedBooks = new Set(["character", "persona", "chat", "global"]);
  const rows = ["character", "persona", "chat", "global"].map((scope) => ({
    id: scope + "-entry", world_book_id: scope, uid: scope, comment: scope,
    key: [scope], keysecondary: [], content: "Lore for {{char}} from " + scope,
    disabled: scope === "chat", constant: scope === "global", extensions: {},
    position: scope === "character" ? 3 : 0, depth: 0, role: scope === "character" ? "assistant" : "system", order_value: 0, updated_at: 1,
  }));
  const character = { id: "card", name: "Alice", world_book_ids: ["character"], extensions: {
    [EXTENSION_KEY]: { characterConfig: { ...DEFAULT_CHARACTER_CONFIG, tokenBudget: 1 } },
  } };
  const chat = { id: "turn", character_id: "card", metadata: { chat_world_book_ids: ["chat"] } };
  const host = {
    // Public hosts have these hooks without the unpublished exact-selection
    // capability or required-interceptor support.
    contracts: { preAssemblyGenerationContext: 1 },
    permissions: {
      has: (permission: string) => granted.has(permission),
      getGranted: async () => [...granted],
      onChanged: (handler: () => void) => { permissionChanged = handler; },
    },
    registerContextHandler: (handler: unknown, _priority: number, options: unknown) => {
      hooks.prepare = handler; hooks.prepareOptions = options;
    },
    registerWorldInfoInterceptor: (handler: unknown, priority: number) => { hooks.activate = handler; hooks.activatePriority = priority; },
    registerInterceptor: (handler: unknown, _priority: number, options: unknown) => {
      hooks.inject = handler; hooks.injectOptions = options;
    },
    onFrontendMessage: () => {},
    sendToFrontend: () => {},
    log: { info: () => {}, warn: () => {}, error: () => {} },
    userStorage: {
      mkdir: async () => {}, setJson: async () => {},
      getJson: async (path: string, options: any) => path === "global/settings.json"
        ? { ...DEFAULT_GLOBAL_SETTINGS, enabled: true }
        : path.startsWith("books/") ? { ...DEFAULT_BOOK_CONFIG, enabled: selectedBooks.has(path.slice(6, -5)) } : options.fallback,
    },
    characters: { get: async () => character },
    chats: { get: async () => chat, getActive: async () => null },
    chat: { getMessages: async () => [{ role: "user", content: "Tell me about Alice" }] },
    personas: { getActive: async () => ({ attached_world_book_id: "persona" }), getDefault: async () => null },
    world_books: {
      getGlobal: async () => ["global"],
      get: async (id: string) => ({ id, name: id, description: "", updated_at: 1, metadata: bookMetadata[id] ?? {} }),
      entries: {
        list: async (id: string) => ({ data: rows.filter((entry) => entry.world_book_id === id), total: 1 }),
        get: async (id: string) => rows.find((entry) => entry.id === id),
      },
    },
    connections: { get: async () => ({ provider: "openai", model: "test" }) },
    enclave: { get: async () => null },
    macros: { resolve: async (text: string) => ({ text: text.replaceAll("{{char}}", "Alice"), diagnostics: [] }) },
    generate: { quiet: async ({ messages, connection_id }: any) => {
      expect(connection_id).toBe("connection");
      const prompt = messages.at(-1).content;
      modelPrompts.push(prompt);
      if (prompt.startsWith("Choose every top-level")) return { content: '{"categories":["Other"]}' };
      if (malformedSelection) return { content: "{}" };
      const ids = [...prompt.matchAll(/id="([^"]+)";/g)].map((match: any) => match[1]);
      return { content: JSON.stringify({ entryIds: emptySelection ? [] : ids }) };
    } },
  };
  (globalThis as any).spindle = host;
  try {
    await import("./index");
    expect(hooks.prepare).toBeUndefined();
    granted.add("interceptor");
    permissionChanged!();
    expect(hooks.prepareOptions).toEqual({ timeoutMs: 120_000 });
    expect(hooks.injectOptions).toBeUndefined();
    expect(hooks.activatePriority).toBe(95);
    const context = { chatId: "turn", userId: "user", connectionId: "connection" };
    const prepared = await hooks.prepare(context);
    expect(prepared.loreRecallRunId).toBeString();
    const activation = await hooks.activate({ ...context, entries: rows });
    expect(activation.disabled).toHaveLength(4);
    const nativeMessages = [{ role: "user", content: "Tell me about Alice", __isChatHistory: true }];
    const injected = await hooks.inject(nativeMessages, prepared);
    const content = injected.messages.map((message: any) => message.content);
    expect(content).toContain("Lore for Alice from global");
    expect(content).toContain("Lore for Alice from character");
    expect(content).not.toContain("Lore for Alice from chat");
    expect(content).not.toContain("Lore for Alice from persona");
    expect(injected.breakdown).toHaveLength(2);

    malformedSelection = true;
    const failed = await hooks.prepare(context);
    expect(failed.loreRecallRunId).toBeString();
    expect(await hooks.activate({ ...context, entries: rows })).toBeUndefined();
    expect(await hooks.inject(nativeMessages, failed)).toEqual(nativeMessages);

    malformedSelection = false;
    emptySelection = true;
    rows.find((entry) => entry.constant)!.constant = false;
    const empty = await hooks.prepare(context);
    expect(empty.loreRecallRunId).toBeString();
    expect((await hooks.activate({ ...context, entries: rows })).disabled).toHaveLength(4);
    expect((await hooks.inject(nativeMessages, empty)).messages).toEqual(nativeMessages);

    emptySelection = false;
    rows.find((row) => row.id === "global-entry")!.constant = true;
    selectedBooks.clear();
    selectedBooks.add("character");
    const oneBook = await hooks.prepare(context);
    expect((await hooks.activate({ ...context, entries: rows })).disabled).toEqual(["character-entry"]);
    const oneInjected = await hooks.inject(nativeMessages, oneBook);
    expect(oneInjected.breakdown).toHaveLength(1);
    expect(oneInjected.messages[0]).toEqual(nativeMessages[0]);
    expect(oneInjected.messages[1].content).toBe("Lore for Alice from character");
    expect(oneInjected.messages[1].role).toBe("assistant");
    expect(oneInjected.breakdown[0].name).toContain("AN after");
    expect(oneInjected.messages.map((message: any) => message.content)).not.toContain("Lore for Alice from global");

    // LumiBooks' summary handler runs at priority 90 before Recall at 95.
    // It disables tagged summaries for native activation, then inserts assistant
    // summary messages itself. Its Codex entries use normal lorebook activation.
    const summaryMeta = { lumibooks: { chatId: "turn", tier: 1, msgIds: ["old-message"] } };
    const codexMeta = { lumibooks_codex: { chatId: "turn", record: "character:alice", file: "characters" } };
    bookMetadata.timeline = { lumibooks_chat_id: "turn" };
    bookMetadata.codex = { lumibooks_codex_chat_id: "turn" };
    chat.metadata.chat_world_book_ids.push("timeline", "codex", "mixed");
    rows.push(
      { ...rows[0], id: "chapter", world_book_id: "timeline", content: "LumiBooks chapter", extensions: summaryMeta, constant: true },
      { ...rows[0], id: "codex-record", world_book_id: "codex", content: "Codex Alice", extensions: codexMeta,
        constant: true, position: 4, depth: 0, role: "system" },
      { ...rows[0], id: "disabled-codex", world_book_id: "codex", content: "Disabled Codex", extensions: codexMeta, disabled: true },
      { ...rows[0], id: "mixed-chapter", world_book_id: "mixed", content: "Mixed chapter", extensions: summaryMeta, constant: true },
      { ...rows[0], id: "mixed-lore", world_book_id: "mixed", content: "Mixed ordinary lore", extensions: {}, constant: true, position: 0 },
    );
    selectedBooks.add("timeline"); // Existing summary-book opt-in must be honored.
    selectedBooks.add("codex");
    selectedBooks.add("mixed");
    modelPrompts.length = 0;
    const withLumiBooks = await hooks.prepare(context);
    const afterLumiBooksVote = rows.map((row) => ({ ...row,
      disabled: row.disabled || !!(row.extensions as any).lumibooks,
    }));
    expect((await hooks.activate({ ...context, entries: afterLumiBooksVote })).disabled)
      .toEqual(["character-entry", "chapter", "codex-record", "disabled-codex", "mixed-chapter", "mixed-lore"]);
    const lumiBooksMessage = { role: "assistant", content: "LumiBooks chapter" };
    const compatible = await hooks.inject([lumiBooksMessage, ...nativeMessages], withLumiBooks);
    expect(compatible.breakdown).toHaveLength(5);
    expect(compatible.messages.filter((message: any) => message.content === "LumiBooks chapter")).toEqual([lumiBooksMessage]);
    expect(compatible.messages.filter((message: any) => message.content === "LumiBooks chapter")).toHaveLength(1);
    expect(compatible.breakdown.find((item: any) => item.name.includes("LumiBooks timeline"))).toBeDefined();
    expect(compatible.messages.map((message: any) => message.content)).toContain("Lore for Alice from character");
    expect(compatible.messages.map((message: any) => message.content)).toContain("Codex Alice");
    expect(compatible.messages.find((message: any) => message.content === "Codex Alice")).toMatchObject({ role: "system" });
    expect(compatible.messages.findIndex((message: any) => message.content === "Codex Alice"))
      .toBeGreaterThan(compatible.messages.findIndex((message: any) => message.__isChatHistory));
    expect(compatible.messages.map((message: any) => message.content)).toContain("Mixed ordinary lore");
    expect(compatible.messages.map((message: any) => message.content)).toContain("Mixed chapter");
    expect(compatible.messages.map((message: any) => message.content)).not.toContain("Disabled Codex");
    expect(modelPrompts.join("\n")).not.toContain("LumiBooks chapter");
    expect(modelPrompts.join("\n")).not.toContain("Mixed chapter");
    selectedBooks.clear();
    selectedBooks.add("timeline");
    const summariesOnly = await hooks.prepare(context);
    expect((await hooks.activate({ ...context, entries: afterLumiBooksVote })).disabled).toEqual(["chapter"]);
    const unselectedSummary = { role: "assistant", content: "Mixed chapter" };
    const onlyTimeline = await hooks.inject([lumiBooksMessage, unselectedSummary, ...nativeMessages], summariesOnly);
    expect(onlyTimeline.breakdown).toHaveLength(1);
    expect(onlyTimeline.messages).toContain(unselectedSummary);

    const changedSummary = await hooks.prepare(context);
    rows.find((row) => row.id === "chapter")!.disabled = true;
    expect(await hooks.activate({ ...context, entries: afterLumiBooksVote })).toBeUndefined();
    expect(await hooks.inject([lumiBooksMessage, ...nativeMessages], changedSummary)).toEqual([lumiBooksMessage, ...nativeMessages]);
    rows.find((row) => row.id === "chapter")!.disabled = false;

    const timeoutSummary = await hooks.prepare(context);
    const previousList = host.world_books.entries.list;
    const previousTimeout = globalThis.setTimeout;
    try {
      host.world_books.entries.list = async () => new Promise(() => {});
      globalThis.setTimeout = ((handler: any, delay: number, ...args: any[]) =>
        previousTimeout(handler, delay === 8_000 ? 5 : delay, ...args)) as typeof setTimeout;
      expect(await hooks.activate({ ...context, entries: afterLumiBooksVote })).toBeUndefined();
      expect(await hooks.inject([lumiBooksMessage, ...nativeMessages], timeoutSummary)).toEqual([lumiBooksMessage, ...nativeMessages]);
    } finally {
      host.world_books.entries.list = previousList;
      globalThis.setTimeout = previousTimeout;
    }

    malformedSelection = true;
    // Constants alone do not call the selector; use a dynamic summary to test retrieval fallback.
    rows.find((row) => row.id === "chapter")!.constant = false;
    const failedSummary = await hooks.prepare(context);
    expect(await hooks.activate({ ...context, entries: afterLumiBooksVote })).toBeUndefined();
    expect(await hooks.inject([lumiBooksMessage, ...nativeMessages], failedSummary)).toEqual([lumiBooksMessage, ...nativeMessages]);
    malformedSelection = false;
    selectedBooks.clear();
    const none = await hooks.prepare(context);
    expect(await hooks.activate({ ...context, entries: rows })).toBeUndefined();
    expect(await hooks.inject(nativeMessages, none)).toEqual(nativeMessages);
    // Let the feed's debounced pushes complete while the mock host is active.
    await Bun.sleep(220);
  } finally {
    (globalThis as any).spindle = previous;
  }
});
