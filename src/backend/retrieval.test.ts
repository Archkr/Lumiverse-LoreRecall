import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_BOOK_CONFIG, DEFAULT_CHARACTER_CONFIG, DEFAULT_GLOBAL_SETTINGS, assignEntryToTarget, createEmptyTreeIndex } from "../shared";
import { ROOT_CATEGORIES, ensureRootCategories } from "../categories";
import type { IndexedEntry, RuntimeBook } from "./contracts";
import { buildRetrievalPreview } from "./retrieval";
import { filterWithJev } from "./jev";
import { normalizeGlobalSettings } from "../shared";
import { finalizeRecallActivation } from "./activation";

const previousSpindle = (globalThis as any).spindle;
afterEach(() => { (globalThis as any).spindle = previousSpindle; });

function entry(id: string, patch: Partial<IndexedEntry> = {}): IndexedEntry {
  return {
    entryId: id, worldBookId: "book", worldBookName: "Test Book", label: id, aliases: [],
    summary: `${id} summary`, collapsedText: "", tags: [], comment: "", key: [], keysecondary: [],
    disabled: false, updatedAt: 1, groupName: "", constant: false, selective: false, vectorized: false,
    previewText: `${id} preview`, content: `${id} full content`, legacyTree: null, ...patch,
  };
}

function book(entries: IndexedEntry[], id = "book"): RuntimeBook {
  const tree = ensureRootCategories(createEmptyTreeIndex(id));
  const characters = tree.nodes[tree.rootId].childIds.find((id) => tree.nodes[id].label === "Characters")!;
  for (const item of entries) assignEntryToTarget(tree, item.entryId, { categoryId: characters });
  return {
    summary: { id, name: "Test Book", description: "", updatedAt: 1 },
    cache: { version: 2, bookId: id, bookUpdatedAt: 1, name: "Test Book", description: "", entries },
    tree, config: { ...DEFAULT_BOOK_CONFIG },
    status: { bookId: id, attachedToCharacter: false, selectedForCharacter: true,
      entryCount: entries.length, categoryCount: 7, rootEntryCount: 0, unassignedCount: 0,
      treeMissing: false, warnings: [] },
  };
}

function host(options: { key?: string; reject?: string[]; malformedBatch?: boolean; emptyCategories?: boolean; emptySelection?: boolean } = {}) {
  const prompts: string[] = [];
  (globalThis as any).spindle = {
    generate: { quiet: async ({ messages }: any) => {
      const prompt = messages.at(-1).content as string;
      prompts.push(prompt);
      if (prompt.startsWith("Choose every top-level")) return { content: JSON.stringify({ categories: options.emptyCategories ? [] : ["Characters"] }) };
      if (options.malformedBatch) return { content: "{}" };
      const ids = [...prompt.matchAll(/id="([^"]+)";/g)].map((match) => match[1]);
      return { content: JSON.stringify({ entryIds: options.emptySelection ? [] : ids }) };
    } },
    enclave: { get: async () => options.key ?? null },
    cors: async (_url: string, request: any) => {
      const body = JSON.parse(request.body);
      const answers = Object.fromEntries(body.state.entries.map((item: any) => [item.id, {
        type: "noul", noul: options.reject?.includes(item.label) ? 0.2 : 0.9,
      }]));
      return { status: 200, body: JSON.stringify({ answers }) };
    },
  };
  return prompts;
}

async function preview(entries: IndexedEntry[], patch: Partial<typeof DEFAULT_CHARACTER_CONFIG> = {}) {
  return buildRetrievalPreview([{ role: "user", content: "Talk about the cast" }],
    { ...DEFAULT_GLOBAL_SETTINGS }, { ...DEFAULT_CHARACTER_CONFIG, enabled: true, tokenBudget: 2, ...patch },
    [book(entries)], "user");
}

describe("category retrieval", () => {
  function largeBooks() {
    const dynamics = Array.from({ length: 174 }, (_, index) => entry(`cast-${index}`, {
      worldBookId: `book-${index % 4}`, summary: "s".repeat(200), previewText: "p".repeat(200),
    }));
    const constants = Array.from({ length: 33 }, (_, index) => entry(`constant-${index}`, {
      worldBookId: `book-${index % 4}`, constant: true,
    }));
    return Array.from({ length: 4 }, (_, index) => book(
      [...dynamics, ...constants].filter((item) => item.worldBookId === `book-${index}`), `book-${index}`));
  }

  test("six batches review all 174 entries concurrently, retry transient failures, and preserve model order", async () => {
    host();
    let active = 0;
    let peak = 0;
    const attempts = new Map<number, number>();
    (globalThis as any).spindle.generate.quiet = async ({ messages }: any) => {
      const prompt = messages.at(-1).content as string;
      if (prompt.startsWith("Choose every")) return { content: '{"categories":["Characters"]}' };
      const index = Number(prompt.match(/Batch (\d+) of/)![1]);
      attempts.set(index, (attempts.get(index) ?? 0) + 1);
      peak = Math.max(peak, ++active);
      try {
        await Bun.sleep(index === 1 ? 25 : 2);
        if (index === 2 && attempts.get(index) === 1) throw new Error("Generation aborted");
        if (index === 3 && attempts.get(index) === 1) return { content: "{}" };
        return { content: JSON.stringify({ entryIds: [...prompt.matchAll(/id="([^"]+)";/g)].map((match) => match[1]) }) };
      } finally { active--; }
    };
    const books = largeBooks();
    const result = (await buildRetrievalPreview([{ role: "user", content: "Talk about the cast" }],
      DEFAULT_GLOBAL_SETTINGS, { ...DEFAULT_CHARACTER_CONFIG, tokenBudget: 6 }, books, "user"))!;
    expect(peak).toBe(3);
    expect(result.selectionBatches).toHaveLength(6);
    expect(result.selectionBatches?.map((batch) => batch.status)).toEqual(Array(6).fill("completed"));
    expect(attempts.get(2)).toBe(2);
    expect(attempts.get(3)).toBe(2);
    expect(result.modelSelectedEntries).toHaveLength(174);
    expect(result.retrievalComplete).toBe(true);
    expect(result.injectedNodes).toHaveLength(39);
    expect(result.selectionSummary).toBe("Prepared 6 dynamic, 33 constant entries.");
    expect(result.injectedNodes.filter((node) => node.reasons.includes("model_selected")).map((node) => node.entryId))
      .toEqual(result.selectionBatches![0].selectedEntryIds.slice(0, 6));
    expect(result.scopeManifestCounts.reduce((count, scope) => count + (scope.reviewedEntryCount ?? 0), 0)).toBe(174);
    expect(result.trace.filter((step) => step.label.startsWith("Selection batch"))).toHaveLength(6);
    const byId = new Map(books.flatMap((book) => book.cache.entries.map((entry) => [entry.entryId, entry])));
    finalizeRecallActivation(result, result.injectedNodes.map((node) => ({ id: node.entryId, content: byId.get(node.entryId)!.content })));
    expect(result.selectionSummary).toBe("Activated 6 dynamic, 33 constant entries.");
    expect(result.injectedText).not.toBe("");
  });

  test("deadline cancels active calls once, skips queued batches, and ignores late provider results", async () => {
    host();
    const pending: Array<() => void> = [];
    const events: any[] = [];
    let requests = 0;
    (globalThis as any).spindle.generate.quiet = async ({ messages }: any) => {
      const prompt = messages.at(-1).content as string;
      if (prompt.startsWith("Choose every")) return { content: '{"categories":["Characters"]}' };
      requests++;
      const ids = [...prompt.matchAll(/id="([^"]+)";/g)].map((match) => match[1]);
      if (prompt.includes("Batch 1 of")) return { content: JSON.stringify({ entryIds: ids.slice(0, 6) }) };
      // Deliberately ignore AbortSignal to verify that an uncooperative provider cannot delay fallback.
      return new Promise((resolve) => pending.push(() => resolve({ content: JSON.stringify({ entryIds: ids }) })));
    };
    const result = (await buildRetrievalPreview([{ role: "user", content: "Talk about the cast" }],
      DEFAULT_GLOBAL_SETTINGS, { ...DEFAULT_CHARACTER_CONFIG, tokenBudget: 6 }, largeBooks(), "user",
      { deadlineAt: Date.now() + 1200, reportProgress: (event) => events.push(event) }))!;
    expect(requests).toBe(4);
    expect(result.selectionBatches?.map((batch) => batch.status)).toEqual([
      "completed", "timed_out", "timed_out", "timed_out", "skipped", "skipped",
    ]);
    expect(result.modelSelectedEntries).toHaveLength(6);
    expect(result.reservedConstantCount).toBe(33);
    expect(result.retrievalComplete).toBe(false);
    expect(result.activationSource).toBe("native");
    expect(result.injectedNodes).toEqual([]);
    expect(result.injectedText).toBe("");
    expect(result.fallbackPath.filter((reason) => reason.includes("ran out of time"))).toHaveLength(1);
    expect(result.fallbackReason).toContain(".\n");
    expect(result.fallbackReason).not.toContain("no usable entryIds");
    expect(result.selectedScopes).toHaveLength(4);
    expect(result.trace.length).toBeGreaterThan(6);
    const eventCount = events.length;
    pending.forEach((resolve) => resolve());
    await Bun.sleep(10);
    expect(events).toHaveLength(eventCount);
    expect(result.modelSelectedEntries).toHaveLength(6);
  });

  test("parent cancellation stops requests and records cancellation rather than malformed output", async () => {
    host();
    const abort = new AbortController();
    (globalThis as any).spindle.generate.quiet = async () => {
      abort.abort();
      return new Promise(() => {});
    };
    const result = await buildRetrievalPreview([{ role: "user", content: "Cast" }],
      DEFAULT_GLOBAL_SETTINGS, DEFAULT_CHARACTER_CONFIG, [book([entry("cast")])], "user", { signal: abort.signal });
    expect(result?.controllerUsed).toBe(true);
    expect(result?.retrievalComplete).toBe(false);
    expect(result?.fallbackReason).toContain("cancelled");
    expect(result?.fallbackReason).not.toContain("invalid categories");
    expect(result?.selectionBatches).toEqual([]);
  });

  test("creates fixed roots and preserves legacy branches under a classified root", () => {
    const tree = createEmptyTreeIndex("book");
    const legacy = "legacy";
    tree.nodes[legacy] = { id: legacy, kind: "category", label: "NPCs", summary: "", parentId: tree.rootId,
      childIds: [], entryIds: ["a"], collapsed: false, createdBy: "manual" };
    tree.nodes[tree.rootId].childIds.push(legacy);
    ensureRootCategories(tree);
    expect(tree.nodes[tree.rootId].childIds.map((id) => tree.nodes[id].label)).toEqual([...ROOT_CATEGORIES]);
    expect(tree.nodes[tree.nodes[legacy].parentId!].label).toBe("Characters");
  });

  test("reviews every routed entry across batches and keeps constants outside the cap", async () => {
    const prompts = host();
    const entries = Array.from({ length: 65 }, (_, index) => entry(`cast-${index}`));
    entries.push(entry("always", { constant: true }));
    entries.push(entry("disabled", { disabled: true }));
    const result = await preview(entries);
    expect(prompts.filter((prompt) => prompt.startsWith("Select ALL"))).toHaveLength(2);
    expect(result?.modelSelectedEntries).toHaveLength(65);
    expect(result?.injectedNodes).toHaveLength(3);
    expect(result?.injectedNodes.some((node) => node.entryId === "always")).toBe(true);
    expect(result?.modelSelectedEntries?.some((node) => node.entryId === "disabled")).toBe(false);
  });

  test("JEV rejects entries and the dynamic cap keeps strongest approvals", async () => {
    host({ key: "secret", reject: ["cast-1"] });
    const result = await preview([entry("cast-0"), entry("cast-1"), entry("cast-2")]);
    expect(result?.jevRejectedEntries?.map((node) => node.entryId)).toEqual(["cast-1"]);
    expect(result?.injectedNodes.map((node) => node.entryId)).toEqual(["cast-0", "cast-2"]);
  });

  test("the cap favors stronger JEV approvals", async () => {
    host({ key: "secret" });
    (globalThis as any).spindle.cors = async (_url: string, request: any) => {
      const body = JSON.parse(request.body);
      const scores = [0.62, 0.95, 0.8];
      return { status: 200, body: JSON.stringify({ answers: Object.fromEntries(
        body.state.entries.map((item: any, index: number) => [item.id, { type: "noul", noul: scores[index] }]),
      ) }) };
    };
    const result = await preview([entry("cast-0"), entry("cast-1"), entry("cast-2")]);
    expect(result?.injectedNodes.map((node) => node.entryId)).toEqual(["cast-1", "cast-2"]);
  });

  test("unusable model output skips its batch and records an issue", async () => {
    host({ malformedBatch: true });
    const result = await preview([entry("cast-0")]);
    expect(result?.modelSelectedEntries).toHaveLength(0);
    expect(result?.fallbackReason).toContain("no usable entryIds");
    expect(result?.retrievalComplete).toBe(false);
    expect(result?.selectionBatches?.[0].status).toBe("failed");
    expect(result?.selectionBatches?.[0].attempts).toHaveLength(2);
    expect(result?.injectedNodes).toEqual([]);
  });

  test("an expired pre-generation deadline falls back before model selection", async () => {
    const prompts = host();
    const result = await buildRetrievalPreview([{ role: "user", content: "Talk about the cast" }],
      DEFAULT_GLOBAL_SETTINGS, DEFAULT_CHARACTER_CONFIG, [book([entry("cast-0")])], "user",
      { deadlineAt: Date.now() - 1 });
    expect(prompts).toHaveLength(0);
    expect(result?.retrievalComplete).toBe(false);
    expect(result?.fallbackReason).toContain("ran out of time");
  });

  test("valid empty category and entry selections complete without native fallback", async () => {
    host({ emptyCategories: true });
    const noCategory = await preview([entry("cast-0")]);
    expect(noCategory?.retrievalComplete).toBe(true);
    expect(noCategory?.injectedNodes).toHaveLength(0);

    host({ emptySelection: true });
    const noEntry = await preview([entry("cast-0")]);
    expect(noEntry?.retrievalComplete).toBe(true);
    expect(noEntry?.injectedNodes).toHaveLength(0);
    expect(noEntry?.selectionBatches?.[0].attempts).toHaveLength(1);
  });

  test("partial JEV answers pass missing decisions through", async () => {
    host({ key: "secret" });
    (globalThis as any).spindle.cors = async () => ({ status: 200,
      body: JSON.stringify({ answers: { entry_0: { type: "noul", noul: 0.59 } } }) });
    const result = await filterWithJev([entry("a"), entry("b")], "scene", DEFAULT_GLOBAL_SETTINGS, "user");
    expect(result.verdicts.map((verdict) => verdict.approved)).toEqual([false, true]);
    expect(result.verdicts[1].answered).toBe(false);
  });

  test("legacy snapshot settings gain JEV defaults without changing the snapshot version", () => {
    const oldSettings = { enabled: true, autoDetectPattern: "*recall*" };
    const restored = normalizeGlobalSettings(oldSettings);
    expect(restored.jevThreshold).toBe(0.6);
    expect(restored.jevProvider).toBe("typesafe");
  });
});
