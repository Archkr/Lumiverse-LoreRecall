import { describe, expect, test } from "bun:test";
import { DEFAULT_BOOK_CONFIG, createEmptyTreeIndex } from "../shared";
import type { RuntimeBook, IndexedEntry } from "./contracts";
import { mapAttachedBookSources, overlayActiveEntries, recallEligibleBooks, toWorkspaceEntry } from "./attached";

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
    config: { ...DEFAULT_BOOK_CONFIG }, tree: createEmptyTreeIndex("book"),
    status: { bookId: "book", attachedToCharacter: true, selectedForCharacter: true,
      entryCount: 1, categoryCount: 0, rootEntryCount: 0, unassignedCount: 0, treeMissing: true, warnings: [] },
  };
}

describe("attached lorebooks", () => {
  test("leaves disabled and write-only books on native activation", () => {
    const readable = book();
    const readOnly = { ...book(), summary: { ...book().summary, id: "read-only" },
      config: { ...DEFAULT_BOOK_CONFIG, permission: "read_only" as const } };
    const disabled = { ...book(), summary: { ...book().summary, id: "disabled" },
      config: { ...DEFAULT_BOOK_CONFIG, enabled: false } };
    const writeOnly = { ...book(), summary: { ...book().summary, id: "write-only" },
      config: { ...DEFAULT_BOOK_CONFIG, permission: "write_only" as const } };
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
});
