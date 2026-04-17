// @bun
// src/shared.ts
var EXTENSION_KEY = "lore_recall";
var DEFAULT_MAX_RESULTS = 6;
var DEFAULT_MAX_TRAVERSAL_DEPTH = 3;
var DEFAULT_TOKEN_BUDGET = 900;
var DEFAULT_CHARACTER_CONFIG = {
  enabled: false,
  managedBookIds: [],
  defaultMode: "collapsed",
  maxResults: DEFAULT_MAX_RESULTS,
  maxTraversalDepth: DEFAULT_MAX_TRAVERSAL_DEPTH,
  tokenBudget: DEFAULT_TOKEN_BUDGET,
  rerankEnabled: false
};
function clampInt(value, min, max) {
  if (!Number.isFinite(value))
    return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
function uniqueStrings(values) {
  const seen = new Set;
  const result = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed)
      continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key))
      continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
function truncateText(value, maxLength) {
  if (value.length <= maxLength)
    return value;
  if (maxLength <= 1)
    return value.slice(0, maxLength);
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`;
}
function normalizeCharacterConfig(value) {
  const next = value ?? {};
  return {
    enabled: !!next.enabled,
    managedBookIds: uniqueStrings(Array.isArray(next.managedBookIds) ? next.managedBookIds : []),
    defaultMode: next.defaultMode === "traversal" ? "traversal" : "collapsed",
    maxResults: clampInt(typeof next.maxResults === "number" ? next.maxResults : DEFAULT_CHARACTER_CONFIG.maxResults, 1, 12),
    maxTraversalDepth: clampInt(typeof next.maxTraversalDepth === "number" ? next.maxTraversalDepth : DEFAULT_CHARACTER_CONFIG.maxTraversalDepth, 1, 6),
    tokenBudget: clampInt(typeof next.tokenBudget === "number" ? next.tokenBudget : DEFAULT_CHARACTER_CONFIG.tokenBudget, 200, 4000),
    rerankEnabled: !!next.rerankEnabled
  };
}
function defaultEntryTreeMeta(seed) {
  const fallbackLabel = seed.comment?.trim() || seed.key?.find(Boolean)?.trim() || `Node ${seed.entryId.slice(0, 8)}`;
  return {
    nodeId: seed.entryId,
    parentNodeId: null,
    label: fallbackLabel,
    aliases: [],
    summary: "",
    childrenOrder: [],
    collapsedText: "",
    tags: []
  };
}
function asStringArray(value) {
  if (!Array.isArray(value))
    return [];
  return uniqueStrings(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean));
}
function normalizeEntryTreeMeta(raw, seed) {
  const fallback = defaultEntryTreeMeta(seed);
  const value = raw && typeof raw === "object" ? raw : {};
  const nodeId = typeof value.nodeId === "string" && value.nodeId.trim() ? value.nodeId.trim() : fallback.nodeId;
  const parentNodeId = typeof value.parentNodeId === "string" && value.parentNodeId.trim() ? value.parentNodeId.trim() : null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label.trim() : fallback.label;
  return {
    nodeId,
    parentNodeId: parentNodeId && parentNodeId !== nodeId ? parentNodeId : null,
    label,
    aliases: asStringArray(value.aliases),
    summary: typeof value.summary === "string" ? value.summary.trim() : "",
    childrenOrder: asStringArray(value.childrenOrder),
    collapsedText: typeof value.collapsedText === "string" ? value.collapsedText.trim() : "",
    tags: asStringArray(value.tags)
  };
}

// src/backend.ts
var lastFrontendUserId = null;
var chatUserIds = new Map;
var CHARACTER_CONFIG_DIR = "characters";
var CACHE_DIR = "cache";
var CACHE_VERSION = 1;
var PAGE_LIMIT = 200;
function send(message, userId = lastFrontendUserId ?? undefined) {
  spindle.sendToFrontend(message);
}
function rememberChatUser(chatId, userId) {
  if (!chatId || !userId)
    return;
  chatUserIds.set(chatId, userId);
}
function resolveUserId(chatId) {
  if (chatId) {
    const mappedUserId = chatUserIds.get(chatId);
    if (mappedUserId)
      return mappedUserId;
  }
  return lastFrontendUserId;
}
function readChatIdFromMessage(message) {
  if (!("chatId" in message))
    return null;
  return typeof message.chatId === "string" && message.chatId.trim() ? message.chatId : null;
}
function getCharacterConfigPath(characterId) {
  return `${CHARACTER_CONFIG_DIR}/${characterId}.json`;
}
function getBookCachePath(bookId) {
  return `${CACHE_DIR}/${bookId}.json`;
}
async function ensureStorageFolders(userId) {
  await spindle.userStorage.mkdir(CHARACTER_CONFIG_DIR, userId).catch(() => {});
  await spindle.userStorage.mkdir(CACHE_DIR, userId).catch(() => {});
}
async function loadCharacterConfig(characterId, userId) {
  const stored = await spindle.userStorage.getJson(getCharacterConfigPath(characterId), {
    fallback: DEFAULT_CHARACTER_CONFIG,
    userId
  });
  return normalizeCharacterConfig(stored);
}
async function saveCharacterConfig(characterId, patch, userId) {
  const current = await loadCharacterConfig(characterId, userId);
  const next = normalizeCharacterConfig({ ...current, ...patch });
  await spindle.userStorage.setJson(getCharacterConfigPath(characterId), next, { indent: 2, userId });
  return next;
}
async function invalidateBookCache(bookId, userId) {
  await spindle.userStorage.delete(getBookCachePath(bookId), userId).catch(() => {});
}
async function listAllWorldBooks(userId) {
  const books = [];
  let offset = 0;
  while (true) {
    const page = await spindle.world_books.list({ limit: PAGE_LIMIT, offset, userId });
    books.push(...page.data);
    if (books.length >= page.total || page.data.length === 0)
      break;
    offset += page.data.length;
  }
  return books;
}
async function listAllEntries(worldBookId, userId) {
  const entries = [];
  let offset = 0;
  while (true) {
    const page = await spindle.world_books.entries.list(worldBookId, { limit: PAGE_LIMIT, offset, userId });
    entries.push(...page.data);
    if (entries.length >= page.total || page.data.length === 0)
      break;
    offset += page.data.length;
  }
  return entries;
}
function stripCodeFences(content) {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function parseJsonObject(content) {
  const trimmed = stripCodeFences(content);
  if (!trimmed)
    return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match)
      return null;
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
}
function getGenerationContent(result) {
  if (!result || typeof result !== "object")
    return "";
  const content = result.content;
  return typeof content === "string" ? content : "";
}
function toBookSummary(book) {
  return {
    id: book.id,
    name: book.name,
    description: book.description,
    updatedAt: book.updated_at
  };
}
function toIndexedEntry(book, entry) {
  const meta = normalizeEntryTreeMeta((entry.extensions || {})[EXTENSION_KEY], {
    entryId: entry.id,
    comment: entry.comment,
    key: entry.key
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
    ...meta
  };
}
async function loadBookCache(bookId, userId) {
  const book = await spindle.world_books.get(bookId, userId);
  if (!book)
    return null;
  const cachePath = getBookCachePath(bookId);
  const cached = await spindle.userStorage.getJson(cachePath, { fallback: null, userId });
  if (cached && cached.version === CACHE_VERSION && cached.bookId === bookId && cached.bookUpdatedAt === book.updated_at) {
    return cached;
  }
  const entries = await listAllEntries(bookId, userId);
  const rebuilt = {
    version: CACHE_VERSION,
    bookId: book.id,
    bookUpdatedAt: book.updated_at,
    name: book.name,
    description: book.description,
    entries: entries.map((entry) => toIndexedEntry(book, entry))
  };
  await spindle.userStorage.setJson(cachePath, rebuilt, { indent: 2, userId });
  return rebuilt;
}
function toManagedBookView(cache, attachedToCharacter) {
  return {
    id: cache.bookId,
    name: cache.name,
    description: cache.description,
    updatedAt: cache.bookUpdatedAt,
    attachedToCharacter,
    entries: cache.entries.map(({ content: _content, ...rest }) => rest)
  };
}
function stripSearchMarkup(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeSearchText(value) {
  return stripSearchMarkup(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokenize(value) {
  return Array.from(new Set(normalizeSearchText(value).split(" ").filter((token) => token.length >= 2)));
}
function buildQueryText(messages) {
  return messages.filter((message) => message.role !== "system" && message.content.trim()).slice(-6).map((message) => `${message.role}: ${stripSearchMarkup(message.content)}`).join(`
`);
}
function createNodeMap(entries) {
  return new Map(entries.map((entry) => [entry.nodeId, entry]));
}
function getParentEntry(entry, byNodeId) {
  if (!entry.parentNodeId)
    return null;
  const parent = byNodeId.get(entry.parentNodeId);
  if (!parent || parent.nodeId === entry.nodeId)
    return null;
  return parent;
}
function getBreadcrumb(entry, byNodeId) {
  const labels = [];
  const visited = new Set;
  let cursor = entry;
  while (cursor && !visited.has(cursor.nodeId)) {
    visited.add(cursor.nodeId);
    labels.push(cursor.label);
    cursor = getParentEntry(cursor, byNodeId);
  }
  return labels.reverse().join(" > ");
}
function getEntryBody(entry) {
  return entry.collapsedText.trim() || entry.content.trim();
}
function countTokenMatches(queryTokens, targetTokens) {
  if (!queryTokens.length || !targetTokens.length)
    return 0;
  const targetSet = new Set(targetTokens);
  let count = 0;
  for (const token of queryTokens) {
    if (targetSet.has(token))
      count += 1;
  }
  return count;
}
function countPhraseBonus(queryText, value) {
  if (!queryText || !value || value.length < 4)
    return false;
  return queryText.includes(value) || value.includes(queryText);
}
function scoreEntry(entry, queryText, queryTokens, byNodeId) {
  const reasons = [];
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
  if (labelMatches > 0)
    reasons.push("label");
  if (aliasMatches > 0)
    reasons.push("alias");
  if (keyMatches > 0)
    reasons.push("keyword");
  if (tagMatches > 0)
    reasons.push("tag");
  if (summaryMatches > 0)
    reasons.push("summary");
  if (bodyMatches > 0)
    reasons.push("content");
  if (parentMatches > 0)
    reasons.push("parent");
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
    reasons: Array.from(new Set(reasons))
  };
}
function scoreEntries(entries, queryText) {
  const queryNormalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  if (!queryNormalized || queryTokens.length === 0)
    return [];
  const byNodeId = createNodeMap(entries);
  return entries.filter((entry) => !entry.disabled).map((entry) => scoreEntry(entry, queryNormalized, queryTokens, byNodeId)).filter((scored) => scored.score > 0).sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}
async function maybeRerankEntries(queryText, scored, userId) {
  if (scored.length <= 1)
    return scored;
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
        `content=${truncateText(getEntryBody(item.entry), 160)}`
      ].filter(Boolean);
      return `- ${candidate.join(" ; ")}`;
    })
  ].join(`
`);
  try {
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages: [{ role: "user", content: prompt }],
      parameters: { temperature: 0.1, max_tokens: 220 },
      userId
    });
    const parsed = parseJsonObject(getGenerationContent(result));
    const ids = Array.isArray(parsed?.ids) ? parsed.ids.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
    if (!ids.length)
      return scored;
    const byId = new Map(scored.map((item) => [item.entry.nodeId, item]));
    const ordered = [];
    const seen = new Set;
    for (const id of ids) {
      const match = byId.get(id);
      if (!match || seen.has(match.entry.nodeId))
        continue;
      seen.add(match.entry.nodeId);
      ordered.push(match);
    }
    for (const item of scored) {
      if (seen.has(item.entry.nodeId))
        continue;
      ordered.push(item);
    }
    return ordered;
  } catch (error) {
    spindle.log.warn(`Lore Recall rerank failed: ${error instanceof Error ? error.message : String(error)}`);
    return scored;
  }
}
function buildTraversalCandidateSet(entries, shortlist, maxTraversalDepth) {
  const byNodeId = createNodeMap(entries);
  const childrenByParent = new Map;
  for (const entry of entries) {
    const parentKey = entry.parentNodeId && entry.parentNodeId !== entry.nodeId && byNodeId.has(entry.parentNodeId) ? entry.parentNodeId : null;
    const bucket = childrenByParent.get(parentKey) ?? [];
    bucket.push(entry);
    childrenByParent.set(parentKey, bucket);
  }
  const orderedIds = [];
  const seen = new Set;
  const add = (nodeId) => {
    if (!nodeId || seen.has(nodeId) || !byNodeId.has(nodeId) || orderedIds.length >= 40)
      return;
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
    const children = (childrenByParent.get(scored.entry.nodeId) ?? []).sort((left, right) => left.label.localeCompare(right.label));
    children.slice(0, 4).forEach((child) => add(child.nodeId));
  }
  return orderedIds.map((nodeId) => byNodeId.get(nodeId)).filter((entry) => !!entry);
}
async function selectTraversalEntries(entries, config, queryText, userId) {
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
    JSON.stringify(traversalCandidates.map((entry) => ({
      nodeId: entry.nodeId,
      parentNodeId: entry.parentNodeId,
      label: entry.label,
      aliases: entry.aliases.slice(0, 5),
      summary: truncateText(entry.summary, 120),
      preview: truncateText(getEntryBody(entry), 180)
    })), null, 2)
  ].join(`
`);
  try {
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages: [{ role: "user", content: prompt }],
      parameters: { temperature: 0.1, max_tokens: 260 },
      userId
    });
    const parsed = parseJsonObject(getGenerationContent(result));
    const requestedIds = Array.isArray(parsed?.nodeIds) ? parsed.nodeIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
    const selected = [];
    const seen = new Set;
    const deterministicById = new Map(deterministic.map((entry) => [entry.entry.nodeId, entry]));
    for (const nodeId of requestedIds) {
      const match = candidateById.get(nodeId);
      if (!match || seen.has(nodeId))
        continue;
      seen.add(nodeId);
      selected.push(deterministicById.get(nodeId) ?? {
        entry: match,
        score: 1,
        reasons: ["controller"]
      });
      if (selected.length >= config.maxResults)
        break;
    }
    if (!selected.length) {
      return {
        selected: deterministic.slice(0, config.maxResults),
        fallbackReason: "Traversal controller returned no valid nodes, so collapsed retrieval was used instead."
      };
    }
    for (const fallback of deterministic) {
      if (selected.length >= config.maxResults)
        break;
      if (seen.has(fallback.entry.nodeId))
        continue;
      seen.add(fallback.entry.nodeId);
      selected.push(fallback);
    }
    return { selected, fallbackReason: null };
  } catch (error) {
    spindle.log.warn(`Lore Recall traversal failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      selected: scoreEntries(entries, queryText).slice(0, config.maxResults),
      fallbackReason: "Traversal controller failed, so collapsed retrieval was used instead."
    };
  }
}
function buildPreviewNodes(scoredEntries, byNodeId) {
  return scoredEntries.map((item) => ({
    entryId: item.entry.entryId,
    label: item.entry.label,
    worldBookId: item.entry.worldBookId,
    worldBookName: item.entry.worldBookName,
    breadcrumb: getBreadcrumb(item.entry, byNodeId),
    score: Number(item.score.toFixed(2)),
    reasons: item.reasons,
    previewText: truncateText(getEntryBody(item.entry), 240)
  }));
}
function buildInjectionText(scoredEntries, tokenBudget, byNodeId) {
  if (!scoredEntries.length)
    return null;
  const maxChars = clampInt(tokenBudget, 200, 4000) * 4;
  const parts = [
    "[Lore Recall Retrieved Context]",
    "Use this retrieved reference only if it is relevant to the current reply. Do not mention Lore Recall or describe this block explicitly."
  ];
  const included = [];
  for (const item of scoredEntries) {
    const entryBody = getEntryBody(item.entry);
    if (!entryBody)
      continue;
    const section = [
      "",
      `${included.length + 1}. ${getBreadcrumb(item.entry, byNodeId)}`,
      `Book: ${item.entry.worldBookName}`,
      item.entry.aliases.length ? `Aliases: ${item.entry.aliases.join(", ")}` : "",
      entryBody
    ].filter(Boolean).join(`
`);
    const candidateText = [...parts, section].join(`
`);
    if (candidateText.length <= maxChars) {
      parts.push(section);
      included.push(item);
      continue;
    }
    if (!included.length) {
      const remaining = Math.max(120, maxChars - parts.join(`
`).length - 20);
      const shortened = truncateText(entryBody, remaining);
      parts.push([
        "",
        `1. ${getBreadcrumb(item.entry, byNodeId)}`,
        `Book: ${item.entry.worldBookName}`,
        shortened
      ].join(`
`));
      included.push(item);
    }
    break;
  }
  const text = parts.join(`
`).trim();
  if (!included.length || !text)
    return null;
  return {
    text,
    included,
    estimatedTokens: Math.ceil(text.length / 4)
  };
}
async function buildRetrievalPreview(messages, config, managedBooks, userId) {
  const entries = managedBooks.flatMap((book) => book.entries);
  if (!entries.length)
    return null;
  const queryText = buildQueryText(messages);
  if (!queryText.trim())
    return null;
  let selected = [];
  let fallbackReason = null;
  if (config.defaultMode === "traversal") {
    const traversal = await selectTraversalEntries(entries, config, queryText, userId);
    selected = traversal.selected;
    fallbackReason = traversal.fallbackReason;
  } else {
    let collapsed = scoreEntries(entries, queryText);
    if (config.rerankEnabled) {
      collapsed = await maybeRerankEntries(queryText, collapsed, userId);
    }
    selected = collapsed.slice(0, config.maxResults);
  }
  if (!selected.length)
    return null;
  const byNodeId = createNodeMap(entries);
  const injection = buildInjectionText(selected, config.tokenBudget, byNodeId);
  if (!injection)
    return null;
  return {
    mode: config.defaultMode,
    queryText,
    estimatedTokens: injection.estimatedTokens,
    injectedText: injection.text,
    selectedNodes: buildPreviewNodes(injection.included, byNodeId),
    fallbackReason
  };
}
async function resolveActiveChat(userId, chatId) {
  if (chatId)
    return spindle.chats.get(chatId, userId);
  return spindle.chats.getActive(userId);
}
async function buildState(userId, chatId) {
  const [allBooks, activeChat] = await Promise.all([listAllWorldBooks(userId), resolveActiveChat(userId, chatId)]);
  const sortedBooks = allBooks.slice().sort((left, right) => left.name.localeCompare(right.name)).map(toBookSummary);
  if (!activeChat?.character_id) {
    return {
      activeChatId: activeChat?.id ?? null,
      activeCharacterId: null,
      activeCharacterName: null,
      config: null,
      allWorldBooks: sortedBooks,
      managedBooks: [],
      attachedManagedBookIds: [],
      preview: null
    };
  }
  const character = await spindle.characters.get(activeChat.character_id, userId);
  if (!character) {
    return {
      activeChatId: activeChat.id,
      activeCharacterId: activeChat.character_id,
      activeCharacterName: null,
      config: null,
      allWorldBooks: sortedBooks,
      managedBooks: [],
      attachedManagedBookIds: [],
      preview: null
    };
  }
  const config = await loadCharacterConfig(character.id, userId);
  const characterWithBooks = character;
  const characterWorldBookIds = Array.isArray(characterWithBooks.world_book_ids) ? characterWithBooks.world_book_ids.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  const selectedBookIds = config.managedBookIds.filter((bookId) => allBooks.some((book) => book.id === bookId));
  const attachedManagedBookIds = selectedBookIds.filter((bookId) => characterWorldBookIds.includes(bookId));
  const managedBookCaches = (await Promise.all(selectedBookIds.map((bookId) => loadBookCache(bookId, userId)))).filter((book) => !!book);
  const preview = activeChat.id && config.enabled && managedBookCaches.length ? await buildRetrievalPreview((await spindle.chat.getMessages(activeChat.id)).map((message) => ({
    role: message.role,
    content: message.content
  })), config, managedBookCaches, userId) : null;
  return {
    activeChatId: activeChat.id,
    activeCharacterId: character.id,
    activeCharacterName: character.name,
    config,
    allWorldBooks: sortedBooks,
    managedBooks: managedBookCaches.map((cache) => toManagedBookView(cache, attachedManagedBookIds.includes(cache.bookId))),
    attachedManagedBookIds,
    preview
  };
}
async function pushState(userId, chatId) {
  const state = await buildState(userId, chatId);
  rememberChatUser(state.activeChatId, userId);
  send({ type: "state", state }, userId);
}
async function saveEntryMeta(entryId, meta, userId) {
  const entry = await spindle.world_books.entries.get(entryId, userId);
  if (!entry) {
    throw new Error("That world book entry no longer exists.");
  }
  const currentMeta = normalizeEntryTreeMeta((entry.extensions || {})[EXTENSION_KEY], {
    entryId: entry.id,
    comment: entry.comment,
    key: entry.key
  });
  const nextMeta = normalizeEntryTreeMeta({
    ...currentMeta,
    ...meta,
    childrenOrder: Array.isArray(meta.childrenOrder) ? meta.childrenOrder : currentMeta.childrenOrder
  }, {
    entryId: entry.id,
    comment: entry.comment,
    key: entry.key
  });
  await spindle.world_books.entries.update(entry.id, {
    extensions: {
      ...entry.extensions || {},
      [EXTENSION_KEY]: nextMeta
    }
  }, userId);
  await invalidateBookCache(entry.world_book_id, userId);
}
spindle.registerInterceptor(async (messages, context) => {
  try {
    const contextValue = context && typeof context === "object" ? context : {};
    const chatId = typeof contextValue.chatId === "string" ? contextValue.chatId : null;
    if (!chatId)
      return messages;
    const userId = resolveUserId(chatId);
    if (!userId) {
      spindle.log.warn(`Lore Recall skipped retrieval for chat ${chatId} because no user context was available yet.`);
      return messages;
    }
    await ensureStorageFolders(userId);
    const chat = await spindle.chats.get(chatId, userId);
    if (!chat?.character_id)
      return messages;
    rememberChatUser(chatId, userId);
    const config = await loadCharacterConfig(chat.character_id, userId);
    if (!config.enabled || !config.managedBookIds.length)
      return messages;
    const books = (await Promise.all(config.managedBookIds.map((bookId) => loadBookCache(bookId, userId)))).filter((book) => !!book);
    if (!books.length)
      return messages;
    const preview = await buildRetrievalPreview(messages, config, books, userId);
    if (!preview?.injectedText.trim())
      return messages;
    return [{ role: "system", content: preview.injectedText }, ...messages];
  } catch (error) {
    spindle.log.warn(`Lore Recall interceptor failed: ${error instanceof Error ? error.message : String(error)}`);
    return messages;
  }
}, 95);
spindle.onFrontendMessage(async (payload, userId) => {
  lastFrontendUserId = userId;
  const message = payload;
  rememberChatUser(readChatIdFromMessage(message), userId);
  try {
    await ensureStorageFolders(userId);
    switch (message.type) {
      case "ready":
      case "refresh":
        await pushState(userId, message.chatId);
        break;
      case "save_character_config":
        await saveCharacterConfig(message.characterId, message.patch, userId);
        await pushState(userId, message.chatId);
        break;
      case "save_entry_meta":
        await saveEntryMeta(message.entryId, message.meta, userId);
        await pushState(userId, message.chatId);
        break;
    }
  } catch (error) {
    const description = error instanceof Error ? error.message : "Unknown Lore Recall error";
    spindle.log.error(`Lore Recall error: ${description}`);
    send({ type: "error", message: description }, userId);
  }
});
spindle.log.info("Lore Recall loaded.");
