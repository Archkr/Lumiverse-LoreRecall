import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_BOOK_CONFIG, assignEntryToTarget, createEmptyTreeIndex, ensureCategoryPath } from "../shared";
import { ensureRootCategories } from "../categories";
import { mapAttachedBookSources } from "./attached";
import { getRuntimeBooks, loadBookConfig, saveBookConfig } from "./storage";

const previousSpindle = (globalThis as { spindle?: unknown }).spindle;

afterEach(() => {
  (globalThis as { spindle?: unknown }).spindle = previousSpindle;
});

describe("attached workspace book loading", () => {
  test("indexes LumiBooks ownership from metadata and entry tags while upgrading an old cache", async () => {
    const saved = new Map<string, any>();
    const originalTree = ensureRootCategories(createEmptyTreeIndex("summary"));
    const branch = ensureCategoryPath(originalTree, ["Characters", "Saved branch"], "manual");
    assignEntryToTarget(originalTree, "summary-entry", { categoryId: branch });
    saved.set("trees/summary.json", originalTree);
    saved.set("books/summary.json", { ...DEFAULT_BOOK_CONFIG, enabled: true });
    saved.set("cache/summary.json", { version: 2, bookId: "summary", bookUpdatedAt: 1,
      name: "Old cached book", description: "", entries: [] });
    const books: Record<string, any> = {
      summary: { lumibooks_chat_id: "chat" }, codex: { lumibooks_codex_chat_id: "chat" }, mixed: {}, orphan: {},
    };
    const rows = (id: string) => [{ id: id + "-entry", key: [], content: "Content",
      extensions: id === "codex" ? { lumibooks_codex: { chatId: "chat", record: "character:alice" } }
        : { lumibooks: { chatId: "chat", tier: 1, msgIds: ["old-message"] } },
    }, ...(id === "mixed" ? [{ id: "ordinary", key: [], content: "Ordinary lore", extensions: {} }] : [])];
    const listed: string[] = [];
    (globalThis as any).spindle = {
      world_books: {
        get: async (id: string) => ({ id, name: id === "codex" ? "LumiBooks Codex" : id,
          description: "", updated_at: 1, metadata: books[id] }),
        entries: { list: async (id: string) => { listed.push(id); return { data: rows(id), total: rows(id).length }; } },
      },
      userStorage: {
        getJson: async (path: string, options: any) => saved.get(path) ?? options.fallback,
        setJson: async (path: string, value: any) => { saved.set(path, value); },
      },
    };
    const ids = Object.keys(books);
    const loaded = await getRuntimeBooks(ids, ids, "user");
    expect(loaded.loadIssues).toEqual({});
    const byId = Object.fromEntries(loaded.runtimeBooks.map((book) => [book.summary.id, book]));
    expect(byId.summary.summary.activationOwner).toBe("lumibooks");
    expect(byId.orphan.summary.activationOwner).toBe("lumibooks");
    expect(byId.codex.summary.activationOwner).toBeUndefined();
    expect(byId.mixed.summary.activationOwner).toBeUndefined();
    expect(byId.mixed.cache.entries.map((entry) => entry.activationOwner)).toEqual(["lumibooks", undefined]);
    expect(saved.get("cache/summary.json").ownershipVersion).toBe(1);
    expect(byId.summary.config.enabled).toBe(true);
    expect(byId.summary.tree.nodes[byId.summary.tree.rootId].childIds).toHaveLength(7);
    expect(byId.summary.tree).toEqual(originalTree);
    const savedTree = saved.get("trees/summary.json");
    // Ownership metadata can change without a timestamp change; cached entries stay usable.
    books.codex = { lumibooks_chat_id: "chat" };
    expect((await getRuntimeBooks(["codex"], ids, "user")).runtimeBooks[0].summary.activationOwner).toBe("lumibooks");
    expect(listed).toEqual(ids);
    expect(saved.get("trees/summary.json")).toEqual(savedTree);
    expect(saved.get("books/summary.json").enabled).toBe(true);
  });
  test("Recall choices persist per book without changing tree data or other settings", async () => {
    const saved = new Map<string, unknown>([
      ["books/ready.json", { enabled: false, description: "Notes", permission: "read_only" }],
      ["trees/ready.json", { nodes: { existing: {} } }],
    ]);
    const written: string[] = [];
    (globalThis as any).spindle = { userStorage: {
      getJson: async (path: string, options: any) => saved.get(path) ?? options.fallback,
      setJson: async (path: string, value: unknown) => { written.push(path); saved.set(path, value); },
    } };
    expect((await loadBookConfig("new", "user")).enabled).toBe(false);
    await saveBookConfig("ready", { enabled: true }, "user");
    expect(await loadBookConfig("ready", "user")).toEqual({ enabled: true, description: "Notes", permission: "read_only" });
    await saveBookConfig("ready", { enabled: false }, "user");
    expect((await loadBookConfig("ready", "user")).enabled).toBe(false);
    expect(written).toEqual(["books/ready.json", "books/ready.json"]);
    expect(saved.get("trees/ready.json")).toEqual({ nodes: { existing: {} } });
  });
  test("keeps a readable attached book when another attached book fails", async () => {
    const requested: string[] = [];
    (globalThis as { spindle?: unknown }).spindle = {
      world_books: {
        get: async (id: string) => {
          requested.push(id);
          if (id === "broken") throw new Error("Book storage failed");
          if (id === "missing") return null;
          return { id, name: "Ready", description: "", updated_at: 1 };
        },
        entries: { list: async () => { throw new Error("Cached entries should be used"); } },
      },
      userStorage: {
        getJson: async (path: string, options: { fallback: unknown }) =>
          path === "cache/ready.json"
            ? { version: 2, ownershipVersion: 1, bookId: "ready", bookUpdatedAt: 1, name: "Ready", description: "", entries: [] }
            : path === "books/ready.json" ? DEFAULT_BOOK_CONFIG : options.fallback,
        setJson: async () => {},
      },
    };

    const sources = mapAttachedBookSources({
      character: ["ready"], persona: "broken", chat: [], global: ["missing"],
    });
    const attachedIds = Object.keys(sources);
    const result = await getRuntimeBooks(attachedIds, attachedIds, "user", 100);
    expect(requested).toEqual(["ready", "broken", "missing"]);
    expect(result.runtimeBooks.map((book) => book.summary.id)).toEqual(["ready"]);
    expect(result.loadIssues.broken).toBe("Book storage failed");
    expect(result.loadIssues.missing).toBe("This lorebook is no longer available.");
    expect(result.missingBookIds).toEqual(["missing"]);
  });

  test("a stalled attached book stops holding the workspace state", async () => {
    (globalThis as { spindle?: unknown }).spindle = {
      world_books: { get: async () => new Promise(() => {}) },
      userStorage: { getJson: async (_path: string, options: { fallback: unknown }) => options.fallback },
    };

    const result = await getRuntimeBooks(["stalled"], ["stalled"], "user", 5);
    expect(result.runtimeBooks).toEqual([]);
    expect(result.loadIssues.stalled).toBe("Loading this lorebook timed out.");
    expect(result.missingBookIds).toEqual([]);
  });
});
