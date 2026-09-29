import { afterEach, expect, test } from "bun:test";
import { DEFAULT_GLOBAL_SETTINGS, normalizeGlobalSettings } from "../shared";
import { getControllerTokenUsage, runControllerJson } from "./controller-json";
import { buildTreeWithLlm } from "./operations";

const previousSpindle = (globalThis as { spindle?: unknown }).spindle;
afterEach(() => { (globalThis as { spindle?: unknown }).spindle = previousSpindle; });

const outputLimitKeys = ["max_tokens", "max_completion_tokens", "max_output_tokens", "maxOutputTokens"];

test("legacy output budgets are ignored and controller requests omit token limits", async () => {
  for (const controllerMaxTokens of [1200, 8192, 32768]) {
    const settings = normalizeGlobalSettings({ ...DEFAULT_GLOBAL_SETTINGS, controllerMaxTokens } as any);
    expect(settings).not.toHaveProperty("controllerMaxTokens");
    let request: any;
    (globalThis as any).spindle = {
      generate: { quiet: async (input: unknown) => {
        request = input;
        return { content: '{"assignments":[]}' };
      } },
    };
    const result = await runControllerJson("Assign entries", settings, "user", { primaryKey: "assignments" });
    expect(result.parsed).toEqual({ assignments: [] });
    for (const key of outputLimitKeys) expect(request.parameters).not.toHaveProperty(key);
  }
});

test("reasoning token accounting does not depend on a returned reasoning trace", () => {
  expect(getControllerTokenUsage({ provider_raw: {
    output_tokens_details: { reasoning_tokens: 1200, text_tokens: null },
  } })).toEqual({ reasoningTokens: 1200, textTokens: null });
  expect(getControllerTokenUsage({ completion_tokens_details: {
    reasoning_tokens: 0, text_tokens: 128,
  } })).toEqual({ reasoningTokens: 0, textTokens: 128 });
  expect(getControllerTokenUsage(null)).toEqual({ reasoningTokens: null, textTokens: null });
});

function treeHost(emptyResponse = false) {
  const requests: any[] = [];
  const row = {
    id: "test-entry", world_book_id: "token-test-book", uid: "test-entry", comment: "Alice",
    key: ["Alice"], keysecondary: [], content: "Alice is a scientist.", extensions: {}, updated_at: 1,
  };
  const storage = new Map<string, unknown>();
  const host = {
    userStorage: {
      getJson: async (path: string, options: any) => path === "global/settings.json"
        ? { ...DEFAULT_GLOBAL_SETTINGS, controllerMaxTokens: 1200 }
        : storage.get(path) ?? options.fallback,
      setJson: async (path: string, value: unknown) => { storage.set(path, value); },
      delete: async (path: string) => { storage.delete(path); },
    },
    world_books: {
      get: async () => ({ id: row.world_book_id, name: "Token test", description: "", updated_at: 1 }),
      entries: { list: async () => ({ data: [row], total: 1 }), get: async () => row, update: async () => row },
    },
    log: { warn: () => {} },
    generate: { quiet: async (request: any) => {
      requests.push(request);
      if (emptyResponse) return { content: "", finish_reason: "max_output_tokens", usage: {
        provider_raw: { output_tokens_details: { reasoning_tokens: 1200, text_tokens: null } },
      } };
      const prompt: string = request.messages.at(-1).content;
      if (prompt.startsWith("Organize")) return { content: JSON.stringify({
        assignments: [{ entryId: row.id, path: ["Characters"] }],
      }) };
      if (prompt.startsWith("Write short category")) return { content: JSON.stringify({ summaries:
        [...prompt.matchAll(/"nodeId":"([^"]+)"/g)].map((match) => ({ nodeId: match[1], summary: "Characters" })),
      }) };
      return { content: JSON.stringify({ entries: [{ entryId: row.id, summary: "Scientist", collapsedText: "Alice is a scientist." }] }) };
    } },
  };
  return { host, requests };
}

test("tree assignments and category and entry summaries all omit output caps", async () => {
  const { host, requests } = treeHost();
  (globalThis as any).spindle = host;
  const result = await buildTreeWithLlm(["token-test-book"], "user");
  expect(result.completed).toBe(1);
  expect(result.issues).toEqual([]);
  expect(requests).toHaveLength(3);
  for (const request of requests) {
    for (const key of outputLimitKeys) expect(request.parameters).not.toHaveProperty(key);
  }
});

test("empty assignment diagnostics retain reasoning usage without inventing trace text", async () => {
  const { host } = treeHost(true);
  (globalThis as any).spindle = host;
  const result = await buildTreeWithLlm(["token-test-book"], "user");
  expect(result.completed).toBe(0);
  const payload = JSON.parse(result.issues[0].debugPayload!);
  expect(payload.responseLength).toBe(0);
  expect(payload.reasoningTokens).toBe(1200);
  expect(payload.textTokens).toBeNull();
  expect(payload.reasoningTextLength).toBe(0);
  expect(payload.reasoningTraceAvailable).toBe(false);
  expect(payload.controllerSettings).not.toHaveProperty("controllerMaxTokens");
});
