import { describe, expect, test } from "bun:test";
import { DEFAULT_BOOK_CONFIG, createEmptyTreeIndex, normalizeBookConfig } from "../shared";
import type { RuntimeBook, IndexedEntry } from "./contracts";
import { attachedCharacterIds, attachedWorkspaceBooks, buildAttachedWorkspaceState, mapAttachedBookScopes, mapAttachedBookSources, overlayActiveEntries, recallEligibleBooks, toWorkspaceEntry } from "./attached";

function book(): RuntimeBook {
  const cached: IndexedEntry = {
    entryId: "old", worldBookId: "book", worldBookName: "Book", label: "Old", aliases: [],
    summary: "Summary", collapsedText: "", tags: [], comment: "old", key: ["old"], keysecondary: [],
    disabled: false, constant: false, content: "stale", previewText: "stale", updatedAt: 1,
    groupName: "", selective: false, vectorized: false, legacyTree: null,
  };
  return {
    summary: { id: "book", name: "Book", description: "", updatedAt: 1 },
    cache: { version: 2, bookId: "book", bookUpdatedAt: 1, name: "Book", description: "", entries: [cached] },
    config: { ...DEFAULT_BOOK_CONFIG, enabled: true }, tree: createEmptyTreeIndex("book"),
    status: { bookId: "book", attachedToCharacter: true, selectedForCharacter: true,
      entryCount: 1, categoryCount: 0, rootEntryCount: 0, unassignedCount: 0, treeMissing: true, warnings: [] },
  };
}

describe("attached lorebooks", () => {
  test("excludes summary books and mixed-book summary entries without changing trees or saved choices", () => {
    const summary = { ...book(), summary: { ...book().summary, id: "summary", activationOwner: "lumibooks" as const } };
    const codex = { ...book(), summary: { ...book().summary, id: "codex", name: "LumiBooks Codex" } };
    const mixed = book();
    mixed.cache.entries.push({ ...mixed.cache.entries[0], entryId: "chapter", activationOwner: "lumibooks", constant: true });
    const originalTree = JSON.stringify(mixed.tree);
    const eligible = recallEligibleBooks([summary, codex, mixed]);
    expect(eligible.map((book) => book.summary.id)).toEqual(["codex", "book"]);
    expect(eligible[1].cache.entries.map((entry) => entry.entryId)).toEqual(["old"]);
    expect(mixed.cache.entries).toHaveLength(2);
    expect(JSON.stringify(mixed.tree)).toBe(originalTree);
    expect(summary.config.enabled).toBe(true);
    expect(attachedWorkspaceBooks(["summary", "codex", "book"], [summary, codex, mixed])).toHaveLength(3);
  });
  test("books opt in explicitly while existing saved choices remain compatible", () => {
    expect(DEFAULT_BOOK_CONFIG.enabled).toBe(false);
    expect(normalizeBookConfig().enabled).toBe(false);
    expect(normalizeBookConfig({ description: "Previously configured" }).enabled).toBe(false);
    expect(normalizeBookConfig({ enabled: true }).enabled).toBe(true);
    const selected = book();
    const unselected = ["second", "third"].map((id) => ({ ...book(),
      summary: { ...book().summary, id }, config: normalizeBookConfig() }));
    expect(recallEligibleBooks([selected, ...unselected]).map((book) => book.summary.id)).toEqual(["book"]);
    expect(attachedWorkspaceBooks(["book", "second", "third"], [selected, ...unselected])).toHaveLength(3);
  });
  test("leaves disabled and write-only books on native activation", () => {
    const readable = book();
    const readOnly = { ...book(), summary: { ...book().summary, id: "read-only" },
      config: { ...DEFAULT_BOOK_CONFIG, enabled: true, permission: "read_only" as const } };
    const disabled = { ...book(), summary: { ...book().summary, id: "disabled" },
      config: { ...DEFAULT_BOOK_CONFIG, enabled: false } };
    const writeOnly = { ...book(), summary: { ...book().summary, id: "write-only" },
      config: { ...DEFAULT_BOOK_CONFIG, enabled: true, permission: "write_only" as const } };
    expect(recallEligibleBooks([readable, readOnly, disabled, writeOnly]).map((item) => item.summary.id))
      .toEqual(["book", "read-only"]);
  });

  test("follows all attachment scopes and changes with the active chat", () => {
    const first = mapAttachedBookSources({
      character: ["character-book"], persona: "persona-book", chat: ["chat-one"], global: ["global-book"],
    });
    const second = mapAttachedBookSources({
      character: ["character-book"], persona: "persona-book", chat: ["chat-two", "global-book"], global: ["global-book"],
    });
    expect(first).toEqual({
      "character-book": "character", "persona-book": "persona", "chat-one": "chat", "global-book": "global",
    });
    expect(second).toEqual({
      "character-book": "character", "persona-book": "persona", "chat-two": "chat", "global-book": "chat",
    });
  });

  test("uses only current host entries and their latest content and flags", () => {
    const [active] = overlayActiveEntries([book()], [
      { id: "old", world_book_id: "book", comment: "old", key: ["old"], keysecondary: [],
        content: "updated", disabled: true, constant: false, extensions: {}, book_source: "chat" },
      { id: "new", world_book_id: "book", comment: "new", key: ["new"], keysecondary: [],
        content: "newly attached content", disabled: false, constant: true, extensions: {}, book_source: "chat" },
    ]);
    expect(active.cache.entries.map((entry) => entry.entryId)).toEqual(["old", "new"]);
    expect(active.cache.entries[0]).toMatchObject({ content: "updated", disabled: true });
    expect(active.cache.entries[1]).toMatchObject({ content: "newly attached content", constant: true });
    expect(book().cache.entries[0].content).toBe("stale");
  });

  test("workspace entry data omits full lore content", () => {
    const entry = book().cache.entries[0];
    const view = toWorkspaceEntry(entry);
    expect(view).toMatchObject({ entryId: "old", label: "Old", previewText: "stale" });
    expect("content" in view).toBe(false);
    expect("legacyTree" in view).toBe(false);
  });

  test("keeps attached books visible when their details cannot be read", () => {
    const scopes = mapAttachedBookScopes({ character: ["book"], persona: null, chat: [], global: ["unreadable", "book"] });
    const state = buildAttachedWorkspaceState(scopes, [book()]);
    expect(state.allWorldBooks).toEqual([
      { id: "book", name: "Book", description: "", updatedAt: 1 },
      { id: "unreadable", name: "unreadable", description: "Details unavailable", updatedAt: 0 },
    ]);
    expect(state.attachedBookSources).toEqual({ book: "character", unreadable: "global" });
    expect(state.attachedBookScopes.book).toEqual(["character", "global"]);
    expect(attachedWorkspaceBooks(["unreadable", "book"], [book()])).toEqual(state.allWorldBooks);
  });

  test("counts six distinct attachments while retaining three global links", () => {
    const scopes = mapAttachedBookScopes({
      character: ["character-one", "shared"],
      persona: "persona-one", chat: ["chat-one"],
      global: ["global-one", "global-two", "shared"],
    });
    const state = buildAttachedWorkspaceState(scopes, []);
    expect(state.allWorldBooks).toHaveLength(6);
    expect(Object.keys(state.attachedBookSources)).toHaveLength(6);
    expect(Object.values(state.attachedBookScopes).filter((sources) => sources.includes("global"))).toHaveLength(3);
    expect(state.attachedBookScopes.shared).toEqual(["character", "global"]);
  });

  test("omits stale global IDs but keeps the three existing global books", () => {
    const presentIds = ["calamities", "arcs", "v4"];
    const missingIds = ["deleted-one", "deleted-two", "deleted-three"];
    const scopes = mapAttachedBookScopes({
      character: [], persona: null, chat: [], global: [...missingIds, ...presentIds],
    });
    const loaded = presentIds.map((id) => ({ ...book(), summary: { ...book().summary, id, name: id } }));
    const state = buildAttachedWorkspaceState(scopes, loaded, missingIds);
    expect(state.allWorldBooks.map((item) => item.id)).toEqual([...presentIds].sort());
    expect(Object.keys(state.attachedBookSources)).toEqual(presentIds);
    expect(Object.values(state.attachedBookScopes).filter((sources) => sources.includes("global"))).toHaveLength(3);
  });

  test("includes group member books only when Lumiverse merges their lore", () => {
    const metadata = { group: true, character_ids: ["narrator", "lore", "muted"],
      muted_character_ids: ["muted"], group_card_mode: "merge_ignore_muted" };
    expect(attachedCharacterIds("narrator", metadata)).toEqual(["narrator", "lore"]);
    expect(attachedCharacterIds("narrator", { ...metadata, group_lorebook_mode: "active_character" }))
      .toEqual(["narrator"]);
    expect(attachedCharacterIds("narrator", { ...metadata, group_lorebook_mode: "all" }))
      .toEqual(["narrator", "lore", "muted"]);
  });
});
