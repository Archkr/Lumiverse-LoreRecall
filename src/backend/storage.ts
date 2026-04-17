declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { ConnectionProfileDTO, WorldBookDTO, WorldBookEntryDTO } from "lumiverse-spindle-types";
import {
  DEFAULT_BOOK_CONFIG,
  DEFAULT_CHARACTER_CONFIG,
  DEFAULT_GLOBAL_SETTINGS,
  EXTENSION_KEY,
  ROOT_NODE_ID,
  TREE_VERSION,
  assignEntryToTarget,
  createAutoDetectRegex,
  createEmptyTreeIndex,
  defaultEntryRecallMeta,
  ensureCategoryPath,
  ensureTreeIndexShape,
  normalizeBookConfig,
  normalizeCharacterConfig,
  normalizeEntryRecallMeta,
  normalizeGlobalSettings,
  readLegacyEntryTreeMeta,
  treeHasContent,
  truncateText,
  uniqueStrings,
} from "../shared";
import type {
  BookRetrievalConfig,
  BookStatus,
  BookSummary,
  CharacterRetrievalConfig,
  ConnectionOption,
  EntryRecallMeta,
  GlobalLoreRecallSettings,
  ManagedBookEntryView,
} from "../types";
import type { CachedBook, IndexedEntry, RuntimeBook, TreeLoadResult } from "./contracts";
import {
  CACHE_VERSION,
  CHARACTER_CONFIG_DIR,
  GLOBAL_SETTINGS_PATH,
  PAGE_LIMIT,
  getBookCachePath,
  getBookConfigPath,
  getCharacterConfigPath,
  getTreePath,
} from "./runtime";

export async function loadGlobalSettings(userId: string): Promise<GlobalLoreRecallSettings> {
  const stored = await spindle.userStorage.getJson<Partial<GlobalLoreRecallSettings>>(GLOBAL_SETTINGS_PATH, {
    fallback: DEFAULT_GLOBAL_SETTINGS,
    userId,
  });
  return normalizeGlobalSettings(stored);
}

export async function saveGlobalSettings(
  patch: Partial<GlobalLoreRecallSettings>,
  userId: string,
): Promise<GlobalLoreRecallSettings> {
  const current = await loadGlobalSettings(userId);
  const next = normalizeGlobalSettings({ ...current, ...patch });
  await spindle.userStorage.setJson(GLOBAL_SETTINGS_PATH, next, { indent: 2, userId });
  return next;
}

export async function loadCharacterConfig(characterId: string, userId: string): Promise<CharacterRetrievalConfig> {
  const stored = await spindle.userStorage.getJson<Partial<CharacterRetrievalConfig>>(getCharacterConfigPath(characterId), {
    fallback: DEFAULT_CHARACTER_CONFIG,
    userId,
  });
  return normalizeCharacterConfig(stored);
}

export async function saveCharacterConfig(
  characterId: string,
  patch: Partial<CharacterRetrievalConfig>,
  userId: string,
): Promise<CharacterRetrievalConfig> {
  const current = await loadCharacterConfig(characterId, userId);
  const next = normalizeCharacterConfig({ ...current, ...patch });
  await spindle.userStorage.setJson(getCharacterConfigPath(characterId), next, { indent: 2, userId });
  return next;
}

export async function loadBookConfig(bookId: string, userId: string): Promise<BookRetrievalConfig> {
  const stored = await spindle.userStorage.getJson<Partial<BookRetrievalConfig>>(getBookConfigPath(bookId), {
    fallback: DEFAULT_BOOK_CONFIG,
    userId,
  });
  return normalizeBookConfig(stored);
}

export async function saveBookConfig(
  bookId: string,
  patch: Partial<BookRetrievalConfig>,
  userId: string,
): Promise<BookRetrievalConfig> {
  const current = await loadBookConfig(bookId, userId);
  const next = normalizeBookConfig({ ...current, ...patch });
  await spindle.userStorage.setJson(getBookConfigPath(bookId), next, { indent: 2, userId });
  return next;
}

export async function invalidateBookCache(bookId: string, userId: string): Promise<void> {
  await spindle.userStorage.delete(getBookCachePath(bookId), userId).catch(() => {});
}

export async function listAllWorldBooks(userId: string): Promise<WorldBookDTO[]> {
  const books: WorldBookDTO[] = [];
  let offset = 0;
  while (true) {
    const page = await spindle.world_books.list({ limit: PAGE_LIMIT, offset, userId });
    books.push(...page.data);
    if (books.length >= page.total || page.data.length === 0) break;
    offset += page.data.length;
  }
  return books;
}

export async function listAllEntries(worldBookId: string, userId: string): Promise<WorldBookEntryDTO[]> {
  const entries: WorldBookEntryDTO[] = [];
  let offset = 0;
  while (true) {
    const page = await spindle.world_books.entries.list(worldBookId, { limit: PAGE_LIMIT, offset, userId });
    entries.push(...page.data);
    if (entries.length >= page.total || page.data.length === 0) break;
    offset += page.data.length;
  }
  return entries;
}

export function toBookSummary(book: WorldBookDTO): BookSummary {
  return {
    id: book.id,
    name: book.name,
    description: book.description,
    updatedAt: book.updated_at,
  };
}

export function buildConnectionOption(connection: ConnectionProfileDTO): ConnectionOption {
  return {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    model: connection.model,
    isDefault: connection.is_default,
    hasApiKey: connection.has_api_key,
  };
}

function toIndexedEntry(book: WorldBookDTO, entry: WorldBookEntryDTO): IndexedEntry {
  const rawExtension = (entry.extensions || {})[EXTENSION_KEY];
  const meta = normalizeEntryRecallMeta(rawExtension, {
    entryId: entry.id,
    comment: entry.comment,
    key: entry.key,
  });
  const legacy = readLegacyEntryTreeMeta(rawExtension, {
    entryId: entry.id,
    comment: entry.comment,
    key: entry.key,
  });

  return {
    entryId: entry.id,
    worldBookId: book.id,
    worldBookName: book.name,
    comment: entry.comment || "",
    key: Array.isArray(entry.key) ? entry.key : [],
    keysecondary: Array.isArray(entry.keysecondary) ? entry.keysecondary : [],
    disabled: !!entry.disabled,
    updatedAt: entry.updated_at,
    groupName: entry.group_name || "",
    constant: !!entry.constant,
    selective: !!entry.selective,
    vectorized: !!entry.vectorized,
    previewText: truncateText(entry.content || "", 220),
    content: entry.content || "",
    legacyTree: legacy
      ? {
          nodeId: legacy.nodeId,
          parentNodeId: legacy.parentNodeId,
          childrenOrder: legacy.childrenOrder,
        }
      : null,
    ...meta,
  };
}

export async function loadBookCache(bookId: string, userId: string): Promise<CachedBook | null> {
  const book = await spindle.world_books.get(bookId, userId);
  if (!book) return null;

  const cached = await spindle.userStorage.getJson<CachedBook | null>(getBookCachePath(bookId), {
    fallback: null,
    userId,
  });

  if (
    cached &&
    cached.version === CACHE_VERSION &&
    cached.bookId === book.id &&
    cached.bookUpdatedAt === book.updated_at
  ) {
    return cached;
  }

  const entries = await listAllEntries(bookId, userId);
  const rebuilt: CachedBook = {
    version: CACHE_VERSION,
    bookId: book.id,
    bookUpdatedAt: book.updated_at,
    name: book.name,
    description: book.description,
    entries: entries.map((entry) => toIndexedEntry(book, entry)),
  };

  await spindle.userStorage.setJson(getBookCachePath(bookId), rebuilt, { indent: 2, userId });
  return rebuilt;
}

function inspectTreeIssues(rawTree: unknown, validEntryIds: Set<string>): { staleEntryRefs: number; staleNodeRefs: number } {
  const value = rawTree && typeof rawTree === "object" ? (rawTree as Record<string, unknown>) : {};
  const nodes = value.nodes && typeof value.nodes === "object" ? (value.nodes as Record<string, unknown>) : {};
  const nodeIds = new Set(Object.keys(nodes));
  let staleEntryRefs = 0;
  let staleNodeRefs = 0;

  for (const nodeValue of Object.values(nodes)) {
    const node = nodeValue && typeof nodeValue === "object" ? (nodeValue as Record<string, unknown>) : {};
    if (Array.isArray(node.entryIds)) {
      staleEntryRefs += node.entryIds.filter((entryId) => typeof entryId === "string" && !validEntryIds.has(entryId)).length;
    }
    if (Array.isArray(node.childIds)) {
      staleNodeRefs += node.childIds.filter((childId) => typeof childId === "string" && !nodeIds.has(childId)).length;
    }
  }

  return { staleEntryRefs, staleNodeRefs };
}

function migrateLegacyTree(bookId: string, entries: IndexedEntry[]) {
  const legacyEntries = entries.filter((entry) => entry.legacyTree);
  if (!legacyEntries.length) return null;

  const tree = createEmptyTreeIndex(bookId);
  const byLegacyId = new Map<string, IndexedEntry>();
  for (const entry of legacyEntries) {
    if (entry.legacyTree?.nodeId) byLegacyId.set(entry.legacyTree.nodeId, entry);
  }

  for (const entry of entries) {
    const path: string[] = [];
    const visited = new Set<string>();
    let cursor = entry.legacyTree?.parentNodeId ? byLegacyId.get(entry.legacyTree.parentNodeId) ?? null : null;
    while (cursor && !visited.has(cursor.entryId)) {
      visited.add(cursor.entryId);
      path.push(cursor.label);
      cursor = cursor.legacyTree?.parentNodeId ? byLegacyId.get(cursor.legacyTree.parentNodeId) ?? null : null;
    }
    path.reverse();

    if (path.length) {
      const categoryId = ensureCategoryPath(tree, path, "migration");
      assignEntryToTarget(tree, entry.entryId, { categoryId });
    } else {
      assignEntryToTarget(tree, entry.entryId, "root");
    }
  }

  tree.lastBuiltAt = Date.now();
  tree.buildSource = "migration";
  return tree;
}

export async function loadTreeIndex(bookId: string, entries: IndexedEntry[], userId: string): Promise<TreeLoadResult> {
  const path = getTreePath(bookId);
  const rawTree = await spindle.userStorage.getJson<unknown>(path, { fallback: null, userId });
  const validEntryIds = new Set(entries.map((entry) => entry.entryId));
  const issues = inspectTreeIssues(rawTree, validEntryIds);

  let tree = ensureTreeIndexShape(rawTree as any, bookId, Array.from(validEntryIds));
  if (!treeHasContent(tree)) {
    const migrated = migrateLegacyTree(bookId, entries);
    if (migrated) {
      tree = ensureTreeIndexShape(migrated, bookId, Array.from(validEntryIds));
    } else {
      tree = createEmptyTreeIndex(bookId);
      tree.unassignedEntryIds = entries.map((entry) => entry.entryId);
    }
    await spindle.userStorage.setJson(path, tree, { indent: 2, userId });
  } else if ((rawTree as any)?.version !== TREE_VERSION || issues.staleEntryRefs || issues.staleNodeRefs) {
    await spindle.userStorage.setJson(path, tree, { indent: 2, userId });
  }

  return { tree, ...issues };
}

export async function saveTreeIndex(bookId: string, tree: any, entryIds: string[], userId: string): Promise<void> {
  await spindle.userStorage.setJson(getTreePath(bookId), ensureTreeIndexShape(tree, bookId, entryIds), {
    indent: 2,
    userId,
  });
}

function countAssignedRootEntries(tree: any): number {
  return tree.nodes[tree.rootId]?.entryIds.length ?? 0;
}

export function buildBookStatus(
  bookId: string,
  config: BookRetrievalConfig,
  tree: any,
  entries: IndexedEntry[],
  attachedToCharacter: boolean,
  selectedForCharacter: boolean,
): BookStatus {
  const warnings: string[] = [];
  if (attachedToCharacter) warnings.push("Still attached natively");
  if (!config.enabled) warnings.push("Disabled for Lore Recall");
  if (config.permission === "write_only") warnings.push("Excluded from retrieval");
  if (!treeHasContent(tree)) warnings.push("Missing tree");

  return {
    bookId,
    attachedToCharacter,
    selectedForCharacter,
    entryCount: entries.length,
    categoryCount: Math.max(0, Object.keys(tree.nodes).length - 1),
    rootEntryCount: countAssignedRootEntries(tree),
    unassignedCount: tree.unassignedEntryIds.length,
    treeMissing: !treeHasContent(tree),
    warnings,
  };
}

export async function getRuntimeBooks(
  selectedBookIds: string[],
  attachedBookIds: string[],
  userId: string,
): Promise<{ runtimeBooks: RuntimeBook[]; staleIssues: Record<string, { staleEntryRefs: number; staleNodeRefs: number }> }> {
  const runtimeBooks: RuntimeBook[] = [];
  const staleIssues: Record<string, { staleEntryRefs: number; staleNodeRefs: number }> = {};

  for (const bookId of selectedBookIds) {
    const cache = await loadBookCache(bookId, userId);
    if (!cache) continue;

    const config = await loadBookConfig(bookId, userId);
    const loadedTree = await loadTreeIndex(bookId, cache.entries, userId);
    staleIssues[bookId] = { staleEntryRefs: loadedTree.staleEntryRefs, staleNodeRefs: loadedTree.staleNodeRefs };

    runtimeBooks.push({
      summary: {
        id: cache.bookId,
        name: cache.name,
        description: cache.description,
        updatedAt: cache.bookUpdatedAt,
      },
      cache,
      config,
      tree: loadedTree.tree,
      status: buildBookStatus(bookId, config, loadedTree.tree, cache.entries, attachedBookIds.includes(bookId), true),
    });
  }

  return { runtimeBooks, staleIssues };
}

export function computeSuggestedBookIds(
  allBooks: BookSummary[],
  selectedBookIds: string[],
  settings: GlobalLoreRecallSettings,
): string[] {
  const matcher = createAutoDetectRegex(settings.autoDetectPattern);
  if (!matcher) return [];
  return allBooks
    .filter((book) => !selectedBookIds.includes(book.id))
    .filter((book) => matcher.test(book.name))
    .map((book) => book.id);
}

export function normalizeEntryMetaForWrite(
  raw: EntryRecallMeta,
  seed: { entryId: string; comment?: string; key?: string[] },
): EntryRecallMeta {
  const normalized = normalizeEntryRecallMeta(raw, seed);
  const fallback = defaultEntryRecallMeta(seed);
  return {
    label: normalized.label || fallback.label,
    aliases: uniqueStrings(normalized.aliases),
    summary: normalized.summary.trim(),
    collapsedText: normalized.collapsedText.trim(),
    tags: uniqueStrings(normalized.tags),
  };
}

export function isReadableBook(config: BookRetrievalConfig): boolean {
  return config.enabled && config.permission !== "write_only";
}

export function canEditBook(config: BookRetrievalConfig): boolean {
  return config.permission !== "read_only";
}
