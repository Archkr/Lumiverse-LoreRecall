import { describe, expect, test } from "bun:test";
import type { FrontendState } from "../types";
import { attachmentScopeSummary, filterBooks, getBookAttachmentScopes, getBookActivationLabel, getBookRecallChoice, getRecallBookIds, getRecallStatus, getSourceListPresentation, isRecallActive } from "./helpers";

test("Sources keeps three attached books visible while only one is selected for Recall", () => {
  const state = makeState({
    attachedBookSources: { "date-a": "global", "date-b": "global", "date-c": "global" },
    bookConfigs: {
      "date-a": { enabled: true, description: "", permission: "read_write" },
      "date-b": { enabled: false, description: "", permission: "read_write" },
      "date-c": { enabled: true, description: "", permission: "write_only" },
    },
    bookStatuses: { "date-a": {}, "date-b": {}, "date-c": {} } as any,
  });
  expect(getRecallBookIds(state)).toEqual(["date-a"]);
  expect(getSourceListPresentation(state, "").bookIds).toHaveLength(3);
  state.bookConfigs["date-a"].enabled = false;
  expect(getRecallBookIds(state)).toEqual([]);
  state.bookConfigs["date-b"].enabled = true;
  expect(getRecallBookIds(state)).toEqual(["date-b"]);
});

test("Sources labels LumiBooks summaries and disables their Recall switch while Codex remains selectable", () => {
  const state = makeState({
    attachedBookSources: { "date-a": "chat", "date-b": "chat" },
    bookConfigs: {
      "date-a": { enabled: true, description: "", permission: "read_write" },
      "date-b": { enabled: true, description: "", permission: "read_write" },
    }, bookStatuses: { "date-a": {}, "date-b": {} } as any,
  });
  state.allWorldBooks[0].activationOwner = "lumibooks";
  state.allWorldBooks[1].name = "LumiBooks Codex";
  expect(getRecallBookIds(state)).toEqual(["date-b"]);
  expect(getSourceListPresentation(state, "").bookIds).toEqual(["date-a", "date-b"]);
  expect(getBookActivationLabel(state, "date-a")).toBe("Managed by LumiBooks");
  expect(getBookRecallChoice(state, "date-a")).toMatchObject({ selected: false, disabled: true });
  expect(getBookRecallChoice(state, "date-a").detail).toContain("in place of older chat messages");
  expect(getBookActivationLabel(state, "date-b")).toBe("Selected for Recall");
  expect(getBookRecallChoice(state, "date-b")).toMatchObject({ selected: true, disabled: false });
  expect(state.bookConfigs["date-a"].enabled).toBe(true);
});

function makeState(overrides: Partial<FrontendState> = {}): FrontendState {
  return {
    activeChatId: "chat",
    activeCharacterId: "character",
    activeCharacterName: "Character",
    allWorldBooks: [
      { id: "date-a", name: "Date A Live V1", description: "first", updatedAt: 1 },
      { id: "date-b", name: "Date A Live V2", description: "second", updatedAt: 1 },
      { id: "date-c", name: "Date A Bullet", description: "third", updatedAt: 1 },
      { id: "other", name: "Other Book", description: "misc", updatedAt: 1 },
    ],
    attachedBookSources: {},
    attachedBookScopes: {},
    hostSelectionAvailable: true,
    availableConnections: [],
    bookConfigs: {},
    bookStatuses: {},
    characterConfig: {
      enabled: true,
      managedBookIds: [],
      searchMode: "collapsed",
      collapsedDepth: 2,
      maxResults: 6,
      maxTraversalDepth: 3,
      traversalStepLimit: 5,
      scopePickLimit: 5,
      tokenBudget: 6,
      rerankEnabled: false,
      selectiveRetrieval: true,
      multiBookMode: "unified",
      contextMessages: 10,
    },
    diagnosticsResults: [],
    globalSettings: {
      enabled: true,
      autoDetectPattern: "*recall*",
      controllerConnectionId: null,
      controllerTemperature: 0.2,
      buildDetail: "lite",
      treeGranularity: 0,
      chunkTokens: 30000,
      dedupMode: "none",
      jevProvider: "typesafe",
      jevModel: "",
      jevTimeoutMs: 8000,
      jevThreshold: 0.6,
    },
    managedEntries: {},
    preview: null,
    retrievalFeed: { sessions: [] },
    suggestedBookIds: [],
    treeIndexes: {},
    unassignedCounts: {},
    ...overrides,
  };
}

describe("filterBooks", () => {
  test("retrieval status follows the global switch and host support, not legacy character enablement", () => {
    const state = makeState();
    state.characterConfig!.enabled = false;
    expect(isRecallActive(state)).toBe(true);
    expect(isRecallActive({ ...state, hostSelectionAvailable: false })).toBe(false);
    expect(isRecallActive({ ...state, globalSettings: { ...state.globalSettings, enabled: false } })).toBe(false);
    expect(getRecallStatus(state).label).toBe("Retrieval on");
    expect(getRecallStatus({ ...state, hostSelectionAvailable: false }).label).toBe("Retrieval unavailable");
    expect(getRecallStatus({ ...state, globalSettings: { ...state.globalSettings, enabled: false } }).label).toBe("Retrieval off");
  });

  test("searches every lorebook while a query is active", () => {
    const state = makeState({
      characterConfig: {
        ...makeState().characterConfig!,
        managedBookIds: ["date-a"],
      },
    });

    expect(filterBooks(state, "Date")).toEqual(["date-a", "date-b", "date-c"]);
  });

  test("keeps sibling prefix matches visible after managing one book", () => {
    const before = makeState();
    const after = makeState({
      characterConfig: {
        ...makeState().characterConfig!,
        managedBookIds: ["date-b"],
      },
    });

    expect(filterBooks(before, "Date A")).toEqual(["date-a", "date-b", "date-c"]);
    expect(filterBooks(after, "Date A")).toEqual(["date-a", "date-b", "date-c"]);
  });

  test("shows every lorebook when the query is empty even with curated books", () => {
    const state = makeState({
      bookConfigs: { other: { enabled: true, description: "", permission: "read_write" } },
      characterConfig: {
        ...makeState().characterConfig!,
        managedBookIds: ["date-a"],
      },
      suggestedBookIds: ["date-c"],
    });

    expect(filterBooks(state, "")).toEqual(["date-a", "date-b", "date-c", "other"]);
  });

  test("shows all books on empty query when there is no curated set", () => {
    expect(filterBooks(makeState(), "")).toEqual(["date-a", "date-b", "date-c", "other"]);
  });
});

describe("attached source presentation", () => {
  test("shows all six distinct books and the three global attachments", () => {
    const state = makeState({
      allWorldBooks: ["g1", "g2", "shared", "c1", "p1", "chat1"].map((id) => ({ id, name: id, description: "", updatedAt: 1 })),
      attachedBookSources: { g1: "global", g2: "global", shared: "character", c1: "character", p1: "persona", chat1: "chat" },
      attachedBookScopes: { g1: ["global"], g2: ["global"], shared: ["character", "global"], c1: ["character"], p1: ["persona"], chat1: ["chat"] },
    });
    expect(getSourceListPresentation(state, "").bookIds).toHaveLength(6);
    expect(getSourceListPresentation(state, "").missingCount).toBe(0);
    expect(attachmentScopeSummary(state)).toBe("3 global · 2 character · 1 chat · 1 persona");
    expect(getBookAttachmentScopes(state, "shared")).toEqual(["character", "global"]);
  });

  test("reports missing attachment rows as a data error instead of no books", () => {
    const state = makeState({
      allWorldBooks: [], attachedBookSources: { g1: "global" }, attachedBookScopes: { g1: ["global"] },
    });
    const presentation = getSourceListPresentation(state, "");
    expect(presentation).toMatchObject({ bookIds: [], missingCount: 1, emptyTitle: "Lorebook list unavailable" });
    expect(presentation.emptyDetail).toContain("1 attached lorebook is missing");
  });

  test("does not show stale unattached rows when the inventory disagrees", () => {
    const state = makeState({
      allWorldBooks: [{ id: "old", name: "Old", description: "", updatedAt: 1 }],
      attachedBookSources: {}, attachedBookScopes: {},
    });
    expect(getSourceListPresentation(state, "")).toMatchObject({
      bookIds: [], extraCount: 1, emptyTitle: "Lorebook list unavailable",
    });
  });

  test("distinguishes an empty search from missing attached books", () => {
    const state = makeState({
      allWorldBooks: [{ id: "date-a", name: "Date A Live V1", description: "", updatedAt: 1 }],
      attachedBookSources: { "date-a": "global" }, attachedBookScopes: { "date-a": ["global"] },
    });
    expect(getSourceListPresentation(state, "unmatched")).toMatchObject({ missingCount: 0, emptyTitle: "No matching lorebooks" });
  });
});
