import { expect, test } from "bun:test";
import { DEFAULT_CHARACTER_CONFIG, DEFAULT_GLOBAL_SETTINGS, EXTENSION_KEY } from "../shared";

test("public hooks register after permission grant and retrieve without exact-selection support", async () => {
  const previous = (globalThis as any).spindle;
  const granted = new Set(["generation", "context_handler"]);
  const hooks: Record<string, any> = {};
  let permissionChanged: (() => void) | undefined;
  let malformedSelection = false;
  let emptySelection = false;
  const rows = ["character", "persona", "chat", "global"].map((scope) => ({
    id: scope + "-entry", world_book_id: scope, uid: scope, comment: scope,
    key: [scope], keysecondary: [], content: "Lore for {{char}} from " + scope,
    disabled: scope === "chat", constant: scope === "global", extensions: {},
    position: 0, depth: 0, role: "system", order_value: 0, updated_at: 1,
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
    registerWorldInfoInterceptor: (handler: unknown) => { hooks.activate = handler; },
    registerInterceptor: (handler: unknown, _priority: number, options: unknown) => {
      hooks.inject = handler; hooks.injectOptions = options;
    },
    onFrontendMessage: () => {},
    sendToFrontend: () => {},
    log: { info: () => {}, warn: () => {}, error: () => {} },
    userStorage: {
      mkdir: async () => {}, setJson: async () => {},
      getJson: async (path: string, options: any) => path === "global/settings.json"
        ? { ...DEFAULT_GLOBAL_SETTINGS, enabled: true } : options.fallback,
    },
    characters: { get: async () => character },
    chats: { get: async () => chat, getActive: async () => null },
    chat: { getMessages: async () => [{ role: "user", content: "Tell me about Alice" }] },
    personas: { getActive: async () => ({ attached_world_book_id: "persona" }), getDefault: async () => null },
    world_books: {
      getGlobal: async () => ["global"],
      get: async (id: string) => ({ id, name: id, description: "", updated_at: 1 }),
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
    // Let the feed's debounced pushes complete while the mock host is active.
    await Bun.sleep(220);
  } finally {
    (globalThis as any).spindle = previous;
  }
});
