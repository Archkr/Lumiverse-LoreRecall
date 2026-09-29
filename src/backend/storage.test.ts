import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_BOOK_CONFIG } from "../shared";
import { mapAttachedBookSources } from "./attached";
import { getRuntimeBooks } from "./storage";

const previousSpindle = (globalThis as { spindle?: unknown }).spindle;

afterEach(() => {
  (globalThis as { spindle?: unknown }).spindle = previousSpindle;
});

describe("attached workspace book loading", () => {
  test("keeps a readable attached book when another attached book fails", async () => {
    const requested: string[] = [];
    (globalThis as { spindle?: unknown }).spindle = {
      world_books: {
        get: async (id: string) => {
          requested.push(id);
          if (id === "broken") throw new Error("Book storage failed");
          return { id, name: "Ready", description: "", updated_at: 1 };
        },
        entries: { list: async () => { throw new Error("Cached entries should be used"); } },
      },
      userStorage: {
        getJson: async (path: string, options: { fallback: unknown }) =>
          path === "cache/ready.json"
            ? { version: 2, bookId: "ready", bookUpdatedAt: 1, name: "Ready", description: "", entries: [] }
            : path === "books/ready.json" ? DEFAULT_BOOK_CONFIG : options.fallback,
        setJson: async () => {},
      },
    };

    const sources = mapAttachedBookSources({
      character: ["ready"], persona: "broken", chat: [], global: [],
    });
    const attachedIds = Object.keys(sources);
    const result = await getRuntimeBooks(attachedIds, attachedIds, "user", 100);
    expect(requested).toEqual(["ready", "broken"]);
    expect(result.runtimeBooks.map((book) => book.summary.id)).toEqual(["ready"]);
    expect(result.loadIssues.broken).toBe("Book storage failed");
  });

  test("a stalled attached book stops holding the workspace state", async () => {
    (globalThis as { spindle?: unknown }).spindle = {
      world_books: { get: async () => new Promise(() => {}) },
      userStorage: { getJson: async (_path: string, options: { fallback: unknown }) => options.fallback },
    };

    const result = await getRuntimeBooks(["stalled"], ["stalled"], "user", 5);
    expect(result.runtimeBooks).toEqual([]);
    expect(result.loadIssues.stalled).toBe("Loading this lorebook timed out.");
  });
});
