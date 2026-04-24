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
          "Shido looked over the crater as the smoke cleared.\nImportant note: user is not the main character.\n[Narrative Protocol: Strict Role Separation]\nTreat Mumiah as a Black Box.",
      },
      {
        role: "user",
        content: "I walk up behind him and call out.",
      },
    ];

    const recentConversation = __testing.buildRecentConversation(messages, 4);
    expect(recentConversation).toContain("Character: Shido looked over the crater as the smoke cleared.");
    expect(recentConversation).toContain("User: I walk up behind him and call out.");
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

  it("builds a preview from sanitized conversation and keeps scope-local manifest counts", async () => {
    const book = makeBook({
      id: "date-a-live",
      name: "Date A Live Test",
      description: "A lorebook about spirits, powers, and command response.",
      categories: [
        {
          id: "combat-magic",
          label: "Combat & Magic",
          summary: "Magic systems, angels, and astral dresses.",
          entries: [
            {
              id: "astral-dress",
              label: "Astral Dress",
              summary: "Spiritual armor made of Reiryoku.",
              text: "Spiritual armor made of Reiryoku.",
            },
            {
              id: "angel",
              label: "Angel",
              summary: "Manifested miracle / Spirit weapon.",
              text: "Manifested miracle / Spirit weapon.",
            },
          ],
        },
        {
          id: "characters",
          label: "Characters",
          summary: "Major cast entries.",
          entries: [
            {
              id: "shido",
              label: "Shido Itsuka",
              summary: "The boy who tries to save Spirits.",
              text: "The boy who tries to save Spirits.",
            },
          ],
        },
      ],
    });

    const preview = await buildRetrievalPreview(
      [
        {
          role: "assistant",
          content:
            "Shido could see Kiryu Oka in her astral dress at the center of the crater.\nImportant note: user is not the main character.\n[Narrative Protocol: Strict Role Separation]",
        },
        {
          role: "user",
          content: "I ambush him from behind and talk about my angel.",
        },
      ],
      settings,
      { ...config, managedBookIds: [book.summary.id] },
      [book],
      "user-1",
      { allowController: false },
    );

    expect(preview).not.toBeNull();
    expect(preview?.recentConversation).toContain("Character: Shido could see Kiryu Oka in her astral dress at the center of the crater.");
    expect(preview?.recentConversation).not.toContain("Important note:");
    expect(preview?.fallbackPath[0]).toContain("top-level deterministic scope fallback");
    expect(preview?.scopeManifestCounts.some((scope) => scope.manifestEntryCount === 2)).toBeTrue();
  });
});
