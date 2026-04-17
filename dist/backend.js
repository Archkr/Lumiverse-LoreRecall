// @bun
// src/shared.ts
var EXTENSION_KEY = "lore_recall";
var TREE_VERSION = 2;
var ROOT_NODE_ID = "root";
var DEFAULT_GLOBAL_SETTINGS = {
  enabled: true,
  autoDetectPattern: "*recall*",
  controllerConnectionId: null,
  controllerTemperature: 0.2,
  controllerMaxTokens: 8192,
  buildDetail: "lite",
  treeGranularity: 0,
  chunkTokens: 30000,
  dedupMode: "none"
};
var DEFAULT_CHARACTER_CONFIG = {
  enabled: false,
  managedBookIds: [],
  searchMode: "collapsed",
  collapsedDepth: 2,
  maxResults: 6,
  maxTraversalDepth: 3,
  traversalStepLimit: 5,
  tokenBudget: 900,
  rerankEnabled: false,
  selectiveRetrieval: true,
  multiBookMode: "unified",
  contextMessages: 10
};
var DEFAULT_BOOK_CONFIG = {
  enabled: true,
  description: "",
  permission: "read_write"
};
function clampInt(value, min, max) {
  if (!Number.isFinite(value))
    return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
function clampFloat(value, min, max) {
  if (!Number.isFinite(value))
    return min;
  return Math.min(max, Math.max(min, value));
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
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
function normalizeGlobalSettings(value) {
  const next = value ?? {};
  return {
    enabled: next.enabled !== false,
    autoDetectPattern: typeof next.autoDetectPattern === "string" && next.autoDetectPattern.trim() ? next.autoDetectPattern.trim() : DEFAULT_GLOBAL_SETTINGS.autoDetectPattern,
    controllerConnectionId: typeof next.controllerConnectionId === "string" && next.controllerConnectionId.trim() ? next.controllerConnectionId.trim() : null,
    controllerTemperature: clampFloat(typeof next.controllerTemperature === "number" ? next.controllerTemperature : DEFAULT_GLOBAL_SETTINGS.controllerTemperature, 0, 2),
    controllerMaxTokens: clampInt(typeof next.controllerMaxTokens === "number" ? next.controllerMaxTokens : DEFAULT_GLOBAL_SETTINGS.controllerMaxTokens, 256, 32768),
    buildDetail: next.buildDetail === "full" ? "full" : "lite",
    treeGranularity: clampInt(typeof next.treeGranularity === "number" ? next.treeGranularity : DEFAULT_GLOBAL_SETTINGS.treeGranularity, 0, 4),
    chunkTokens: clampInt(typeof next.chunkTokens === "number" ? next.chunkTokens : DEFAULT_GLOBAL_SETTINGS.chunkTokens, 1000, 120000),
    dedupMode: next.dedupMode === "lexical" || next.dedupMode === "llm" ? next.dedupMode : "none"
  };
}
function normalizeCharacterConfig(value) {
  const next = value ?? {};
  const searchMode = next.searchMode === "traversal" || next.defaultMode === "traversal" ? "traversal" : "collapsed";
  return {
    enabled: !!next.enabled,
    managedBookIds: uniqueStrings(Array.isArray(next.managedBookIds) ? next.managedBookIds : []),
    searchMode,
    collapsedDepth: clampInt(typeof next.collapsedDepth === "number" ? next.collapsedDepth : DEFAULT_CHARACTER_CONFIG.collapsedDepth, 1, 6),
    maxResults: clampInt(typeof next.maxResults === "number" ? next.maxResults : DEFAULT_CHARACTER_CONFIG.maxResults, 1, 16),
    maxTraversalDepth: clampInt(typeof next.maxTraversalDepth === "number" ? next.maxTraversalDepth : DEFAULT_CHARACTER_CONFIG.maxTraversalDepth, 1, 8),
    traversalStepLimit: clampInt(typeof next.traversalStepLimit === "number" ? next.traversalStepLimit : DEFAULT_CHARACTER_CONFIG.traversalStepLimit, 1, 12),
    tokenBudget: clampInt(typeof next.tokenBudget === "number" ? next.tokenBudget : DEFAULT_CHARACTER_CONFIG.tokenBudget, 200, 8000),
    rerankEnabled: !!next.rerankEnabled,
    selectiveRetrieval: next.selectiveRetrieval !== false,
    multiBookMode: next.multiBookMode === "per_book" ? "per_book" : "unified",
    contextMessages: clampInt(typeof next.contextMessages === "number" ? next.contextMessages : DEFAULT_CHARACTER_CONFIG.contextMessages, 2, 60)
  };
}
function normalizeBookConfig(value) {
  const next = value ?? {};
  return {
    enabled: next.enabled !== false,
    description: typeof next.description === "string" ? next.description.trim() : "",
    permission: next.permission === "read_only" || next.permission === "write_only" ? next.permission : "read_write"
  };
}
function defaultEntryRecallMeta(seed) {
  const fallbackLabel = seed.comment?.trim() || seed.key?.find(Boolean)?.trim() || `Entry ${seed.entryId.slice(0, 8)}`;
  return {
    label: fallbackLabel,
    aliases: [],
    summary: "",
    collapsedText: "",
    tags: []
  };
}
function asStringArray(value) {
  if (!Array.isArray(value))
    return [];
  return uniqueStrings(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean));
}
function normalizeEntryRecallMeta(raw, seed) {
  const fallback = defaultEntryRecallMeta(seed);
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : fallback.label,
    aliases: asStringArray(value.aliases),
    summary: typeof value.summary === "string" ? value.summary.trim() : "",
    collapsedText: typeof value.collapsedText === "string" ? value.collapsedText.trim() : "",
    tags: asStringArray(value.tags)
  };
}
function readLegacyEntryTreeMeta(raw, seed) {
  const value = raw && typeof raw === "object" ? raw : null;
  if (!value)
    return null;
  const entryMeta = normalizeEntryRecallMeta(value, seed);
  const nodeId = typeof value.nodeId === "string" && value.nodeId.trim() ? value.nodeId.trim() : seed.entryId;
  const parentNodeId = typeof value.parentNodeId === "string" && value.parentNodeId.trim() ? value.parentNodeId.trim() : null;
  const childrenOrder = asStringArray(value.childrenOrder);
  if (!("nodeId" in value) && !("parentNodeId" in value) && !("childrenOrder" in value)) {
    return null;
  }
  return {
    nodeId,
    parentNodeId: parentNodeId && parentNodeId !== nodeId ? parentNodeId : null,
    childrenOrder,
    ...entryMeta
  };
}
function makeTreeNode(id, label, parentId, createdBy, summary = "") {
  return {
    id,
    kind: id === ROOT_NODE_ID ? "root" : "category",
    label,
    summary,
    parentId,
    childIds: [],
    entryIds: [],
    collapsed: false,
    createdBy
  };
}
function createEmptyTreeIndex(bookId) {
  return {
    version: TREE_VERSION,
    bookId,
    rootId: ROOT_NODE_ID,
    nodes: {
      [ROOT_NODE_ID]: makeTreeNode(ROOT_NODE_ID, "Root", null, "system")
    },
    unassignedEntryIds: [],
    lastBuiltAt: null,
    buildSource: null
  };
}
function ensureTreeIndexShape(tree, bookId, entryIds) {
  const base = tree && tree.version === TREE_VERSION ? tree : createEmptyTreeIndex(bookId);
  const root = base.nodes[base.rootId] ?? makeTreeNode(base.rootId || ROOT_NODE_ID, "Root", null, "system");
  const nodes = {
    ...base.nodes,
    [root.id]: {
      ...root,
      kind: "root",
      parentId: null,
      label: root.label || "Root"
    }
  };
  for (const [nodeId, node] of Object.entries(nodes)) {
    nodes[nodeId] = {
      ...node,
      kind: nodeId === base.rootId ? "root" : "category",
      childIds: uniqueStrings(node.childIds ?? []).filter((childId) => childId !== nodeId),
      entryIds: uniqueStrings(node.entryIds ?? []),
      parentId: nodeId === base.rootId ? null : typeof node.parentId === "string" && node.parentId.trim() ? node.parentId.trim() : base.rootId
    };
  }
  const validNodeIds = new Set(Object.keys(nodes));
  for (const node of Object.values(nodes)) {
    node.childIds = node.childIds.filter((childId) => validNodeIds.has(childId));
  }
  const validEntryIds = new Set(entryIds);
  for (const node of Object.values(nodes)) {
    node.entryIds = node.entryIds.filter((entryId) => validEntryIds.has(entryId));
  }
  const assigned = new Set;
  for (const node of Object.values(nodes)) {
    for (const entryId of node.entryIds)
      assigned.add(entryId);
  }
  const unassignedEntryIds = uniqueStrings(base.unassignedEntryIds ?? []).filter((entryId) => validEntryIds.has(entryId));
  for (const entryId of entryIds) {
    if (assigned.has(entryId))
      continue;
    if (!unassignedEntryIds.includes(entryId))
      unassignedEntryIds.push(entryId);
  }
  return {
    version: TREE_VERSION,
    bookId,
    rootId: base.rootId || ROOT_NODE_ID,
    nodes,
    unassignedEntryIds,
    lastBuiltAt: typeof base.lastBuiltAt === "number" ? base.lastBuiltAt : null,
    buildSource: base.buildSource ?? null
  };
}
function treeHasContent(tree) {
  const categoryCount = Object.keys(tree.nodes).length - 1;
  return categoryCount > 0 || tree.unassignedEntryIds.length > 0 || (tree.nodes[tree.rootId]?.entryIds.length ?? 0) > 0;
}
function slugifyLabel(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "category";
}
function makeNodeId(prefix, label) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${slugifyLabel(label)}_${suffix}`;
}
function ensureCategoryPath(tree, labels, createdBy) {
  let parentId = tree.rootId;
  for (const rawLabel of labels) {
    const label = rawLabel.trim();
    if (!label)
      continue;
    const parent = tree.nodes[parentId];
    const existingId = parent.childIds.find((childId) => tree.nodes[childId]?.label.toLowerCase() === label.toLowerCase());
    if (existingId) {
      parentId = existingId;
      continue;
    }
    const nodeId = makeNodeId("cat", label);
    tree.nodes[nodeId] = makeTreeNode(nodeId, label, parentId, createdBy);
    parent.childIds.push(nodeId);
    parentId = nodeId;
  }
  return parentId;
}
function removeEntryFromTree(tree, entryId) {
  tree.unassignedEntryIds = tree.unassignedEntryIds.filter((id) => id !== entryId);
  for (const node of Object.values(tree.nodes)) {
    node.entryIds = node.entryIds.filter((id) => id !== entryId);
  }
}
function assignEntryToTarget(tree, entryId, target) {
  removeEntryFromTree(tree, entryId);
  if (target === "unassigned") {
    tree.unassignedEntryIds.push(entryId);
    return;
  }
  const nodeId = target === "root" ? tree.rootId : target.categoryId;
  const node = tree.nodes[nodeId];
  if (!node) {
    tree.unassignedEntryIds.push(entryId);
    return;
  }
  node.entryIds.push(entryId);
}
function getNodeDepth(tree, nodeId) {
  let depth = 0;
  let cursor = tree.nodes[nodeId];
  const visited = new Set;
  while (cursor && cursor.parentId && cursor.parentId !== cursor.id && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    depth += 1;
    cursor = tree.nodes[cursor.parentId];
  }
  return depth;
}
function getNodePath(tree, nodeId) {
  const path = [];
  const visited = new Set;
  let cursor = tree.nodes[nodeId];
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    path.push(cursor);
    if (!cursor.parentId)
      break;
    cursor = tree.nodes[cursor.parentId];
  }
  return path.reverse();
}
function getEntryCategoryPath(tree, entryId) {
  for (const node of Object.values(tree.nodes)) {
    if (!node.entryIds.includes(entryId))
      continue;
    return getNodePath(tree, node.id).filter((item) => item.id !== tree.rootId);
  }
  return [];
}
function deleteCategoryNode(tree, nodeId, target) {
  if (nodeId === tree.rootId)
    return;
  const node = tree.nodes[nodeId];
  if (!node)
    return;
  for (const childId of [...node.childIds]) {
    deleteCategoryNode(tree, childId, target);
  }
  for (const entryId of [...node.entryIds]) {
    assignEntryToTarget(tree, entryId, target);
  }
  if (node.parentId && tree.nodes[node.parentId]) {
    tree.nodes[node.parentId].childIds = tree.nodes[node.parentId].childIds.filter((childId) => childId !== nodeId);
  }
  delete tree.nodes[nodeId];
}
function moveCategoryNode(tree, nodeId, parentId) {
  if (nodeId === tree.rootId)
    return;
  const node = tree.nodes[nodeId];
  if (!node)
    return;
  const nextParentId = parentId && tree.nodes[parentId] ? parentId : tree.rootId;
  if (node.parentId && tree.nodes[node.parentId]) {
    tree.nodes[node.parentId].childIds = tree.nodes[node.parentId].childIds.filter((childId) => childId !== nodeId);
  }
  node.parentId = nextParentId;
  const nextParent = tree.nodes[nextParentId];
  if (!nextParent.childIds.includes(nodeId))
    nextParent.childIds.push(nodeId);
}
function titleCase(value) {
  return value.split(/[\s_-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function splitHierarchy(value) {
  return value.split(/(?:>|\/|::|\u2192|\|)/).map((segment) => segment.trim()).filter(Boolean);
}
function createAutoDetectRegex(pattern) {
  const source = pattern.trim();
  if (!source)
    return null;
  try {
    if (source.startsWith("/") && source.lastIndexOf("/") > 0) {
      const lastSlash = source.lastIndexOf("/");
      return new RegExp(source.slice(1, lastSlash), source.slice(lastSlash + 1) || "i");
    }
    const escaped = source.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i");
  } catch {
    return null;
  }
}

// src/backend/runtime.ts
var GLOBAL_SETTINGS_PATH = "global/settings.json";
var CHARACTER_CONFIG_DIR = "characters";
var BOOK_CONFIG_DIR = "books";
var TREE_DIR = "trees";
var CACHE_DIR = "cache";
var PAGE_LIMIT = 200;
var CACHE_VERSION = 2;
var lastFrontendUserId = null;
var chatUserIds = new Map;
function setLastFrontendUserId(userId) {
  lastFrontendUserId = userId;
}
function send(message, userId = lastFrontendUserId ?? undefined) {
  spindle.sendToFrontend(message, userId);
}
function rememberChatUser(chatId, userId) {
  if (!chatId || !userId)
    return;
  chatUserIds.set(chatId, userId);
}
function resolveUserId(chatId) {
  if (chatId) {
    const mapped = chatUserIds.get(chatId);
    if (mapped)
      return mapped;
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
function getBookConfigPath(bookId) {
  return `${BOOK_CONFIG_DIR}/${bookId}.json`;
}
function getTreePath(bookId) {
  return `${TREE_DIR}/${bookId}.json`;
}
function getBookCachePath(bookId) {
  return `${CACHE_DIR}/${bookId}.json`;
}
async function ensureStorageFolders(userId) {
  await Promise.all([
    spindle.userStorage.mkdir("global", userId).catch(() => {}),
    spindle.userStorage.mkdir(CHARACTER_CONFIG_DIR, userId).catch(() => {}),
    spindle.userStorage.mkdir(BOOK_CONFIG_DIR, userId).catch(() => {}),
    spindle.userStorage.mkdir(TREE_DIR, userId).catch(() => {}),
    spindle.userStorage.mkdir(CACHE_DIR, userId).catch(() => {})
  ]);
}

// src/backend/storage.ts
async function loadGlobalSettings(userId) {
  const stored = await spindle.userStorage.getJson(GLOBAL_SETTINGS_PATH, {
    fallback: DEFAULT_GLOBAL_SETTINGS,
    userId
  });
  return normalizeGlobalSettings(stored);
}
async function saveGlobalSettings(patch, userId) {
  const current = await loadGlobalSettings(userId);
  const next = normalizeGlobalSettings({ ...current, ...patch });
  await spindle.userStorage.setJson(GLOBAL_SETTINGS_PATH, next, { indent: 2, userId });
  return next;
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
async function loadBookConfig(bookId, userId) {
  const stored = await spindle.userStorage.getJson(getBookConfigPath(bookId), {
    fallback: DEFAULT_BOOK_CONFIG,
    userId
  });
  return normalizeBookConfig(stored);
}
async function saveBookConfig(bookId, patch, userId) {
  const current = await loadBookConfig(bookId, userId);
  const next = normalizeBookConfig({ ...current, ...patch });
  await spindle.userStorage.setJson(getBookConfigPath(bookId), next, { indent: 2, userId });
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
function toBookSummary(book) {
  return {
    id: book.id,
    name: book.name,
    description: book.description,
    updatedAt: book.updated_at
  };
}
function buildConnectionOption(connection) {
  return {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    model: connection.model,
    isDefault: connection.is_default,
    hasApiKey: connection.has_api_key
  };
}
function toIndexedEntry(book, entry) {
  const rawExtension = (entry.extensions || {})[EXTENSION_KEY];
  const meta = normalizeEntryRecallMeta(rawExtension, {
    entryId: entry.id,
    comment: entry.comment,
    key: entry.key
  });
  const legacy = readLegacyEntryTreeMeta(rawExtension, {
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
    keysecondary: Array.isArray(entry.keysecondary) ? entry.keysecondary : [],
    disabled: !!entry.disabled,
    updatedAt: entry.updated_at,
    groupName: entry.group_name || "",
    constant: !!entry.constant,
    selective: !!entry.selective,
    vectorized: !!entry.vectorized,
    previewText: truncateText(entry.content || "", 220),
    content: entry.content || "",
    legacyTree: legacy ? {
      nodeId: legacy.nodeId,
      parentNodeId: legacy.parentNodeId,
      childrenOrder: legacy.childrenOrder
    } : null,
    ...meta
  };
}
async function loadBookCache(bookId, userId) {
  const book = await spindle.world_books.get(bookId, userId);
  if (!book)
    return null;
  const cached = await spindle.userStorage.getJson(getBookCachePath(bookId), {
    fallback: null,
    userId
  });
  if (cached && cached.version === CACHE_VERSION && cached.bookId === book.id && cached.bookUpdatedAt === book.updated_at) {
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
  await spindle.userStorage.setJson(getBookCachePath(bookId), rebuilt, { indent: 2, userId });
  return rebuilt;
}
function inspectTreeIssues(rawTree, validEntryIds) {
  const value = rawTree && typeof rawTree === "object" ? rawTree : {};
  const nodes = value.nodes && typeof value.nodes === "object" ? value.nodes : {};
  const nodeIds = new Set(Object.keys(nodes));
  let staleEntryRefs = 0;
  let staleNodeRefs = 0;
  for (const nodeValue of Object.values(nodes)) {
    const node = nodeValue && typeof nodeValue === "object" ? nodeValue : {};
    if (Array.isArray(node.entryIds)) {
      staleEntryRefs += node.entryIds.filter((entryId) => typeof entryId === "string" && !validEntryIds.has(entryId)).length;
    }
    if (Array.isArray(node.childIds)) {
      staleNodeRefs += node.childIds.filter((childId) => typeof childId === "string" && !nodeIds.has(childId)).length;
    }
  }
  return { staleEntryRefs, staleNodeRefs };
}
function migrateLegacyTree(bookId, entries) {
  const legacyEntries = entries.filter((entry) => entry.legacyTree);
  if (!legacyEntries.length)
    return null;
  const tree = createEmptyTreeIndex(bookId);
  const byLegacyId = new Map;
  for (const entry of legacyEntries) {
    if (entry.legacyTree?.nodeId)
      byLegacyId.set(entry.legacyTree.nodeId, entry);
  }
  for (const entry of entries) {
    const path = [];
    const visited = new Set;
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
async function loadTreeIndex(bookId, entries, userId) {
  const path = getTreePath(bookId);
  const rawTree = await spindle.userStorage.getJson(path, { fallback: null, userId });
  const validEntryIds = new Set(entries.map((entry) => entry.entryId));
  const issues = inspectTreeIssues(rawTree, validEntryIds);
  let tree = ensureTreeIndexShape(rawTree, bookId, Array.from(validEntryIds));
  if (!treeHasContent(tree)) {
    const migrated = migrateLegacyTree(bookId, entries);
    if (migrated) {
      tree = ensureTreeIndexShape(migrated, bookId, Array.from(validEntryIds));
    } else {
      tree = createEmptyTreeIndex(bookId);
      tree.unassignedEntryIds = entries.map((entry) => entry.entryId);
    }
    await spindle.userStorage.setJson(path, tree, { indent: 2, userId });
  } else if (rawTree?.version !== TREE_VERSION || issues.staleEntryRefs || issues.staleNodeRefs) {
    await spindle.userStorage.setJson(path, tree, { indent: 2, userId });
  }
  return { tree, ...issues };
}
async function saveTreeIndex(bookId, tree, entryIds, userId) {
  await spindle.userStorage.setJson(getTreePath(bookId), ensureTreeIndexShape(tree, bookId, entryIds), {
    indent: 2,
    userId
  });
}
function countAssignedRootEntries(tree) {
  return tree.nodes[tree.rootId]?.entryIds.length ?? 0;
}
function buildBookStatus(bookId, config, tree, entries, attachedToCharacter, selectedForCharacter) {
  const warnings = [];
  if (attachedToCharacter)
    warnings.push("Still attached natively");
  if (!config.enabled)
    warnings.push("Disabled for Lore Recall");
  if (config.permission === "write_only")
    warnings.push("Excluded from retrieval");
  if (!treeHasContent(tree))
    warnings.push("Missing tree");
  return {
    bookId,
    attachedToCharacter,
    selectedForCharacter,
    entryCount: entries.length,
    categoryCount: Math.max(0, Object.keys(tree.nodes).length - 1),
    rootEntryCount: countAssignedRootEntries(tree),
    unassignedCount: tree.unassignedEntryIds.length,
    treeMissing: !treeHasContent(tree),
    warnings
  };
}
async function getRuntimeBooks(selectedBookIds, attachedBookIds, userId) {
  const runtimeBooks = [];
  const staleIssues = {};
  for (const bookId of selectedBookIds) {
    const cache = await loadBookCache(bookId, userId);
    if (!cache)
      continue;
    const config = await loadBookConfig(bookId, userId);
    const loadedTree = await loadTreeIndex(bookId, cache.entries, userId);
    staleIssues[bookId] = { staleEntryRefs: loadedTree.staleEntryRefs, staleNodeRefs: loadedTree.staleNodeRefs };
    runtimeBooks.push({
      summary: {
        id: cache.bookId,
        name: cache.name,
        description: cache.description,
        updatedAt: cache.bookUpdatedAt
      },
      cache,
      config,
      tree: loadedTree.tree,
      status: buildBookStatus(bookId, config, loadedTree.tree, cache.entries, attachedBookIds.includes(bookId), true)
    });
  }
  return { runtimeBooks, staleIssues };
}
function computeSuggestedBookIds(allBooks, selectedBookIds, settings) {
  const matcher = createAutoDetectRegex(settings.autoDetectPattern);
  if (!matcher)
    return [];
  return allBooks.filter((book) => !selectedBookIds.includes(book.id)).filter((book) => matcher.test(book.name)).map((book) => book.id);
}
function normalizeEntryMetaForWrite(raw, seed) {
  const normalized = normalizeEntryRecallMeta(raw, seed);
  const fallback = defaultEntryRecallMeta(seed);
  return {
    label: normalized.label || fallback.label,
    aliases: uniqueStrings(normalized.aliases),
    summary: normalized.summary.trim(),
    collapsedText: normalized.collapsedText.trim(),
    tags: uniqueStrings(normalized.tags)
  };
}
function isReadableBook(config) {
  return config.enabled && config.permission !== "write_only";
}
function canEditBook(config) {
  return config.permission !== "read_only";
}

// src/backend/retrieval.ts
function stripCodeFences(content) {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function parseJsonObject(content) {
  const trimmed = stripCodeFences(content);
  if (!trimmed)
    return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match)
      return null;
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed;
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
function stripSearchMarkup(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeSearchText(value) {
  return stripSearchMarkup(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokenize(value) {
  return Array.from(new Set(normalizeSearchText(value).split(" ").filter((token) => token.length >= 2)));
}
function buildQueryText(messages, contextMessages) {
  return messages.filter((message) => message.role !== "system" && message.content.trim()).slice(-contextMessages).map((message) => `${message.role}: ${stripSearchMarkup(message.content)}`).join(`
`);
}
function getEntryBody(entry) {
  return entry.collapsedText.trim() || entry.content.trim();
}
function getEntryBreadcrumb(entry, tree) {
  const path = getEntryCategoryPath(tree, entry.entryId).map((node) => node.label).filter((label) => label && label !== "Root");
  return [...path, entry.label].join(" > ");
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
function scoreEntry(entry, tree, queryText, queryTokens) {
  const reasons = [];
  let score = 0;
  const breadcrumb = normalizeSearchText(getEntryBreadcrumb(entry, tree));
  const labelText = normalizeSearchText(entry.label);
  const aliasText = normalizeSearchText(entry.aliases.join(" "));
  const keyText = normalizeSearchText([...entry.key, ...entry.keysecondary].join(" "));
  const summaryText = normalizeSearchText(entry.summary);
  const tagText = normalizeSearchText(entry.tags.join(" "));
  const commentText = normalizeSearchText(entry.comment);
  const bodyText = normalizeSearchText(truncateText(getEntryBody(entry), 500));
  const groupText = normalizeSearchText(entry.groupName);
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
  const breadcrumbMatches = countTokenMatches(queryTokens, tokenize(breadcrumb));
  const commentMatches = countTokenMatches(queryTokens, tokenize(commentText));
  const groupMatches = countTokenMatches(queryTokens, tokenize(groupText));
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
  if (breadcrumbMatches > 0)
    reasons.push("branch");
  if (commentMatches > 0)
    reasons.push("comment");
  if (groupMatches > 0)
    reasons.push("group");
  score += labelMatches * 4;
  score += aliasMatches * 3;
  score += keyMatches * 3;
  score += tagMatches * 2;
  score += summaryMatches * 2;
  score += bodyMatches;
  score += breadcrumbMatches * 2;
  score += commentMatches * 2;
  score += groupMatches;
  if (entry.constant)
    score += 0.2;
  if (entry.selective)
    score += 0.1;
  return { entry, score, reasons: Array.from(new Set(reasons)) };
}
function scoreEntries(queryText, books) {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  if (!normalized || !queryTokens.length)
    return [];
  return books.flatMap((book) => book.cache.entries.filter((entry) => !entry.disabled).map((entry) => scoreEntry(entry, book.tree, normalized, queryTokens))).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}
async function runControllerJson(prompt, settings) {
  try {
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages: [{ role: "user", content: prompt }],
      parameters: {
        temperature: settings.controllerTemperature,
        max_tokens: settings.controllerMaxTokens
      },
      ...settings.controllerConnectionId ? { connection_id: settings.controllerConnectionId } : {}
    });
    return parseJsonObject(getGenerationContent(result));
  } catch (error) {
    spindle.log.warn(`Lore Recall controller call failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
async function maybeChooseBooks(queryText, books, config, settings) {
  if (config.multiBookMode !== "per_book" || books.length <= 1)
    return books;
  const prompt = [
    "Choose the most relevant lore books for the query.",
    'Return ONLY JSON in this exact shape: {"bookIds":["book-id-1","book-id-2"]}.',
    `Choose up to ${Math.min(3, books.length)} books.`,
    "",
    `Query: ${queryText}`,
    "",
    "Books:",
    ...books.map((book) => `- id=${book.summary.id}; name=${book.summary.name}; description=${truncateText(book.config.description || book.summary.description, 140)}; categories=${Math.max(0, Object.keys(book.tree.nodes).length - 1)}; entries=${book.cache.entries.length}`)
  ].join(`
`);
  const parsed = await runControllerJson(prompt, settings);
  const ids = Array.isArray(parsed?.bookIds) ? parsed.bookIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  if (!ids.length)
    return books;
  const chosen = books.filter((book) => ids.includes(book.summary.id));
  return chosen.length ? chosen : books;
}
async function maybeRerankEntries(queryText, scored, settings) {
  if (scored.length <= 1)
    return scored;
  const prompt = [
    "You rank lore nodes for retrieval relevance.",
    'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
    "Use only entryIds from the candidate list.",
    "",
    `Query: ${queryText}`,
    "",
    "Candidates:",
    ...scored.map((item) => `- entryId=${item.entry.entryId}; label=${item.entry.label}; book=${item.entry.worldBookName}; summary=${truncateText(item.entry.summary, 120)}; preview=${truncateText(getEntryBody(item.entry), 160)}`)
  ].join(`
`);
  const parsed = await runControllerJson(prompt, settings);
  const ids = Array.isArray(parsed?.entryIds) ? parsed.entryIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  if (!ids.length)
    return scored;
  const byId = new Map(scored.map((item) => [item.entry.entryId, item]));
  const ordered = [];
  const seen = new Set;
  for (const id of ids) {
    const match = byId.get(id);
    if (!match || seen.has(id))
      continue;
    seen.add(id);
    ordered.push(match);
  }
  for (const item of scored) {
    if (seen.has(item.entry.entryId))
      continue;
    ordered.push(item);
  }
  return ordered;
}
async function maybeSelectEntries(queryText, candidates, config, settings) {
  if (!config.selectiveRetrieval || !candidates.length)
    return candidates.slice(0, config.maxResults);
  const prompt = [
    "Select the exact lore entries that should be injected.",
    'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
    `Choose up to ${config.maxResults} entryIds.`,
    "",
    `Query: ${queryText}`,
    "",
    "Entry manifest:",
    ...candidates.slice(0, Math.max(config.maxResults * 3, 12)).map((item) => `- entryId=${item.entry.entryId}; label=${item.entry.label}; book=${item.entry.worldBookName}; summary=${truncateText(item.entry.summary, 140)}; preview=${truncateText(getEntryBody(item.entry), 180)}`)
  ].join(`
`);
  const parsed = await runControllerJson(prompt, settings);
  const ids = Array.isArray(parsed?.entryIds) ? parsed.entryIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  if (!ids.length)
    return candidates.slice(0, config.maxResults);
  const byId = new Map(candidates.map((item) => [item.entry.entryId, item]));
  const chosen = [];
  const seen = new Set;
  for (const id of ids) {
    const match = byId.get(id);
    if (!match || seen.has(id))
      continue;
    seen.add(id);
    chosen.push(match);
    if (chosen.length >= config.maxResults)
      break;
  }
  if (!chosen.length)
    return candidates.slice(0, config.maxResults);
  for (const item of candidates) {
    if (chosen.length >= config.maxResults)
      break;
    if (seen.has(item.entry.entryId))
      continue;
    chosen.push(item);
  }
  return chosen;
}
function getDescendantCategoryIds(tree, nodeId, depthLimit) {
  const result = [];
  const queue = [{ nodeId, depth: 0 }];
  const seen = new Set;
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current.nodeId))
      continue;
    seen.add(current.nodeId);
    result.push(current.nodeId);
    if (current.depth >= depthLimit)
      continue;
    const node = tree.nodes[current.nodeId];
    if (!node)
      continue;
    for (const childId of node.childIds) {
      queue.push({ nodeId: childId, depth: current.depth + 1 });
    }
  }
  return result;
}
async function selectTraversalEntries(queryText, books, config, settings) {
  const deterministic = scoreEntries(queryText, books).slice(0, Math.max(config.maxResults * 4, 16));
  if (!deterministic.length) {
    return {
      selected: [],
      fallbackReason: "Traversal found no scored entries, so nothing was injected.",
      steps: ["No traversal candidates scored above zero."]
    };
  }
  const categoryRows = [];
  for (const book of books) {
    for (const node of Object.values(book.tree.nodes)) {
      if (node.id === book.tree.rootId)
        continue;
      const depth = getNodeDepth(book.tree, node.id);
      if (depth > Math.min(config.maxTraversalDepth, config.traversalStepLimit))
        continue;
      categoryRows.push({
        id: `${book.summary.id}:${node.id}`,
        label: `${book.summary.name} :: ${node.label}`,
        summary: truncateText(node.summary, 140),
        depth,
        entryCount: node.entryIds.length
      });
    }
  }
  const prompt = [
    "Choose relevant traversal branches and direct entry IDs.",
    'Return ONLY JSON in this exact shape: {"categoryIds":["book:node"],"entryIds":["entry-id"]}.',
    `You may choose up to ${config.maxTraversalDepth} categoryIds and ${config.maxResults} entryIds.`,
    "",
    `Query: ${queryText}`,
    "",
    "Categories:",
    ...categoryRows.slice(0, 80).map((row) => `- categoryId=${row.id}; label=${row.label}; depth=${row.depth}; entries=${row.entryCount}; summary=${row.summary}`),
    "",
    "Fallback entries:",
    ...deterministic.slice(0, 24).map((item) => `- entryId=${item.entry.entryId}; label=${item.entry.label}; book=${item.entry.worldBookName}; summary=${truncateText(item.entry.summary, 120)}`)
  ].join(`
`);
  const parsed = await runControllerJson(prompt, settings);
  const categoryIds = Array.isArray(parsed?.categoryIds) ? parsed.categoryIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  const entryIds = Array.isArray(parsed?.entryIds) ? parsed.entryIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  const deterministicById = new Map(deterministic.map((item) => [item.entry.entryId, item]));
  const selectedMap = new Map;
  const steps = [
    `${books.length} book(s) considered for traversal.`,
    `${categoryRows.length} category branch(es) exposed to the controller.`
  ];
  for (const categoryId of categoryIds) {
    const [bookId, nodeId] = categoryId.split(":");
    const book = books.find((item) => item.summary.id === bookId);
    if (!book || !book.tree.nodes[nodeId])
      continue;
    const nodeIds = getDescendantCategoryIds(book.tree, nodeId, Math.min(config.maxTraversalDepth, config.traversalStepLimit));
    const entryIdsFromCategories = uniqueStrings(nodeIds.flatMap((id) => book.tree.nodes[id]?.entryIds ?? []));
    for (const entryId of entryIdsFromCategories) {
      const match = deterministicById.get(entryId);
      if (match)
        selectedMap.set(entryId, match);
    }
  }
  for (const entryId of entryIds) {
    const match = deterministicById.get(entryId);
    if (match)
      selectedMap.set(entryId, match);
  }
  const selected = Array.from(selectedMap.values()).sort((left, right) => right.score - left.score);
  if (!selected.length) {
    return {
      selected: deterministic.slice(0, config.maxResults),
      fallbackReason: "Traversal controller returned no usable branches, so collapsed retrieval was used instead.",
      steps: [...steps, "Collapsed fallback used because no traversal branch resolved to entries."]
    };
  }
  const finalSelected = config.selectiveRetrieval ? await maybeSelectEntries(queryText, selected, config, settings) : selected.slice(0, config.maxResults);
  return {
    selected: finalSelected,
    fallbackReason: null,
    steps: [...steps, `Traversal selected ${finalSelected.length} entry candidate(s).`]
  };
}
function buildPreviewNodes(selected, booksById) {
  return selected.map((item) => {
    const book = booksById.get(item.entry.worldBookId);
    return {
      entryId: item.entry.entryId,
      label: item.entry.label,
      worldBookId: item.entry.worldBookId,
      worldBookName: item.entry.worldBookName,
      breadcrumb: book ? getEntryBreadcrumb(item.entry, book.tree) : item.entry.label,
      score: Number(item.score.toFixed(2)),
      reasons: item.reasons,
      previewText: truncateText(getEntryBody(item.entry), 240)
    };
  });
}
function buildInjectionText(selected, booksById, tokenBudget, collapsedDepth) {
  if (!selected.length)
    return null;
  const maxChars = clampInt(tokenBudget, 200, 8000) * 4;
  const parts = [
    "[Lore Recall Retrieved Context]",
    "Use this retrieved reference only if it is relevant to the current reply. Do not mention Lore Recall or describe this block explicitly."
  ];
  const included = [];
  for (const item of selected) {
    const book = booksById.get(item.entry.worldBookId);
    const path = book ? getEntryCategoryPath(book.tree, item.entry.entryId).slice(-collapsedDepth) : [];
    const pathLabels = path.map((node) => node.label);
    const branchSummary = path.map((node) => node.summary.trim()).filter(Boolean).join(" | ");
    const section = [
      "",
      `${included.length + 1}. ${[...pathLabels, item.entry.label].join(" > ")}`,
      `Book: ${item.entry.worldBookName}`,
      item.entry.aliases.length ? `Aliases: ${item.entry.aliases.join(", ")}` : "",
      branchSummary ? `Branch summary: ${branchSummary}` : "",
      getEntryBody(item.entry)
    ].filter(Boolean).join(`
`);
    const nextText = [...parts, section].join(`
`);
    if (nextText.length <= maxChars) {
      parts.push(section);
      included.push(item);
      continue;
    }
    if (!included.length) {
      const remaining = Math.max(180, maxChars - parts.join(`
`).length - 20);
      parts.push([
        "",
        `1. ${[...pathLabels, item.entry.label].join(" > ")}`,
        `Book: ${item.entry.worldBookName}`,
        truncateText(getEntryBody(item.entry), remaining)
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
async function buildRetrievalPreview(messages, settings, config, books) {
  const queryText = buildQueryText(messages, config.contextMessages);
  if (!queryText.trim())
    return null;
  const readableBooks = books.filter((book) => isReadableBook(book.config));
  if (!readableBooks.length)
    return null;
  const chosenBooks = await maybeChooseBooks(queryText, readableBooks, config, settings);
  const steps = [
    `${books.length} managed book(s) loaded.`,
    `${chosenBooks.length} readable book(s) selected for search.`
  ];
  let selected = [];
  let fallbackReason = null;
  if (config.searchMode === "traversal") {
    const traversal = await selectTraversalEntries(queryText, chosenBooks, config, settings);
    selected = traversal.selected;
    fallbackReason = traversal.fallbackReason;
    steps.push(...traversal.steps);
  } else {
    let collapsed = scoreEntries(queryText, chosenBooks);
    if (config.rerankEnabled) {
      collapsed = await maybeRerankEntries(queryText, collapsed, settings);
      steps.push("Collapsed retrieval reranked top candidates.");
    }
    selected = config.selectiveRetrieval ? await maybeSelectEntries(queryText, collapsed, config, settings) : collapsed.slice(0, config.maxResults);
    steps.push(`Collapsed retrieval selected ${selected.length} candidate(s).`);
  }
  if (!selected.length)
    return null;
  const booksById = new Map(chosenBooks.map((book) => [book.summary.id, book]));
  const injection = buildInjectionText(selected, booksById, config.tokenBudget, config.collapsedDepth);
  if (!injection)
    return null;
  return {
    mode: config.searchMode,
    queryText,
    estimatedTokens: injection.estimatedTokens,
    injectedText: injection.text,
    selectedNodes: buildPreviewNodes(injection.included, booksById),
    fallbackReason,
    selectedBookIds: chosenBooks.map((book) => book.summary.id),
    steps
  };
}

// src/backend/operations.ts
async function runControllerJson2(prompt, settings) {
  try {
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages: [{ role: "user", content: prompt }],
      parameters: {
        temperature: settings.controllerTemperature,
        max_tokens: settings.controllerMaxTokens
      },
      ...settings.controllerConnectionId ? { connection_id: settings.controllerConnectionId } : {}
    });
    const content = (result && typeof result === "object" && typeof result.content === "string" ? result.content : "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (!content)
      return null;
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed;
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match)
        return null;
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          return parsed;
      } catch {
        return null;
      }
    }
    return null;
  } catch (error) {
    spindle.log.warn(`Lore Recall controller call failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
async function updateEntryMeta(entryId, meta, userId) {
  const entry = await spindle.world_books.entries.get(entryId, userId);
  if (!entry)
    throw new Error("That world book entry no longer exists.");
  const nextMeta = normalizeEntryMetaForWrite(meta, { entryId: entry.id, comment: entry.comment, key: entry.key });
  await spindle.world_books.entries.update(entry.id, {
    extensions: {
      ...entry.extensions || {},
      [EXTENSION_KEY]: {
        ...(entry.extensions || {})[EXTENSION_KEY],
        ...nextMeta
      }
    }
  }, userId);
  await invalidateBookCache(entry.world_book_id, userId);
}
function getMetadataCategoryPath(entry) {
  if (entry.groupName.trim())
    return splitHierarchy(entry.groupName);
  if (entry.constant)
    return ["Always On"];
  if (entry.selective)
    return ["Selective"];
  const commentMatch = entry.comment.match(/^([^:\/|]{3,32})[:\/|]/);
  if (commentMatch?.[1])
    return [titleCase(commentMatch[1].trim())];
  const firstKey = [...entry.key, ...entry.keysecondary].find((value) => value.trim());
  if (firstKey)
    return ["Keywords", titleCase(firstKey.split(/\s+/).slice(0, 2).join(" "))];
  return [];
}
async function buildTreeFromMetadata(bookIds, userId) {
  for (const bookId of uniqueStrings(bookIds)) {
    const config = await loadBookConfig(bookId, userId);
    if (!canEditBook(config))
      continue;
    const cache = await loadBookCache(bookId, userId);
    if (!cache)
      continue;
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
function chunkEntries(items, chunkTokens) {
  const maxChars = Math.max(2000, chunkTokens * 4);
  const chunks = [];
  let current = [];
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
  if (current.length)
    chunks.push(current);
  return chunks;
}
async function buildTreeWithLlm(bookIds, userId) {
  const settings = await loadGlobalSettings(userId);
  for (const bookId of uniqueStrings(bookIds)) {
    const config = await loadBookConfig(bookId, userId);
    if (!canEditBook(config))
      continue;
    const cache = await loadBookCache(bookId, userId);
    if (!cache?.entries.length)
      continue;
    const tree = createEmptyTreeIndex(bookId);
    const updates = [];
    for (const chunk of chunkEntries(cache.entries, settings.chunkTokens)) {
      const prompt = [
        "Organize these lore entries into a compact retrieval tree.",
        'Return ONLY JSON in this exact shape: {"assignments":[{"entryId":"...","path":["Category","Subcategory"],"summary":"...","collapsedText":"..."}]}',
        `Build detail: ${settings.buildDetail}.`,
        `Tree granularity: ${settings.treeGranularity}.`,
        "Use empty path [] when an entry should stay unassigned.",
        "",
        "Entries:",
        ...chunk.map((entry) => JSON.stringify({
          entryId: entry.entryId,
          comment: entry.comment,
          keys: [...entry.key, ...entry.keysecondary],
          groupName: entry.groupName,
          constant: entry.constant,
          selective: entry.selective,
          preview: truncateText(entry.content, 420)
        }))
      ].join(`
`);
      const parsed = await runControllerJson2(prompt, settings);
      const assignments = Array.isArray(parsed?.assignments) ? parsed.assignments.filter((value) => !!value && typeof value === "object") : [];
      for (const assignment of assignments) {
        const entryId = typeof assignment.entryId === "string" ? assignment.entryId : "";
        if (!entryId)
          continue;
        const path = Array.isArray(assignment.path) ? assignment.path.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
        if (path.length) {
          const categoryId = ensureCategoryPath(tree, path, "llm");
          assignEntryToTarget(tree, entryId, { categoryId });
        } else {
          assignEntryToTarget(tree, entryId, "unassigned");
        }
        updates.push({
          entryId,
          summary: typeof assignment.summary === "string" ? assignment.summary.trim() : undefined,
          collapsedText: typeof assignment.collapsedText === "string" ? assignment.collapsedText.trim() : undefined
        });
      }
    }
    for (const entry of cache.entries) {
      const assigned = tree.unassignedEntryIds.includes(entry.entryId) || Object.values(tree.nodes).some((node) => node.entryIds.includes(entry.entryId));
      if (!assigned)
        assignEntryToTarget(tree, entry.entryId, "unassigned");
    }
    tree.lastBuiltAt = Date.now();
    tree.buildSource = "llm";
    await saveTreeIndex(bookId, tree, cache.entries.map((entry) => entry.entryId), userId);
    for (const update of updates) {
      const entry = await spindle.world_books.entries.get(update.entryId, userId);
      if (!entry)
        continue;
      const current = normalizeEntryRecallMeta((entry.extensions || {})[EXTENSION_KEY], {
        entryId: entry.id,
        comment: entry.comment,
        key: entry.key
      });
      await spindle.world_books.entries.update(entry.id, {
        extensions: {
          ...entry.extensions || {},
          [EXTENSION_KEY]: {
            ...(entry.extensions || {})[EXTENSION_KEY],
            ...current,
            summary: update.summary || current.summary,
            collapsedText: update.collapsedText || current.collapsedText
          }
        }
      }, userId);
    }
    await invalidateBookCache(bookId, userId);
  }
}
async function updateCategory(bookId, nodeId, patch, userId) {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config))
    throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache)
    throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  const node = loaded.tree.nodes[nodeId];
  if (!node || node.id === loaded.tree.rootId)
    throw new Error("That category no longer exists.");
  if (typeof patch.label === "string" && patch.label.trim())
    node.label = patch.label.trim();
  if (typeof patch.summary === "string")
    node.summary = patch.summary.trim();
  if (typeof patch.collapsed === "boolean")
    node.collapsed = patch.collapsed;
  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = loaded.tree.buildSource ?? "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}
async function createCategory(bookId, parentId, label, userId) {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config))
    throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache)
    throw new Error("That world book no longer exists.");
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
    createdBy: "manual"
  };
  loaded.tree.nodes[nextParentId].childIds.push(nodeId);
  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}
function wouldCreateCycle(tree, nodeId, parentId) {
  if (!parentId || parentId === ROOT_NODE_ID)
    return false;
  if (parentId === nodeId)
    return true;
  const visited = new Set;
  let cursor = tree.nodes[parentId];
  while (cursor && !visited.has(cursor.id)) {
    if (cursor.id === nodeId)
      return true;
    visited.add(cursor.id);
    cursor = cursor.parentId ? tree.nodes[cursor.parentId] : undefined;
  }
  return false;
}
async function moveCategory(bookId, nodeId, parentId, userId) {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config))
    throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache)
    throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  if (!loaded.tree.nodes[nodeId] || nodeId === loaded.tree.rootId)
    throw new Error("That category no longer exists.");
  if (wouldCreateCycle(loaded.tree, nodeId, parentId))
    throw new Error("That move would create a category cycle.");
  moveCategoryNode(loaded.tree, nodeId, parentId);
  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}
async function deleteCategory(bookId, nodeId, target, userId) {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config))
    throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache)
    throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  if (!loaded.tree.nodes[nodeId] || nodeId === loaded.tree.rootId)
    throw new Error("That category no longer exists.");
  deleteCategoryNode(loaded.tree, nodeId, target);
  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}
async function assignEntries(bookId, entryIds, target, userId) {
  const config = await loadBookConfig(bookId, userId);
  if (!canEditBook(config))
    throw new Error("This book is read-only inside Lore Recall.");
  const cache = await loadBookCache(bookId, userId);
  if (!cache)
    throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  const validEntryIds = new Set(cache.entries.map((entry) => entry.entryId));
  for (const entryId of uniqueStrings(entryIds)) {
    if (!validEntryIds.has(entryId))
      continue;
    assignEntryToTarget(loaded.tree, entryId, target);
  }
  loaded.tree.lastBuiltAt = Date.now();
  loaded.tree.buildSource = "manual";
  await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
}
function getDescendantCategoryIds2(tree, nodeId, depthLimit) {
  const result = [];
  const queue = [{ nodeId, depth: 0 }];
  const seen = new Set;
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current.nodeId))
      continue;
    seen.add(current.nodeId);
    result.push(current.nodeId);
    if (current.depth >= depthLimit)
      continue;
    const node = tree.nodes[current.nodeId];
    if (!node)
      continue;
    for (const childId of node.childIds) {
      queue.push({ nodeId: childId, depth: current.depth + 1 });
    }
  }
  return result;
}
async function regenerateSummaries(bookId, entryIds, nodeIds, userId) {
  const settings = await loadGlobalSettings(userId);
  const cache = await loadBookCache(bookId, userId);
  if (!cache)
    throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  const targetEntries = ((entryIds?.length) ? cache.entries.filter((entry) => entryIds.includes(entry.entryId)) : cache.entries.filter((entry) => !entry.summary.trim() || !entry.collapsedText.trim())).slice(0, 24);
  if (targetEntries.length) {
    const prompt = [
      "Write short retrieval summaries for these lore entries.",
      'Return ONLY JSON in this exact shape: {"entries":[{"entryId":"...","summary":"...","collapsedText":"..."}]}',
      "",
      "Entries:",
      ...targetEntries.map((entry) => JSON.stringify({
        entryId: entry.entryId,
        label: entry.label,
        comment: entry.comment,
        keys: [...entry.key, ...entry.keysecondary],
        content: truncateText(entry.content, 500)
      }))
    ].join(`
`);
    const parsed = await runControllerJson2(prompt, settings);
    const updates = Array.isArray(parsed?.entries) ? parsed.entries.filter((value) => !!value && typeof value === "object") : [];
    for (const update of updates) {
      const entryId = typeof update.entryId === "string" ? update.entryId : "";
      if (!entryId)
        continue;
      const entry = await spindle.world_books.entries.get(entryId, userId);
      if (!entry)
        continue;
      const current = normalizeEntryRecallMeta((entry.extensions || {})[EXTENSION_KEY], {
        entryId: entry.id,
        comment: entry.comment,
        key: entry.key
      });
      await spindle.world_books.entries.update(entry.id, {
        extensions: {
          ...entry.extensions || {},
          [EXTENSION_KEY]: {
            ...(entry.extensions || {})[EXTENSION_KEY],
            ...current,
            summary: typeof update.summary === "string" ? update.summary.trim() : current.summary,
            collapsedText: typeof update.collapsedText === "string" ? update.collapsedText.trim() : current.collapsedText
          }
        }
      }, userId);
    }
    await invalidateBookCache(bookId, userId);
  }
  const targetNodeIds = uniqueStrings(nodeIds ?? []).filter((id) => loaded.tree.nodes[id] && id !== loaded.tree.rootId).slice(0, 16);
  for (const nodeId of targetNodeIds) {
    const node = loaded.tree.nodes[nodeId];
    const descendantIds = getDescendantCategoryIds2(loaded.tree, nodeId, 2);
    const sampleEntryIds = uniqueStrings(descendantIds.flatMap((id) => loaded.tree.nodes[id]?.entryIds ?? [])).slice(0, 8);
    const prompt = [
      "Write a short category summary for this lore branch.",
      'Return ONLY JSON in this exact shape: {"summary":"..."}',
      "",
      `Category: ${node.label}`,
      "Entries:",
      ...sampleEntryIds.map((entryId) => cache.entries.find((entry) => entry.entryId === entryId)).filter((entry) => !!entry).map((entry) => `- ${entry.label}: ${truncateText(entry.summary || entry.content, 180)}`)
    ].join(`
`);
    const parsed = await runControllerJson2(prompt, settings);
    if (typeof parsed?.summary === "string")
      node.summary = parsed.summary.trim();
  }
  if (targetNodeIds.length) {
    loaded.tree.lastBuiltAt = Date.now();
    loaded.tree.buildSource = "manual";
    await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
  }
}
function buildDiagnostics(runtimeBooks, staleIssues) {
  const diagnostics = [];
  for (const book of runtimeBooks) {
    const issues = staleIssues[book.summary.id];
    if (book.status.attachedToCharacter) {
      diagnostics.push({
        id: `attached:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Managed book is still attached natively",
        detail: `${book.summary.name} is attached to the character and may duplicate native world info activation.`
      });
    }
    if (book.status.treeMissing) {
      diagnostics.push({
        id: `tree:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Book is missing a usable tree",
        detail: `${book.summary.name} has no categories or assigned entries yet.`
      });
    }
    if (issues?.staleEntryRefs || issues?.staleNodeRefs) {
      diagnostics.push({
        id: `stale:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Tree had stale references",
        detail: `${book.summary.name} referenced ${issues.staleEntryRefs} stale entry id(s) and ${issues.staleNodeRefs} stale category link(s). Lore Recall sanitized the stored tree.`
      });
    }
    if (!book.config.enabled) {
      diagnostics.push({
        id: `disabled:${book.summary.id}`,
        severity: "info",
        bookId: book.summary.id,
        title: "Managed book is disabled",
        detail: `${book.summary.name} is still selected for the character, but Lore Recall has it disabled in book settings.`
      });
    }
    if (book.config.permission === "write_only") {
      diagnostics.push({
        id: `writeonly:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Managed book is write-only",
        detail: `${book.summary.name} will not be searched during retrieval while write-only mode is active.`
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
        detail: `${book.summary.name} has ${missingSummaryCount} entry summary gap(s) and ${missingCollapsedCount} collapsed-text gap(s).`
      });
    }
  }
  return diagnostics;
}
async function exportSnapshot(userId) {
  const [globalSettings, characterFiles, bookFiles, treeFiles, books] = await Promise.all([
    loadGlobalSettings(userId),
    spindle.userStorage.list(`${CHARACTER_CONFIG_DIR}/`, userId).catch(() => []),
    spindle.userStorage.list(`${BOOK_CONFIG_DIR}/`, userId).catch(() => []),
    spindle.userStorage.list(`${TREE_DIR}/`, userId).catch(() => []),
    listAllWorldBooks(userId)
  ]);
  const characterConfigs = {};
  for (const path of characterFiles.filter((file) => file.endsWith(".json"))) {
    const characterId = path.split("/").pop()?.replace(/\.json$/i, "") ?? "";
    if (!characterId)
      continue;
    characterConfigs[characterId] = await loadCharacterConfig(characterId, userId);
  }
  const bookConfigs = {};
  for (const path of bookFiles.filter((file) => file.endsWith(".json"))) {
    const bookId = path.split("/").pop()?.replace(/\.json$/i, "") ?? "";
    if (!bookId)
      continue;
    bookConfigs[bookId] = await loadBookConfig(bookId, userId);
  }
  const treeIndexes = {};
  for (const path of treeFiles.filter((file) => file.endsWith(".json"))) {
    const bookId = path.split("/").pop()?.replace(/\.json$/i, "") ?? "";
    if (!bookId)
      continue;
    const cache = await loadBookCache(bookId, userId);
    if (!cache)
      continue;
    treeIndexes[bookId] = (await loadTreeIndex(bookId, cache.entries, userId)).tree;
  }
  const entryMeta = {};
  for (const book of books) {
    const entries = await listAllEntries(book.id, userId);
    const perBook = {};
    for (const entry of entries) {
      const meta = normalizeEntryRecallMeta((entry.extensions || {})[EXTENSION_KEY], {
        entryId: entry.id,
        comment: entry.comment,
        key: entry.key
      });
      const fallback = defaultEntryRecallMeta({ entryId: entry.id, comment: entry.comment, key: entry.key });
      if (JSON.stringify(meta) !== JSON.stringify(fallback) || (entry.extensions || {})[EXTENSION_KEY]) {
        perBook[entry.id] = meta;
      }
    }
    if (Object.keys(perBook).length)
      entryMeta[book.id] = perBook;
  }
  return {
    version: 2,
    exportedAt: Date.now(),
    globalSettings,
    characterConfigs,
    bookConfigs,
    treeIndexes,
    entryMeta
  };
}
async function importSnapshot(snapshot, userId) {
  await saveGlobalSettings(snapshot.globalSettings, userId);
  for (const [characterId, config] of Object.entries(snapshot.characterConfigs ?? {})) {
    await spindle.userStorage.setJson(getCharacterConfigPath(characterId), config, { indent: 2, userId });
  }
  for (const [bookId, config] of Object.entries(snapshot.bookConfigs ?? {})) {
    await spindle.userStorage.setJson(getBookConfigPath(bookId), config, { indent: 2, userId });
  }
  for (const [bookId, tree] of Object.entries(snapshot.treeIndexes ?? {})) {
    const cache = await loadBookCache(bookId, userId);
    if (!cache)
      continue;
    await spindle.userStorage.setJson(getTreePath(bookId), ensureTreeIndexShape(tree, bookId, cache.entries.map((entry) => entry.entryId)), { indent: 2, userId });
  }
  for (const [bookId, perBook] of Object.entries(snapshot.entryMeta ?? {})) {
    for (const [entryId, meta] of Object.entries(perBook)) {
      const entry = await spindle.world_books.entries.get(entryId, userId);
      if (!entry || entry.world_book_id !== bookId)
        continue;
      await spindle.world_books.entries.update(entry.id, {
        extensions: {
          ...entry.extensions || {},
          [EXTENSION_KEY]: {
            ...(entry.extensions || {})[EXTENSION_KEY],
            ...normalizeEntryMetaForWrite(meta, {
              entryId: entry.id,
              comment: entry.comment,
              key: entry.key
            })
          }
        }
      }, userId);
    }
    await invalidateBookCache(bookId, userId);
  }
}
async function applySuggestedBooks(characterId, bookIds, mode, userId) {
  const current = await loadCharacterConfig(characterId, userId);
  const managedBookIds = mode === "replace" ? uniqueStrings(bookIds) : uniqueStrings([...current.managedBookIds, ...bookIds]);
  await saveCharacterConfig(characterId, { managedBookIds }, userId);
}

// src/backend/index.ts
async function resolveActiveChat(userId, chatId) {
  if (chatId)
    return spindle.chats.get(chatId, userId);
  return spindle.chats.getActive(userId);
}
async function buildState(userId, chatId) {
  const [allBooks, activeChat, settings, connections] = await Promise.all([
    listAllWorldBooks(userId),
    resolveActiveChat(userId, chatId),
    loadGlobalSettings(userId),
    spindle.connections.list(userId).catch(() => [])
  ]);
  const sortedBooks = allBooks.slice().sort((left, right) => left.name.localeCompare(right.name)).map(toBookSummary);
  const baseState = {
    activeChatId: activeChat?.id ?? null,
    activeCharacterId: activeChat?.character_id ?? null,
    activeCharacterName: null,
    globalSettings: settings,
    characterConfig: null,
    allWorldBooks: sortedBooks,
    managedEntries: {},
    bookConfigs: {},
    bookStatuses: {},
    treeIndexes: {},
    unassignedCounts: {},
    availableConnections: connections.map(buildConnectionOption).sort((left, right) => left.name.localeCompare(right.name)),
    diagnosticsResults: [],
    suggestedBookIds: [],
    preview: null
  };
  if (!activeChat?.character_id)
    return baseState;
  const character = await spindle.characters.get(activeChat.character_id, userId);
  if (!character)
    return baseState;
  const characterConfig = await loadCharacterConfig(character.id, userId);
  const validBookIds = new Set(allBooks.map((book) => book.id));
  const selectedBookIds = characterConfig.managedBookIds.filter((bookId) => validBookIds.has(bookId));
  const attachedWorldBookIds = character && Array.isArray(character.world_book_ids) ? character.world_book_ids.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  const { runtimeBooks, staleIssues } = await getRuntimeBooks(selectedBookIds, attachedWorldBookIds, userId);
  const managedEntries = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.cache.entries]));
  const bookConfigs = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.config]));
  const bookStatuses = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.status]));
  const treeIndexes = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree]));
  const unassignedCounts = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree.unassignedEntryIds.length]));
  const diagnosticsResults = buildDiagnostics(runtimeBooks, staleIssues);
  const suggestedBookIds = computeSuggestedBookIds(sortedBooks, selectedBookIds, settings);
  const preview = settings.enabled && characterConfig.enabled && runtimeBooks.length ? await buildRetrievalPreview((await spindle.chat.getMessages(activeChat.id)).map((message) => ({
    role: message.role,
    content: message.content
  })), settings, characterConfig, runtimeBooks) : null;
  return {
    ...baseState,
    activeCharacterId: character.id,
    activeCharacterName: character.name,
    characterConfig,
    managedEntries,
    bookConfigs,
    bookStatuses,
    treeIndexes,
    unassignedCounts,
    diagnosticsResults,
    suggestedBookIds,
    preview
  };
}
async function pushState(userId, chatId) {
  const state = await buildState(userId, chatId);
  rememberChatUser(state.activeChatId, userId);
  send({ type: "state", state }, userId);
}
spindle.registerInterceptor(async (messages, context) => {
  try {
    const chatId = context && typeof context === "object" && typeof context.chatId === "string" ? context.chatId : null;
    if (!chatId)
      return messages;
    const userId = resolveUserId(chatId);
    if (!userId) {
      spindle.log.warn(`Lore Recall skipped retrieval for chat ${chatId} because no user context was available yet.`);
      return messages;
    }
    await ensureStorageFolders(userId);
    const settings = await loadGlobalSettings(userId);
    if (!settings.enabled)
      return messages;
    const chat = await spindle.chats.get(chatId, userId);
    if (!chat?.character_id)
      return messages;
    const character = await spindle.characters.get(chat.character_id, userId);
    const config = await loadCharacterConfig(chat.character_id, userId);
    if (!config.enabled || !config.managedBookIds.length)
      return messages;
    const attachedWorldBookIds = character && Array.isArray(character.world_book_ids) ? character.world_book_ids.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
    const { runtimeBooks } = await getRuntimeBooks(config.managedBookIds, attachedWorldBookIds, userId);
    if (!runtimeBooks.length)
      return messages;
    const preview = await buildRetrievalPreview(messages, settings, config, runtimeBooks);
    if (!preview?.injectedText.trim())
      return messages;
    return [{ role: "system", content: preview.injectedText }, ...messages];
  } catch (error) {
    spindle.log.warn(`Lore Recall interceptor failed: ${error instanceof Error ? error.message : String(error)}`);
    return messages;
  }
}, 95);
spindle.onFrontendMessage(async (payload, userId) => {
  setLastFrontendUserId(userId);
  const message = payload;
  rememberChatUser(readChatIdFromMessage(message), userId);
  try {
    await ensureStorageFolders(userId);
    switch (message.type) {
      case "ready":
      case "refresh":
      case "run_diagnostics":
        await pushState(userId, message.chatId);
        break;
      case "save_global_settings":
        await saveGlobalSettings(message.patch, userId);
        await pushState(userId, message.chatId);
        break;
      case "save_character_config":
        await saveCharacterConfig(message.characterId, message.patch, userId);
        await pushState(userId, message.chatId);
        break;
      case "save_book_config":
        await saveBookConfig(message.bookId, message.patch, userId);
        await pushState(userId, message.chatId);
        break;
      case "save_entry_meta":
        await updateEntryMeta(message.entryId, message.meta, userId);
        await pushState(userId, message.chatId);
        break;
      case "save_category":
        await updateCategory(message.bookId, message.nodeId, message.patch, userId);
        await pushState(userId, message.chatId);
        break;
      case "create_category":
        await createCategory(message.bookId, message.parentId, message.label, userId);
        await pushState(userId, message.chatId);
        break;
      case "move_category":
        await moveCategory(message.bookId, message.nodeId, message.parentId, userId);
        await pushState(userId, message.chatId);
        break;
      case "delete_category":
        await deleteCategory(message.bookId, message.nodeId, message.target, userId);
        await pushState(userId, message.chatId);
        break;
      case "assign_entries":
        await assignEntries(message.bookId, message.entryIds, message.target, userId);
        await pushState(userId, message.chatId);
        break;
      case "build_tree_from_metadata":
        await buildTreeFromMetadata(message.bookIds, userId);
        await pushState(userId, message.chatId);
        break;
      case "build_tree_with_llm":
        await buildTreeWithLlm(message.bookIds, userId);
        await pushState(userId, message.chatId);
        break;
      case "regenerate_summaries":
        await regenerateSummaries(message.bookId, message.entryIds, message.nodeIds, userId);
        await pushState(userId, message.chatId);
        break;
      case "export_snapshot": {
        const snapshot = await exportSnapshot(userId);
        send({
          type: "export_snapshot_ready",
          filename: `lore-recall-${new Date(snapshot.exportedAt).toISOString().slice(0, 10)}.json`,
          snapshot
        }, userId);
        await pushState(userId, message.chatId);
        break;
      }
      case "import_snapshot":
        await importSnapshot(message.snapshot, userId);
        await pushState(userId, message.chatId);
        break;
      case "apply_suggested_books":
        await applySuggestedBooks(message.characterId, message.bookIds, message.mode, userId);
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
