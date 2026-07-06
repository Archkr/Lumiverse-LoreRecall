import { describe, expect, test } from "bun:test";
import type { CharacterRetrievalConfig, GlobalLoreRecallSettings } from "../types";
import {
  DEFAULT_BOOK_CONFIG,
  DEFAULT_CHARACTER_CONFIG,
  DEFAULT_GLOBAL_SETTINGS,
  assignEntryToTarget,
  createEmptyTreeIndex,
  ensureCategoryPath,
} from "../shared";
import type { IndexedEntry, RuntimeBook } from "./contracts";
import { buildRetrievalPreview, type DynamicRetrievalFeedbackSnapshot } from "./retrieval";

function makeEntry(patch: Partial<IndexedEntry> & Pick<IndexedEntry, "entryId" | "label">): IndexedEntry {
  return {
    entryId: patch.entryId,
    worldBookId: patch.worldBookId ?? "book",
    worldBookName: patch.worldBookName ?? "Synthetic Lore",
    label: patch.label,
    aliases: patch.aliases ?? [],
    summary: patch.summary ?? `${patch.label} summary.`,
    collapsedText: patch.collapsedText ?? "",
    tags: patch.tags ?? [],
    comment: patch.comment ?? "",
    key: patch.key ?? [],
    keysecondary: patch.keysecondary ?? [],
    disabled: patch.disabled ?? false,
    updatedAt: patch.updatedAt ?? 1,
    groupName: patch.groupName ?? "",
    constant: patch.constant ?? false,
    selective: patch.selective ?? false,
    vectorized: patch.vectorized ?? false,
    previewText: patch.previewText ?? patch.summary ?? `${patch.label} preview.`,
    content: patch.content ?? patch.collapsedText ?? `${patch.label} content.`,
    legacyTree: patch.legacyTree ?? null,
  };
}

function makeBook(entries: IndexedEntry[]): RuntimeBook {
  const tree = createEmptyTreeIndex("book");
  const categoryId = ensureCategoryPath(tree, ["Cast"], "manual");
  for (const entry of entries) {
    assignEntryToTarget(tree, entry.entryId, { categoryId });
  }
  return {
    summary: {
      id: "book",
      name: "Synthetic Lore",
      description: "Synthetic regression fixture.",
      updatedAt: 1,
    },
    cache: {
      version: 2,
      bookId: "book",
      bookUpdatedAt: 1,
      name: "Synthetic Lore",
      description: "Synthetic regression fixture.",
      entries,
    },
    tree,
    config: { ...DEFAULT_BOOK_CONFIG, enabled: true },
    status: {
      bookId: "book",
      attachedToCharacter: true,
      selectedForCharacter: true,
      entryCount: entries.length,
      categoryCount: 1,
      rootEntryCount: 0,
      unassignedCount: 0,
      treeMissing: false,
      warnings: [],
    },
  };
}

function makeCategorizedBook(items: Array<{ entry: IndexedEntry; path: string[] }>): RuntimeBook {
  const tree = createEmptyTreeIndex("book");
  for (const item of items) {
    const categoryId = ensureCategoryPath(tree, item.path, "manual");
    assignEntryToTarget(tree, item.entry.entryId, { categoryId });
  }
  const entries = items.map((item) => item.entry);
  return {
    summary: {
      id: "book",
      name: "Synthetic Lore",
      description: "Synthetic regression fixture.",
      updatedAt: 1,
    },
    cache: {
      version: 2,
      bookId: "book",
      bookUpdatedAt: 1,
      name: "Synthetic Lore",
      description: "Synthetic regression fixture.",
      entries,
    },
    tree,
    config: { ...DEFAULT_BOOK_CONFIG, enabled: true },
    status: {
      bookId: "book",
      attachedToCharacter: true,
      selectedForCharacter: true,
      entryCount: entries.length,
      categoryCount: Math.max(0, Object.keys(tree.nodes).length - 1),
      rootEntryCount: 0,
      unassignedCount: 0,
      treeMissing: false,
      warnings: [],
    },
  };
}

function makeConfig(patch: Partial<CharacterRetrievalConfig> = {}): CharacterRetrievalConfig {
  return {
    ...DEFAULT_CHARACTER_CONFIG,
    enabled: true,
    managedBookIds: ["book"],
    searchMode: "traversal",
    maxResults: 8,
    tokenBudget: 8,
    selectiveRetrieval: true,
    rerankEnabled: false,
    traversalStepLimit: 3,
    contextMessages: 10,
    ...patch,
  };
}

function makeSettings(): GlobalLoreRecallSettings {
  return { ...DEFAULT_GLOBAL_SETTINGS, enabled: true };
}

async function previewFor(
  entries: IndexedEntry[],
  conversation: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    __isChatHistory?: boolean;
    sourceMessageId?: string;
    sourceIndexInChat?: number;
  }>,
  configPatch: Partial<CharacterRetrievalConfig> = {},
  feedback?: DynamicRetrievalFeedbackSnapshot,
) {
  const preview = await buildRetrievalPreview(
    conversation,
    makeSettings(),
    makeConfig(configPatch),
    [makeBook(entries)],
    "test-user",
    { allowController: false, dynamicFeedback: feedback },
  );
  expect(preview).not.toBeNull();
  return preview!;
}

function dynamicLabels(preview: Awaited<ReturnType<typeof previewFor>>): string[] {
  return preview.manifestSelectedEntries.map((entry) => entry.label);
}

function injectedLabels(preview: Awaited<ReturnType<typeof previewFor>>): string[] {
  return preview.injectedNodes.map((entry) => entry.label);
}

describe("retrieval accuracy", () => {
  test("keeps active-beat entries while rejecting note-only and composite false positives", async () => {
    const entries = [
      makeEntry({ entryId: "constant", label: "Always-On Operating Rule", constant: true }),
      makeEntry({ entryId: "commander", label: "Commander Vale", aliases: ["Vale"] }),
      makeEntry({ entryId: "captain", label: "Captain Hale", aliases: ["Hale"] }),
      makeEntry({ entryId: "medic", label: "Medic Protocol", key: ["medic"] }),
      makeEntry({ entryId: "timeline", label: "Distant Moon Accord" }),
      makeEntry({ entryId: "relationship", label: "Captain Hale-Archivist Nera Relationship" }),
      makeEntry({ entryId: "engine", label: "War Engine", content: "Captain Hale once saw this machine in a museum." }),
    ];

    const preview = await previewFor(
      entries,
      [
        { role: "assistant", content: "Earlier we were talking about the Distant Moon Accord and Archivist Nera." },
        {
          role: "assistant",
          content:
            "Commander Vale set down the clipboard. Captain Hale was named in the threat about inventory duty, but the room kept moving around the active argument.",
        },
        { role: "assistant", content: "Note: Story takes place after the Distant Moon Accord." },
        { role: "assistant", content: "The field medic cannot survive a week with Captain Hale." },
      ],
      { contextMessages: 2 },
    );

    expect(injectedLabels(preview)).toContain("Always-On Operating Rule");
    expect(dynamicLabels(preview)).toContain("Captain Hale");
    expect(dynamicLabels(preview)).toContain("Medic Protocol");
    expect(dynamicLabels(preview)).not.toContain("Distant Moon Accord");
    expect(dynamicLabels(preview)).not.toContain("Captain Hale-Archivist Nera Relationship");
    expect(dynamicLabels(preview)).not.toContain("War Engine");
  });

  test("timeline note mentions do not become active anchors", async () => {
    const preview = await previewFor(
      [
        makeEntry({ entryId: "timeline", label: "Old Treaty" }),
        makeEntry({ entryId: "active", label: "Captain Hale" }),
      ],
      [
        { role: "assistant", content: "Note: Story takes place after the Old Treaty." },
        { role: "assistant", content: "Captain Hale is the one speaking in the scene right now." },
      ],
      { tokenBudget: 1, maxResults: 1 },
    );

    expect(dynamicLabels(preview)).toEqual(["Captain Hale"]);
  });

  test("composite relationship entries require an exact phrase or both principal endpoints", async () => {
    const entries = [
      makeEntry({ entryId: "captain", label: "Captain Hale" }),
      makeEntry({ entryId: "relationship", label: "Captain Hale-Archivist Nera Relationship" }),
    ];

    const oneEndpoint = await previewFor(entries, [{ role: "assistant", content: "Captain Hale is annoyed." }]);
    expect(dynamicLabels(oneEndpoint)).toContain("Captain Hale");
    expect(dynamicLabels(oneEndpoint)).not.toContain("Captain Hale-Archivist Nera Relationship");

    const exactPhrase = await previewFor(entries, [
      { role: "assistant", content: "The Captain Hale-Archivist Nera Relationship matters here." },
    ]);
    expect(dynamicLabels(exactPhrase)).toContain("Captain Hale-Archivist Nera Relationship");
  });

  test("constants always inject outside dynamic slots and ignore dynamic feedback penalties", async () => {
    const feedback: DynamicRetrievalFeedbackSnapshot = {
      entries: {
        constant: {
          injections: 10,
          references: 0,
          missStreak: 10,
          lastReferenced: 0,
          recentInjectionCount: 3,
        },
        captain: {
          injections: 3,
          references: 0,
          missStreak: 3,
          lastReferenced: 0,
          recentInjectionCount: 0,
        },
      },
    };
    const preview = await previewFor(
      [
        makeEntry({ entryId: "constant", label: "Unrelated Constant", constant: true }),
        makeEntry({ entryId: "captain", label: "Captain Hale" }),
      ],
      [{ role: "assistant", content: "Captain Hale is waiting for an answer." }],
      { tokenBudget: 1, maxResults: 1 },
      feedback,
    );

    expect(preview.reservedConstantCount).toBe(1);
    expect(preview.remainingDynamicSlots).toBe(1);
    expect(injectedLabels(preview)).toContain("Unrelated Constant");
    expect(injectedLabels(preview)).toContain("Captain Hale");
    expect(dynamicLabels(preview)).toEqual(["Captain Hale"]);
  });

  test("latest user and assistant focus outranks older assistant prose", async () => {
    const preview = await previewFor(
      [
        makeEntry({ entryId: "old", label: "Archive Vault" }),
        makeEntry({ entryId: "active", label: "Captain Hale" }),
      ],
      [
        {
          role: "assistant",
          content:
            "Archive Vault. Archive Vault. Archive Vault. The previous scene spent too much time on Archive Vault before the conversation moved on.",
        },
        { role: "assistant", content: "Captain Hale is the only person speaking in the scene now." },
      ],
      { tokenBudget: 1, maxResults: 1 },
    );

    expect(dynamicLabels(preview)).toEqual(["Captain Hale"]);
  });

  test("retrieval context uses user and assistant chat history when Lumiverse marks it", async () => {
    const preview = await previewFor(
      [
        makeEntry({ entryId: "archive", label: "Archive Vault" }),
        makeEntry({ entryId: "beatrice", label: "Beatrice" }),
        makeEntry({ entryId: "filter", label: "Filter Behavior", key: ["filter"] }),
        makeEntry({ entryId: "enhancer", label: "RP Enhancer" }),
      ],
      [
        { role: "system", content: "System preset mentions Archive Vault.", __isChatHistory: false },
        { role: "user", content: "User says Beatrice has no filter.", __isChatHistory: true },
        {
          role: "assistant",
          content: "[[ Steven's RP enhancer V2]] This assistant-role preset block mentions RP Enhancer.",
          __isChatHistory: false,
        },
        {
          role: "assistant",
          content: "Beatrice says she does not have a filter when speaking here.",
          __isChatHistory: true,
        },
      ],
      { tokenBudget: 1, maxResults: 1 },
    );

    expect(preview.queryText).toContain("User: User says Beatrice has no filter.");
    expect(preview.queryText).toContain("Character: Beatrice says");
    expect(preview.queryText).not.toMatch(/System preset|RP enhancer/i);
    expect(dynamicLabels(preview)).toEqual(["Beatrice"]);
  });

  test("single generic token does not activate a multiword named-entity label", async () => {
    const preview = await previewFor(
      [
        makeEntry({ entryId: "raizen", label: "Raizen High School" }),
        makeEntry({ entryId: "kotori", label: "Kotori Itsuka" }),
      ],
      [
        {
          role: "assistant",
          content:
            "Kotori demands a report on the high-output unknowns while the group debates whether to retreat.",
        },
      ],
      { tokenBudget: 2, maxResults: 2 },
    );

    const pulledByLabel = new Map(preview.pulledNodes.map((entry) => [entry.label, entry]));
    expect(pulledByLabel.get("Kotori Itsuka")?.selectionRole).toBe("active_anchor");
    expect(pulledByLabel.get("Kotori Itsuka")?.reasons).toContain("mention");
    expect(pulledByLabel.get("Raizen High School")?.selectionRole).not.toBe("active_anchor");
    expect(pulledByLabel.get("Raizen High School")?.reasons).not.toContain("mention");
  });

  test("configured context window is treated as active scene for direct anchors", async () => {
    const preview = await previewFor(
      [
        makeEntry({ entryId: "yuzuru", label: "Yuzuru Yamai" }),
        makeEntry({ entryId: "natsumi", label: "Natsumi Kyouno" }),
        makeEntry({ entryId: "kaguya", label: "Kaguya Yamai" }),
        makeEntry({ entryId: "nia", label: "Nia Honjou" }),
        makeEntry({ entryId: "shido", label: "Shido Itsuka" }),
      ],
      [
        { role: "assistant", content: "Yuzuru observes the impasse while Natsumi asks whether everyone can leave." },
        { role: "user", content: "Hard pass." },
        { role: "assistant", content: "Kaguya shouts, Nia laughs, and Shido tries one last bargain." },
        { role: "user", content: "Still no." },
      ],
      { searchMode: "collapsed", contextMessages: 4, tokenBudget: 5, maxResults: 5 },
    );

    const labels = dynamicLabels(preview);
    expect(labels).toContain("Yuzuru Yamai");
    expect(labels).toContain("Natsumi Kyouno");
    expect(labels).toContain("Kaguya Yamai");
    expect(labels).toContain("Nia Honjou");
    expect(labels).toContain("Shido Itsuka");
  });

  test("collapsed mode keeps high-confidence scene support from summary and content matches", async () => {
    const preview = await previewFor(
      [
        makeEntry({
          entryId: "infirmary",
          label: "Blue Annex",
          summary: "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
          content: "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
        }),
      ],
      [
        {
          role: "assistant",
          content:
            "The character is in the infirmary treating crystal fever after an ambush and needs isolation and evacuation timing.",
        },
      ],
      { searchMode: "collapsed", tokenBudget: 2, maxResults: 2 },
    );

    expect(preview.pulledNodes.map((entry) => entry.label)).toContain("Blue Annex");
    expect(dynamicLabels(preview)).toContain("Blue Annex");
  });

  test("collapsed mode keeps scene support alongside a more literal keyed candidate", async () => {
    const preview = await previewFor(
      [
        makeEntry({
          entryId: "infirmary",
          label: "Blue Annex",
          summary: "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
          content: "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
        }),
        makeEntry({
          entryId: "glossary",
          label: "Crystal Fever",
          key: ["crystal"],
          summary: "A general glossary entry for the condition.",
          content: "A general glossary entry for the condition.",
        }),
      ],
      [
        {
          role: "assistant",
          content:
            "The character is in the infirmary treating crystal fever after an ambush and needs isolation and evacuation timing.",
        },
      ],
      { searchMode: "collapsed", tokenBudget: 2, maxResults: 2 },
    );

    expect(dynamicLabels(preview)).toContain("Crystal Fever");
    expect(dynamicLabels(preview)).toContain("Blue Annex");
  });

  test("collapsed mode protects selected faction scope members ahead of unrelated stragglers", async () => {
    const previousSpindle = (globalThis as any).spindle;
    try {
      (globalThis as any).spindle = {
        generate: {
          quiet: async (request: any) => {
            const prompt = String(request.messages?.at(-1)?.content ?? "");
            if (prompt.includes("Select the exact lore entries")) {
              return { content: JSON.stringify({ entryIds: ["beryl", "cyra"] }) };
            }
            const factionAChoice = /choiceId=(category:[^;]+); label=Faction A\b/.exec(prompt)?.[1] ?? "root";
            return { content: JSON.stringify({ nodeIds: [factionAChoice], reason: "Faction A cast" }) };
          },
        },
        log: { warn: () => undefined },
      };

      const preview = await buildRetrievalPreview(
        [{ role: "assistant", content: "Astra Vale asks for the Faction A cast briefing before the next move." }],
        makeSettings(),
        makeConfig({ searchMode: "collapsed", tokenBudget: 5, maxResults: 5 }),
        [
          makeCategorizedBook([
            {
              entry: makeEntry({
                entryId: "astra",
                label: "Astra Vale",
                content: "Astra Vale keeps dossiers on Beryl Cross and Cyra Drift.",
              }),
              path: ["Factions", "Faction A"],
            },
            { entry: makeEntry({ entryId: "borin", label: "Borin Tal" }), path: ["Factions", "Faction A"] },
            { entry: makeEntry({ entryId: "celia", label: "Celia Voss" }), path: ["Factions", "Faction A"] },
            { entry: makeEntry({ entryId: "darin", label: "Darin Sol" }), path: ["Factions", "Faction A"] },
            {
              entry: makeEntry({ entryId: "manual", label: "Faction A Protocol", content: "Generic protocol notes." }),
              path: ["Factions", "Faction A"],
            },
            { entry: makeEntry({ entryId: "beryl", label: "Beryl Cross" }), path: ["Factions", "Faction B"] },
            { entry: makeEntry({ entryId: "cyra", label: "Cyra Drift" }), path: ["Factions", "Faction C"] },
          ]),
        ],
        "test-user",
        { allowController: true },
      );

      expect(preview).not.toBeNull();
      const pulledLabels = preview!.pulledNodes.map((entry) => entry.label);
      expect(pulledLabels).toContain("Beryl Cross");
      expect(pulledLabels).toContain("Cyra Drift");
      const labels = dynamicLabels(preview!);
      expect(labels.slice(0, 4)).toEqual(["Astra Vale", "Borin Tal", "Celia Voss", "Darin Sol"]);
      expect(labels).not.toContain("Faction A Protocol");
    } finally {
      if (previousSpindle === undefined) {
        delete (globalThis as any).spindle;
      } else {
        (globalThis as any).spindle = previousSpindle;
      }
    }
  });

  test("traversal mode protects selected faction scope members ahead of unrelated stragglers", async () => {
    const previousSpindle = (globalThis as any).spindle;
    try {
      (globalThis as any).spindle = {
        generate: {
          quiet: async (request: any) => {
            const prompt = String(request.messages?.at(-1)?.content ?? "");
            if (prompt.includes("Select the exact lore entries")) {
              return { content: JSON.stringify({ entryIds: ["beryl", "cyra"] }) };
            }
            const factionAChoice = /choiceId=(category:[^;]+); label=Faction A\b/.exec(prompt)?.[1] ?? "";
            return {
              content: JSON.stringify({
                action: "retrieve",
                choiceIds: factionAChoice ? [factionAChoice] : [],
                reason: "Faction A cast",
              }),
            };
          },
        },
        log: { warn: () => undefined },
      };

      const preview = await buildRetrievalPreview(
        [{ role: "assistant", content: "Astra Vale asks for the Faction A cast briefing before the next move." }],
        makeSettings(),
        makeConfig({ searchMode: "traversal", traversalStepLimit: 1, tokenBudget: 5, maxResults: 5 }),
        [
          makeCategorizedBook([
            {
              entry: makeEntry({
                entryId: "astra",
                label: "Astra Vale",
                content: "Astra Vale keeps dossiers on Beryl Cross and Cyra Drift.",
              }),
              path: ["Factions", "Faction A"],
            },
            { entry: makeEntry({ entryId: "borin", label: "Borin Tal" }), path: ["Factions", "Faction A"] },
            { entry: makeEntry({ entryId: "celia", label: "Celia Voss" }), path: ["Factions", "Faction A"] },
            { entry: makeEntry({ entryId: "darin", label: "Darin Sol" }), path: ["Factions", "Faction A"] },
            {
              entry: makeEntry({ entryId: "manual", label: "Faction A Protocol", content: "Generic protocol notes." }),
              path: ["Factions", "Faction A"],
            },
            { entry: makeEntry({ entryId: "beryl", label: "Beryl Cross" }), path: ["Factions", "Faction B"] },
            { entry: makeEntry({ entryId: "cyra", label: "Cyra Drift" }), path: ["Factions", "Faction C"] },
          ]),
        ],
        "test-user",
        { allowController: true },
      );

      expect(preview).not.toBeNull();
      const pulledLabels = preview!.pulledNodes.map((entry) => entry.label);
      expect(pulledLabels).toContain("Beryl Cross");
      expect(pulledLabels).toContain("Cyra Drift");
      const labels = dynamicLabels(preview!);
      expect(labels.slice(0, 4)).toEqual(["Astra Vale", "Borin Tal", "Celia Voss", "Darin Sol"]);
      expect(labels).not.toContain("Faction A Protocol");
    } finally {
      if (previousSpindle === undefined) {
        delete (globalThis as any).spindle;
      } else {
        (globalThis as any).spindle = previousSpindle;
      }
    }
  });

  test("selected scope core reserve scales without forcing every large-scope member", async () => {
    const previousSpindle = (globalThis as any).spindle;
    try {
      (globalThis as any).spindle = {
        generate: {
          quiet: async (request: any) => {
            const prompt = String(request.messages?.at(-1)?.content ?? "");
            if (prompt.includes("Select the exact lore entries")) {
              return { content: JSON.stringify({ entryIds: [] }) };
            }
            const factionAChoice = /choiceId=(category:[^;]+); label=Faction A\b/.exec(prompt)?.[1] ?? "root";
            return { content: JSON.stringify({ nodeIds: [factionAChoice], reason: "Faction A cast" }) };
          },
        },
        log: { warn: () => undefined },
      };

      const members = Array.from({ length: 12 }, (_, index) =>
        makeEntry({
          entryId: `member-${index + 1}`,
          label: `Aster ${index + 1}`,
          content: "Primary cast profile.",
        }),
      );
      const preview = await buildRetrievalPreview(
        [{ role: "assistant", content: "The scene needs the Faction A cast briefing." }],
        makeSettings(),
        makeConfig({ searchMode: "collapsed", tokenBudget: 10, maxResults: 10 }),
        [
          makeCategorizedBook(
            members.map((entry) => ({
              entry,
              path: ["Factions", "Faction A"],
            })),
          ),
        ],
        "test-user",
        { allowController: true },
      );

      expect(preview).not.toBeNull();
      const labels = dynamicLabels(preview!);
      expect(labels).toHaveLength(6);
      expect(labels.every((label) => /^Aster \d+$/.test(label))).toBe(true);
    } finally {
      if (previousSpindle === undefined) {
        delete (globalThis as any).spindle;
      } else {
        (globalThis as any).spindle = previousSpindle;
      }
    }
  });

  test("live collapsed manifest cannot drop protected active anchors or scene support", async () => {
    const previousSpindle = (globalThis as any).spindle;
    const temperatures: unknown[] = [];
    const prompts: string[] = [];
    try {
      (globalThis as any).spindle = {
        generate: {
          quiet: async (request: any) => {
            const prompt = String(request.messages?.at(-1)?.content ?? "");
            prompts.push(prompt);
            temperatures.push(request.parameters?.temperature);
            if (prompt.includes("Select the exact lore entries")) {
              return { content: JSON.stringify({ entryIds: ["archive"] }) };
            }
            const categoryChoice = /choiceId=(category:[^;\s]+)/.exec(prompt)?.[1] ?? "root";
            return { content: JSON.stringify({ nodeIds: [categoryChoice], reason: "test scope" }) };
          },
        },
        log: { warn: () => undefined },
      };

      const preview = await buildRetrievalPreview(
        [
          { role: "assistant", content: "Earlier, Archive Vault was mentioned in background logistics." },
          { role: "user", content: "Set that aside for now." },
          { role: "assistant", content: "Captain Hale waits near the infirmary doors." },
          {
            role: "assistant",
            content:
              "Captain Hale needs the infirmary protocol for crystal fever after an ambush, including isolation and evacuation timing.",
          },
        ],
        makeSettings(),
        makeConfig({ searchMode: "collapsed", tokenBudget: 7, maxResults: 7 }),
        [
          makeBook([
            makeEntry({ entryId: "captain", label: "Captain Hale" }),
            makeEntry({
              entryId: "infirmary",
              label: "Blue Annex",
              summary:
                "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
              content:
                "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
            }),
            makeEntry({
              entryId: "archive",
              label: "Archive Vault",
              aliases: ["Archive Vault"],
              key: ["Archive Vault"],
              summary: "Background logistics storage.",
              content: "Background logistics storage.",
            }),
            makeEntry({
              entryId: "isolation",
              label: "Isolation Protocol",
              summary:
                "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
              content:
                "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
            }),
            makeEntry({
              entryId: "evacuation",
              label: "Evacuation Protocol",
              summary:
                "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
              content:
                "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
            }),
            makeEntry({
              entryId: "monitoring",
              label: "Monitoring Protocol",
              summary:
                "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
              content:
                "The infirmary protocol for treating crystal fever after an ambush, including isolation and evacuation timing.",
            }),
          ]),
        ],
        "test-user",
        { allowController: true },
      );

      expect(preview).not.toBeNull();
      const labels = dynamicLabels(preview!);
      expect(labels).toContain("Captain Hale");
      expect(labels).toContain("Blue Annex");
      expect(labels).toContain("Archive Vault");
      expect(prompts.some((prompt) => prompt.includes("Select the exact lore entries"))).toBe(true);
      expect(temperatures.length).toBeGreaterThanOrEqual(1);
      expect(temperatures.every((temperature) => temperature === 0.1)).toBe(true);
    } finally {
      if (previousSpindle === undefined) {
        delete (globalThis as any).spindle;
      } else {
        (globalThis as any).spindle = previousSpindle;
      }
    }
  });

  test("collapsed empty scope response falls back to scored entry scopes instead of broad roots", async () => {
    const previousSpindle = (globalThis as any).spindle;
    try {
      (globalThis as any).spindle = {
        generate: {
          quiet: async () => ({ content: JSON.stringify({ nodeIds: [], reason: "nothing relevant" }) }),
        },
        log: { warn: () => undefined },
      };

      const target = makeEntry({
        entryId: "captain",
        label: "Captain Hale",
        content: "Captain Hale is handling the infirmary emergency.",
      });
      const distractors = Array.from({ length: 12 }, (_, index) =>
        makeEntry({
          entryId: `archive-${index + 1}`,
          label: `Archive Note ${index + 1}`,
          content: "Unrelated logistics and background archives.",
        }),
      );
      const preview = await buildRetrievalPreview(
        [{ role: "assistant", content: "Captain Hale needs to answer the infirmary emergency now." }],
        makeSettings(),
        makeConfig({ searchMode: "collapsed", tokenBudget: 3, maxResults: 3 }),
        [
          makeCategorizedBook([
            { entry: target, path: ["Cast"] },
            ...distractors.map((entry) => ({ entry, path: ["Archives"] })),
          ]),
        ],
        "test-user",
        { allowController: true },
      );

      expect(preview).not.toBeNull();
      expect(preview!.pulledNodes.map((entry) => entry.label)).toContain("Captain Hale");
      expect(preview!.pulledNodes.map((entry) => entry.label)).not.toContain("Archive Note 1");
      expect(preview!.selectedScopes.map((scope) => scope.breadcrumb)).toContain("Cast");
      expect(preview!.fallbackReason).toContain("deterministic entry-scope fallback");
      expect(preview!.fallbackReason).not.toContain("top-level deterministic scope fallback");
    } finally {
      if (previousSpindle === undefined) {
        delete (globalThis as any).spindle;
      } else {
        (globalThis as any).spindle = previousSpindle;
      }
    }
  });

  test("collapsed refinement caps overbroad controller scope lists", async () => {
    const previousSpindle = (globalThis as any).spindle;
    try {
      (globalThis as any).spindle = {
        generate: {
          quiet: async (request: any) => {
            const prompt = String(request.messages?.at(-1)?.content ?? "");
            if (prompt.includes("CATEGORY CHOICES:")) {
              const nodeIds = Array.from(prompt.matchAll(/^- \[([^\]]+)\]/gm), (match) => match[1]);
              return { content: JSON.stringify({ nodeIds, reason: "all children" }) };
            }
            const topChoice = /choiceId=(category:[^;]+); label=Top\b/.exec(prompt)?.[1] ?? "root";
            return { content: JSON.stringify({ nodeIds: [topChoice], reason: "top branch" }) };
          },
        },
        log: { warn: () => undefined },
      };

      const entries = Array.from({ length: 15 }, (_, index) =>
        makeEntry({
          entryId: `protocol-${index + 1}`,
          label: `Protocol ${index + 1}`,
          summary: "Emergency infirmary protocol support.",
          content: "Emergency infirmary protocol support.",
        }),
      );
      const preview = await buildRetrievalPreview(
        [{ role: "assistant", content: "The scene needs emergency infirmary protocol support." }],
        makeSettings(),
        makeConfig({ searchMode: "collapsed", tokenBudget: 6, maxResults: 6 }),
        [
          makeCategorizedBook(
            entries.map((entry, index) => ({
              entry,
              path: ["Top", `Child ${index + 1}`],
            })),
          ),
        ],
        "test-user",
        { allowController: true },
      );

      expect(preview).not.toBeNull();
      expect(preview!.selectedScopes).toHaveLength(5);
      expect(preview!.trace.some((step) => step.summary.includes("Narrowed retrieval to 5 scope(s)"))).toBe(true);
    } finally {
      if (previousSpindle === undefined) {
        delete (globalThis as any).spindle;
      } else {
        (globalThis as any).spindle = previousSpindle;
      }
    }
  });

  test("traversal retrieve respects configured scope pick limit", async () => {
    const previousSpindle = (globalThis as any).spindle;
    try {
      (globalThis as any).spindle = {
        generate: {
          quiet: async (request: any) => {
            const prompt = String(request.messages?.at(-1)?.content ?? "");
            if (prompt.includes("hierarchical knowledge tree")) {
              const choiceIds = Array.from(prompt.matchAll(/choiceId=(category:[^;]+);/g), (match) => match[1]);
              return { content: JSON.stringify({ action: "finish", choiceIds, reason: "all visible branches" }) };
            }
            return { content: JSON.stringify({ entryIds: [] }) };
          },
        },
        log: { warn: () => undefined },
      };

      const entries = Array.from({ length: 15 }, (_, index) =>
        makeEntry({
          entryId: `triage-${index + 1}`,
          label: `Triage Branch ${index + 1}`,
          summary: "Emergency infirmary triage support.",
          content: "Emergency infirmary triage support.",
        }),
      );
      const preview = await buildRetrievalPreview(
        [{ role: "assistant", content: "The scene needs emergency infirmary triage support." }],
        makeSettings(),
        makeConfig({
          searchMode: "traversal",
          selectiveRetrieval: false,
          traversalStepLimit: 1,
          scopePickLimit: 8,
          tokenBudget: 20,
          maxResults: 20,
        }),
        [
          makeCategorizedBook(
            entries.map((entry, index) => ({
              entry,
              path: [`Branch ${index + 1}`],
            })),
          ),
        ],
        "test-user",
        { allowController: true },
      );

      expect(preview).not.toBeNull();
      expect(preview!.retrievedScopes).toHaveLength(8);
      expect(preview!.trace.some((step) => step.summary.includes("from 8 retrieval scope(s)"))).toBe(true);
      expect(preview!.fallbackReason).toBeNull();
    } finally {
      if (previousSpindle === undefined) {
        delete (globalThis as any).spindle;
      } else {
        (globalThis as any).spindle = previousSpindle;
      }
    }
  });

  test("selected active entries expand into related mechanics and organizations from their own content", async () => {
    const preview = await previewFor(
      [
        makeEntry({
          entryId: "captain",
          label: "Captain Hale",
          content:
            "Captain Hale works under the Harbor Guild, follows Signal Doctrine, and coordinates with Guide Rowan whenever a field medic is assigned to dangerous inventory work.",
        }),
        makeEntry({
          entryId: "guild",
          label: "Harbor Guild",
          tags: ["organization"],
          content: "Harbor Guild is the organization responsible for safe workplace assignments.",
        }),
        makeEntry({
          entryId: "doctrine",
          label: "Signal Doctrine",
          tags: ["protocol"],
          content: "Signal Doctrine is a protocol for deciding when a support specialist needs backup.",
        }),
        makeEntry({
          entryId: "rowan",
          label: "Guide Rowan",
          content: "Guide Rowan is the liaison Captain Hale calls when inventory duty becomes dangerous.",
        }),
        makeEntry({
          entryId: "unrelated",
          label: "Archive Vault",
          content: "Archive Vault is unrelated storage lore.",
        }),
      ],
      [{ role: "assistant", content: "Captain Hale wants to put the medic on inventory duty for a week." }],
      { tokenBudget: 4, maxResults: 4 },
    );

    expect(dynamicLabels(preview)).toContain("Captain Hale");
    expect(dynamicLabels(preview)).toContain("Harbor Guild");
    expect(dynamicLabels(preview)).toContain("Signal Doctrine");
    expect(dynamicLabels(preview)).toContain("Guide Rowan");
    expect(dynamicLabels(preview)).not.toContain("Archive Vault");
  });

  test("manifest selectedEntryIds stay consistent with selected dynamic entries", async () => {
    const preview = await previewFor(
      [
        makeEntry({ entryId: "constant", label: "Always-On Operating Rule", constant: true }),
        makeEntry({ entryId: "captain", label: "Captain Hale" }),
        makeEntry({ entryId: "medic", label: "Medic Protocol", key: ["medic"] }),
      ],
      [{ role: "assistant", content: "Captain Hale asked the medic for a status report." }],
    );

    const manifestIds = new Set(preview.scopeManifestCounts.flatMap((manifest) => manifest.selectedEntryIds));
    const selectedIds = new Set(preview.manifestSelectedEntries.map((entry) => entry.entryId));
    expect(manifestIds).toEqual(selectedIds);
    expect(preview.scopeManifestCounts.reduce((total, manifest) => total + manifest.manifestEntryCount, 0)).toBeGreaterThanOrEqual(
      selectedIds.size,
    );
  });
});
