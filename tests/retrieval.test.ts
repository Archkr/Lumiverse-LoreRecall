import { describe, expect, it } from "bun:test";

import { __testing, buildRetrievalPreview } from "../src/backend/retrieval";
import type { ChatLikeMessage, RuntimeBook, ScoredEntry } from "../src/backend/contracts";
import type {
  BookRetrievalConfig,
  BookStatus,
  BookSummary,
  BookTreeIndex,
  CharacterRetrievalConfig,
  GlobalLoreRecallSettings,
  ManagedBookEntryView,
} from "../src/types";

function makeEntry(
  bookId: string,
  bookName: string,
  entryId: string,
  label: string,
  summary: string,
  collapsedText: string,
): RuntimeBook["cache"]["entries"][number] {
  const base: ManagedBookEntryView = {
    entryId,
    worldBookId: bookId,
    worldBookName: bookName,
    label,
    aliases: [],
    summary,
    collapsedText,
    tags: [],
    comment: "",
    key: [],
    keysecondary: [],
    disabled: false,
    updatedAt: 0,
    groupName: "",
    constant: false,
    selective: false,
    vectorized: false,
    previewText: collapsedText,
  };

  return {
    ...base,
    content: collapsedText,
    legacyTree: null,
  };
}

function makeBook(args: {
  id: string;
  name: string;
  description?: string;
  categories: Array<{
    id: string;
    label: string;
    summary: string;
    entries: Array<{
      id: string;
      label: string;
      summary: string;
      text: string;
    }>;
  }>;
}): RuntimeBook {
  const rootId = `${args.id}-root`;
  const nodes: BookTreeIndex["nodes"] = {
    [rootId]: {
      id: rootId,
      kind: "root",
      label: "Root",
      summary: args.description ?? `${args.name} root summary`,
      parentId: null,
      childIds: args.categories.map((category) => category.id),
      entryIds: [],
      collapsed: false,
      createdBy: "manual",
    },
  };

  const entries = args.categories.flatMap((category) => {
    nodes[category.id] = {
      id: category.id,
      kind: "category",
      label: category.label,
      summary: category.summary,
      parentId: rootId,
      childIds: [],
      entryIds: category.entries.map((entry) => entry.id),
      collapsed: false,
      createdBy: "manual",
    };

    return category.entries.map((entry) =>
      makeEntry(args.id, args.name, entry.id, entry.label, entry.summary, entry.text),
    );
  });

  const summary: BookSummary = {
    id: args.id,
    name: args.name,
    description: args.description ?? "",
    updatedAt: 0,
  };

  const config: BookRetrievalConfig = {
    enabled: true,
    description: args.description ?? "",
    permission: "read_only",
  };

  const status: BookStatus = {
    bookId: args.id,
    attachedToCharacter: true,
    selectedForCharacter: true,
    entryCount: entries.length,
    categoryCount: args.categories.length,
    rootEntryCount: 0,
    unassignedCount: 0,
    treeMissing: false,
    warnings: [],
  };

  return {
    summary,
    cache: {
      version: 2,
      bookId: args.id,
      bookUpdatedAt: 0,
      name: args.name,
      description: args.description ?? "",
      entries,
    },
    tree: {
      version: 2,
      bookId: args.id,
      rootId,
      nodes,
      unassignedEntryIds: [],
      lastBuiltAt: 0,
      buildSource: "manual",
    },
    config,
    status,
  };
}

function makeHarborBook(): RuntimeBook {
  return makeBook({
    id: "harbor-book",
    name: "Harbor Chronicle",
    description: "People, places, emergencies, and local groups around a busy port settlement.",
    categories: [
      {
        id: "people",
        label: "People",
        summary: "Named individuals and collective relationships in the harbor.",
        entries: [
          {
            id: "captain-rowan",
            label: "Captain Rowan",
            summary: "A veteran commander responsible for coordinating the harbor watch.",
            text: "Captain Rowan leads the harbor watch and directs the settlement's defenses.",
          },
          {
            id: "mira-vale",
            label: "Mira Vale",
            summary: "A fast-moving scout who relays field updates to Rowan.",
            text: "Mira Vale serves as a scout and trusted field partner during emergencies.",
          },
          {
            id: "harbor-collective",
            label: "Harbor Collective",
            summary: "The harbor crew, couriers, and watch coordinators act as a group when the port is under pressure.",
            text: "The Harbor Collective is a group entry covering how the harbor crew coordinate as a team.",
          },
        ],
      },
      {
        id: "places",
        label: "Places",
        summary: "Named places around the settlement and its surrounding waters.",
        entries: [
          {
            id: "north-pier",
            label: "North Pier",
            summary: "A key harbor platform used for lookouts, loading, and emergency staging.",
            text: "North Pier is the primary staging platform for harbor traffic and lookout duty.",
          },
        ],
      },
      {
        id: "threats",
        label: "Threats",
        summary: "Danger systems, looming crises, and response doctrine.",
        entries: [
          {
            id: "red-tide",
            label: "Red Tide",
            summary: "A looming floodfront threat that forces the harbor into coordinated emergency response.",
            text: "Red Tide is a major threat entry covering the floodfront and response protocol.",
          },
        ],
      },
    ],
  });
}

const settings: GlobalLoreRecallSettings = {
  enabled: true,
  autoDetectPattern: "",
  controllerConnectionId: null,
  controllerTemperature: 0.2,
  controllerMaxTokens: 8192,
  buildDetail: "lite",
  treeGranularity: 2,
  chunkTokens: 30000,
  dedupMode: "none",
};

const config: CharacterRetrievalConfig = {
  enabled: true,
  managedBookIds: [],
  searchMode: "collapsed",
  collapsedDepth: 3,
  maxResults: 8,
  maxTraversalDepth: 6,
  traversalStepLimit: 4,
  tokenBudget: 8,
  rerankEnabled: false,
  selectiveRetrieval: true,
  multiBookMode: "unified",
  contextMessages: 4,
};

describe("Lore Recall retrieval helpers", () => {
  it("sanitizes protocol-heavy assistant messages into scene-only recent conversation", () => {
    const messages: ChatLikeMessage[] = [
      {
        role: "assistant",
        content:
          "The watch captain studied the smoke above the gate.\nImportant note: keep the visitor outside the main viewpoint.\n[Narrative Protocol: Scene Control]\nTreat the visitor as a Black Box.",
      },
      {
        role: "user",
        content: "I call down from the wall.",
      },
    ];

    const recentConversation = __testing.buildRecentConversation(messages, 4);
    expect(recentConversation).toContain("Character: The watch captain studied the smoke above the gate.");
    expect(recentConversation).toContain("User: I call down from the wall.");
    expect(recentConversation).not.toContain("Important note:");
    expect(recentConversation).not.toContain("Narrative Protocol");
    expect(recentConversation).not.toContain("Black Box");
  });

  it("resolves raw node ids, document selectors, and legacy synthetic ids", () => {
    const bookA = makeBook({
      id: "book-a",
      name: "Book A",
      categories: [{ id: "cat-a", label: "Category A", summary: "Summary A", entries: [] }],
    });
    const bookB = makeBook({
      id: "book-b",
      name: "Book B",
      categories: [{ id: "cat-b", label: "Category B", summary: "Summary B", entries: [] }],
    });

    const scopes = __testing.resolveScopeChoices(
      ["cat-a", "doc:book-b", "category:book-a:cat-a"],
      [bookA, bookB],
    );

    expect(scopes).toHaveLength(2);
    expect(scopes.some((scope) => scope.book.summary.id === "book-a" && scope.nodeId === "cat-a")).toBeTrue();
    expect(scopes.some((scope) => scope.book.summary.id === "book-b" && scope.nodeId === bookB.tree.rootId)).toBeTrue();
  });

  it("keeps the full manifest for a scope instead of truncating to eight entries", () => {
    const entries = Array.from({ length: 11 }, (_, index) => ({
      id: `entry-${index + 1}`,
      label: `Entry ${index + 1}`,
      summary: `Summary ${index + 1}`,
      text: `Text ${index + 1}`,
    }));
    const book = makeBook({
      id: "manifest-book",
      name: "Manifest Book",
      categories: [{ id: "scope-node", label: "Scope Node", summary: "Scope summary", entries }],
    });

    const candidates: ScoredEntry[] = book.cache.entries.map((entry, index) => ({
      entry,
      score: 100 - index,
      reasons: ["branch"],
    }));

    const manifests = __testing.buildScopedManifests(candidates, [{ book, nodeId: "scope-node" }]);
    expect(manifests).toHaveLength(1);
    expect(manifests[0]?.candidates).toHaveLength(11);
  });

  it("prefers focal entities and compact group coverage over one-per-scope spreading", () => {
    const book = makeHarborBook();
    const recentConversation =
      "User: Captain Rowan and Mira Vale stood on North Pier while everyone in the harbor crew gathered together as the Red Tide rolled closer.";
    const scopes = [
      { book, nodeId: "people" },
      { book, nodeId: "places" },
      { book, nodeId: "threats" },
    ];

    const candidates = __testing.collectCandidatesForScopes(recentConversation, scopes);
    const ranked = __testing.rankSelectionCandidates(recentConversation, candidates, scopes);
    const selected = __testing.buildDeterministicSelection(ranked, 4);

    expect(ranked.find((item) => item.candidate.entry.entryId === "north-pier")?.selectionRole).toBe("location_context");
    expect(ranked.find((item) => item.candidate.entry.entryId === "red-tide")?.selectionRole).toBe(
      "threat_or_rule_context",
    );
    expect(ranked.find((item) => item.candidate.entry.entryId === "harbor-collective")?.selectionRole).toBe(
      "group_cover",
    );
    expect(selected.some((item) => item.entry.entryId === "captain-rowan")).toBeTrue();
    expect(selected.some((item) => item.entry.entryId === "mira-vale")).toBeTrue();
    expect(selected.some((item) => item.entry.entryId === "harbor-collective")).toBeTrue();
    expect(selected.filter((item) => item.entry.worldBookId === book.summary.id && item.reasons.includes("branch"))).toHaveLength(
      4,
    );
    expect(selected.filter((item) => item.entry.entryId.startsWith("captain") || item.entry.entryId === "mira-vale" || item.entry.entryId === "harbor-collective")).toHaveLength(3);
  });

  it("drops helper context before focal entities when the budget is tight", () => {
    const book = makeHarborBook();
    const recentConversation =
      "User: Captain Rowan and Mira Vale stood on North Pier while everyone in the harbor crew gathered together as the Red Tide rolled closer.";
    const scopes = [
      { book, nodeId: "people" },
      { book, nodeId: "places" },
      { book, nodeId: "threats" },
    ];

    const candidates = __testing.collectCandidatesForScopes(recentConversation, scopes);
    const ranked = __testing.rankSelectionCandidates(recentConversation, candidates, scopes);
    const selected = __testing.buildDeterministicSelection(ranked, 2);

    expect(selected.map((item) => item.entry.entryId)).toEqual(["captain-rowan", "mira-vale"]);
    expect(selected.every((item) => item.selectionRole === "present_entity")).toBeTrue();
  });

  it("builds a preview from sanitized conversation and reports generic selection roles", async () => {
    const book = makeHarborBook();

    const preview = await buildRetrievalPreview(
      [
        {
          role: "assistant",
          content:
            "Captain Rowan studied the North Pier while the sirens echoed across the harbor.\nImportant note: keep the visitor outside the main viewpoint.\n[Narrative Protocol: Scene Control]",
        },
        {
          role: "user",
          content: "I step onto the pier and stare at Rowan while the floodfront closes in.",
        },
      ],
      settings,
      { ...config, managedBookIds: [book.summary.id] },
      [book],
      "user-1",
      { allowController: false },
    );

    expect(preview).not.toBeNull();
    expect(preview?.recentConversation).toContain(
      "Character: Captain Rowan studied the North Pier while the sirens echoed across the harbor.",
    );
    expect(preview?.recentConversation).not.toContain("Important note:");
    expect(preview?.fallbackPath[0]).toContain("top-level deterministic scope fallback");
    expect(preview?.selectionSummary).toContain("Scene-first selection");
    expect(preview?.scopeManifestCounts.some((scope) => scope.manifestEntryCount >= 1)).toBeTrue();
    expect(preview?.manifestSelectedEntries.some((node) => !!node.selectionRole)).toBeTrue();
    expect(preview?.manifestSelectedEntries.every((node) => node.worldBookName === "Harbor Chronicle")).toBeTrue();
  });
});
