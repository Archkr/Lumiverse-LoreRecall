declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import {
  EXTENSION_KEY,
  ROOT_NODE_ID,
  assignEntryToTarget,
  createEmptyTreeIndex,
  defaultEntryRecallMeta,
  deleteCategoryNode,
  ensureCategoryPath,
  ensureTreeIndexShape,
  makeNodeId,
  moveCategoryNode,
  normalizeEntryRecallMeta,
  splitHierarchy,
  titleCase,
  truncateText,
  uniqueStrings,
} from "../shared";
import type {
  BookTreeNode,
  CharacterRetrievalConfig,
  DiagnosticFinding,
  EntryRecallMeta,
  ExportSnapshot,
  GlobalLoreRecallSettings,
} from "../types";
import type { IndexedEntry, RuntimeBook } from "./contracts";
import {
  BOOK_CONFIG_DIR,
  CHARACTER_CONFIG_DIR,
  GLOBAL_SETTINGS_PATH,
  TREE_DIR,
  getBookConfigPath,
  getCharacterConfigPath,
  getTreePath,
} from "./runtime";
import {
  canEditBook,
  getRuntimeBooks,
  invalidateBookCache,
  listAllEntries,
  listAllWorldBooks,
  loadBookCache,
  loadBookConfig,
  loadCharacterConfig,
  loadGlobalSettings,
  loadTreeIndex,
  normalizeEntryMetaForWrite,
  saveBookConfig,
  saveCharacterConfig,
  saveGlobalSettings,
  saveTreeIndex,
} from "./storage";

async function runControllerJson(
  prompt: string,
  settings: GlobalLoreRecallSettings,
  userId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages: [{ role: "user", content: prompt }],
      parameters: {
        temperature: settings.controllerTemperature,
        max_tokens: settings.controllerMaxTokens,
      },
      ...(settings.controllerConnectionId ? { connection_id: settings.controllerConnectionId } : {}),
      userId,
    });
    const content = (result && typeof result === "object" && typeof (result as { content?: unknown }).content === "string"
      ? (result as { content: string }).content
      : ""
    ).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (!content) return null;
    try {
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        const parsed = JSON.parse(match[0]) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  } catch (error: unknown) {
    spindle.log.warn(`Lore Recall controller call failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function updateEntryMeta(entryId: string, meta: EntryRecallMeta, userId: string): Promise<void> {
  const entry = await spindle.world_books.entries.get(entryId, userId);
  if (!entry) throw new Error("That world book entry no longer exists.");
  const nextMeta = normalizeEntryMetaForWrite(meta, { entryId: entry.id, comment: entry.comment, key: entry.key });
  await spindle.world_books.entries.update(
    entry.id,
    {
      extensions: {
        ...(entry.extensions || {}),
        [EXTENSION_KEY]: {
          ...((entry.extensions || {})[EXTENSION_KEY] as Record<string, unknown> | undefined),
          ...nextMeta,
        },
      },
    },
    userId,
  );
  await invalidateBookCache(entry.world_book_id, userId);
}

function getMetadataCategoryPath(entry: IndexedEntry): string[] {
  if (entry.groupName.trim()) return splitHierarchy(entry.groupName);
  if (entry.constant) return ["Always On"];
  if (entry.selective) return ["Selective"];
  const commentMatch = entry.comment.match(/^([^:\/|]{3,32})[:\/|]/);
  if (commentMatch?.[1]) return [titleCase(commentMatch[1].trim())];
  const firstKey = [...entry.key, ...entry.keysecondary].find((value) => value.trim());
  if (firstKey) return ["Keywords", titleCase(firstKey.split(/\s+/).slice(0, 2).join(" "))];
  return [];
}

export async function buildTreeFromMetadata(bookIds: string[], userId: string): Promise<void> {
  for (const bookId of uniqueStrings(bookIds)) {
    const config = await loadBookConfig(bookId, userId);
    if (!canEditBook(config)) continue;
    const cache = await loadBookCache(bookId, userId);
    if (!cache) continue;

    const tree = createEmptyTreeIndex(bookId);
    for (const entry of cache.entries) {
      const path = getMetadataCategoryPath(entry);
      if (path.length) {
        const categoryId = ensureCategoryPath(tree, path, "metadata");
        assignEntryToTarget(tree, entry.entryId, { categoryId });
      } else {
        assignEntryToTarget(tree, entry.entryId, "unassigned");
      }
    }

    tree.lastBuiltAt = Date.now();
    tree.buildSource = "metadata";
    await saveTreeIndex(bookId, tree, cache.entries.map((entry) => entry.entryId), userId);
  }
}

function chunkEntries<T extends { content: string; previewText: string }>(items: T[], chunkTokens: number): T[][] {
  const maxChars = Math.max(2000, chunkTokens * 4);
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentChars = 0;
  for (const item of items) {
    const size = Math.max(item.content.length, item.previewText.length);
    if (current.length && currentChars + size > maxChars) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export async function buildTreeWithLlm(bookIds: string[], userId: string): Promise<void> {
  const settings = await loadGlobalSettings(userId);

  for (const bookId of uniqueStrings(bookIds)) {
    const config = await loadBookConfig(bookId, userId);
    if (!canEditBook(config)) continue;
    const cache = await loadBookCache(bookId, userId);
    if (!cache?.entries.length) continue;

    const tree = createEmptyTreeIndex(bookId);
    const updates: Array<{ entryId: string; summary?: string; collapsedText?: string }> = [];

    for (const chunk of chunkEntries(cache.entries, settings.chunkTokens)) {
      const prompt = [
        "Organize these lore entries into a compact retrieval tree.",
        'Return ONLY JSON in this exact shape: {"assignments":[{"entryId":"...","path":["Category","Subcategory"],"summary":"...","collapsedText":"..."}]}',
        `Build detail: ${settings.buildDetail}.`,
        `Tree granularity: ${settings.treeGranularity}.`,
        "Use empty path [] when an entry should stay unassigned.",
        "",
        "Entries:",
        ...chunk.map((entry) =>
          JSON.stringify({
            entryId: entry.entryId,
            comment: entry.comment,
            keys: [...entry.key, ...entry.keysecondary],
            groupName: entry.groupName,
            constant: entry.constant,
            selective: entry.selective,
            preview: truncateText(entry.content, 420),
          }),
        ),
      ].join("\n");

      const parsed = await runControllerJson(prompt, settings, userId);
      const assignments = Array.isArray(parsed?.assignments)
        ? parsed.assignments.filter((value): value is Record<string, unknown> => !!value && typeof value === "object")
        : [];

      for (const assignment of assignments) {
        const entryId = typeof assignment.entryId === "string" ? assignment.entryId : "";
        if (!entryId) continue;
        const path = Array.isArray(assignment.path)
          ? assignment.path.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        if (path.length) {
          const categoryId = ensureCategoryPath(tree, path, "llm");
          assignEntryToTarget(tree, entryId, { categoryId });
        } else {
          assignEntryToTarget(tree, entryId, "unassigned");
        }
        updates.push({
          entryId,
          summary: typeof assignment.summary === "string" ? assignment.summary.trim() : undefined,
          collapsedText: typeof assignment.collapsedText === "string" ? assignment.collapsedText.trim() : undefined,
        });
      }
    }

    for (const entry of cache.entries) {
      const assigned = tree.unassignedEntryIds.includes(entry.entryId) || Object.values(tree.nodes).some((node) => node.entryIds.includes(entry.entryId));
      if (!assigned) assignEntryToTarget(tree, entry.entryId, "unassigned");
    }

    tree.lastBuiltAt = Date.now();
    tree.buildSource = "llm";
    await saveTreeIndex(bookId, tree, cache.entries.map((entry) => entry.entryId), userId);

    for (const update of updates) {
      const entry = await spindle.world_books.entries.get(update.entryId, userId);
      if (!entry) continue;
      const current = normalizeEntryRecallMeta((entry.extensions || {})[EXTENSION_KEY], {
        entryId: entry.id,
        comment: entry.comment,
        key: entry.key,
      });
      await spindle.world_books.entries.update(
        entry.id,
        {
          extensions: {
            ...(entry.extensions || {}),
            [EXTENSION_KEY]: {
              ...((entry.extensions || {})[EXTENSION_KEY] as Record<string, unknown> | undefined),
              ...current,
              summary: update.summary || current.summary,
              collapsedText: update.collapsedText || current.collapsedText,
            },
          },
        },
        userId,
      );
    }

    await invalidateBookCache(bookId, userId);
  }
}

export async function updateCategory(
  bookId: string,
  nodeId: string,
  patch: Partial<Pick<BookTreeNode, "label" | "summary" | "collapsed">>,
  userId: string,
): Promise<void> {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config)) throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache) throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  const node = loaded.tree.nodes[nodeId];
  if (!node || node.id === loaded.tree.rootId) throw new Error("That category no longer exists.");

  if (typeof patch.label === "string" && patch.label.trim()) node.label = patch.label.trim();
  if (typeof patch.summary === "string") node.summary = patch.summary.trim();
  if (typeof patch.collapsed === "boolean") node.collapsed = patch.collapsed;
  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = loaded.tree.buildSource ?? "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}

export async function createCategory(bookId: string, parentId: string | null, label: string, userId: string): Promise<void> {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config)) throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache) throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);

  const nextParentId = parentId && loaded.tree.nodes[parentId] ? parentId : ROOT_NODE_ID;
  const nodeId = makeNodeId("cat", label);
  loaded.tree.nodes[nodeId] = {
    id: nodeId,
    kind: "category",
    label: label.trim() || "Untitled category",
    summary: "",
    parentId: nextParentId,
    childIds: [],
    entryIds: [],
    collapsed: false,
    createdBy: "manual",
  };
  loaded.tree.nodes[nextParentId].childIds.push(nodeId);
  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}

function wouldCreateCycle(tree: any, nodeId: string, parentId: string | null): boolean {
  if (!parentId || parentId === ROOT_NODE_ID) return false;
  if (parentId === nodeId) return true;
  const visited = new Set<string>();
  let cursor = tree.nodes[parentId];
  while (cursor && !visited.has(cursor.id)) {
    if (cursor.id === nodeId) return true;
    visited.add(cursor.id);
    cursor = cursor.parentId ? tree.nodes[cursor.parentId] : undefined;
  }
  return false;
}

export async function moveCategory(bookId: string, nodeId: string, parentId: string | null, userId: string): Promise<void> {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config)) throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache) throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  if (!loaded.tree.nodes[nodeId] || nodeId === loaded.tree.rootId) throw new Error("That category no longer exists.");
  if (wouldCreateCycle(loaded.tree, nodeId, parentId)) throw new Error("That move would create a category cycle.");

  moveCategoryNode(loaded.tree, nodeId, parentId);
  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}

export async function deleteCategory(
  bookId: string,
  nodeId: string,
  target: "root" | "unassigned" | { categoryId: string },
  userId: string,
): Promise<void> {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config)) throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache) throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  if (!loaded.tree.nodes[nodeId] || nodeId === loaded.tree.rootId) throw new Error("That category no longer exists.");

  deleteCategoryNode(loaded.tree, nodeId, target);
  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}

export async function assignEntries(
  bookId: string,
  entryIds: string[],
  target: "root" | "unassigned" | { categoryId: string },
  userId: string,
): Promise<void> {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config)) throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache) throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  const validEntryIds = new Set(cache.entries.map((entry) => entry.entryId));

  for (const entryId of uniqueStrings(entryIds)) {
    if (!validEntryIds.has(entryId)) continue;
    assignEntryToTarget(loaded.tree, entryId, target);
  }

  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}

function getDescendantCategoryIds(tree: any, nodeId: string, depthLimit: number): string[] {
  const result: string[] = [];
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId, depth: 0 }];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current.nodeId)) continue;
    seen.add(current.nodeId);
    result.push(current.nodeId);
    if (current.depth >= depthLimit) continue;
    const node = tree.nodes[current.nodeId];
    if (!node) continue;
    for (const childId of node.childIds) {
      queue.push({ nodeId: childId, depth: current.depth + 1 });
    }
  }
  return result;
}

export async function regenerateSummaries(
  bookId: string,
  entryIds: string[] | undefined,
  nodeIds: string[] | undefined,
  userId: string,
): Promise<void> {
  const settings = await loadGlobalSettings(userId);
  const cache = await loadBookCache(bookId, userId);
  if (!cache) throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);

  const targetEntries = (entryIds?.length
    ? cache.entries.filter((entry) => entryIds.includes(entry.entryId))
    : cache.entries.filter((entry) => !entry.summary.trim() || !entry.collapsedText.trim())
  ).slice(0, 24);

  if (targetEntries.length) {
    const prompt = [
      "Write short retrieval summaries for these lore entries.",
      'Return ONLY JSON in this exact shape: {"entries":[{"entryId":"...","summary":"...","collapsedText":"..."}]}',
      "",
      "Entries:",
      ...targetEntries.map((entry) =>
        JSON.stringify({
          entryId: entry.entryId,
          label: entry.label,
          comment: entry.comment,
          keys: [...entry.key, ...entry.keysecondary],
          content: truncateText(entry.content, 500),
        }),
      ),
    ].join("\n");

    const parsed = await runControllerJson(prompt, settings, userId);
    const updates = Array.isArray(parsed?.entries)
      ? parsed.entries.filter((value): value is Record<string, unknown> => !!value && typeof value === "object")
      : [];

    for (const update of updates) {
      const entryId = typeof update.entryId === "string" ? update.entryId : "";
      if (!entryId) continue;
      const entry = await spindle.world_books.entries.get(entryId, userId);
      if (!entry) continue;
      const current = normalizeEntryRecallMeta((entry.extensions || {})[EXTENSION_KEY], {
        entryId: entry.id,
        comment: entry.comment,
        key: entry.key,
      });
      await spindle.world_books.entries.update(
        entry.id,
        {
          extensions: {
            ...(entry.extensions || {}),
            [EXTENSION_KEY]: {
              ...((entry.extensions || {})[EXTENSION_KEY] as Record<string, unknown> | undefined),
              ...current,
              summary: typeof update.summary === "string" ? update.summary.trim() : current.summary,
              collapsedText:
                typeof update.collapsedText === "string" ? update.collapsedText.trim() : current.collapsedText,
            },
          },
        },
        userId,
      );
    }
    await invalidateBookCache(bookId, userId);
  }

  const targetNodeIds = uniqueStrings(nodeIds ?? []).filter((id) => loaded.tree.nodes[id] && id !== loaded.tree.rootId).slice(0, 16);
  for (const nodeId of targetNodeIds) {
    const node = loaded.tree.nodes[nodeId];
    const descendantIds = getDescendantCategoryIds(loaded.tree, nodeId, 2);
    const sampleEntryIds = uniqueStrings(descendantIds.flatMap((id) => loaded.tree.nodes[id]?.entryIds ?? [])).slice(0, 8);
    const prompt = [
      "Write a short category summary for this lore branch.",
      'Return ONLY JSON in this exact shape: {"summary":"..."}',
      "",
      `Category: ${node.label}`,
      "Entries:",
      ...sampleEntryIds
        .map((entryId) => cache.entries.find((entry) => entry.entryId === entryId))
        .filter((entry): entry is IndexedEntry => !!entry)
        .map((entry) => `- ${entry.label}: ${truncateText(entry.summary || entry.content, 180)}`),
    ].join("\n");
    const parsed = await runControllerJson(prompt, settings, userId);
    if (typeof parsed?.summary === "string") node.summary = parsed.summary.trim();
  }

  if (targetNodeIds.length) {
    loaded.tree.lastBuiltAt = Date.now();
    loaded.tree.buildSource = "manual";
    await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
  }
}

export function buildDiagnostics(
  runtimeBooks: RuntimeBook[],
  staleIssues: Record<string, { staleEntryRefs: number; staleNodeRefs: number }>,
): DiagnosticFinding[] {
  const diagnostics: DiagnosticFinding[] = [];

  for (const book of runtimeBooks) {
    const issues = staleIssues[book.summary.id];
    if (book.status.attachedToCharacter) {
      diagnostics.push({
        id: `attached:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Managed book is still attached natively",
        detail: `${book.summary.name} is attached to the character and may duplicate native world info activation.`,
      });
    }
    if (book.status.treeMissing) {
      diagnostics.push({
        id: `tree:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Book is missing a usable tree",
        detail: `${book.summary.name} has no categories or assigned entries yet.`,
      });
    }
    if (issues?.staleEntryRefs || issues?.staleNodeRefs) {
      diagnostics.push({
        id: `stale:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Tree had stale references",
        detail: `${book.summary.name} referenced ${issues.staleEntryRefs} stale entry id(s) and ${issues.staleNodeRefs} stale category link(s). Lore Recall sanitized the stored tree.`,
      });
    }
    if (!book.config.enabled) {
      diagnostics.push({
        id: `disabled:${book.summary.id}`,
        severity: "info",
        bookId: book.summary.id,
        title: "Managed book is disabled",
        detail: `${book.summary.name} is still selected for the character, but Lore Recall has it disabled in book settings.`,
      });
    }
    if (book.config.permission === "write_only") {
      diagnostics.push({
        id: `writeonly:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Managed book is write-only",
        detail: `${book.summary.name} will not be searched during retrieval while write-only mode is active.`,
      });
    }
    const missingSummaryCount = book.cache.entries.filter((entry) => !entry.summary.trim()).length;
    const missingCollapsedCount = book.cache.entries.filter((entry) => !entry.collapsedText.trim()).length;
    if (missingSummaryCount || missingCollapsedCount) {
      diagnostics.push({
        id: `coverage:${book.summary.id}`,
        severity: "info",
        bookId: book.summary.id,
        title: "Book metadata is incomplete",
        detail: `${book.summary.name} has ${missingSummaryCount} entry summary gap(s) and ${missingCollapsedCount} collapsed-text gap(s).`,
      });
    }
  }

  return diagnostics;
}

export async function exportSnapshot(userId: string): Promise<ExportSnapshot> {
  const [globalSettings, characterFiles, bookFiles, treeFiles, books] = await Promise.all([
    loadGlobalSettings(userId),
    spindle.userStorage.list(`${CHARACTER_CONFIG_DIR}/`, userId).catch(() => [] as string[]),
    spindle.userStorage.list(`${BOOK_CONFIG_DIR}/`, userId).catch(() => [] as string[]),
    spindle.userStorage.list(`${TREE_DIR}/`, userId).catch(() => [] as string[]),
    listAllWorldBooks(userId),
  ]);

  const characterConfigs: Record<string, CharacterRetrievalConfig> = {};
  for (const path of characterFiles.filter((file) => file.endsWith(".json"))) {
    const characterId = path.split("/").pop()?.replace(/\.json$/i, "") ?? "";
    if (!characterId) continue;
    characterConfigs[characterId] = await loadCharacterConfig(characterId, userId);
  }

  const bookConfigs: Record<string, any> = {};
  for (const path of bookFiles.filter((file) => file.endsWith(".json"))) {
    const bookId = path.split("/").pop()?.replace(/\.json$/i, "") ?? "";
    if (!bookId) continue;
    bookConfigs[bookId] = await loadBookConfig(bookId, userId);
  }

  const treeIndexes: Record<string, any> = {};
  for (const path of treeFiles.filter((file) => file.endsWith(".json"))) {
    const bookId = path.split("/").pop()?.replace(/\.json$/i, "") ?? "";
    if (!bookId) continue;
    const cache = await loadBookCache(bookId, userId);
    if (!cache) continue;
    treeIndexes[bookId] = (await loadTreeIndex(bookId, cache.entries, userId)).tree;
  }

  const entryMeta: Record<string, Record<string, EntryRecallMeta>> = {};
  for (const book of books) {
    const entries = await listAllEntries(book.id, userId);
    const perBook: Record<string, EntryRecallMeta> = {};
    for (const entry of entries) {
      const meta = normalizeEntryRecallMeta((entry.extensions || {})[EXTENSION_KEY], {
        entryId: entry.id,
        comment: entry.comment,
        key: entry.key,
      });
      const fallback = defaultEntryRecallMeta({ entryId: entry.id, comment: entry.comment, key: entry.key });
      if (JSON.stringify(meta) !== JSON.stringify(fallback) || (entry.extensions || {})[EXTENSION_KEY]) {
        perBook[entry.id] = meta;
      }
    }
    if (Object.keys(perBook).length) entryMeta[book.id] = perBook;
  }

  return {
    version: 2,
    exportedAt: Date.now(),
    globalSettings,
    characterConfigs,
    bookConfigs,
    treeIndexes,
    entryMeta,
  };
}

export async function importSnapshot(snapshot: ExportSnapshot, userId: string): Promise<void> {
  await saveGlobalSettings(snapshot.globalSettings, userId);

  for (const [characterId, config] of Object.entries(snapshot.characterConfigs ?? {})) {
    await spindle.userStorage.setJson(getCharacterConfigPath(characterId), config, { indent: 2, userId });
  }
  for (const [bookId, config] of Object.entries(snapshot.bookConfigs ?? {})) {
    await spindle.userStorage.setJson(getBookConfigPath(bookId), config, { indent: 2, userId });
  }
  for (const [bookId, tree] of Object.entries(snapshot.treeIndexes ?? {})) {
    const cache = await loadBookCache(bookId, userId);
    if (!cache) continue;
    await spindle.userStorage.setJson(
      getTreePath(bookId),
      ensureTreeIndexShape(tree as any, bookId, cache.entries.map((entry) => entry.entryId)),
      { indent: 2, userId },
    );
  }

  for (const [bookId, perBook] of Object.entries(snapshot.entryMeta ?? {})) {
    for (const [entryId, meta] of Object.entries(perBook)) {
      const entry = await spindle.world_books.entries.get(entryId, userId);
      if (!entry || entry.world_book_id !== bookId) continue;
      await spindle.world_books.entries.update(
        entry.id,
        {
          extensions: {
            ...(entry.extensions || {}),
            [EXTENSION_KEY]: {
              ...((entry.extensions || {})[EXTENSION_KEY] as Record<string, unknown> | undefined),
              ...normalizeEntryMetaForWrite(meta, {
                entryId: entry.id,
                comment: entry.comment,
                key: entry.key,
              }),
            },
          },
        },
        userId,
      );
    }
    await invalidateBookCache(bookId, userId);
  }
}

export async function applySuggestedBooks(
  characterId: string,
  bookIds: string[],
  mode: "append" | "replace",
  userId: string,
): Promise<void> {
  const current = await loadCharacterConfig(characterId, userId);
  const managedBookIds =
    mode === "replace" ? uniqueStrings(bookIds) : uniqueStrings([...current.managedBookIds, ...bookIds]);
  await saveCharacterConfig(characterId, { managedBookIds }, userId);
}
