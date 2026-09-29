import { describe, expect, test } from "bun:test";
import type { FrontendState } from "../types";
import { filterBooks, isRecallActive } from "./helpers";

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
      controllerMaxTokens: 8192,
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
