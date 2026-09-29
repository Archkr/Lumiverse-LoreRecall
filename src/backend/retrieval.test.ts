import { describe, expect, test } from "bun:test";
import { DEFAULT_BOOK_CONFIG, DEFAULT_CHARACTER_CONFIG, DEFAULT_GLOBAL_SETTINGS, assignEntryToTarget, createEmptyTreeIndex } from "../shared";
import { ROOT_CATEGORIES, ensureRootCategories } from "../categories";
import type { IndexedEntry, RuntimeBook } from "./contracts";
import { buildRetrievalPreview } from "./retrieval";
import { filterWithJev } from "./jev";
import { normalizeGlobalSettings } from "../shared";

function entry(id: string, patch: Partial<IndexedEntry> = {}): IndexedEntry {
  return {
    entryId: id, worldBookId: "book", worldBookName: "Test Book", label: id, aliases: [],
    summary: `${id} summary`, collapsedText: "", tags: [], comment: "", key: [], keysecondary: [],
    disabled: false, updatedAt: 1, groupName: "", constant: false, selective: false, vectorized: false,
    previewText: `${id} preview`, content: `${id} full content`, legacyTree: null, ...patch,
  };
}

function book(entries: IndexedEntry[]): RuntimeBook {
  const tree = ensureRootCategories(createEmptyTreeIndex("book"));
  const characters = tree.nodes[tree.rootId].childIds.find((id) => tree.nodes[id].label === "Characters")!;
  for (const item of entries) assignEntryToTarget(tree, item.entryId, { categoryId: characters });
  return {
    summary: { id: "book", name: "Test Book", description: "", updatedAt: 1 },
    cache: { version: 2, bookId: "book", bookUpdatedAt: 1, name: "Test Book", description: "", entries },
    tree, config: { ...DEFAULT_BOOK_CONFIG },
    status: { bookId: "book", attachedToCharacter: false, selectedForCharacter: true,
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
