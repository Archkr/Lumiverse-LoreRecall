declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { LlmMessageDTO, WorldBookDTO, WorldBookEntryDTO } from "lumiverse-spindle-types";
import {
  DEFAULT_CHARACTER_CONFIG,
  EXTENSION_KEY,
  clampInt,
  normalizeCharacterConfig,
  normalizeEntryTreeMeta,
  truncateText,
} from "./shared";
import type {
  BackendToFrontend,
  BookSummary,
  CharacterRetrievalConfig,
  EntryTreeMeta,
  FrontendState,
  FrontendToBackend,
  ManagedBookEntryView,
  ManagedBookView,
  PreviewNode,
  RetrievalPreview,
} from "./types";

type ChatLikeMessage = { role: "system" | "user" | "assistant"; content: string };

interface IndexedEntry extends ManagedBookEntryView {
  content: string;
}

interface CachedBook {
  version: 1;
  bookId: string;
  bookUpdatedAt: number;
  name: string;
  description: string;
  entries: IndexedEntry[];
}

interface ScoredEntry {
  entry: IndexedEntry;
  score: number;
  reasons: string[];
}

let lastFrontendUserId: string | null = null;

const CHARACTER_CONFIG_DIR = "characters";
const CACHE_DIR = "cache";
const CACHE_VERSION = 1 as const;
const PAGE_LIMIT = 200;

function send(message: BackendToFrontend, userId = lastFrontendUserId ?? undefined): void {
  void userId;
  spindle.sendToFrontend(message);
}

function getCharacterConfigPath(characterId: string): string {
  return `${CHARACTER_CONFIG_DIR}/${characterId}.json`;
}

function getBookCachePath(bookId: string): string {
  return `${CACHE_DIR}/${bookId}.json`;
}

async function ensureStorageFolders(): Promise<void> {
  await spindle.userStorage.mkdir(CHARACTER_CONFIG_DIR).catch(() => {});
  await spindle.userStorage.mkdir(CACHE_DIR).catch(() => {});
}

async function loadCharacterConfig(characterId: string): Promise<CharacterRetrievalConfig> {
  const stored = await spindle.userStorage.getJson<Partial<CharacterRetrievalConfig>>(getCharacterConfigPath(characterId), {
    fallback: DEFAULT_CHARACTER_CONFIG,
  });
  return normalizeCharacterConfig(stored);
}

async function saveCharacterConfig(
  characterId: string,
  patch: Partial<CharacterRetrievalConfig>,
): Promise<CharacterRetrievalConfig> {
  const current = await loadCharacterConfig(characterId);
  const next = normalizeCharacterConfig({ ...current, ...patch });
  await spindle.userStorage.setJson(getCharacterConfigPath(characterId), next, { indent: 2 });
  return next;
}

async function invalidateBookCache(bookId: string): Promise<void> {
  await spindle.userStorage.delete(getBookCachePath(bookId)).catch(() => {});
}

async function listAllWorldBooks(): Promise<WorldBookDTO[]> {
  const books: WorldBookDTO[] = [];
  let offset = 0;

  while (true) {
    const page = await spindle.world_books.list({ limit: PAGE_LIMIT, offset });
    books.push(...page.data);
    if (books.length >= page.total || page.data.length === 0) break;
    offset += page.data.length;
  }

  return books;
}

async function listAllEntries(worldBookId: string): Promise<WorldBookEntryDTO[]> {
  const entries: WorldBookEntryDTO[] = [];
  let offset = 0;

  while (true) {
    const page = await spindle.world_books.entries.list(worldBookId, { limit: PAGE_LIMIT, offset });
    entries.push(...page.data);
    if (entries.length >= page.total || page.data.length === 0) break;
    offset += page.data.length;
  }

  return entries;
}

function stripCodeFences(content: string): string {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = stripCodeFences(content);
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function getGenerationContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

function toBookSummary(book: WorldBookDTO): BookSummary {
  return {
    id: book.id,
    name: book.name,
    description: book.description,
    updatedAt: book.updated_at,
  };
}

function toIndexedEntry(book: WorldBookDTO, entry: WorldBookEntryDTO): IndexedEntry {
  const meta = normalizeEntryTreeMeta((entry.extensions || {})[EXTENSION_KEY], {
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
    disabled: !!entry.disabled,
    updatedAt: entry.updated_at,
    content: entry.content || "",
    ...meta,
  };
}

async function loadBookCache(bookId: string): Promise<CachedBook | null> {
  const book = await spindle.world_books.get(bookId);
  if (!book) return null;

  const cachePath = getBookCachePath(bookId);
  const cached = await spindle.userStorage.getJson<CachedBook | null>(cachePath, { fallback: null });
  if (
    cached &&
    cached.version === CACHE_VERSION &&
    cached.bookId === bookId &&
    cached.bookUpdatedAt === book.updated_at
  ) {
    return cached;
  }

  const entries = await listAllEntries(bookId);
  const rebuilt: CachedBook = {
    version: CACHE_VERSION,
    bookId: book.id,
    bookUpdatedAt: book.updated_at,
    name: book.name,
    description: book.description,
    entries: entries.map((entry) => toIndexedEntry(book, entry)),
  };

  await spindle.userStorage.setJson(cachePath, rebuilt, { indent: 2 });
  return rebuilt;
}

function toManagedBookView(cache: CachedBook, attachedToCharacter: boolean): ManagedBookView {
  return {
    id: cache.bookId,
    name: cache.name,
    description: cache.description,
    updatedAt: cache.bookUpdatedAt,
    attachedToCharacter,
    entries: cache.entries.map(({ content: _content, ...rest }) => rest),
  };
}

function stripSearchMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string): string {
  return stripSearchMarkup(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      normalizeSearchText(value)
        .split(" ")
        .filter((token) => token.length >= 2),
    ),
  );
}

function buildQueryText(messages: ChatLikeMessage[]): string {
  return messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .slice(-6)
    .map((message) => `${message.role}: ${stripSearchMarkup(message.content)}`)
    .join("\n");
}

function createNodeMap(entries: IndexedEntry[]): Map<string, IndexedEntry> {
  return new Map(entries.map((entry) => [entry.nodeId, entry]));
}

function getParentEntry(entry: IndexedEntry, byNodeId: Map<string, IndexedEntry>): IndexedEntry | null {
  if (!entry.parentNodeId) return null;
  const parent = byNodeId.get(entry.parentNodeId);
  if (!parent || parent.nodeId === entry.nodeId) return null;
  return parent;
}

function getBreadcrumb(entry: IndexedEntry, byNodeId: Map<string, IndexedEntry>): string {
  const labels: string[] = [];
  const visited = new Set<string>();
  let cursor: IndexedEntry | null = entry;

  while (cursor && !visited.has(cursor.nodeId)) {
    visited.add(cursor.nodeId);
    labels.push(cursor.label);
    cursor = getParentEntry(cursor, byNodeId);
  }

  return labels.reverse().join(" > ");
}

function getEntryBody(entry: IndexedEntry): string {
  return entry.collapsedText.trim() || entry.content.trim();
}

function countTokenMatches(queryTokens: string[], targetTokens: string[]): number {
  if (!queryTokens.length || !targetTokens.length) return 0;
  const targetSet = new Set(targetTokens);
  let count = 0;
  for (const token of queryTokens) {
    if (targetSet.has(token)) count += 1;
  }
  return count;
}

function countPhraseBonus(queryText: string, value: string): boolean {
  if (!queryText || !value || value.length < 4) return false;
  return queryText.includes(value) || value.includes(queryText);
}

function scoreEntry(entry: IndexedEntry, queryText: string, queryTokens: string[], byNodeId: Map<string, IndexedEntry>): ScoredEntry {
  const reasons: string[] = [];
  let score = 0;

  const labelText = normalizeSearchText(entry.label);
  const aliasText = normalizeSearchText(entry.aliases.join(" "));
  const keyText = normalizeSearchText(entry.key.join(" "));
  const summaryText = normalizeSearchText(entry.summary);
  const tagText = normalizeSearchText(entry.tags.join(" "));
  const commentText = normalizeSearchText(entry.comment);
  const bodyText = normalizeSearchText(truncateText(getEntryBody(entry), 500));
  const parentText = normalizeSearchText(getParentEntry(entry, byNodeId)?.label || "");

  if (countPhraseBonus(queryText, labelText)) {
    score += 12;
    reasons.push("label");
  }
  if (countPhraseBonus(queryText, aliasText)) {
    score += 8;
    reasons.push("alias");
  }
  if (countPhraseBonus(queryText, keyText)) {
    score += 7;
    reasons.push("keyword");
  }

  const labelMatches = countTokenMatches(queryTokens, tokenize(labelText));
  const aliasMatches = countTokenMatches(queryTokens, tokenize(aliasText));
  const keyMatches = countTokenMatches(queryTokens, tokenize(keyText));
  const tagMatches = countTokenMatches(queryTokens, tokenize(tagText));
  const summaryMatches = countTokenMatches(queryTokens, tokenize(summaryText));
  const bodyMatches = Math.min(6, countTokenMatches(queryTokens, tokenize(bodyText)));
  const commentMatches = countTokenMatches(queryTokens, tokenize(commentText));
  const parentMatches = countTokenMatches(queryTokens, tokenize(parentText));

  if (labelMatches > 0) reasons.push("label");
  if (aliasMatches > 0) reasons.push("alias");
  if (keyMatches > 0) reasons.push("keyword");
  if (tagMatches > 0) reasons.push("tag");
  if (summaryMatches > 0) reasons.push("summary");
  if (bodyMatches > 0) reasons.push("content");
  if (parentMatches > 0) reasons.push("parent");

  score += labelMatches * 4;
  score += aliasMatches * 3;
  score += keyMatches * 3;
  score += tagMatches * 2;
  score += summaryMatches * 2;
  score += bodyMatches;
  score += commentMatches * 2;
  score += parentMatches;

  return {
    entry,
    score,
    reasons: Array.from(new Set(reasons)),
  };
}

function scoreEntries(entries: IndexedEntry[], queryText: string): ScoredEntry[] {
  const queryNormalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  if (!queryNormalized || queryTokens.length === 0) return [];

  const byNodeId = createNodeMap(entries);

  return entries
    .filter((entry) => !entry.disabled)
    .map((entry) => scoreEntry(entry, queryNormalized, queryTokens, byNodeId))
    .filter((scored) => scored.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}

async function maybeRerankEntries(queryText: string, scored: ScoredEntry[]): Promise<ScoredEntry[]> {
  if (scored.length <= 1) return scored;

  const prompt = [
    "You rank lore nodes for retrieval relevance.",
    'Return ONLY JSON in this exact shape: {"ids":["candidate-id-1","candidate-id-2"]}.',
    "Use only IDs from the candidate list. Do not explain your reasoning.",
    "",
    `Query: ${queryText}`,
    "",
    "Candidates:",
    ...scored.map((item) => {
      const candidate = [
        `id=${item.entry.nodeId}`,
        `label=${item.entry.label}`,
        item.entry.aliases.length ? `aliases=${item.entry.aliases.join(" | ")}` : "",
        item.entry.summary ? `summary=${truncateText(item.entry.summary, 120)}` : "",
        `content=${truncateText(getEntryBody(item.entry), 160)}`,
      ].filter(Boolean);
      return `- ${candidate.join(" ; ")}`;
    }),
  ].join("\n");

  try {
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages: [{ role: "user", content: prompt }],
      parameters: { temperature: 0.1, max_tokens: 220 },
    });
    const parsed = parseJsonObject(getGenerationContent(result));
    const ids = Array.isArray(parsed?.ids)
      ? parsed.ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    if (!ids.length) return scored;

    const byId = new Map(scored.map((item) => [item.entry.nodeId, item]));
    const ordered: ScoredEntry[] = [];
    const seen = new Set<string>();

    for (const id of ids) {
      const match = byId.get(id);
      if (!match || seen.has(match.entry.nodeId)) continue;
      seen.add(match.entry.nodeId);
      ordered.push(match);
    }

    for (const item of scored) {
      if (seen.has(item.entry.nodeId)) continue;
      ordered.push(item);
    }

    return ordered;
  } catch (error: unknown) {
    spindle.log.warn(`Lore Recall rerank failed: ${error instanceof Error ? error.message : String(error)}`);
    return scored;
  }
}

function buildTraversalCandidateSet(entries: IndexedEntry[], shortlist: ScoredEntry[], maxTraversalDepth: number): IndexedEntry[] {
  const byNodeId = createNodeMap(entries);
  const childrenByParent = new Map<string | null, IndexedEntry[]>();

  for (const entry of entries) {
    const parentKey =
      entry.parentNodeId && entry.parentNodeId !== entry.nodeId && byNodeId.has(entry.parentNodeId)
        ? entry.parentNodeId
        : null;
    const bucket = childrenByParent.get(parentKey) ?? [];
    bucket.push(entry);
    childrenByParent.set(parentKey, bucket);
  }

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const add = (nodeId: string | null | undefined) => {
    if (!nodeId || seen.has(nodeId) || !byNodeId.has(nodeId) || orderedIds.length >= 40) return;
    seen.add(nodeId);
    orderedIds.push(nodeId);
  };

  for (const scored of shortlist.slice(0, Math.max(12, maxTraversalDepth * 4))) {
    add(scored.entry.nodeId);

    let depth = 0;
    let cursor = getParentEntry(scored.entry, byNodeId);
    while (cursor && depth < maxTraversalDepth + 2) {
      add(cursor.nodeId);
      cursor = getParentEntry(cursor, byNodeId);
      depth += 1;
    }

    const children = (childrenByParent.get(scored.entry.nodeId) ?? []).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
    children.slice(0, 4).forEach((child) => add(child.nodeId));
  }

  return orderedIds.map((nodeId) => byNodeId.get(nodeId)).filter((entry): entry is IndexedEntry => !!entry);
}

async function selectTraversalEntries(
  entries: IndexedEntry[],
  config: CharacterRetrievalConfig,
  queryText: string,
): Promise<{ selected: ScoredEntry[]; fallbackReason: string | null }> {
  const deterministic = scoreEntries(entries, queryText).slice(0, Math.max(config.maxResults * 4, 12));
  if (!deterministic.length) {
    return { selected: [], fallbackReason: "No scored nodes were available for traversal." };
  }

  const traversalCandidates = buildTraversalCandidateSet(entries, deterministic, config.maxTraversalDepth);
  const candidateById = new Map(traversalCandidates.map((entry) => [entry.nodeId, entry]));

  const prompt = [
    "You are choosing lore tree branches for retrieval.",
    'Return ONLY JSON in this exact shape: {"nodeIds":["node-id-1","node-id-2"],"reason":"short reason"}.',
    `Choose up to ${config.maxResults} nodeIds.`,
    "Prefer the most specific nodes that answer the query. Use parent summary nodes only when the query is broad.",
    "Do not invent nodeIds.",
    "",
    `Query: ${queryText}`,
    "",
    "Candidate tree nodes:",
    JSON.stringify(
      traversalCandidates.map((entry) => ({
        nodeId: entry.nodeId,
        parentNodeId: entry.parentNodeId,
        label: entry.label,
        aliases: entry.aliases.slice(0, 5),
        summary: truncateText(entry.summary, 120),
        preview: truncateText(getEntryBody(entry), 180),
      })),
      null,
      2,
    ),
  ].join("\n");

  try {
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages: [{ role: "user", content: prompt }],
      parameters: { temperature: 0.1, max_tokens: 260 },
    });
    const parsed = parseJsonObject(getGenerationContent(result));
    const requestedIds = Array.isArray(parsed?.nodeIds)
      ? parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    const selected: ScoredEntry[] = [];
    const seen = new Set<string>();
    const deterministicById = new Map(deterministic.map((entry) => [entry.entry.nodeId, entry]));

    for (const nodeId of requestedIds) {
      const match = candidateById.get(nodeId);
      if (!match || seen.has(nodeId)) continue;
      seen.add(nodeId);
      selected.push(
        deterministicById.get(nodeId) ?? {
          entry: match,
          score: 1,
          reasons: ["controller"],
        },
      );
      if (selected.length >= config.maxResults) break;
    }

    if (!selected.length) {
      return {
        selected: deterministic.slice(0, config.maxResults),
        fallbackReason: "Traversal controller returned no valid nodes, so collapsed retrieval was used instead.",
      };
    }

    for (const fallback of deterministic) {
      if (selected.length >= config.maxResults) break;
      if (seen.has(fallback.entry.nodeId)) continue;
      seen.add(fallback.entry.nodeId);
      selected.push(fallback);
    }

    return { selected, fallbackReason: null };
  } catch (error: unknown) {
    spindle.log.warn(`Lore Recall traversal failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      selected: scoreEntries(entries, queryText).slice(0, config.maxResults),
      fallbackReason: "Traversal controller failed, so collapsed retrieval was used instead.",
    };
  }
}

function buildPreviewNodes(scoredEntries: ScoredEntry[], byNodeId: Map<string, IndexedEntry>): PreviewNode[] {
  return scoredEntries.map((item) => ({
    entryId: item.entry.entryId,
    label: item.entry.label,
    worldBookId: item.entry.worldBookId,
    worldBookName: item.entry.worldBookName,
    breadcrumb: getBreadcrumb(item.entry, byNodeId),
    score: Number(item.score.toFixed(2)),
    reasons: item.reasons,
    previewText: truncateText(getEntryBody(item.entry), 240),
  }));
}

function buildInjectionText(
  scoredEntries: ScoredEntry[],
  tokenBudget: number,
  byNodeId: Map<string, IndexedEntry>,
): { text: string; included: ScoredEntry[]; estimatedTokens: number } | null {
  if (!scoredEntries.length) return null;

  const maxChars = clampInt(tokenBudget, 200, 4000) * 4;
  const parts: string[] = [
    "[Lore Recall Retrieved Context]",
    "Use this retrieved reference only if it is relevant to the current reply. Do not mention Lore Recall or describe this block explicitly.",
  ];
  const included: ScoredEntry[] = [];

  for (const item of scoredEntries) {
    const entryBody = getEntryBody(item.entry);
    if (!entryBody) continue;

    const section = [
      "",
      `${included.length + 1}. ${getBreadcrumb(item.entry, byNodeId)}`,
      `Book: ${item.entry.worldBookName}`,
      item.entry.aliases.length ? `Aliases: ${item.entry.aliases.join(", ")}` : "",
      entryBody,
    ]
      .filter(Boolean)
      .join("\n");

    const candidateText = [...parts, section].join("\n");
    if (candidateText.length <= maxChars) {
      parts.push(section);
      included.push(item);
      continue;
    }

    if (!included.length) {
      const remaining = Math.max(120, maxChars - parts.join("\n").length - 20);
      const shortened = truncateText(entryBody, remaining);
      parts.push(
        [
          "",
          `1. ${getBreadcrumb(item.entry, byNodeId)}`,
          `Book: ${item.entry.worldBookName}`,
          shortened,
        ].join("\n"),
      );
      included.push(item);
    }
    break;
  }

  const text = parts.join("\n").trim();
  if (!included.length || !text) return null;

  return {
    text,
    included,
    estimatedTokens: Math.ceil(text.length / 4),
  };
}

async function buildRetrievalPreview(
  messages: ChatLikeMessage[],
  config: CharacterRetrievalConfig,
  managedBooks: CachedBook[],
): Promise<RetrievalPreview | null> {
  const entries = managedBooks.flatMap((book) => book.entries);
  if (!entries.length) return null;

  const queryText = buildQueryText(messages);
  if (!queryText.trim()) return null;

  let selected: ScoredEntry[] = [];
  let fallbackReason: string | null = null;

  if (config.defaultMode === "traversal") {
    const traversal = await selectTraversalEntries(entries, config, queryText);
    selected = traversal.selected;
    fallbackReason = traversal.fallbackReason;
  } else {
    let collapsed = scoreEntries(entries, queryText);
    if (config.rerankEnabled) {
      collapsed = await maybeRerankEntries(queryText, collapsed);
    }
    selected = collapsed.slice(0, config.maxResults);
  }

  if (!selected.length) return null;

  const byNodeId = createNodeMap(entries);
  const injection = buildInjectionText(selected, config.tokenBudget, byNodeId);
  if (!injection) return null;

  return {
    mode: config.defaultMode,
    queryText,
    estimatedTokens: injection.estimatedTokens,
    injectedText: injection.text,
    selectedNodes: buildPreviewNodes(injection.included, byNodeId),
    fallbackReason,
  };
}

async function resolveActiveChat(chatId?: string | null) {
  if (chatId) return spindle.chats.get(chatId);
  return spindle.chats.getActive();
}

async function buildState(chatId?: string | null): Promise<FrontendState> {
  const [allBooks, activeChat] = await Promise.all([listAllWorldBooks(), resolveActiveChat(chatId)]);
  const sortedBooks = allBooks
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(toBookSummary);

  if (!activeChat?.character_id) {
    return {
      activeChatId: activeChat?.id ?? null,
      activeCharacterId: null,
      activeCharacterName: null,
      config: null,
      allWorldBooks: sortedBooks,
      managedBooks: [],
      attachedManagedBookIds: [],
      preview: null,
    };
  }

  const character = await spindle.characters.get(activeChat.character_id);
  if (!character) {
    return {
      activeChatId: activeChat.id,
      activeCharacterId: activeChat.character_id,
      activeCharacterName: null,
      config: null,
      allWorldBooks: sortedBooks,
      managedBooks: [],
      attachedManagedBookIds: [],
      preview: null,
    };
  }

  const config = await loadCharacterConfig(character.id);
  const characterWithBooks = character as unknown as { world_book_ids?: unknown };
  const characterWorldBookIds = Array.isArray(characterWithBooks.world_book_ids)
    ? (characterWithBooks.world_book_ids.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ))
    : [];
  const selectedBookIds = config.managedBookIds.filter((bookId) => allBooks.some((book) => book.id === bookId));
  const attachedManagedBookIds = selectedBookIds.filter((bookId) => characterWorldBookIds.includes(bookId));
  const managedBookCaches = (
    await Promise.all(selectedBookIds.map((bookId) => loadBookCache(bookId)))
  ).filter((book): book is CachedBook => !!book);

  const preview =
    activeChat.id && config.enabled && managedBookCaches.length
      ? await buildRetrievalPreview(
          (
            await spindle.chat.getMessages(activeChat.id)
          ).map((message) => ({
            role: message.role,
            content: message.content,
          })),
          config,
          managedBookCaches,
        )
      : null;

  return {
    activeChatId: activeChat.id,
    activeCharacterId: character.id,
    activeCharacterName: character.name,
    config,
    allWorldBooks: sortedBooks,
    managedBooks: managedBookCaches.map((cache) => toManagedBookView(cache, attachedManagedBookIds.includes(cache.bookId))),
    attachedManagedBookIds,
    preview,
  };
}

async function pushState(chatId?: string | null, userId?: string): Promise<void> {
  const state = await buildState(chatId);
  send({ type: "state", state }, userId);
}

async function saveEntryMeta(entryId: string, meta: EntryTreeMeta): Promise<void> {
  const entry = await spindle.world_books.entries.get(entryId);
  if (!entry) {
    throw new Error("That world book entry no longer exists.");
  }

  const currentMeta = normalizeEntryTreeMeta((entry.extensions || {})[EXTENSION_KEY], {
    entryId: entry.id,
    comment: entry.comment,
    key: entry.key,
  });
  const nextMeta = normalizeEntryTreeMeta(
    {
      ...currentMeta,
      ...meta,
      childrenOrder: Array.isArray(meta.childrenOrder) ? meta.childrenOrder : currentMeta.childrenOrder,
    },
    {
      entryId: entry.id,
      comment: entry.comment,
      key: entry.key,
    },
  );

  await spindle.world_books.entries.update(entry.id, {
    extensions: {
      ...(entry.extensions || {}),
      [EXTENSION_KEY]: nextMeta,
    },
  });

  await invalidateBookCache(entry.world_book_id);
}

spindle.registerInterceptor(async (messages, context) => {
  try {
    const contextValue = context && typeof context === "object" ? (context as { chatId?: unknown }) : {};
    const chatId = typeof contextValue.chatId === "string" ? contextValue.chatId : null;
    if (!chatId) return messages;

    const chat = await spindle.chats.get(chatId);
    if (!chat?.character_id) return messages;

    const config = await loadCharacterConfig(chat.character_id);
    if (!config.enabled || !config.managedBookIds.length) return messages;

    const books = (
      await Promise.all(config.managedBookIds.map((bookId) => loadBookCache(bookId)))
    ).filter((book): book is CachedBook => !!book);
    if (!books.length) return messages;

    const preview = await buildRetrievalPreview(messages, config, books);
    if (!preview?.injectedText.trim()) return messages;

    return [{ role: "system", content: preview.injectedText }, ...messages] satisfies LlmMessageDTO[];
  } catch (error: unknown) {
    spindle.log.warn(`Lore Recall interceptor failed: ${error instanceof Error ? error.message : String(error)}`);
    return messages;
  }
}, 95);

spindle.onFrontendMessage(async (payload, userId) => {
  lastFrontendUserId = userId;
  const message = payload as FrontendToBackend;

  try {
    await ensureStorageFolders();

    switch (message.type) {
      case "ready":
      case "refresh":
        await pushState(message.chatId, userId);
        break;

      case "save_character_config":
        await saveCharacterConfig(message.characterId, message.patch);
        await pushState(message.chatId, userId);
        break;

      case "save_entry_meta":
        await saveEntryMeta(message.entryId, message.meta);
        await pushState(message.chatId, userId);
        break;
    }
  } catch (error: unknown) {
    const description = error instanceof Error ? error.message : "Unknown Lore Recall error";
    spindle.log.error(`Lore Recall error: ${description}`);
    send({ type: "error", message: description }, userId);
  }
});

(async () => {
  await ensureStorageFolders();
  spindle.log.info("Lore Recall loaded.");
})();
