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
  buildDetail: "lite",
  treeGranularity: 0,
  chunkTokens: 30000,
  dedupMode: "none",
  jevProvider: "typesafe",
  jevModel: "",
  jevTimeoutMs: 8000,
  jevThreshold: 0.6
};
var DEFAULT_CHARACTER_CONFIG = {
  enabled: false,
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
  contextMessages: 10
};
var DEFAULT_BOOK_CONFIG = {
  enabled: true,
  description: "",
  permission: "read_write"
};
var TREE_GRANULARITY_PRESETS = {
  1: {
    targetCategories: "3-5",
    targetTopLevelMin: 3,
    targetTopLevelMax: 5,
    maxEntries: 20,
    label: "Minimal",
    description: "Keep entries grouped broadly."
  },
  2: {
    targetCategories: "5-8",
    targetTopLevelMin: 5,
    targetTopLevelMax: 8,
    maxEntries: 12,
    label: "Moderate",
    description: "Balanced split for most books."
  },
  3: {
    targetCategories: "8-15",
    targetTopLevelMin: 8,
    targetTopLevelMax: 15,
    maxEntries: 8,
    label: "Detailed",
    description: "Break books into more specific groups."
  },
  4: {
    targetCategories: "12-20",
    targetTopLevelMin: 12,
    targetTopLevelMax: 20,
    maxEntries: 5,
    label: "Extensive",
    description: "Maximum splitting into small groups."
  }
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
    buildDetail: next.buildDetail === "full" || next.buildDetail === "names" ? next.buildDetail : "lite",
    treeGranularity: clampInt(typeof next.treeGranularity === "number" ? next.treeGranularity : DEFAULT_GLOBAL_SETTINGS.treeGranularity, 0, 4),
    chunkTokens: clampInt(typeof next.chunkTokens === "number" ? next.chunkTokens : DEFAULT_GLOBAL_SETTINGS.chunkTokens, 1000, 120000),
    dedupMode: next.dedupMode === "lexical" || next.dedupMode === "llm" ? next.dedupMode : "none",
    jevProvider: next.jevProvider === "openrouter" ? "openrouter" : "typesafe",
    jevModel: typeof next.jevModel === "string" ? next.jevModel.trim() : "",
    jevTimeoutMs: clampInt(next.jevTimeoutMs ?? DEFAULT_GLOBAL_SETTINGS.jevTimeoutMs, 1000, 60000),
    jevThreshold: clampFloat(next.jevThreshold ?? DEFAULT_GLOBAL_SETTINGS.jevThreshold, 0, 1)
  };
}
function getEffectiveTreeGranularity(setting, entryCount = 0) {
  let level = clampInt(setting, 0, 4);
  const isAuto = level === 0;
  if (level === 0) {
    if (entryCount >= 3000)
      level = 4;
    else if (entryCount >= 1000)
      level = 3;
    else if (entryCount >= 200)
      level = 2;
    else
      level = 1;
  }
  const preset = TREE_GRANULARITY_PRESETS[level];
  return {
    level,
    isAuto,
    ...preset
  };
}
function getBuildDetailLabel(detail) {
  switch (detail) {
    case "full":
      return "Full";
    case "names":
      return "Names only";
    default:
      return "Lite";
  }
}
function getBuildDetailDescription(detail) {
  switch (detail) {
    case "full":
      return "Send complete entry content and metadata for stronger categorization.";
    case "names":
      return "Send labels only. Cheapest, but the model can only group by names.";
    default:
      return "Send a trimmed content preview plus metadata. Good balance of quality and cost.";
  }
}
function normalizeCharacterConfig(value) {
  const next = value ?? {};
  const searchMode = next.searchMode === "traversal" || next.defaultMode === "traversal" ? "traversal" : "collapsed";
  const legacyBudget = typeof next.tokenBudget === "number" && Number.isFinite(next.tokenBudget) ? Math.floor(next.tokenBudget) : null;
  const injectedEntryLimit = legacyBudget == null ? DEFAULT_CHARACTER_CONFIG.tokenBudget : legacyBudget > 128 ? typeof next.maxResults === "number" && Number.isFinite(next.maxResults) ? Math.floor(next.maxResults) : DEFAULT_CHARACTER_CONFIG.tokenBudget : legacyBudget;
  return {
    enabled: !!next.enabled,
    managedBookIds: uniqueStrings(Array.isArray(next.managedBookIds) ? next.managedBookIds : []),
    searchMode,
    collapsedDepth: clampInt(typeof next.collapsedDepth === "number" ? next.collapsedDepth : DEFAULT_CHARACTER_CONFIG.collapsedDepth, 1, 12),
    maxResults: clampInt(typeof next.maxResults === "number" ? next.maxResults : DEFAULT_CHARACTER_CONFIG.maxResults, 1, 64),
    maxTraversalDepth: clampInt(typeof next.maxTraversalDepth === "number" ? next.maxTraversalDepth : DEFAULT_CHARACTER_CONFIG.maxTraversalDepth, 1, 16),
    traversalStepLimit: clampInt(typeof next.traversalStepLimit === "number" ? next.traversalStepLimit : DEFAULT_CHARACTER_CONFIG.traversalStepLimit, 1, 24),
    scopePickLimit: clampInt(typeof next.scopePickLimit === "number" ? next.scopePickLimit : DEFAULT_CHARACTER_CONFIG.scopePickLimit, 1, 24),
    tokenBudget: clampInt(injectedEntryLimit, 1, 64),
    rerankEnabled: !!next.rerankEnabled,
    selectiveRetrieval: next.selectiveRetrieval !== false,
    multiBookMode: next.multiBookMode === "per_book" ? "per_book" : "unified",
    contextMessages: clampInt(typeof next.contextMessages === "number" ? next.contextMessages : DEFAULT_CHARACTER_CONFIG.contextMessages, 1, 100)
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

// src/categories.ts
var ROOT_CATEGORIES = ["Characters", "Locations", "Items", "Factions", "Events", "Worldbuilding", "Other"];
var HINTS = {
  Characters: /character|person|people|cast|npc|protagonist|relationship|family/i,
  Locations: /location|place|region|city|town|land|map|geograph/i,
  Items: /item|object|artifact|equipment|weapon|tool|inventory/i,
  Factions: /faction|organization|group|guild|house|clan|government/i,
  Events: /event|history|timeline|era|incident|war|battle/i,
  Worldbuilding: /world|lore|magic|system|rule|culture|religion|species|setting/i
};
function classifyCategory(label) {
  const matches = Object.keys(HINTS).filter((root) => HINTS[root].test(label));
  return matches.length === 1 ? matches[0] : "Other";
}
function ensureRootCategories(tree) {
  const root = tree.nodes[tree.rootId];
  if (!root)
    return tree;
  const existing = [...root.childIds];
  const fixedIds = new Map;
  for (const label of ROOT_CATEGORIES)
    fixedIds.set(label, ensureCategoryPath(tree, [label], "system"));
  for (const id of existing) {
    const node = tree.nodes[id];
    if (!node || Array.from(fixedIds.values()).includes(id))
      continue;
    const target = fixedIds.get(classifyCategory(`${node.label} ${node.summary}`));
    root.childIds = root.childIds.filter((childId) => childId !== id);
    node.parentId = target;
    if (!tree.nodes[target].childIds.includes(id))
      tree.nodes[target].childIds.push(id);
  }
  const other = tree.nodes[fixedIds.get("Other")];
  other.entryIds = [...new Set([...other.entryIds, ...root.entryIds, ...tree.unassignedEntryIds])];
  root.entryIds = [];
  tree.unassignedEntryIds = [];
  root.childIds = ROOT_CATEGORIES.map((label) => fixedIds.get(label));
  return tree;
}
function rootCategoryForEntry(tree, entryId) {
  for (const label of ROOT_CATEGORIES) {
    const rootId = tree.nodes[tree.rootId]?.childIds.find((id) => tree.nodes[id]?.label === label);
    if (!rootId)
      continue;
    const queue = [rootId];
    const visited = new Set;
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id))
        continue;
      visited.add(id);
      const node = tree.nodes[id];
      if (!node)
        continue;
      if (node.entryIds.includes(entryId))
        return label;
      queue.push(...node.childIds);
    }
  }
  return "Other";
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
var WORLD_BOOK_LIST_TTL_MS = 5000;
var worldBookListCache = new Map;
function invalidateWorldBookListCache(userId) {
  if (typeof userId === "string") {
    worldBookListCache.delete(userId);
    return;
  }
  worldBookListCache.clear();
}
function getLoreRecallCharacterPayload(character) {
  const value = character?.extensions?.[EXTENSION_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value))
    return {};
  return value;
}
function readStoredCharacterConfig(character) {
  const payload = getLoreRecallCharacterPayload(character);
  return payload.characterConfig === undefined ? null : payload.characterConfig;
}
async function readLegacyCharacterConfig(characterId, userId) {
  return spindle.userStorage.getJson(getCharacterConfigPath(characterId), {
    fallback: null,
    userId
  });
}
async function writeCharacterConfigExtension(character, config, userId) {
  const currentPayload = getLoreRecallCharacterPayload(character);
  await spindle.characters.update(character.id, {
    extensions: {
      [EXTENSION_KEY]: {
        ...currentPayload,
        characterConfig: config
      }
    }
  }, userId);
}
function characterHasStoredConfig(character) {
  return readStoredCharacterConfig(character) !== null;
}
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
async function loadCharacterConfig(characterId, userId, character) {
  const resolvedCharacter = character === undefined ? await spindle.characters.get(characterId, userId) : character;
  const stored = readStoredCharacterConfig(resolvedCharacter);
  if (stored)
    return normalizeCharacterConfig(stored);
  const legacy = await readLegacyCharacterConfig(characterId, userId);
  if (legacy) {
    const normalized = normalizeCharacterConfig(legacy);
    if (resolvedCharacter) {
      try {
        await writeCharacterConfigExtension(resolvedCharacter, normalized, userId);
        await spindle.userStorage.delete(getCharacterConfigPath(characterId), userId).catch(() => {});
      } catch (error) {
        spindle.log.warn(`Lore Recall could not migrate character config ${characterId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return normalized;
  }
  return normalizeCharacterConfig(DEFAULT_CHARACTER_CONFIG);
}
async function saveCharacterConfig(characterId, patch, userId, character) {
  const resolvedCharacter = character === undefined ? await spindle.characters.get(characterId, userId) : character;
  if (!resolvedCharacter) {
    throw new Error(`Character ${characterId} was not found.`);
  }
  const currentStored = readStoredCharacterConfig(resolvedCharacter);
  const current = currentStored ? normalizeCharacterConfig(currentStored) : await loadCharacterConfig(characterId, userId, resolvedCharacter);
  const next = normalizeCharacterConfig({ ...current, ...patch });
  await writeCharacterConfigExtension(resolvedCharacter, next, userId);
  await spindle.userStorage.delete(getCharacterConfigPath(characterId), userId).catch(() => {});
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
  const cached = worldBookListCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.books;
  }
  const books = [];
  let offset = 0;
  while (true) {
    const page = await spindle.world_books.list({ limit: PAGE_LIMIT, offset, userId });
    books.push(...page.data);
    if (books.length >= page.total || page.data.length === 0)
      break;
    offset += page.data.length;
  }
  worldBookListCache.set(userId, {
    expiresAt: Date.now() + WORLD_BOOK_LIST_TTL_MS,
    books
  });
  return books;
}
async function listAllCharacters(userId) {
  const characters = [];
  let offset = 0;
  while (true) {
    const page = await spindle.characters.list({ limit: PAGE_LIMIT, offset, userId });
    characters.push(...page.data);
    if (characters.length >= page.total || page.data.length === 0)
      break;
    offset += page.data.length;
  }
  return characters;
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
  let tree = ensureRootCategories(ensureTreeIndexShape(rawTree, bookId, Array.from(validEntryIds)));
  if (!treeHasContent(tree)) {
    const migrated = migrateLegacyTree(bookId, entries);
    if (migrated) {
      tree = ensureRootCategories(ensureTreeIndexShape(migrated, bookId, Array.from(validEntryIds)));
    } else {
      tree = ensureRootCategories(createEmptyTreeIndex(bookId));
      tree.nodes[tree.nodes[tree.rootId].childIds.at(-1)].entryIds = entries.map((entry) => entry.entryId);
    }
    await spindle.userStorage.setJson(path, tree, { indent: 2, userId });
  } else if (rawTree?.version !== TREE_VERSION || issues.staleEntryRefs || issues.staleNodeRefs || JSON.stringify(rawTree) !== JSON.stringify(tree)) {
    await spindle.userStorage.setJson(path, tree, { indent: 2, userId });
  }
  return { tree, ...issues };
}
async function saveTreeIndex(bookId, tree, entryIds, userId) {
  await spindle.userStorage.setJson(getTreePath(bookId), ensureRootCategories(ensureTreeIndexShape(tree, bookId, entryIds)), {
    indent: 2,
    userId
  });
}
function countAssignedRootEntries(tree) {
  return tree.nodes[tree.rootId]?.entryIds.length ?? 0;
}
function buildBookStatus(bookId, config, tree, entries, attachedToCharacter, selectedForCharacter) {
  const warnings = [];
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
async function getRuntimeBooks(selectedBookIds, attachedBookIds, userId, maxWaitMs) {
  const attachedBookIdSet = new Set(attachedBookIds);
  const staleIssues = {};
  const loadIssues = {};
  const missingBookIds = new Set;
  const runtimeBooks = (await Promise.all(selectedBookIds.map(async (bookId) => {
    let timer;
    try {
      const load = async () => {
        const [cache, config] = await Promise.all([loadBookCache(bookId, userId), loadBookConfig(bookId, userId)]);
        if (!cache) {
          missingBookIds.add(bookId);
          throw new Error("This lorebook is no longer available.");
        }
        const loadedTree = await loadTreeIndex(bookId, cache.entries, userId);
        return {
          book: {
            summary: {
              id: cache.bookId,
              name: cache.name,
              description: cache.description,
              updatedAt: cache.bookUpdatedAt
            },
            cache,
            config,
            tree: loadedTree.tree,
            status: buildBookStatus(bookId, config, loadedTree.tree, cache.entries, attachedBookIdSet.has(bookId), true)
          },
          staleIssue: { staleEntryRefs: loadedTree.staleEntryRefs, staleNodeRefs: loadedTree.staleNodeRefs }
        };
      };
      const loaded = maxWaitMs ? await Promise.race([
        load(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Loading this lorebook timed out.")), maxWaitMs);
        })
      ]) : await load();
      staleIssues[bookId] = loaded.staleIssue;
      return loaded.book;
    } catch (error) {
      loadIssues[bookId] = error instanceof Error ? error.message : String(error);
      delete staleIssues[bookId];
      return null;
    } finally {
      if (timer)
        clearTimeout(timer);
    }
  }))).filter((book) => !!book);
  return { runtimeBooks, staleIssues, loadIssues, missingBookIds: selectedBookIds.filter((id) => missingBookIds.has(id)) };
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

// src/backend/attached.ts
function mapAttachedBookScopes(input) {
  const scopes = {};
  const add = (ids, scope) => {
    for (const id of ids) {
      if (!id)
        continue;
      const bookScopes = scopes[id] ?? (scopes[id] = []);
      if (!bookScopes.includes(scope))
        bookScopes.push(scope);
    }
  };
  add(input.character, "character");
  if (input.persona)
    add([input.persona], "persona");
  add(input.chat, "chat");
  add(input.global, "global");
  return scopes;
}
function attachedCharacterIds(activeCharacterId, metadata) {
  if (!activeCharacterId)
    return [];
  if (metadata.group !== true && metadata.group !== 1)
    return [activeCharacterId];
  const configuredMode = metadata.group_lorebook_mode;
  const cardMode = metadata.group_card_mode;
  const mode = configuredMode === "all" || configuredMode === "all_unmuted" || configuredMode === "active_character" ? configuredMode : cardMode === "merge" ? "all" : cardMode === "merge_ignore_muted" ? "all_unmuted" : "active_character";
  if (mode === "active_character")
    return [activeCharacterId];
  const muted = mode === "all_unmuted" && Array.isArray(metadata.muted_character_ids) ? new Set(metadata.muted_character_ids.filter((id) => typeof id === "string")) : new Set;
  const members = Array.isArray(metadata.character_ids) ? metadata.character_ids.filter((id) => typeof id === "string" && !!id && !muted.has(id)) : [];
  return members.length ? [...new Set(members)] : [activeCharacterId];
}
function toWorkspaceEntry(entry) {
  return {
    entryId: entry.entryId,
    worldBookId: entry.worldBookId,
    worldBookName: entry.worldBookName,
    comment: entry.comment,
    key: entry.key,
    keysecondary: entry.keysecondary,
    disabled: entry.disabled,
    updatedAt: entry.updatedAt,
    groupName: entry.groupName,
    constant: entry.constant,
    selective: entry.selective,
    vectorized: entry.vectorized,
    previewText: entry.previewText,
    label: entry.label,
    aliases: entry.aliases,
    summary: entry.summary,
    collapsedText: entry.collapsedText,
    tags: entry.tags
  };
}
function attachedWorkspaceBooks(attachedBookIds, loadedBooks) {
  const loadedById = new Map(loadedBooks.map((book) => [book.summary.id, book.summary]));
  return attachedBookIds.map((id) => loadedById.get(id) ?? { id, name: id, description: "Details unavailable", updatedAt: 0 }).sort((left, right) => left.name.localeCompare(right.name));
}
function buildAttachedWorkspaceState(scopes, loadedBooks, missingBookIds = []) {
  const missing = new Set(missingBookIds);
  const bookIds = Object.keys(scopes).filter((id) => !missing.has(id));
  const existingScopes = Object.fromEntries(bookIds.map((id) => [id, scopes[id]]));
  return {
    allWorldBooks: attachedWorkspaceBooks(bookIds, loadedBooks),
    attachedBookSources: Object.fromEntries(bookIds.map((id) => [id, scopes[id][0]])),
    attachedBookScopes: existingScopes
  };
}

// src/backend/controller-json.ts
var THINK_BLOCK_RE = /<think[\s\S]*?<\/think>/gi;
function sanitizeControllerText(value) {
  return value.replace(THINK_BLOCK_RE, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function extractGenerationContent(result) {
  return result && typeof result === "object" && typeof result.content === "string" ? result.content : "";
}
function extractGenerationUsage(result) {
  if (!result || typeof result !== "object")
    return null;
  const usage = result.usage;
  return usage && typeof usage === "object" ? usage : null;
}
function getControllerTokenUsage(usage) {
  const record = (value) => value && typeof value === "object" ? value : {};
  const raw = record(usage?.provider_raw);
  const sources = [usage ?? {}, raw];
  const details = sources.flatMap((source) => [
    record(source.output_tokens_details),
    record(source.completion_tokens_details),
    source
  ]);
  const count = (key) => {
    for (const detail of details) {
      const value = detail[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0)
        return value;
    }
    return null;
  };
  return { reasoningTokens: count("reasoning_tokens"), textTokens: count("text_tokens") };
}
function extractGenerationReasoning(result) {
  return result && typeof result === "object" && typeof result.reasoning === "string" ? result.reasoning : "";
}
function parseJsonValue(content) {
  const cleaned = sanitizeControllerText(content);
  if (!cleaned)
    return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {}
    }
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
function normalizeArrayPayload(parsed, primaryKey) {
  if (Array.isArray(parsed))
    return { [primaryKey]: parsed };
  if (!parsed || typeof parsed !== "object")
    return null;
  const record = parsed;
  if (Array.isArray(record[primaryKey]))
    return record;
  if (Array.isArray(record.data))
    return { [primaryKey]: record.data };
  if (Array.isArray(record.items))
    return { [primaryKey]: record.items };
  const result = record.result;
  if (result && typeof result === "object" && Array.isArray(result[primaryKey])) {
    return { [primaryKey]: result[primaryKey] };
  }
  return null;
}
function buildStructuredJsonParameters(provider, schemaName, schema) {
  const normalizedProvider = provider?.trim().toLowerCase() ?? "";
  if (normalizedProvider === "google" || normalizedProvider === "gemini") {
    return {
      responseMimeType: "application/json",
      responseSchema: schema
    };
  }
  if (normalizedProvider === "openai" || normalizedProvider === "openrouter") {
    return {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          schema
        }
      }
    };
  }
  return {};
}
function buildNoReasoningParameters(provider) {
  const normalizedProvider = provider?.trim().toLowerCase() ?? "";
  if (normalizedProvider === "openrouter") {
    return { reasoning: { effort: "none" } };
  }
  if (normalizedProvider === "nanogpt") {
    return { reasoning_effort: "none" };
  }
  if (normalizedProvider === "google" || normalizedProvider === "google_vertex" || normalizedProvider === "gemini") {
    return { thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false } };
  }
  return { reasoning: { effort: "none" } };
}
function resolveControllerConnectionId(settings, fallbackConnectionId) {
  if (settings.controllerConnectionId?.trim())
    return settings.controllerConnectionId.trim();
  if (fallbackConnectionId?.trim())
    return fallbackConnectionId.trim();
  return null;
}
async function runControllerJson(prompt, settings, userId, options = {}) {
  const connectionId = resolveControllerConnectionId(settings, options.connectionId);
  const connection = connectionId ? await spindle.connections.get(connectionId, userId).catch(() => null) : null;
  const structuredParameters = options.primaryKey && options.schemaName && options.schema ? buildStructuredJsonParameters(connection?.provider ?? null, options.schemaName, options.schema) : {};
  const noReasoningParameters = options.disableReasoning !== false ? buildNoReasoningParameters(connection?.provider ?? null) : {};
  const result = await spindle.generate.quiet({
    type: "quiet",
    messages: [
      ...options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : [],
      { role: "user", content: prompt }
    ],
    parameters: {
      temperature: options.temperatureOverride ?? settings.controllerTemperature,
      ...noReasoningParameters,
      ...structuredParameters
    },
    ...connectionId ? { connection_id: connectionId } : {},
    userId,
    signal: options.signal
  });
  const content = sanitizeControllerText(extractGenerationContent(result));
  const reasoning = sanitizeControllerText(extractGenerationReasoning(result));
  const parseSource = content || reasoning;
  const parsedFrom = content ? "content" : reasoning ? "reasoning" : null;
  const base = {
    rawContent: content,
    rawReasoning: reasoning,
    parsedFrom,
    provider: connection?.provider ?? null,
    model: connection?.model ?? null,
    connectionId,
    finishReason: result && typeof result === "object" && typeof result.finish_reason === "string" ? result.finish_reason ?? null : null,
    toolCallsCount: result && typeof result === "object" && Array.isArray(result.tool_calls) ? result.tool_calls?.length ?? 0 : null,
    usage: extractGenerationUsage(result)
  };
  if (!parseSource)
    return { parsed: null, ...base };
  const parsed = parseJsonValue(parseSource);
  if (!options.primaryKey) {
    return {
      parsed: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null,
      ...base
    };
  }
  const normalized = normalizeArrayPayload(parsed, options.primaryKey);
  if (normalized)
    return { parsed: normalized, ...base };
  return { parsed: null, ...base };
}

// src/backend/jev.ts
var PROVIDERS = {
  typesafe: { url: "https://api.typesafe.ai/v1/systemone", model: "jev-latest" },
  openrouter: { url: "https://openrouter.ai/api/alpha/decisions", model: "typesafe/jev-1.13" }
};
function secretSlot(provider) {
  return `lore-recall-jev.${provider}`;
}
function enclave() {
  return spindle.enclave;
}
async function hasJevKey(provider, userId) {
  return !!await readJevKey(provider, userId);
}
async function readJevKey(provider, userId) {
  try {
    const key = await enclave()?.get(secretSlot(provider), userId);
    return typeof key === "string" && key.trim() ? key.trim() : null;
  } catch {
    return null;
  }
}
async function saveJevKey(provider, key, userId) {
  if (!key.trim())
    throw new Error("Enter a JEV API key.");
  if (typeof enclave()?.put !== "function")
    throw new Error("Encrypted secret storage is unavailable.");
  await enclave().put(secretSlot(provider), key.trim(), userId);
}
async function clearJevKey(provider, userId) {
  if (typeof enclave()?.delete !== "function")
    throw new Error("Encrypted secret storage is unavailable.");
  await enclave().delete(secretSlot(provider), userId);
}
async function filterWithJev(entries, conversation, settings, userId) {
  if (!entries.length)
    return { verdicts: [], error: null };
  const key = await readJevKey(settings.jevProvider, userId);
  const cors = typeof spindle === "undefined" ? null : spindle.cors;
  const fallback = (error) => ({
    verdicts: entries.map((entry) => ({ entryId: entry.entryId, approved: true, confidence: null, answered: false })),
    error
  });
  if (!key)
    return fallback("JEV key is not configured; model picks passed through.");
  if (typeof cors !== "function")
    return fallback("JEV network permission is unavailable; model picks passed through.");
  const verdicts = [];
  const provider = PROVIDERS[settings.jevProvider];
  const deadline = Date.now() + 20000;
  for (let offset = 0;offset < entries.length; offset += 32) {
    if (deadline - Date.now() < 1000) {
      return { verdicts: [...verdicts, ...entries.slice(offset).map((entry) => ({
        entryId: entry.entryId,
        approved: true,
        confidence: null,
        answered: false
      }))], error: "JEV ran out of time; remaining model picks passed through." };
    }
    const batch = entries.slice(offset, offset + 32);
    const questions = Object.fromEntries(batch.map((entry, index) => [
      `entry_${index}`,
      {
        type: "noul",
        instructions: `Should the lore entry identified by entry_${index} be available for the very next reply? Answer yes only when it materially helps the current scene.`,
        criteria: { true: "Useful for the next reply", false: "Irrelevant or only background context" }
      }
    ]));
    const state = {
      conversation: conversation.slice(-12000),
      entries: batch.map((entry, index) => ({
        id: `entry_${index}`,
        label: entry.label,
        book: entry.worldBookName,
        aliases: entry.aliases,
        keys: entry.key,
        summary: entry.summary.slice(0, 400),
        preview: entry.previewText.slice(0, 350)
      }))
    };
    let timer = null;
    try {
      const response = await Promise.race([
        cors.call(spindle, provider.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ model: settings.jevModel || provider.model, state, questions })
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("JEV timed out.")), Math.min(settings.jevTimeoutMs, deadline - Date.now()));
        })
      ]);
      if (timer)
        clearTimeout(timer);
      const envelope = typeof response === "string" ? { status: 200, body: response } : response;
      if (envelope?.status && (envelope.status < 200 || envelope.status >= 300))
        throw new Error(`JEV HTTP ${envelope.status}.`);
      const payload = JSON.parse(envelope?.body ?? envelope?.text ?? "{}");
      if (!payload.answers || typeof payload.answers !== "object")
        throw new Error("JEV returned no answers.");
      for (let index = 0;index < batch.length; index++) {
        const answer = payload.answers[`entry_${index}`];
        const value = answer?.type === "noul" ? Number(answer.noul) : NaN;
        const answered = Number.isFinite(value) && value >= 0 && value <= 1;
        verdicts.push({
          entryId: batch[index].entryId,
          approved: !answered || value >= settings.jevThreshold,
          confidence: answered ? value : null,
          answered
        });
      }
    } catch (error) {
      if (timer)
        clearTimeout(timer);
      for (const entry of batch)
        verdicts.push({ entryId: entry.entryId, approved: true, confidence: null, answered: false });
      return { verdicts: [...verdicts, ...entries.slice(offset + batch.length).map((entry) => ({
        entryId: entry.entryId,
        approved: true,
        confidence: null,
        answered: false
      }))], error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { verdicts, error: null };
}

// src/backend/retrieval.ts
var TRACE_REPORTER = Symbol("traceReporter");
var RECENT_MESSAGE_LIMIT = 700;
var RECENT_SCENE_MESSAGE_LIMIT = 6000;
var SCENE_MESSAGE_LOOKBACK = 4;
var EMPTY_ENTRY_ID_SET = new Set;
var FEEDBACK_HOT_MS = 2 * 60 * 60 * 1000;
var FEEDBACK_WARM_MS = 12 * 60 * 60 * 1000;
var SCOPE_CORE_GENERIC_LABEL_TERMS = new Set([
  "accord",
  "accords",
  "archive",
  "archives",
  "checklist",
  "classification",
  "classifications",
  "class",
  "classes",
  "doctrine",
  "engine",
  "engines",
  "log",
  "logs",
  "machine",
  "machines",
  "manual",
  "manuals",
  "mechanic",
  "mechanics",
  "note",
  "notes",
  "overview",
  "part",
  "protocol",
  "protocols",
  "reference",
  "references",
  "report",
  "reports",
  "response",
  "rule",
  "rules",
  "system",
  "systems",
  "treaties",
  "treaty",
  "vault",
  "vaults"
]);
var SCOPE_CORE_ENTITY_HINT_TERMS = new Set([
  "cast",
  "character",
  "characters",
  "clan",
  "crew",
  "faction",
  "factions",
  "guild",
  "member",
  "members",
  "organization",
  "organizations",
  "squad",
  "team",
  "unit"
]);
var SEARCH_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "all",
  "also",
  "always",
  "and",
  "any",
  "are",
  "around",
  "assistant",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "character",
  "could",
  "did",
  "does",
  "doing",
  "down",
  "each",
  "everything",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "here",
  "him",
  "his",
  "how",
  "into",
  "its",
  "just",
  "like",
  "more",
  "not",
  "now",
  "off",
  "only",
  "out",
  "over",
  "own",
  "reason",
  "she",
  "should",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "think",
  "this",
  "through",
  "turn",
  "user",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "without",
  "would",
  "you",
  "your"
]);
function emitProgress(reporter, event) {
  if (!reporter)
    return;
  try {
    reporter(event);
  } catch (error) {
    spindle.log.warn(`Lore Recall progress update failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function createFeedItem(kind, label, summary, options = {}) {
  const timestamp = options.timestamp ?? Date.now();
  return {
    id: `${kind}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`,
    kind,
    label,
    summary,
    timestamp,
    phase: options.phase ?? null,
    count: typeof options.count === "number" ? options.count : null,
    scopes: options.scopes?.map((scope) => ({ ...scope })),
    entries: options.entries?.map((entry) => ({ ...entry, reasons: [...entry.reasons] })),
    searchQuery: typeof options.searchQuery === "string" ? options.searchQuery : null,
    searchGlobal: typeof options.searchGlobal === "boolean" ? options.searchGlobal : null,
    details: options.details ? [...options.details] : undefined,
    tone: options.tone,
    durationMs: typeof options.durationMs === "number" ? options.durationMs : null
  };
}
function stripSearchMarkup(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeSearchText(value) {
  return stripSearchMarkup(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokenize(value) {
  return Array.from(new Set(normalizeSearchText(value).split(" ").filter((token) => token.length >= 2 && !SEARCH_STOPWORDS.has(token))));
}
function isRetrievalChatHistoryMessage(message, messages) {
  if (message.role !== "assistant" && message.role !== "user" || !message.content.trim())
    return false;
  const hasHistoryFlags = messages.some((item) => typeof item.__isChatHistory === "boolean");
  return hasHistoryFlags ? message.__isChatHistory === true || message.role === "user" : true;
}
function buildQueryText(messages, contextMessages) {
  const recentMessages = messages.filter((message) => isRetrievalChatHistoryMessage(message, messages)).slice(-contextMessages);
  return recentMessages.map((message, index) => {
    const role = message.role === "user" ? "User" : "Character";
    const messageLimit = recentMessages.length - index <= SCENE_MESSAGE_LOOKBACK ? RECENT_SCENE_MESSAGE_LIMIT : RECENT_MESSAGE_LIMIT;
    const sanitized = sanitizeRetrievalMessage(message.role, message.content, messageLimit);
    return sanitized ? `${role}: ${sanitized}` : "";
  }).filter(Boolean).join(`
`);
}
function findNarrativeProtocolCutIndex(value) {
  const patterns = [
    /important note:/i,
    /\[narrative/i,
    /\[emotional/i,
    /\[strict/i,
    /treat\s+.+?\s+as a black box/i,
    /^you represent\b/im,
    /^the moment\b/im,
    /^you are forbidden\b/im,
    /^characters will not\b/im,
    /^no character may\b/im,
    /^emotional shifts require\b/im,
    /^unreciprocated attraction\b/im
  ];
  let cutIndex = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (!match || typeof match.index !== "number")
      continue;
    cutIndex = cutIndex === -1 ? match.index : Math.min(cutIndex, match.index);
  }
  return cutIndex;
}
function findUserProtocolCutIndex(value) {
  const patterns = [
    /always\s+think\s+and\s+reason/i,
    /##\s*weave\s+planning/i,
    /###\s*active\s+personality\s+matrix/i,
    /private\s+workspace/i,
    /the\s+human\s+never\s+sees/i,
    /\[narrative/i,
    /\[emotional/i,
    /\[strict/i,
    /treat\s+.+?\s+as a black box/i,
    /^you represent\b/im,
    /^the moment\b/im,
    /^you are forbidden\b/im,
    /^characters will not\b/im,
    /^no character may\b/im,
    /^emotional shifts require\b/im,
    /^unreciprocated attraction\b/im
  ];
  let cutIndex = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (!match || typeof match.index !== "number")
      continue;
    cutIndex = cutIndex === -1 ? match.index : Math.min(cutIndex, match.index);
  }
  return cutIndex;
}
function sanitizeRetrievalMessage(role, content, maxLength = RECENT_MESSAGE_LIMIT) {
  let text = stripSearchMarkup(content).replace(/\r\n?/g, `
`);
  const cutIndex = role === "user" ? findUserProtocolCutIndex(text) : findNarrativeProtocolCutIndex(text);
  if (cutIndex >= 0) {
    text = text.slice(0, cutIndex);
  }
  return truncateText(text.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim(), maxLength);
}
function buildRecentConversation(messages, contextMessages) {
  const recentMessages = messages.filter((message) => isRetrievalChatHistoryMessage(message, messages)).slice(-contextMessages);
  return recentMessages.map((message, index) => {
    const role = message.role === "user" ? "User" : "Character";
    const messageLimit = recentMessages.length - index <= SCENE_MESSAGE_LOOKBACK ? RECENT_SCENE_MESSAGE_LIMIT : RECENT_MESSAGE_LIMIT;
    const sanitized = sanitizeRetrievalMessage(message.role, message.content, messageLimit);
    return sanitized ? `${role}: ${sanitized}` : "";
  }).filter(Boolean).join(`
`);
}
function buildPromptContext(recentConversation) {
  if (!recentConversation.trim())
    return "";
  return `RECENT CONVERSATION:
${recentConversation}`;
}
function collectReservedConstantEntries(books) {
  const reserved = [];
  const seen = new Set;
  for (const book of books) {
    for (const entry of book.cache.entries) {
      if (!entry.constant || entry.disabled || seen.has(entry.entryId))
        continue;
      seen.add(entry.entryId);
      reserved.push({
        entry,
        score: 0,
        reasons: ["constant"],
        selectionRole: "score_fallback"
      });
    }
  }
  return reserved.sort((left, right) => left.entry.worldBookName.localeCompare(right.entry.worldBookName) || left.entry.label.localeCompare(right.entry.label));
}
function getEntryBody(entry) {
  const collapsed = entry.collapsedText.trim();
  const content = entry.content.trim();
  if (!collapsed)
    return content;
  if (!content)
    return collapsed;
  const normalizedCollapsed = normalizeSearchText(collapsed);
  const normalizedLabel = normalizeSearchText(entry.label);
  const collapsedTokens = tokenize(collapsed);
  const looksLikeLabelOnly = normalizedCollapsed === normalizedLabel || collapsedTokens.length <= 6 && normalizedLabel.length > 0 && normalizedCollapsed.includes(normalizedLabel) || collapsedTokens.length <= 4;
  return looksLikeLabelOnly ? content : collapsed;
}
function getEntryInjectionBody(entry) {
  const content = entry.content.trim();
  return content || getEntryBody(entry);
}
function getEntryBreadcrumb(entry, tree) {
  const path = getEntryCategoryPath(tree, entry.entryId).map((node) => node.label).filter((label) => label && label !== "Root");
  return [...path, entry.label].join(" > ");
}
var COMPOSITE_LABEL_TERMS = new Set([
  "affection",
  "alliance",
  "bond",
  "bonds",
  "dynamic",
  "family",
  "friend",
  "friendship",
  "lover",
  "relationship",
  "relationships",
  "rival",
  "rivalry",
  "romance"
]);
var SUPPORT_CONTEXT_TERMS = new Set([
  "abilities",
  "ability",
  "angel",
  "artifact",
  "artifacts",
  "base",
  "crew",
  "doctrine",
  "doctrines",
  "equipment",
  "faction",
  "factions",
  "facility",
  "facilities",
  "group",
  "groups",
  "location",
  "locations",
  "magic",
  "mechanic",
  "mechanics",
  "mechanism",
  "mechanisms",
  "operation",
  "operations",
  "organization",
  "organizations",
  "power",
  "powers",
  "protocol",
  "protocols",
  "rule",
  "rules",
  "system",
  "systems",
  "tech",
  "technology",
  "weapon",
  "weapons"
]);
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
      previewText: truncateText(getEntryInjectionBody(item.entry), 240),
      selectionRole: item.selectionRole
    };
  });
}
function buildInjectionText(selected, booksById, injectedEntryLimit, collapsedDepth) {
  if (!selected.length)
    return null;
  const maxEntries = Math.max(0, Math.floor(injectedEntryLimit));
  if (maxEntries <= 0)
    return null;
  const parts = [
    "[Lore Recall Retrieved Context]",
    "Use this retrieved reference only if it is relevant to the current reply. Do not mention Lore Recall or describe this block explicitly."
  ];
  const included = [];
  for (const item of selected.slice(0, maxEntries)) {
    const book = booksById.get(item.entry.worldBookId);
    const path = book ? getEntryCategoryPath(book.tree, item.entry.entryId).slice(-collapsedDepth) : [];
    const pathLabels = path.map((node) => node.label);
    const branchSummary = path.map((node) => node.summary.trim()).filter(Boolean).join(" | ");
    const section = [
      "",
      `${included.length + 1}. ${[...pathLabels, item.entry.label].join(" > ")}`,
      `Book: ${item.entry.worldBookName}`,
      item.entry.aliases.length ? `Aliases: ${item.entry.aliases.join(", ")}` : "",
      branchSummary ? `Category summary: ${branchSummary}` : "",
      "Entry content:",
      getEntryInjectionBody(item.entry)
    ].filter(Boolean).join(`
`);
    parts.push(section);
    included.push(item);
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
async function buildRetrievalPreview(messages, settings, config, books, userId, options = {}) {
  return buildCategoryRetrievalPreview(messages, settings, config, books, userId, options);
}
async function buildCategoryRetrievalPreview(messages, settings, config, books, userId, options) {
  const queryText = buildQueryText(messages, config.contextMessages);
  const recentConversation = buildRecentConversation(messages, config.contextMessages) || queryText;
  if (!queryText.trim())
    return null;
  const readableBooks = books.filter((book) => book.config.enabled && isReadableBook(book.config));
  if (!readableBooks.length)
    return null;
  const report = options.reportProgress;
  const startedAt = options.capturedAt ?? Date.now();
  emitProgress(report, {
    type: "start",
    mode: "collapsed",
    timestamp: startedAt,
    label: "Start retrieval",
    summary: `Reviewing ${readableBooks.length} managed book(s).`
  });
  const allEntries = readableBooks.flatMap((book) => book.cache.entries.filter((entry) => !entry.disabled && !entry.constant).map((entry) => ({ entry, category: rootCategoryForEntry(book.tree, entry.entryId) })));
  const constants = collectReservedConstantEntries(readableBooks);
  const reservedConstantNodes = buildPreviewNodes(constants, new Map(readableBooks.map((book) => [book.summary.id, book])));
  const issues = [];
  let retrievalComplete = true;
  let controllerUsed = false;
  const controllerAllowed = options.allowController !== false;
  const connectionId = resolveControllerConnectionId(settings, options.connectionId);
  const modelDeadline = Math.min(Date.now() + 155000, options.deadlineAt ?? Infinity);
  const runModel = async (prompt) => {
    if (!controllerAllowed)
      return null;
    if (options.signal?.aborted) {
      retrievalComplete = false;
      return null;
    }
    const remainingMs = modelDeadline - Date.now();
    if (remainingMs < 1000) {
      issues.push("Model selection ran out of time; remaining batches were skipped.");
      retrievalComplete = false;
      return null;
    }
    const abort = new AbortController;
    const onAbort = () => abort.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => abort.abort(), Math.min(remainingMs, 30000));
    try {
      const response = await runControllerJson(prompt, settings, userId, { connectionId, temperatureOverride: 0.1, signal: abort.signal });
      if (!response.parsed)
        throw new Error("Model returned no valid JSON.");
      controllerUsed = true;
      return response.parsed;
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      retrievalComplete = false;
      return null;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  };
  const categoriesPresent = ROOT_CATEGORIES.filter((category) => allEntries.some((item) => item.category === category));
  const categoryResult = categoriesPresent.length ? await runModel([
    'Choose every top-level lore category relevant to the next reply. Return only JSON: {"categories":["Characters"]}.',
    "Use only the category names listed. An empty array is valid.",
    buildPromptContext(recentConversation),
    "Categories:",
    ...categoriesPresent.map((category) => {
      const group = allEntries.filter((item) => item.category === category);
      return `- ${category}: ${group.length} entries; examples: ${group.slice(0, 8).map((item) => item.entry.label).join(", ")}`;
    })
  ].join(`
`)) : { categories: [] };
  const rawCategories = categoryResult?.categories;
  const routedCategories = Array.isArray(rawCategories) && rawCategories.every((value) => typeof value === "string" && categoriesPresent.includes(value)) ? [...new Set(rawCategories)] : [];
  if (categoriesPresent.length && controllerAllowed && (!Array.isArray(rawCategories) || rawCategories.some((value) => typeof value !== "string" || !categoriesPresent.includes(value)))) {
    issues.push("Category routing returned an invalid categories array.");
    retrievalComplete = false;
  }
  if (categoriesPresent.length && !controllerAllowed)
    retrievalComplete = false;
  emitProgress(report, { type: "item", item: createFeedItem("scope", "Routed categories", routedCategories.length ? routedCategories.join(", ") : "No dynamic category selected.", { phase: "choose_scope", count: routedCategories.length, tone: "info" }) });
  const routed = allEntries.filter((item) => routedCategories.includes(item.category));
  const batches = [];
  let batch = [];
  let chars = 0;
  for (const item of routed) {
    const cost = Math.min(700, item.entry.summary.length + item.entry.previewText.length + 180);
    if (batch.length && (chars + cost > 18000 || batch.length >= 60)) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(item);
    chars += cost;
  }
  if (batch.length)
    batches.push(batch);
  const selectedEntries = [];
  for (let batchIndex = 0;batchIndex < batches.length; batchIndex++) {
    const candidates = batches[batchIndex];
    const result = await runModel([
      'Select ALL lore entries relevant to the next reply. Return only JSON: {"entryIds":["id"]}.',
      "Use only IDs from this batch. An empty array is valid. Do not impose a count limit.",
      buildPromptContext(recentConversation),
      `Batch ${batchIndex + 1} of ${batches.length}:`,
      ...candidates.map(({ entry, category }) => `- id=${JSON.stringify(entry.entryId)}; category=${category}; book=${entry.worldBookName}; label=${entry.label}; aliases=${entry.aliases.join(", ")}; keys=${entry.key.join(", ")}; summary=${truncateText(entry.summary, 240)}; preview=${truncateText(entry.previewText, 300)}`)
    ].join(`
`));
    if (!result || !Array.isArray(result.entryIds) || !result.entryIds.every((id) => typeof id === "string")) {
      issues.push(`Selection batch ${batchIndex + 1} returned no usable entryIds array.`);
      retrievalComplete = false;
      continue;
    }
    const byId = new Map(candidates.map(({ entry }) => [entry.entryId, entry]));
    const requested = [...new Set(result.entryIds)];
    const invalid = requested.filter((id) => !byId.has(id));
    if (invalid.length) {
      issues.push(`Selection batch ${batchIndex + 1} returned ${invalid.length} unknown ID(s).`);
      retrievalComplete = false;
      continue;
    }
    for (const id of requested)
      selectedEntries.push({ entry: byId.get(id), score: 0, reasons: ["model_selected"] });
  }
  const booksById = new Map(readableBooks.map((book) => [book.summary.id, book]));
  const modelSelectedEntries = buildPreviewNodes(selectedEntries, booksById);
  emitProgress(report, { type: "item", item: createFeedItem("manifest", "Model picks", `Selected ${selectedEntries.length} of ${routed.length} reviewed entries across ${batches.length} batch(es).`, { phase: "manifest_select", count: selectedEntries.length, entries: modelSelectedEntries, tone: "info" }) });
  const jev = await filterWithJev(selectedEntries.map((item) => item.entry), recentConversation, settings, userId);
  if (jev.error)
    issues.push(jev.error);
  const verdictById = new Map(jev.verdicts.map((verdict) => [verdict.entryId, verdict]));
  const approved = selectedEntries.filter((item) => verdictById.get(item.entry.entryId)?.approved !== false).sort((a, b) => (verdictById.get(b.entry.entryId)?.confidence ?? -1) - (verdictById.get(a.entry.entryId)?.confidence ?? -1));
  const rejected = selectedEntries.filter((item) => verdictById.get(item.entry.entryId)?.approved === false);
  const jevApprovedEntries = buildPreviewNodes(approved, booksById);
  const jevRejectedEntries = buildPreviewNodes(rejected, booksById);
  emitProgress(report, { type: "item", item: createFeedItem("trace", "JEV filter", `Approved ${approved.length}; rejected ${rejected.length}; unanswered ${jev.verdicts.filter((v) => !v.answered).length}.`, { phase: "manifest_select", count: approved.length, entries: jevApprovedEntries, tone: jev.error ? "warn" : "info" }) });
  if (rejected.length)
    emitProgress(report, { type: "item", item: createFeedItem("manifest", "JEV rejected", `JEV rejected ${rejected.length} model-selected entr${rejected.length === 1 ? "y" : "ies"}.`, { phase: "manifest_select", count: rejected.length, entries: jevRejectedEntries, tone: "info" }) });
  const dynamicLimit = Math.max(0, config.tokenBudget);
  const selected = approved.slice(0, dynamicLimit);
  const injection = buildInjectionText([...constants, ...selected], booksById, constants.length + dynamicLimit, 12);
  const injectedNodes = buildPreviewNodes(injection?.included ?? [], booksById);
  emitProgress(report, { type: "item", item: createFeedItem("injected", "Cap result", `Prepared ${injectedNodes.length} entries (${constants.length} constant, ${selected.length} dynamic) for activation.`, { phase: "inject", count: injectedNodes.length, entries: injectedNodes, tone: "success" }) });
  for (const issue of issues)
    emitProgress(report, { type: "item", item: createFeedItem("issue", "Retrieval issue", issue, { phase: "fallback", tone: "warn" }) });
  const fallbackReason = !retrievalComplete && issues.length ? issues.join(" ") : null;
  emitProgress(report, {
    type: "finish",
    timestamp: Date.now(),
    status: retrievalComplete ? "completed" : "fallback",
    controllerUsed,
    resolvedConnectionId: controllerUsed ? connectionId : null,
    fallbackReason
  });
  return {
    mode: "collapsed",
    queryText,
    recentConversation,
    estimatedTokens: injection?.estimatedTokens ?? 0,
    injectedText: injection?.text ?? "",
    selectionSummary: `${selected.length} dynamic, ${constants.length} constant`,
    reservedConstantCount: constants.length,
    remainingDynamicSlots: dynamicLimit,
    selectedScopes: [],
    retrievedScopes: [],
    scopeManifestCounts: [],
    searchEvents: [],
    selectedNodes: [],
    reservedConstantNodes,
    pulledNodes: buildPreviewNodes(routed.map(({ entry }) => ({ entry, score: 0, reasons: ["routed"] })), booksById),
    injectedNodes,
    manifestSelectedEntries: modelSelectedEntries,
    routedCategories,
    modelSelectedEntries,
    jevApprovedEntries,
    jevRejectedEntries,
    fallbackReason,
    fallbackPath: issues,
    retrievalComplete,
    selectedBookIds: readableBooks.map((book) => book.summary.id),
    steps: [],
    trace: [],
    capturedAt: startedAt,
    isActual: options.isActual === true,
    controllerUsed,
    resolvedConnectionId: controllerUsed ? connectionId : null
  };
}

// src/backend/activation.ts
var RUN_TTL_MS = 5 * 60000;

class RecallRunStore {
  runs = new Map;
  turns = new Map;
  begin(id, userId, chatId) {
    this.prune();
    this.turns.set(id, { userId, chatId, createdAt: Date.now(), status: "preparing" });
  }
  stayNative(id) {
    const turn = this.turns.get(id);
    if (turn && turn.status !== "consumed" && turn.status !== "claimed")
      turn.status = "native";
  }
  isPassThrough(id) {
    this.prune();
    const turn = this.turns.get(id);
    return !!turn && turn.status !== "claimed";
  }
  put(run) {
    this.prune();
    const turn = this.turns.get(run.id);
    if (turn && turn.status !== "preparing" && turn.status !== "prepared")
      return false;
    this.turns.set(run.id, { userId: run.userId, chatId: run.chatId, createdAt: run.createdAt, status: "prepared" });
    this.runs.set(run.id, run);
    return true;
  }
  get(id) {
    this.prune();
    return this.runs.get(id);
  }
  claim(userId, chatId, availableEntries) {
    this.prune();
    const candidates = [...this.turns.entries()].filter(([, turn]) => turn.userId === userId && turn.chatId === chatId && turn.status !== "claimed" && turn.status !== "consumed");
    if (candidates.length !== 1) {
      const rejected = [];
      for (const [id, turn] of candidates) {
        turn.status = "consumed";
        const run = this.runs.get(id);
        if (run) {
          run.status = "native";
          rejected.push(run);
        }
      }
      return { run: null, rejected, reason: candidates.length > 1 ? "Overlapping generations prevented a safe Recall takeover." : null };
    }
    const [id, turn] = candidates[0];
    const run = this.runs.get(id);
    if (turn.status !== "prepared" || !run) {
      turn.status = "consumed";
      return { run: null, rejected: [], reason: null };
    }
    const available = new Map(availableEntries.map((entry) => [entry.id, entry]));
    if (Object.entries(run.sourceContents).some(([id, content]) => {
      const current = available.get(id);
      return !current || current.disabled || current.content !== content;
    })) {
      run.status = "native";
      turn.status = "consumed";
      return { run: null, rejected: [run], reason: "A selected entry changed or became disabled before activation." };
    }
    run.status = "claimed";
    turn.status = "claimed";
    return { run, rejected: [], reason: null };
  }
  remove(id) {
    this.runs.delete(id);
    this.turns.delete(id);
  }
  prune() {
    const now = Date.now();
    for (const [id, turn] of this.turns) {
      if (now - turn.createdAt > RUN_TTL_MS)
        this.remove(id);
    }
  }
}
function suppressedNativeEntryIds(run, entries) {
  const handled = new Set(run.handledBookIds);
  return entries.filter((entry) => handled.has(entry.world_book_id)).map((entry) => entry.id);
}
function entryRole(role) {
  return role === "user" || role === "assistant" ? role : "system";
}
function insertionIndex(entry, messages) {
  const history = messages.flatMap((message, index) => message.__isChatHistory ? [index] : []);
  const firstHistory = history[0] ?? messages.length;
  if (entry.position === 0)
    return 0;
  if (entry.position === 4 && history.length) {
    const depth = Math.max(0, Math.floor(entry.depth || 0));
    return depth === 0 ? history[history.length - 1] + 1 : history[Math.max(0, history.length - depth)];
  }
  return firstHistory;
}
function injectRecallEntries(messages, entries) {
  const inserted = [...messages];
  const planned = entries.map((entry, order) => ({ entry, order, index: insertionIndex(entry, messages) })).sort((left, right) => left.index - right.index || left.order - right.order);
  const breakdown = [];
  for (let offset = 0;offset < planned.length; offset++) {
    const { entry, index } = planned[offset];
    const messageIndex = index + offset;
    inserted.splice(messageIndex, 0, { role: entryRole(entry.role), content: entry.content });
    breakdown.push({ messageIndex, name: entry.comment?.trim() || "Lore Recall entry" });
  }
  return { messages: inserted, breakdown };
}

// src/backend/granularity.ts
function labelKey(value) {
  return value.trim().toLowerCase();
}
function pathKey(path) {
  return path.map(labelKey).join("\x1F");
}
function stableHash(value) {
  let hash = 0;
  for (let index = 0;index < value.length; index += 1) {
    hash = hash * 31 + value.charCodeAt(index) >>> 0;
  }
  return hash;
}
function normalizePath(value) {
  if (!Array.isArray(value))
    return [];
  return value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
}
function coerceTreeAssignments(values, validEntryIds) {
  const byEntryId = new Map;
  const ignoredEntryIds = [];
  if (!Array.isArray(values))
    return { assignments: [], ignoredEntryIds };
  for (const value of values) {
    if (!value || typeof value !== "object")
      continue;
    const record = value;
    const entryId = typeof record.entryId === "string" ? record.entryId.trim() : "";
    if (!entryId || !validEntryIds.has(entryId)) {
      if (entryId)
        ignoredEntryIds.push(entryId);
      continue;
    }
    byEntryId.set(entryId, {
      entryId,
      path: normalizePath(record.path)
    });
  }
  return {
    assignments: [...byEntryId.values()],
    ignoredEntryIds: uniqueStrings(ignoredEntryIds)
  };
}
function getRoot(tree) {
  return tree.nodes[tree.rootId];
}
function getTopLevelNodes(tree) {
  const root = getRoot(tree);
  return (root?.childIds ?? []).map((nodeId) => tree.nodes[nodeId]).filter((node) => !!node);
}
function findChildByLabel(tree, parentId, label) {
  const parent = tree.nodes[parentId];
  if (!parent)
    return null;
  const key = labelKey(label);
  return parent.childIds.find((childId) => labelKey(tree.nodes[childId]?.label ?? "") === key) ?? null;
}
function findNodeIdByPath(tree, path) {
  let parentId = tree.rootId;
  for (const label of path) {
    const childId = findChildByLabel(tree, parentId, label);
    if (!childId)
      return null;
    parentId = childId;
  }
  return parentId;
}
function getAllowedTopLevelLabels(tree, assignments, granularity) {
  const allowed = [];
  const seen = new Set;
  const push = (label) => {
    const trimmed = label.trim();
    const key = labelKey(trimmed);
    if (!trimmed || seen.has(key) || allowed.length >= granularity.targetTopLevelMax)
      return;
    allowed.push(trimmed);
    seen.add(key);
  };
  for (const node of getTopLevelNodes(tree))
    push(node.label);
  for (const assignment of assignments) {
    if (assignment.path.length)
      push(assignment.path[0]);
  }
  return allowed;
}
function validateTreeAssignmentsGranularity(tree, assignments, granularity) {
  const violations = [];
  const existingTopKeys = new Set(getTopLevelNodes(tree).map((node) => labelKey(node.label)));
  const newTopLabels = [];
  const newTopKeys = new Set;
  for (const assignment of assignments) {
    const topLabel = assignment.path[0];
    if (!topLabel)
      continue;
    const key = labelKey(topLabel);
    if (existingTopKeys.has(key) || newTopKeys.has(key))
      continue;
    newTopKeys.add(key);
    newTopLabels.push(topLabel);
  }
  const totalTopLevel = existingTopKeys.size + newTopLabels.length;
  if (totalTopLevel > granularity.targetTopLevelMax) {
    const allowedNewCount = Math.max(0, granularity.targetTopLevelMax - existingTopKeys.size);
    violations.push(`Top-level category cap exceeded: ${totalTopLevel}/${granularity.targetTopLevelMax}. Excess top-level labels: ${newTopLabels.slice(allowedNewCount).join(", ") || "unknown"}.`);
  }
  const leafCounts = new Map;
  for (const assignment of assignments) {
    if (!assignment.path.length)
      continue;
    const key = pathKey(assignment.path);
    const current = leafCounts.get(key) ?? { path: assignment.path, count: 0, existingCount: 0 };
    current.count += 1;
    leafCounts.set(key, current);
  }
  for (const item of leafCounts.values()) {
    const nodeId = findNodeIdByPath(tree, item.path);
    const node = nodeId ? tree.nodes[nodeId] : null;
    item.existingCount = node && node.childIds.length === 0 ? node.entryIds.length : 0;
    const total = item.existingCount + item.count;
    if (total > granularity.maxEntries) {
      violations.push(`Leaf category "${item.path.join(" > ")}" would contain ${total}/${granularity.maxEntries} entries.`);
    }
  }
  return violations;
}
function normalizeTreeAssignmentsForGranularity(tree, rawAssignments, validEntryIds, granularity) {
  const coerced = coerceTreeAssignments(rawAssignments, validEntryIds);
  const violations = validateTreeAssignmentsGranularity(tree, coerced.assignments, granularity);
  const adjustments = [];
  const allowedTopLabels = getAllowedTopLevelLabels(tree, coerced.assignments, granularity);
  const allowedTopKeys = new Set(allowedTopLabels.map(labelKey));
  let assignments = coerced.assignments.map((assignment) => {
    if (!assignment.path.length || allowedTopKeys.has(labelKey(assignment.path[0])))
      return assignment;
    const targetTopLabel = allowedTopLabels[stableHash(assignment.path[0]) % allowedTopLabels.length] ?? assignment.path[0];
    adjustments.push(`Moved "${assignment.path[0]}" under "${targetTopLabel}" to respect the top-level category cap.`);
    return {
      ...assignment,
      path: [targetTopLabel, ...assignment.path]
    };
  });
  const byPath = new Map;
  for (const assignment of assignments) {
    if (!assignment.path.length)
      continue;
    const key = pathKey(assignment.path);
    const list = byPath.get(key) ?? [];
    list.push(assignment);
    byPath.set(key, list);
  }
  const splitEntryIds = new Map;
  for (const [key, list] of byPath) {
    const path = list[0]?.path ?? [];
    const nodeId = findNodeIdByPath(tree, path);
    const node = nodeId ? tree.nodes[nodeId] : null;
    const existingCount = node && node.childIds.length === 0 ? node.entryIds.length : 0;
    if (existingCount + list.length <= granularity.maxEntries)
      continue;
    adjustments.push(`Split "${path.join(" > ")}" assignment output to respect ${granularity.maxEntries} entries per leaf.`);
    splitEntryIds.set(key, list.map((assignment) => assignment.entryId));
  }
  if (splitEntryIds.size) {
    assignments = assignments.map((assignment) => {
      if (!assignment.path.length)
        return assignment;
      const splitIds = splitEntryIds.get(pathKey(assignment.path));
      if (!splitIds)
        return assignment;
      const index = Math.max(0, splitIds.indexOf(assignment.entryId));
      return {
        ...assignment,
        path: [...assignment.path, `Part ${Math.floor(index / granularity.maxEntries) + 1}`]
      };
    });
  }
  return {
    assignments,
    violations,
    adjustments: uniqueStrings(adjustments),
    ignoredEntryIds: coerced.ignoredEntryIds
  };
}
function applyTreeAssignments(tree, assignments, createdBy) {
  for (const assignment of assignments) {
    if (assignment.path.length) {
      const categoryId = ensureCategoryPath(tree, assignment.path, createdBy);
      assignEntryToTarget(tree, assignment.entryId, { categoryId });
    } else {
      assignEntryToTarget(tree, assignment.entryId, "unassigned");
    }
  }
}
function enforceTopLevelCategoryCap(tree, granularity) {
  const root = getRoot(tree);
  if (!root || root.childIds.length <= granularity.targetTopLevelMax)
    return 0;
  const keptIds = root.childIds.slice(0, granularity.targetTopLevelMax).filter((nodeId) => !!tree.nodes[nodeId]);
  const excessIds = root.childIds.slice(granularity.targetTopLevelMax).filter((nodeId) => !!tree.nodes[nodeId]);
  if (!keptIds.length)
    return 0;
  root.childIds = keptIds;
  for (const [index, nodeId] of excessIds.entries()) {
    const node = tree.nodes[nodeId];
    const parentId = keptIds[index % keptIds.length];
    const parent = tree.nodes[parentId];
    if (!node || !parent)
      continue;
    node.parentId = parentId;
    if (!parent.childIds.includes(nodeId))
      parent.childIds.push(nodeId);
  }
  return excessIds.length;
}
function enforceLeafEntryLimit(tree, granularity, createdBy) {
  const oversizedLeaves = Object.values(tree.nodes).filter((node) => node.id !== tree.rootId && node.childIds.length === 0 && node.entryIds.length > granularity.maxEntries);
  let splitCount = 0;
  for (const node of oversizedLeaves) {
    const entryIds = [...node.entryIds];
    node.entryIds = [];
    for (let index = 0;index < entryIds.length; index += granularity.maxEntries) {
      const label = `Part ${Math.floor(index / granularity.maxEntries) + 1}`;
      const childId = makeNodeId("cat", `${node.label}-${label}`);
      tree.nodes[childId] = makeTreeNode(childId, label, node.id, createdBy);
      tree.nodes[childId].entryIds = entryIds.slice(index, index + granularity.maxEntries);
      node.childIds.push(childId);
    }
    splitCount += 1;
  }
  return splitCount;
}

// src/backend/operations.ts
var CATEGORIZATION_SYSTEM_PROMPT = "You are a categorization assistant. Return only the requested JSON. Do not include commentary, markdown fences, or reasoning text.";
var SUMMARY_SYSTEM_PROMPT = "You are a summarization assistant. Return only the requested JSON. Do not include commentary, markdown fences, or reasoning text.";
function buildAssignmentEntryPayload(entry, detail) {
  const base = {
    entryId: entry.entryId,
    comment: entry.comment
  };
  if (detail === "names") {
    return base;
  }
  const expanded = {
    ...base,
    keys: [...entry.key, ...entry.keysecondary],
    groupName: entry.groupName,
    constant: entry.constant,
    selective: entry.selective
  };
  if (detail === "full") {
    return {
      ...expanded,
      content: entry.content
    };
  }
  return {
    ...expanded,
    preview: truncateText(entry.content, 260)
  };
}
function getCategoryLabelPath(tree, nodeId) {
  const labels = [];
  const visited = new Set;
  let cursor = nodeId;
  while (cursor && cursor !== tree.rootId && !visited.has(cursor)) {
    visited.add(cursor);
    const node = tree.nodes[cursor];
    if (!node)
      break;
    if (node.label.trim())
      labels.push(node.label.trim());
    cursor = node.parentId;
  }
  return labels.reverse();
}
function buildExistingTreeGuidance(tree, granularity, chunkIndex, chunkCount) {
  const root = tree.nodes[tree.rootId];
  const topLevelIds = root?.childIds.filter((nodeId) => !!tree.nodes[nodeId]) ?? [];
  const topLevelLabels = topLevelIds.map((nodeId) => tree.nodes[nodeId].label.trim()).filter(Boolean);
  const remainingTopLevelSlots = Math.max(0, granularity.targetTopLevelMax - topLevelLabels.length);
  const leafSummaries = Object.values(tree.nodes).filter((node) => node.id !== tree.rootId && node.childIds.length === 0).map((node) => ({
    path: getCategoryLabelPath(tree, node.id).join(" > "),
    entryCount: node.entryIds.length
  })).sort((left, right) => right.entryCount - left.entryCount || left.path.localeCompare(right.path)).slice(0, 48);
  const guidance = [
    `This is chunk ${chunkIndex + 1} of ${chunkCount} for one shared final tree. Keep category choices consistent with earlier chunks.`,
    `Final top-level category target for the whole book: ${granularity.targetCategories}. Hard cap: ${granularity.targetTopLevelMax} top-level categories total.`,
    "Do not create or promote one-off character/name labels only to satisfy the numeric target. Root categories must be broad reusable domains."
  ];
  if (topLevelLabels.length > 0) {
    guidance.push(`Existing top-level categories (${topLevelLabels.length}/${granularity.targetTopLevelMax}): ${topLevelLabels.join(" | ")}.`);
    if (remainingTopLevelSlots === 0) {
      guidance.push("Do not create any new top-level categories. Reuse one of the existing top-level categories.");
    } else {
      guidance.push(`Reuse an existing top-level category whenever possible. Only create a new top-level category if none fit, and create at most ${remainingTopLevelSlots} more top-level categor${remainingTopLevelSlots === 1 ? "y" : "ies"}.`);
    }
  } else {
    guidance.push(`No top-level categories exist yet. Start with broad, reusable top-level categories and create no more than ${granularity.targetTopLevelMax} top-level categories in this chunk.`);
  }
  if (leafSummaries.length > 0) {
    guidance.push("Existing leaf categories and current entry counts:");
    guidance.push(...leafSummaries.map((item) => `- ${item.path} [${item.entryCount} entries]`));
    guidance.push(`If an existing leaf category is already near or above ${granularity.maxEntries} entries, create or reuse a sibling subcategory under the same top-level category instead of overfilling that leaf.`);
  }
  guidance.push("Prefer broader reusable categories over one-off niche labels, and avoid near-duplicate top-level categories that overlap with existing ones.");
  return guidance;
}
function ensureCategoryPathFromParent(tree, parentId, labels, createdBy) {
  let currentParentId = parentId;
  for (const rawLabel of labels) {
    const label = rawLabel.trim();
    if (!label)
      continue;
    const parent = tree.nodes[currentParentId];
    if (!parent)
      break;
    const existingId = parent.childIds.find((childId) => tree.nodes[childId]?.label.toLowerCase() === label.toLowerCase());
    if (existingId) {
      currentParentId = existingId;
      continue;
    }
    const nodeId = makeNodeId("cat", label);
    tree.nodes[nodeId] = {
      id: nodeId,
      kind: "category",
      label,
      summary: "",
      parentId: currentParentId,
      childIds: [],
      entryIds: [],
      collapsed: false,
      createdBy
    };
    parent.childIds.push(nodeId);
    currentParentId = nodeId;
  }
  return currentParentId;
}
function collectNodeKeywordHints(tree, nodeId, entries) {
  const entryIds = getDescendantCategoryIds(tree, nodeId, Number.MAX_SAFE_INTEGER).flatMap((currentNodeId) => tree.nodes[currentNodeId]?.entryIds ?? []);
  if (nodeId === tree.rootId) {
    entryIds.push(...tree.unassignedEntryIds);
  }
  const entriesById = new Map(entries.map((entry) => [entry.entryId, entry]));
  return uniqueStrings(uniqueStrings(entryIds).map((entryId) => entriesById.get(entryId)).filter((entry) => !!entry).flatMap((entry) => [...entry.key, ...entry.keysecondary]).map((value) => value.trim()).filter((value) => value && !value.startsWith("[") && value.length <= 32)).slice(0, 8);
}
function appendKeywordHints(summary, keywords) {
  const trimmed = summary.trim();
  if (!trimmed || !keywords.length || /\[Keywords:/i.test(trimmed))
    return trimmed;
  return `${trimmed} [Keywords: ${keywords.join(", ")}]`;
}
function buildRootSummary(tree, bookName) {
  const root = tree.nodes[tree.rootId];
  if (!root)
    return `Top-level index for ${bookName}.`;
  const topLevel = root.childIds.map((childId) => tree.nodes[childId]).filter((node) => !!node);
  if (!topLevel.length) {
    return `Top-level index for ${bookName}.`;
  }
  const labels = topLevel.map((node) => node.label.trim()).filter(Boolean);
  const summarySnippets = topLevel.map((node) => node.summary.trim()).filter(Boolean).slice(0, 4).map((value) => truncateText(value, 90));
  const parts = [`Top-level index for ${bookName}.`];
  if (labels.length) {
    parts.push(`Categories: ${labels.slice(0, 8).join(", ")}${labels.length > 8 ? ` (+${labels.length - 8} more)` : ""}.`);
  }
  if (summarySnippets.length) {
    parts.push(summarySnippets.join(" | "));
  }
  return parts.join(" ");
}
async function subdivideLargeLeafNodes(tree, entries, granularity, settings, userId) {
  const entriesById = new Map(entries.map((entry) => [entry.entryId, entry]));
  for (let pass = 0;pass < 3; pass += 1) {
    const oversizedLeafIds = Object.values(tree.nodes).filter((node) => node.id !== tree.rootId && node.childIds.length === 0 && node.entryIds.length > granularity.maxEntries && node.entryIds.length >= 4).sort((left, right) => right.entryIds.length - left.entryIds.length || left.label.localeCompare(right.label)).map((node) => node.id);
    if (!oversizedLeafIds.length)
      break;
    let subdividedAny = false;
    for (const nodeId of oversizedLeafIds) {
      const node = tree.nodes[nodeId];
      if (!node || node.childIds.length > 0 || node.entryIds.length <= granularity.maxEntries)
        continue;
      const nodeEntries = node.entryIds.map((entryId) => entriesById.get(entryId)).filter((entry) => !!entry);
      if (nodeEntries.length <= granularity.maxEntries)
        continue;
      const prompt = [
        "Split this oversized lore category into smaller sibling subcategories.",
        'Return ONLY JSON in this exact shape: {"assignments":[{"entryId":"...","path":["Subcategory"]}]}',
        `Current category: ${getCategoryLabelPath(tree, nodeId).join(" > ") || node.label}`,
        `Mandatory leaf limit: no returned subcategory should contain more than ${granularity.maxEntries} entries when a split is possible.`,
        "Rules:",
        "- Use short reusable subcategory labels.",
        "- The path should be relative to the current category, not the full tree.",
        "- Create at least 2 useful subcategories when a split is possible.",
        `- If more than ${granularity.maxEntries} entries share a theme, split that theme into narrower numbered or named subgroups.`,
        "- Leave path [] only if an entry truly belongs directly on the current category.",
        "",
        "Entries:",
        ...nodeEntries.map((entry) => JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail)))
      ].join(`
`);
      const controllerResult = await runControllerJson2(prompt, settings, userId, "assignments", "lore_recall_tree_subdivide", ASSIGNMENTS_SCHEMA, {
        systemPrompt: CATEGORIZATION_SYSTEM_PROMPT
      });
      const parsed = controllerResult.parsed ?? normalizeAssignmentsPayload(parseJsonValue(controllerResult.rawContent || controllerResult.rawReasoning));
      if (!parsed || !Array.isArray(parsed.assignments))
        continue;
      const grouped = new Map;
      for (const assignment of parsed.assignments) {
        if (!assignment || typeof assignment !== "object")
          continue;
        const entryId = typeof assignment.entryId === "string" ? assignment.entryId : "";
        const path = Array.isArray(assignment.path) ? assignment.path.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
        if (!entryId || !path.length)
          continue;
        const key = path.join(" > ");
        const list = grouped.get(key) ?? [];
        list.push(entryId);
        grouped.set(key, list);
      }
      if (grouped.size < 2)
        continue;
      for (const assignment of parsed.assignments) {
        if (!assignment || typeof assignment !== "object")
          continue;
        const entryId = typeof assignment.entryId === "string" ? assignment.entryId : "";
        const path = Array.isArray(assignment.path) ? assignment.path.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
        if (!entryId || !path.length)
          continue;
        const categoryId = ensureCategoryPathFromParent(tree, nodeId, path, "llm");
        assignEntryToTarget(tree, entryId, { categoryId });
      }
      subdividedAny = true;
    }
    if (!subdividedAny)
      break;
  }
}

class ControllerJsonError extends Error {
  debugPayload;
  constructor(message, debugPayload) {
    super(message);
    this.name = "ControllerJsonError";
    this.debugPayload = debugPayload;
  }
}
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
function buildControllerDebugPayload(input) {
  return JSON.stringify({
    error: input.error,
    phase: input.phase,
    expectedKey: input.expectedKey,
    bookId: input.bookId ?? null,
    bookName: input.bookName ?? null,
    chunkIndex: input.chunkIndex ?? null,
    chunkTotal: input.chunkTotal ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    connectionId: input.connectionId ?? null,
    finishReason: input.finishReason ?? null,
    toolCallsCount: input.toolCallsCount ?? null,
    usage: input.usage ?? null,
    parsedFrom: input.parsedFrom ?? null,
    reasoningLength: input.reasoningLength ?? null,
    reasoningTextLength: (input.rawReasoning ?? "").length,
    reasoningTraceAvailable: !!input.rawReasoning?.trim(),
    ...getControllerTokenUsage(input.usage ?? null),
    controllerSettings: {
      controllerConnectionId: input.settings.controllerConnectionId,
      controllerTemperature: input.settings.controllerTemperature,
      buildDetail: input.settings.buildDetail,
      treeGranularity: input.settings.treeGranularity,
      chunkTokens: input.settings.chunkTokens,
      dedupMode: input.settings.dedupMode
    },
    promptLength: input.prompt.length,
    responseLength: input.rawContent.length,
    promptPreview: truncateText(input.prompt, 12000),
    responsePreview: truncateText(input.rawContent || "<empty response>", 12000),
    reasoningPreview: truncateText(input.rawReasoning || "<empty reasoning>", 12000),
    entrySample: input.entrySample ?? [],
    capturedAt: Date.now()
  }, null, 2);
}
async function runControllerJson2(prompt, settings, userId, primaryKey, schemaName, schema, options = {}) {
  const result = await runControllerJson(prompt, settings, userId, {
    ...options,
    primaryKey,
    schemaName,
    schema
  });
  if (result.parsed || !primaryKey)
    return result;
  spindle.log.warn(`Lore Recall controller returned unusable ${primaryKey} JSON. Provider=${result.provider ?? "default"} parsedFrom=${result.parsedFrom ?? "none"} content=${result.rawContent.slice(0, 180)} reasoning=${result.rawReasoning.slice(0, 180)}`);
  return result;
}
function normalizeAssignmentsPayload(parsed) {
  const normalized = normalizeArrayPayload(parsed, "assignments");
  if (normalized && Array.isArray(normalized.assignments))
    return normalized;
  const flattenCategories = (categories, parentPath = [], collector = []) => {
    for (const item of categories) {
      if (!item || typeof item !== "object")
        continue;
      const record = item;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const nextPath = label ? [...parentPath, label] : parentPath;
      const entries = Array.isArray(record.entries) ? record.entries.map((value) => typeof value === "string" ? value : value != null ? String(value) : "").map((value) => value.trim()).filter(Boolean) : [];
      for (const entryId of entries) {
        collector.push({ entryId, path: [...nextPath] });
      }
      if (Array.isArray(record.children)) {
        flattenCategories(record.children, nextPath, collector);
      }
    }
    return collector;
  };
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.categories : null;
  if (Array.isArray(source)) {
    return { assignments: flattenCategories(source) };
  }
  const resultSource = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.result : null;
  if (resultSource && typeof resultSource === "object" && Array.isArray(resultSource.categories)) {
    return { assignments: flattenCategories(resultSource.categories) };
  }
  return null;
}
var ASSIGNMENTS_SCHEMA = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entryId: { type: "string" },
          path: { type: "array", items: { type: "string" } }
        },
        required: ["entryId", "path"]
      }
    }
  },
  required: ["assignments"]
};
var CATEGORY_SUMMARIES_SCHEMA = {
  type: "object",
  properties: {
    summaries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          summary: { type: "string" }
        },
        required: ["nodeId", "summary"]
      }
    }
  },
  required: ["summaries"]
};
var ENTRY_SUMMARIES_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entryId: { type: "string" },
          summary: { type: "string" },
          collapsedText: { type: "string" }
        },
        required: ["entryId", "summary", "collapsedText"]
      }
    }
  },
  required: ["entries"]
};
function collectCategorySummaryContext(tree, nodeId, entries) {
  const node = tree.nodes[nodeId];
  if (!node)
    return { childLabels: [], sampleEntries: [] };
  const descendantIds = getDescendantCategoryIds(tree, nodeId, 2);
  const childLabels = uniqueStrings(descendantIds.filter((id) => id !== nodeId).map((id) => tree.nodes[id]?.label).filter((value) => typeof value === "string" && value.trim().length > 0)).slice(0, 8);
  const sampleEntryIds = uniqueStrings(descendantIds.flatMap((id) => tree.nodes[id]?.entryIds ?? [])).slice(0, 8);
  const sampleEntries = sampleEntryIds.map((entryId) => entries.find((entry) => entry.entryId === entryId)).filter((entry) => !!entry);
  return { childLabels, sampleEntries };
}
async function generateCategorySummary(tree, nodeIds, entries, settings, userId) {
  const targets = uniqueStrings(nodeIds).map((nodeId) => ({
    nodeId,
    node: tree.nodes[nodeId],
    context: collectCategorySummaryContext(tree, nodeId, entries)
  })).filter((value) => !!value.node);
  if (!targets.length)
    return {};
  const prompt = [
    "Write short category summaries for these lore branches.",
    'Return ONLY JSON in this exact shape: {"summaries":[{"nodeId":"...","summary":"..."}]}',
    "",
    "Categories:",
    ...targets.map(({ nodeId, node, context }) => JSON.stringify({
      nodeId,
      label: node.label,
      childCategories: context.childLabels,
      entries: context.sampleEntries.map((entry) => ({
        label: entry.label,
        text: truncateText(entry.summary || entry.content, 180)
      }))
    }))
  ].filter(Boolean).join(`
`);
  const controllerResult = await runControllerJson2(prompt, settings, userId, "summaries", "lore_recall_category_summaries", CATEGORY_SUMMARIES_SCHEMA, {
    systemPrompt: SUMMARY_SYSTEM_PROMPT
  });
  const parsed = controllerResult.parsed;
  if (!Array.isArray(parsed?.summaries)) {
    throw new Error("The controller did not return usable category summary JSON.");
  }
  const result = {};
  for (const item of parsed.summaries) {
    if (!item || typeof item !== "object")
      continue;
    const nodeId = typeof item.nodeId === "string" ? item.nodeId : "";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    if (!nodeId || !summary)
      continue;
    result[nodeId] = summary;
  }
  return result;
}
function buildEntrySummaryPrompt(entries) {
  return [
    "Write short retrieval summaries for these lore entries.",
    "For each entry produce a 1 to 2 sentence `summary` (used for ranking) and a 2 to 4 sentence `collapsedText` (the compact body injected during retrieval).",
    'Return ONLY valid JSON in this exact shape: {"entries":[{"entryId":"...","summary":"...","collapsedText":"..."}]}',
    "Do not wrap the JSON in markdown fences. Do not include any explanation before or after the JSON.",
    "Every entry in the input must appear in the output with the same entryId.",
    "",
    "Entries:",
    ...entries.map((entry) => JSON.stringify({
      entryId: entry.entryId,
      label: entry.label,
      comment: entry.comment,
      keys: [...entry.key, ...entry.keysecondary],
      content: truncateText(entry.content, 500)
    }))
  ].join(`
`);
}
async function generateEntrySummaryBatch(entries, settings, userId) {
  if (!entries.length)
    return [];
  const controllerResult = await runControllerJson2(buildEntrySummaryPrompt(entries), settings, userId, "entries", "lore_recall_entry_summaries", ENTRY_SUMMARIES_SCHEMA, {
    systemPrompt: SUMMARY_SYSTEM_PROMPT
  });
  const parsed = controllerResult.parsed;
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error("The controller did not return usable entry summary JSON.");
  }
  return parsed.entries.filter((value) => !!value && typeof value === "object").map((update) => ({
    entryId: typeof update.entryId === "string" ? update.entryId : "",
    summary: typeof update.summary === "string" ? update.summary.trim() : undefined,
    collapsedText: typeof update.collapsedText === "string" ? update.collapsedText.trim() : undefined
  })).filter((update) => !!update.entryId);
}
async function generateEntrySummariesResilient(entries, settings, userId) {
  if (!entries.length)
    return { updates: [], failedEntryIds: [] };
  try {
    const updates = await generateEntrySummaryBatch(entries, settings, userId);
    if (updates.length >= entries.length) {
      return { updates, failedEntryIds: [] };
    }
    if (entries.length === 1) {
      return {
        updates,
        failedEntryIds: updates.length ? [] : [entries[0].entryId]
      };
    }
    const seen = new Set(updates.map((u) => u.entryId));
    const missing = entries.filter((entry) => !seen.has(entry.entryId));
    if (!missing.length)
      return { updates, failedEntryIds: [] };
    const retry = await bisectAndRetry(missing, settings, userId);
    return {
      updates: [...updates, ...retry.updates],
      failedEntryIds: retry.failedEntryIds
    };
  } catch {
    if (entries.length === 1) {
      return { updates: [], failedEntryIds: [entries[0].entryId] };
    }
    return bisectAndRetry(entries, settings, userId);
  }
}
async function bisectAndRetry(entries, settings, userId) {
  const mid = Math.floor(entries.length / 2);
  const left = await generateEntrySummariesResilient(entries.slice(0, mid), settings, userId);
  const right = await generateEntrySummariesResilient(entries.slice(mid), settings, userId);
  return {
    updates: [...left.updates, ...right.updates],
    failedEntryIds: [...left.failedEntryIds, ...right.failedEntryIds]
  };
}
async function updateEntryMeta(entryId, meta, userId) {
  const entry = await spindle.world_books.entries.get(entryId, userId);
  if (!entry)
    throw new Error("That world book entry no longer exists.");
  const config = await loadBookConfig(entry.world_book_id, userId);
  if (!canEditBook(config))
    throw new Error("This book is read-only inside Lore Recall.");
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
function normalizeEntryFlagPatch(patch) {
  const next = {};
  if (typeof patch.disabled === "boolean")
    next.disabled = patch.disabled;
  if (typeof patch.constant === "boolean")
    next.constant = patch.constant;
  if (typeof patch.selective === "boolean")
    next.selective = patch.selective;
  return next;
}
async function patchEntryFlags(entryIds, patch, userId) {
  const normalizedPatch = normalizeEntryFlagPatch(patch);
  const patchKeys = Object.keys(normalizedPatch);
  if (!patchKeys.length)
    return;
  const ids = uniqueStrings(entryIds);
  if (!ids.length)
    return;
  const entries = (await Promise.all(ids.map((entryId) => spindle.world_books.entries.get(entryId, userId).catch(() => null)))).filter((entry) => !!entry);
  if (!entries.length)
    return;
  const configByBookId = new Map;
  for (const entry of entries) {
    if (!configByBookId.has(entry.world_book_id)) {
      configByBookId.set(entry.world_book_id, await loadBookConfig(entry.world_book_id, userId));
    }
    const config = configByBookId.get(entry.world_book_id);
    if (!config || !canEditBook(config)) {
      throw new Error("One or more targeted books are read-only inside Lore Recall.");
    }
  }
  const touchedBookIds = new Set;
  for (const entry of entries) {
    await spindle.world_books.entries.update(entry.id, {
      disabled: normalizedPatch.disabled ?? entry.disabled ?? false,
      constant: normalizedPatch.constant ?? entry.constant ?? false,
      selective: normalizedPatch.selective ?? entry.selective ?? false
    }, userId);
    touchedBookIds.add(entry.world_book_id);
  }
  await Promise.all(Array.from(touchedBookIds).map((bookId) => invalidateBookCache(bookId, userId)));
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
async function buildTreeFromMetadata(bookIds, userId, operation) {
  const issues = [];
  const ids = uniqueStrings(bookIds);
  if (!ids.length) {
    return { issues, completed: 0, total: 0 };
  }
  let completed = 0;
  for (const [index, bookId] of ids.entries()) {
    let bookName = bookId;
    operation?.progress({
      phase: "loading",
      message: `Loading ${bookName}...`,
      current: index + 1,
      total: ids.length,
      percent: Math.round(index / ids.length * 100),
      bookId,
      bookName,
      chunkCurrent: null,
      chunkTotal: null
    });
    try {
      const config = await loadBookConfig(bookId, userId);
      if (!canEditBook(config)) {
        const issue = {
          severity: "warn",
          message: "Skipped because this book is read-only inside Lore Recall.",
          bookId,
          bookName,
          phase: "loading"
        };
        issues.push(issue);
        operation?.addIssue(issue);
        continue;
      }
      const cache = await loadBookCache(bookId, userId);
      if (!cache) {
        const issue = {
          severity: "warn",
          message: "Skipped because this world book no longer exists.",
          bookId,
          bookName,
          phase: "loading"
        };
        issues.push(issue);
        operation?.addIssue(issue);
        continue;
      }
      bookName = cache.name || bookId;
      operation?.progress({
        phase: "classifying",
        message: `Seeding metadata tree for ${bookName}.`,
        current: index + 1,
        total: ids.length,
        percent: Math.round(index / ids.length * 100),
        bookId,
        bookName,
        chunkCurrent: null,
        chunkTotal: null
      });
      const tree = ensureRootCategories(createEmptyTreeIndex(bookId));
      for (const entry of cache.entries) {
        const path = getMetadataCategoryPath(entry);
        if (path.length) {
          const categoryId = ensureCategoryPath(tree, path, "metadata");
          assignEntryToTarget(tree, entry.entryId, { categoryId });
        } else {
          assignEntryToTarget(tree, entry.entryId, "unassigned");
        }
      }
      operation?.progress({
        phase: "saving",
        message: `Saving metadata tree for ${bookName}.`,
        current: index + 1,
        total: ids.length,
        percent: Math.round((index + 0.75) / ids.length * 100),
        bookId,
        bookName,
        chunkCurrent: null,
        chunkTotal: null
      });
      tree.lastBuiltAt = Date.now();
      tree.buildSource = "metadata";
      await saveTreeIndex(bookId, tree, cache.entries.map((entry) => entry.entryId), userId);
      completed += 1;
      operation?.progress({
        phase: "complete",
        message: `Built metadata tree for ${bookName}.`,
        current: index + 1,
        total: ids.length,
        percent: Math.round((index + 1) / ids.length * 100),
        bookId,
        bookName,
        chunkCurrent: null,
        chunkTotal: null
      });
    } catch (error) {
      const issue = {
        severity: "error",
        message: `Metadata build failed: ${describeError(error)}`,
        bookId,
        bookName,
        phase: "saving"
      };
      issues.push(issue);
      operation?.addIssue(issue);
    }
  }
  return {
    issues,
    completed,
    total: ids.length
  };
}
function chunkEntries(items, chunkTokens, measure) {
  const maxChars = Math.max(2000, chunkTokens * 4);
  const maxItems = 12;
  const chunks = [];
  let current = [];
  let currentChars = 0;
  for (const item of items) {
    const size = Math.max(1, measure ? measure(item) : Math.max(item.content.length, item.previewText.length));
    if (current.length && (currentChars + size > maxChars || current.length >= maxItems)) {
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
async function buildTreeWithLlm(bookIds, userId, operation) {
  const settings = await loadGlobalSettings(userId);
  const ids = uniqueStrings(bookIds);
  const issues = [];
  if (!ids.length) {
    return { issues, completed: 0, total: 0 };
  }
  const preparedBooks = [];
  for (const [index, bookId] of ids.entries()) {
    let bookName = bookId;
    operation?.progress({
      phase: "loading",
      message: `Loading ${bookName}...`,
      current: index + 1,
      total: ids.length,
      percent: null,
      bookId,
      bookName,
      chunkCurrent: null,
      chunkTotal: null
    });
    try {
      const config = await loadBookConfig(bookId, userId);
      if (!canEditBook(config)) {
        const issue = {
          severity: "warn",
          message: "Skipped because this book is read-only inside Lore Recall.",
          bookId,
          bookName,
          phase: "loading"
        };
        issues.push(issue);
        operation?.addIssue(issue);
        continue;
      }
      const cache = await loadBookCache(bookId, userId);
      if (!cache) {
        const issue = {
          severity: "warn",
          message: "Skipped because this world book no longer exists.",
          bookId,
          bookName,
          phase: "loading"
        };
        issues.push(issue);
        operation?.addIssue(issue);
        continue;
      }
      bookName = cache.name || bookId;
      if (!cache.entries.length) {
        const issue = {
          severity: "warn",
          message: "Skipped because this book has no entries to build from.",
          bookId,
          bookName,
          phase: "loading"
        };
        issues.push(issue);
        operation?.addIssue(issue);
        continue;
      }
      preparedBooks.push({
        bookId,
        bookName,
        cache,
        chunkCount: Math.max(1, chunkEntries(cache.entries, settings.chunkTokens, (entry) => JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail)).length).length),
        entrySummaryBatchCount: Math.max(1, Math.ceil(cache.entries.length / 8)),
        originalIndex: index
      });
    } catch (error) {
      const issue = {
        severity: "error",
        message: `Failed to prepare this book: ${describeError(error)}`,
        bookId,
        bookName,
        phase: "loading"
      };
      issues.push(issue);
      operation?.addIssue(issue);
    }
  }
  const totalUnits = preparedBooks.reduce((sum, book) => sum + book.chunkCount + book.entrySummaryBatchCount + 2, 0);
  let completedUnits = 0;
  let completedBooks = 0;
  for (const book of preparedBooks) {
    const { bookId, bookName, cache, chunkCount, originalIndex } = book;
    try {
      const tree = ensureRootCategories(createEmptyTreeIndex(bookId));
      const updates = [];
      const chunks = chunkEntries(cache.entries, settings.chunkTokens, (entry) => JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail)).length);
      const granularity = {
        ...getEffectiveTreeGranularity(settings.treeGranularity, cache.entries.length),
        targetTopLevelMin: 7,
        targetTopLevelMax: 7,
        targetCategories: "7 fixed roots"
      };
      const allEntryManifest = chunks.length > 1 ? cache.entries.map((entry) => truncateText(entry.label || entry.comment || entry.entryId, 80)).filter(Boolean).join(`
- `) : "";
      const entrySummaryBatchSize = 8;
      const entrySummaryBatches = Array.from({ length: Math.ceil(cache.entries.length / entrySummaryBatchSize) }, (_, index) => cache.entries.slice(index * entrySummaryBatchSize, (index + 1) * entrySummaryBatchSize)).filter((batch) => batch.length > 0);
      const addGranularityIssue = (message, phase) => {
        const issue = {
          severity: "warn",
          message,
          bookId,
          bookName,
          phase
        };
        issues.push(issue);
        operation?.addIssue(issue);
      };
      for (const [chunkIndex, chunk] of chunks.entries()) {
        operation?.progress({
          phase: "controller",
          message: `Analyzing ${bookName} chunk ${chunkIndex + 1} of ${chunkCount}.`,
          current: originalIndex + 1,
          total: ids.length,
          percent: totalUnits ? Math.round(completedUnits / totalUnits * 100) : null,
          bookId,
          bookName,
          chunkCurrent: chunkIndex + 1,
          chunkTotal: chunkCount
        });
        const validEntryIds = new Set(chunk.map((entry) => entry.entryId));
        const buildPrompt = (violations) => [
          "Organize these lore entries into a compact retrieval tree.",
          'Return ONLY JSON in this exact shape: {"assignments":[{"entryId":"...","path":["Category","Subcategory"]}]}',
          `Build detail: ${getBuildDetailLabel(settings.buildDetail)}. ${getBuildDetailDescription(settings.buildDetail)}`,
          `Tree granularity: ${granularity.label}${granularity.isAuto ? " (auto)" : ""}. This is mandatory, not optional.`,
          "Hard granularity constraints:",
          `- Every path MUST begin with exactly one fixed root: ${ROOT_CATEGORIES.join(", ")}.`,
          "- Place uncertain entries under Other. Create nested branches only below these roots.",
          `- Leaf categories must stay at or below ${granularity.maxEntries} entries whenever a split is possible.`,
          "- Reuse existing top-level categories before creating new ones.",
          "- If a category would exceed the leaf limit, create or reuse subcategories instead of overfilling it.",
          ...buildExistingTreeGuidance(tree, granularity, chunkIndex, chunkCount),
          ...violations.length ? [
            "The previous output violated these non-optional granularity constraints. Correct them in the new JSON:",
            ...violations.map((violation) => `- ${violation}`)
          ] : [],
          ...chunkIndex === 0 && allEntryManifest ? [
            `This book has ${cache.entries.length} total entries across ${chunkCount} chunks. Design the category structure to accommodate the whole book, not just this chunk.`,
            "All entry names in the book:",
            `- ${allEntryManifest}`
          ] : [],
          "Use empty path [] when an entry should stay unassigned.",
          "",
          "Entries:",
          ...chunk.map((entry) => JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail)))
        ].join(`
`);
        let assignmentValues = [];
        let retryViolations = [];
        let retriedForGranularity = false;
        for (let attempt = 0;attempt < 2; attempt += 1) {
          const prompt = buildPrompt(retryViolations);
          const controllerResult = await runControllerJson2(prompt, settings, userId, "assignments", "lore_recall_tree_assignments", ASSIGNMENTS_SCHEMA, {
            systemPrompt: CATEGORIZATION_SYSTEM_PROMPT
          });
          const parsed = controllerResult.parsed ?? normalizeAssignmentsPayload(parseJsonValue(controllerResult.rawContent || controllerResult.rawReasoning));
          if (!parsed || !Array.isArray(parsed.assignments)) {
            throw new ControllerJsonError(`The controller did not return usable assignment JSON for chunk ${chunkIndex + 1}.`, buildControllerDebugPayload({
              phase: "build_tree_with_llm.assignments",
              expectedKey: "assignments",
              error: `The controller did not return usable assignment JSON for chunk ${chunkIndex + 1}.`,
              bookId,
              bookName,
              chunkIndex: chunkIndex + 1,
              chunkTotal: chunkCount,
              provider: controllerResult.provider,
              model: controllerResult.model,
              connectionId: controllerResult.connectionId,
              finishReason: controllerResult.finishReason,
              toolCallsCount: controllerResult.toolCallsCount,
              usage: controllerResult.usage,
              parsedFrom: controllerResult.parsedFrom,
              reasoningLength: controllerResult.rawReasoning.length,
              settings,
              prompt,
              rawContent: controllerResult.rawContent,
              rawReasoning: controllerResult.rawReasoning,
              entrySample: chunk.slice(0, 12).map((entry) => ({
                entryId: entry.entryId,
                label: entry.label
              }))
            }));
          }
          assignmentValues = parsed.assignments;
          const check = normalizeTreeAssignmentsForGranularity(tree, assignmentValues, validEntryIds, granularity);
          if (attempt === 0 && check.violations.length) {
            retryViolations = check.violations;
            retriedForGranularity = true;
            continue;
          }
          break;
        }
        if (retriedForGranularity) {
          addGranularityIssue(`Retried ${bookName} chunk ${chunkIndex + 1} because the controller violated tree granularity constraints.`, "build_tree_with_llm.granularity_retry");
        }
        const normalized = normalizeTreeAssignmentsForGranularity(tree, assignmentValues, validEntryIds, granularity);
        if (normalized.violations.length || normalized.adjustments.length) {
          addGranularityIssue(`Adjusted ${bookName} chunk ${chunkIndex + 1} to enforce ${granularity.label}${granularity.isAuto ? " (auto)" : ""} granularity.`, "build_tree_with_llm.granularity_normalize");
        }
        applyTreeAssignments(tree, normalized.assignments, "llm");
        completedUnits += 1;
      }
      await subdivideLargeLeafNodes(tree, cache.entries, granularity, settings, userId);
      const movedTopLevelCategories = enforceTopLevelCategoryCap(tree, granularity);
      if (movedTopLevelCategories > 0) {
        addGranularityIssue(`Moved ${movedTopLevelCategories} top-level categor${movedTopLevelCategories === 1 ? "y" : "ies"} under existing categories to enforce the ${granularity.targetTopLevelMax} category cap.`, "build_tree_with_llm.granularity_cap");
      }
      const splitLeafCategories = enforceLeafEntryLimit(tree, granularity, "system");
      if (splitLeafCategories > 0) {
        addGranularityIssue(`Split ${splitLeafCategories} oversized leaf categor${splitLeafCategories === 1 ? "y" : "ies"} into numbered subgroups to enforce the ${granularity.maxEntries} entries-per-leaf limit.`, "build_tree_with_llm.granularity_split");
      }
      const categoryNodeIds = Object.keys(tree.nodes).filter((nodeId) => {
        if (nodeId === tree.rootId)
          return false;
        const node = tree.nodes[nodeId];
        return !!node && (node.entryIds.length > 0 || node.childIds.length > 0);
      });
      const categoryBatchSize = 6;
      const categoryBatches = Array.from({ length: Math.ceil(categoryNodeIds.length / categoryBatchSize) }, (_, index) => categoryNodeIds.slice(index * categoryBatchSize, (index + 1) * categoryBatchSize)).filter((batch) => batch.length > 0);
      for (const [batchIndex, nodeBatch] of categoryBatches.entries()) {
        operation?.progress({
          phase: "category_controller",
          message: `Generating category summaries batch ${batchIndex + 1} of ${categoryBatches.length} for ${bookName}.`,
          current: originalIndex + 1,
          total: ids.length,
          percent: null,
          bookId,
          bookName,
          chunkCurrent: batchIndex + 1,
          chunkTotal: categoryBatches.length
        });
        try {
          const summaries = await generateCategorySummary(tree, nodeBatch, cache.entries, settings, userId);
          for (const nodeId of nodeBatch) {
            const node = tree.nodes[nodeId];
            if (!node)
              continue;
            const summary = summaries[nodeId];
            if (summary) {
              node.summary = appendKeywordHints(summary, collectNodeKeywordHints(tree, nodeId, cache.entries));
              continue;
            }
            const issue = {
              severity: "warn",
              message: `No category summary was returned for ${node.label}.`,
              bookId,
              bookName,
              phase: "category_controller"
            };
            issues.push(issue);
            operation?.addIssue(issue);
          }
        } catch (error) {
          for (const nodeId of nodeBatch) {
            const node = tree.nodes[nodeId];
            const issue = {
              severity: "error",
              message: `Category summary generation failed for ${node?.label ?? nodeId}: ${describeError(error)}`,
              bookId,
              bookName,
              phase: "category_controller"
            };
            issues.push(issue);
            operation?.addIssue(issue);
          }
        }
      }
      operation?.progress({
        phase: "saving_tree",
        message: `Saving tree for ${bookName}.`,
        current: originalIndex + 1,
        total: ids.length,
        percent: totalUnits ? Math.round(completedUnits / totalUnits * 100) : null,
        bookId,
        bookName,
        chunkCurrent: chunkCount,
        chunkTotal: chunkCount
      });
      for (const entry of cache.entries) {
        const assigned = tree.unassignedEntryIds.includes(entry.entryId) || Object.values(tree.nodes).some((node) => node.entryIds.includes(entry.entryId));
        if (!assigned)
          assignEntryToTarget(tree, entry.entryId, "unassigned");
      }
      tree.nodes[tree.rootId].summary = appendKeywordHints(buildRootSummary(tree, bookName), collectNodeKeywordHints(tree, tree.rootId, cache.entries));
      tree.lastBuiltAt = Date.now();
      tree.buildSource = "llm";
      await saveTreeIndex(bookId, tree, cache.entries.map((entry) => entry.entryId), userId);
      completedUnits += 1;
      for (const [batchIndex, entryBatch] of entrySummaryBatches.entries()) {
        operation?.progress({
          phase: "entry_controller",
          message: `Generating entry summaries batch ${batchIndex + 1} of ${entrySummaryBatches.length} for ${bookName}.`,
          current: originalIndex + 1,
          total: ids.length,
          percent: totalUnits ? Math.round(completedUnits / totalUnits * 100) : null,
          bookId,
          bookName,
          chunkCurrent: batchIndex + 1,
          chunkTotal: entrySummaryBatches.length
        });
        try {
          const result = await generateEntrySummariesResilient(entryBatch, settings, userId);
          updates.push(...result.updates);
          if (result.failedEntryIds.length) {
            const issue = {
              severity: "warn",
              message: `Entry summary batch ${batchIndex + 1} for ${bookName}: ${result.failedEntryIds.length} of ${entryBatch.length} entries returned unusable JSON after retries.`,
              bookId,
              bookName,
              phase: "entry_controller"
            };
            issues.push(issue);
            operation?.addIssue(issue);
          }
        } catch (error) {
          const issue = {
            severity: "warn",
            message: `Entry summary batch ${batchIndex + 1} failed for ${bookName}: ${describeError(error)}`,
            bookId,
            bookName,
            phase: "entry_controller"
          };
          issues.push(issue);
          operation?.addIssue(issue);
        }
      }
      operation?.progress({
        phase: "writing_summaries",
        message: `Writing summaries for ${bookName}.`,
        current: originalIndex + 1,
        total: ids.length,
        percent: totalUnits ? Math.round(completedUnits / totalUnits * 100) : null,
        bookId,
        bookName,
        chunkCurrent: chunkCount,
        chunkTotal: chunkCount
      });
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
      completedUnits += 1;
      completedBooks += 1;
      operation?.progress({
        phase: "complete",
        message: `Finished LLM tree build for ${bookName}.`,
        current: originalIndex + 1,
        total: ids.length,
        percent: totalUnits ? Math.round(completedUnits / totalUnits * 100) : 100,
        bookId,
        bookName,
        chunkCurrent: chunkCount,
        chunkTotal: chunkCount
      });
    } catch (error) {
      const issue = {
        severity: "error",
        message: `LLM tree build failed: ${describeError(error)}`,
        bookId,
        bookName,
        phase: "controller",
        debugPayload: error instanceof ControllerJsonError ? error.debugPayload : null
      };
      issues.push(issue);
      operation?.addIssue(issue);
    }
  }
  return {
    issues,
    completed: completedBooks,
    total: ids.length
  };
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
  if (node.parentId === loaded.tree.rootId && typeof patch.label === "string" && patch.label !== node.label) {
    throw new Error("Top-level category names are fixed.");
  }
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
  if (nextParentId === ROOT_NODE_ID)
    throw new Error("Create nested categories under one of the seven fixed roots.");
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
  if (loaded.tree.nodes[nodeId].parentId === loaded.tree.rootId)
    throw new Error("Top-level categories cannot be moved.");
  if (!parentId || parentId === loaded.tree.rootId)
    throw new Error("Nested categories must stay under a fixed root.");
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
  if (loaded.tree.nodes[nodeId].parentId === loaded.tree.rootId)
    throw new Error("Top-level categories cannot be deleted.");
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
async function regenerateSummaries(bookId, entryIds, nodeIds, userId, operation) {
  const settings = await loadGlobalSettings(userId);
  const cache = await loadBookCache(bookId, userId);
  if (!cache)
    throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  const bookName = cache.name || bookId;
  const targetEntries = ((entryIds?.length) ? cache.entries.filter((entry) => entryIds.includes(entry.entryId)) : cache.entries.filter((entry) => !entry.summary.trim() || !entry.collapsedText.trim())).slice(0, 24);
  const targetNodeIds = uniqueStrings(nodeIds ?? []).filter((id) => loaded.tree.nodes[id] && id !== loaded.tree.rootId).slice(0, 16);
  const totalTargets = targetEntries.length + targetNodeIds.length;
  let completed = 0;
  const issues = [];
  if (!totalTargets) {
    return { issues, completed: 0, total: 0 };
  }
  if (targetEntries.length) {
    operation?.progress({
      phase: "controller",
      message: `Generating entry summaries for ${bookName}.`,
      current: 0,
      total: totalTargets,
      percent: 0,
      bookId,
      bookName,
      chunkCurrent: 1,
      chunkTotal: 1
    });
    try {
      const result = await generateEntrySummariesResilient(targetEntries, settings, userId);
      const updates = result.updates;
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
      completed += targetEntries.length;
      const successCount = targetEntries.length - result.failedEntryIds.length;
      operation?.progress({
        phase: "entries_complete",
        message: `Updated ${successCount} entry summary${successCount === 1 ? "" : "ies"} for ${bookName}${result.failedEntryIds.length ? ` (${result.failedEntryIds.length} failed after retries)` : ""}.`,
        current: completed,
        total: totalTargets,
        percent: Math.round(completed / totalTargets * 100),
        bookId,
        bookName,
        chunkCurrent: 1,
        chunkTotal: 1
      });
      if (result.failedEntryIds.length) {
        const issue = {
          severity: "warn",
          message: `${result.failedEntryIds.length} of ${targetEntries.length} entries returned unusable JSON after retries.`,
          bookId,
          bookName,
          phase: "controller"
        };
        issues.push(issue);
        operation?.addIssue(issue);
      }
    } catch (error) {
      const issue = {
        severity: "error",
        message: `Entry summary regeneration failed: ${describeError(error)}`,
        bookId,
        bookName,
        phase: "controller"
      };
      issues.push(issue);
      operation?.addIssue(issue);
    }
  }
  const categoryBatchSize = 6;
  const nodeBatches = Array.from({ length: Math.ceil(targetNodeIds.length / categoryBatchSize) }, (_, index) => targetNodeIds.slice(index * categoryBatchSize, (index + 1) * categoryBatchSize)).filter((batch) => batch.length > 0);
  for (const [batchIndex, nodeBatch] of nodeBatches.entries()) {
    const firstNode = loaded.tree.nodes[nodeBatch[0]];
    operation?.progress({
      phase: "category_controller",
      message: `Generating category summaries batch ${batchIndex + 1} of ${nodeBatches.length} in ${bookName}.`,
      current: completed,
      total: totalTargets,
      percent: Math.round(completed / totalTargets * 100),
      bookId,
      bookName,
      chunkCurrent: batchIndex + 1,
      chunkTotal: nodeBatches.length
    });
    try {
      const summaries = await generateCategorySummary(loaded.tree, nodeBatch, cache.entries, settings, userId);
      for (const nodeId of nodeBatch) {
        const node = loaded.tree.nodes[nodeId];
        if (!node)
          continue;
        const summary = summaries[nodeId];
        if (summary) {
          node.summary = appendKeywordHints(summary, collectNodeKeywordHints(loaded.tree, nodeId, cache.entries));
          completed += 1;
          continue;
        }
        const issue = {
          severity: "warn",
          message: `No category summary was returned for ${node.label}.`,
          bookId,
          bookName,
          phase: "category_controller"
        };
        issues.push(issue);
        operation?.addIssue(issue);
      }
      operation?.progress({
        phase: "category_complete",
        message: `Updated category summaries for ${firstNode?.label ?? bookName}.`,
        current: completed,
        total: totalTargets,
        percent: Math.round(completed / totalTargets * 100),
        bookId,
        bookName,
        chunkCurrent: batchIndex + 1,
        chunkTotal: nodeBatches.length
      });
    } catch (error) {
      for (const nodeId of nodeBatch) {
        const node = loaded.tree.nodes[nodeId];
        const issue = {
          severity: "error",
          message: `Category summary regeneration failed for ${node?.label ?? nodeId}: ${describeError(error)}`,
          bookId,
          bookName,
          phase: "category_controller"
        };
        issues.push(issue);
        operation?.addIssue(issue);
      }
    }
  }
  if (targetNodeIds.length) {
    loaded.tree.nodes[loaded.tree.rootId].summary = appendKeywordHints(buildRootSummary(loaded.tree, bookName), collectNodeKeywordHints(loaded.tree, loaded.tree.rootId, cache.entries));
    loaded.tree.lastBuiltAt = Date.now();
    loaded.tree.buildSource = "manual";
    await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
  }
  return {
    issues,
    completed,
    total: totalTargets
  };
}
function buildDiagnostics(runtimeBooks, staleIssues, settings, characterConfig, availableConnections = []) {
  const diagnostics = [];
  const multiBookMode = !!characterConfig && runtimeBooks.length > 1;
  const readableBooks = runtimeBooks.filter((book) => book.config.enabled && book.config.permission !== "write_only");
  if (!readableBooks.length && runtimeBooks.length) {
    diagnostics.push({
      id: "no-readable-books",
      severity: "warn",
      bookId: null,
      title: "No attached books available to Recall",
      detail: "Attached books are disabled or write-only in Lore Recall, so Lumiverse will activate them natively."
    });
  }
  if (settings?.controllerConnectionId?.trim()) {
    const expectedId = settings.controllerConnectionId.trim();
    if (!availableConnections.some((connection) => connection.id === expectedId)) {
      diagnostics.push({
        id: "controller-connection-missing",
        severity: "warn",
        bookId: null,
        title: "Configured controller connection is missing",
        detail: "The controller connection selected in Lore Recall settings is no longer available, so controller-guided retrieval may silently fall back."
      });
    }
  } else if (!availableConnections.length && runtimeBooks.length) {
    diagnostics.push({
      id: "controller-unavailable",
      severity: "warn",
      bookId: null,
      title: "No controller connections are available",
      detail: "No connection profiles are currently available for controller-guided retrieval, tree building, or summary generation."
    });
  }
  for (const book of runtimeBooks) {
    const issues = staleIssues[book.summary.id];
    const categoryNodes = Object.values(book.tree.nodes).filter((node) => node.id !== book.tree.rootId);
    const categorySummaryCount = categoryNodes.filter((node) => node.summary.trim()).length;
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
        title: "Book excluded from Recall",
        detail: `${book.summary.name} is disabled in Lore Recall. Lumiverse will use native activation for this attached book.`
      });
    }
    if (book.config.permission === "write_only") {
      diagnostics.push({
        id: `writeonly:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Book excluded from Recall",
        detail: `${book.summary.name} is write-only in Lore Recall. Lumiverse will use native activation for this attached book.`
      });
    }
    const missingSummaryCount = book.cache.entries.filter((entry) => !entry.summary.trim()).length;
    if (missingSummaryCount) {
      diagnostics.push({
        id: `coverage:${book.summary.id}`,
        severity: "info",
        bookId: book.summary.id,
        title: "Book metadata is incomplete",
        detail: `${book.summary.name} has ${missingSummaryCount} entry summary gap(s). Entry previews still let the model review them.`
      });
    }
    if (categoryNodes.length && categorySummaryCount < categoryNodes.length) {
      diagnostics.push({
        id: `category-summary:${book.summary.id}`,
        severity: categorySummaryCount === 0 ? "warn" : "info",
        bookId: book.summary.id,
        title: "Category summary coverage is incomplete",
        detail: `${book.summary.name} has ${categorySummaryCount}/${categoryNodes.length} category summaries. Summaries help people browse the tree.`
      });
    }
  }
  return diagnostics;
}
async function exportSnapshot(userId, operation) {
  operation?.progress({
    phase: "loading",
    message: "Collecting Lore Recall settings, trees, and metadata for export.",
    current: 0,
    total: 1,
    percent: 0,
    chunkCurrent: null,
    chunkTotal: null
  });
  const [globalSettings, characters, characterFiles, bookFiles, treeFiles, books] = await Promise.all([
    loadGlobalSettings(userId),
    listAllCharacters(userId),
    spindle.userStorage.list(`${CHARACTER_CONFIG_DIR}/`, userId).catch(() => []),
    spindle.userStorage.list(`${BOOK_CONFIG_DIR}/`, userId).catch(() => []),
    spindle.userStorage.list(`${TREE_DIR}/`, userId).catch(() => []),
    listAllWorldBooks(userId)
  ]);
  const legacyCharacterIds = new Set(characterFiles.filter((file) => file.endsWith(".json")).map((path) => path.split("/").pop()?.replace(/\.json$/i, "") ?? "").filter(Boolean));
  const characterConfigs = {};
  for (const character of characters) {
    if (!characterHasStoredConfig(character) && !legacyCharacterIds.has(character.id))
      continue;
    characterConfigs[character.id] = await loadCharacterConfig(character.id, userId, character);
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
  const snapshot = {
    version: 2,
    exportedAt: Date.now(),
    globalSettings,
    characterConfigs,
    bookConfigs,
    treeIndexes,
    entryMeta
  };
  operation?.progress({
    phase: "complete",
    message: "Lore Recall snapshot is ready to download.",
    current: 1,
    total: 1,
    percent: 100,
    chunkCurrent: null,
    chunkTotal: null
  });
  return {
    value: snapshot,
    issues: [],
    completed: 1,
    total: 1
  };
}
async function importSnapshot(snapshot, userId, operation) {
  const totalSteps = 1 + Object.keys(snapshot.characterConfigs ?? {}).length + Object.keys(snapshot.bookConfigs ?? {}).length + Object.keys(snapshot.treeIndexes ?? {}).length + Object.keys(snapshot.entryMeta ?? {}).reduce((sum, bookId) => sum + Object.keys(snapshot.entryMeta?.[bookId] ?? {}).length, 0);
  let completed = 0;
  const issues = [];
  operation?.progress({
    phase: "global_settings",
    message: "Importing Lore Recall global settings.",
    current: completed,
    total: totalSteps,
    percent: totalSteps ? 0 : 100,
    chunkCurrent: null,
    chunkTotal: null
  });
  await saveGlobalSettings(snapshot.globalSettings, userId);
  completed += 1;
  for (const [characterId, config] of Object.entries(snapshot.characterConfigs ?? {})) {
    operation?.progress({
      phase: "character_configs",
      message: `Importing character settings for ${characterId}.`,
      current: completed,
      total: totalSteps,
      percent: totalSteps ? Math.round(completed / totalSteps * 100) : 100,
      chunkCurrent: null,
      chunkTotal: null
    });
    const character = await spindle.characters.get(characterId, userId);
    if (!character) {
      const issue = {
        severity: "warn",
        message: `Skipped character settings for missing character ${characterId}.`,
        phase: "character_configs"
      };
      issues.push(issue);
      operation?.addIssue(issue);
      completed += 1;
      continue;
    }
    await saveCharacterConfig(characterId, config, userId, character);
    completed += 1;
  }
  for (const [bookId, config] of Object.entries(snapshot.bookConfigs ?? {})) {
    operation?.progress({
      phase: "book_configs",
      message: `Importing settings for ${bookId}.`,
      current: completed,
      total: totalSteps,
      percent: totalSteps ? Math.round(completed / totalSteps * 100) : 100,
      bookId,
      bookName: bookId,
      chunkCurrent: null,
      chunkTotal: null
    });
    await spindle.userStorage.setJson(getBookConfigPath(bookId), config, { indent: 2, userId });
    completed += 1;
  }
  for (const [bookId, tree] of Object.entries(snapshot.treeIndexes ?? {})) {
    operation?.progress({
      phase: "trees",
      message: `Importing tree index for ${bookId}.`,
      current: completed,
      total: totalSteps,
      percent: totalSteps ? Math.round(completed / totalSteps * 100) : 100,
      bookId,
      bookName: bookId,
      chunkCurrent: null,
      chunkTotal: null
    });
    const cache = await loadBookCache(bookId, userId);
    if (!cache)
      continue;
    await spindle.userStorage.setJson(getTreePath(bookId), ensureTreeIndexShape(tree, bookId, cache.entries.map((entry) => entry.entryId)), { indent: 2, userId });
    completed += 1;
  }
  for (const [bookId, perBook] of Object.entries(snapshot.entryMeta ?? {})) {
    for (const [entryId, meta] of Object.entries(perBook)) {
      operation?.progress({
        phase: "entry_metadata",
        message: `Importing entry metadata for ${bookId}.`,
        current: completed,
        total: totalSteps,
        percent: totalSteps ? Math.round(completed / totalSteps * 100) : 100,
        bookId,
        bookName: bookId,
        chunkCurrent: null,
        chunkTotal: null
      });
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
      completed += 1;
    }
    await invalidateBookCache(bookId, userId);
  }
  operation?.progress({
    phase: "complete",
    message: "Lore Recall snapshot import finished.",
    current: completed,
    total: totalSteps,
    percent: 100,
    chunkCurrent: null,
    chunkTotal: null
  });
  return {
    issues,
    completed,
    total: totalSteps
  };
}
async function applySuggestedBooks(characterId, bookIds, mode, userId) {
  const current = await loadCharacterConfig(characterId, userId);
  const managedBookIds = mode === "replace" ? uniqueStrings(bookIds) : uniqueStrings([...current.managedBookIds, ...bookIds]);
  await saveCharacterConfig(characterId, { managedBookIds }, userId);
}

// src/backend/index.ts
var CONNECTION_CACHE_TTL_MS = 5000;
var RETRIEVAL_FEED_SESSION_LIMIT = 25;
var RETRIEVAL_FEED_PUSH_DELAY_MS = 180;
var connectionCache = new Map;
var latestStateSequence = new Map;
var previewCache = new Map;
var retrievalFeedCache = new Map;
var scheduledStatePushes = new Map;
var dynamicFeedbackByChat = new Map;
var preparedRecallRuns = new RecallRunStore;
var DYNAMIC_FEEDBACK_RECENT_WINDOW = 3;
async function resolveActiveChat(userId, chatId) {
  if (chatId)
    return spindle.chats.get(chatId, userId);
  return spindle.chats.getActive(userId);
}
async function getTurnAttachmentScopes(chat, userId, selectedPersonaId, activeCharacter, strict = true) {
  const sourceCharacters = await Promise.all(attachedCharacterIds(chat.character_id, chat.metadata ?? {}).map((id) => id === activeCharacter?.id ? Promise.resolve(activeCharacter) : spindle.characters.get(id, userId).catch((error) => {
    if (strict)
      throw error;
    return null;
  })));
  const globalBooksApi = spindle.world_books;
  if (typeof globalBooksApi.getGlobal !== "function" && strict)
    throw new Error("Global lorebook attachments are unavailable.");
  const [globalBookIds, activePersona] = await Promise.all([
    globalBooksApi.getGlobal?.(userId).catch((error) => {
      if (strict)
        throw error;
      return [];
    }) ?? Promise.resolve([]),
    (selectedPersonaId ? spindle.personas.get(selectedPersonaId, userId) : spindle.personas.getActive(userId)).catch((error) => {
      if (strict)
        throw error;
      return null;
    })
  ]);
  const persona = chat.metadata?.temporary === true ? null : activePersona ?? await spindle.personas.getDefault(userId).catch((error) => {
    if (strict)
      throw error;
    return null;
  });
  const chatBookIds = chat.metadata?.chat_world_book_ids;
  return mapAttachedBookScopes({
    character: sourceCharacters.flatMap((source) => source?.world_book_ids ?? []),
    persona: persona?.attached_world_book_id,
    chat: Array.isArray(chatBookIds) ? chatBookIds.filter((id) => typeof id === "string") : [],
    global: globalBookIds
  });
}
async function listConnectionsCached(userId) {
  const cached = connectionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.connections;
  }
  const connections = await spindle.connections.list(userId).catch(() => []);
  connectionCache.set(userId, {
    expiresAt: Date.now() + CONNECTION_CACHE_TTL_MS,
    connections
  });
  return connections;
}
function getPreviewCacheKey(userId, chatId) {
  return `${userId}:${chatId}`;
}
function getDynamicFeedbackState(cacheKey) {
  const existing = dynamicFeedbackByChat.get(cacheKey);
  if (existing)
    return existing;
  const created = {
    pending: [],
    entries: {},
    recentInjectionEntryIds: []
  };
  dynamicFeedbackByChat.set(cacheKey, created);
  return created;
}
function normalizeFeedbackText(value) {
  return value.toLowerCase().replace(/[\u2019']/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function feedbackTextIncludes(normalizedText, phrase) {
  const normalizedPhrase = normalizeFeedbackText(phrase);
  if (normalizedPhrase.length < 3)
    return false;
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}
function feedbackRecordReferenced(record, normalizedAssistantText) {
  if (feedbackTextIncludes(normalizedAssistantText, record.label))
    return true;
  if (record.aliases.some((alias) => feedbackTextIncludes(normalizedAssistantText, alias)))
    return true;
  const keyHits = record.keys.filter((key) => feedbackTextIncludes(normalizedAssistantText, key));
  if (keyHits.some((key) => normalizeFeedbackText(key).length >= 4))
    return true;
  return keyHits.length >= 2;
}
function getPriorAssistantResponse(messages) {
  for (let index = messages.length - 1;index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && typeof message.content === "string" && message.content.trim()) {
      return message.content;
    }
  }
  return "";
}
function processPendingDynamicFeedback(cacheKey, messages) {
  const state = getDynamicFeedbackState(cacheKey);
  if (!state.pending.length)
    return;
  const assistantText = normalizeFeedbackText(getPriorAssistantResponse(messages));
  if (!assistantText)
    return;
  const now = Date.now();
  for (const record of state.pending) {
    const previous = state.entries[record.entryId] ?? {
      injections: 0,
      references: 0,
      missStreak: 0,
      lastReferenced: 0,
      recentInjectionCount: 0
    };
    const referenced = feedbackRecordReferenced(record, assistantText);
    state.entries[record.entryId] = {
      ...previous,
      injections: previous.injections + 1,
      references: previous.references + (referenced ? 1 : 0),
      missStreak: referenced ? 0 : previous.missStreak + 1,
      lastReferenced: referenced ? now : previous.lastReferenced
    };
  }
  state.pending = [];
}
function buildDynamicFeedbackSnapshot(cacheKey) {
  const state = getDynamicFeedbackState(cacheKey);
  const recentCounts = new Map;
  for (const batch of state.recentInjectionEntryIds) {
    for (const entryId of batch) {
      recentCounts.set(entryId, (recentCounts.get(entryId) ?? 0) + 1);
    }
  }
  return {
    entries: Object.fromEntries(Object.entries(state.entries).map(([entryId, data]) => [
      entryId,
      {
        ...data,
        recentInjectionCount: recentCounts.get(entryId) ?? 0
      }
    ]))
  };
}
function findRuntimeEntry(runtimeBooks, entryId) {
  for (const book of runtimeBooks) {
    const entry = book.cache.entries.find((item) => item.entryId === entryId);
    if (entry)
      return entry;
  }
  return null;
}
function recordDynamicInjection(cacheKey, preview, runtimeBooks) {
  const state = getDynamicFeedbackState(cacheKey);
  const dynamicIds = [...new Set((preview?.manifestSelectedEntries ?? []).map((entry) => entry.entryId))];
  state.pending = dynamicIds.map((entryId) => {
    const entry = findRuntimeEntry(runtimeBooks, entryId);
    if (!entry || entry.constant)
      return null;
    return {
      entryId,
      label: entry.label,
      aliases: [...entry.aliases],
      keys: [...entry.key, ...entry.keysecondary]
    };
  }).filter((item) => !!item);
  if (!state.pending.length)
    return;
  state.recentInjectionEntryIds.push(state.pending.map((item) => item.entryId));
  while (state.recentInjectionEntryIds.length > DYNAMIC_FEEDBACK_RECENT_WINDOW) {
    state.recentInjectionEntryIds.shift();
  }
}
function cloneRetrievalFeedItem(item) {
  return {
    ...item,
    scopes: item.scopes?.map((scope) => ({ ...scope })),
    entries: item.entries?.map((entry) => ({ ...entry, reasons: [...entry.reasons] })),
    details: item.details ? [...item.details] : undefined
  };
}
function cloneRetrievalSession(session) {
  return {
    ...session,
    items: session.items.map(cloneRetrievalFeedItem)
  };
}
function cloneRetrievalFeedState(state) {
  return {
    sessions: (state?.sessions ?? []).map(cloneRetrievalSession)
  };
}
function createSessionStartItem(event) {
  return {
    id: `session:${event.timestamp}:${Math.random().toString(36).slice(2, 8)}`,
    kind: "trace",
    label: event.label,
    summary: event.summary,
    timestamp: event.timestamp,
    phase: "session",
    details: event.details ? [...event.details] : undefined,
    tone: "info"
  };
}
function sortAndTrimRetrievalSessions(sessions) {
  return sessions.slice().sort((left, right) => {
    if (left.status === "running" && right.status !== "running")
      return -1;
    if (right.status === "running" && left.status !== "running")
      return 1;
    return right.startedAt - left.startedAt;
  }).slice(0, RETRIEVAL_FEED_SESSION_LIMIT);
}
function getOrCreateRetrievalFeed(userId, chatId) {
  const key = getPreviewCacheKey(userId, chatId);
  const cached = retrievalFeedCache.get(key);
  if (cached)
    return cached;
  const next = { sessions: [] };
  retrievalFeedCache.set(key, next);
  return next;
}
function beginRetrievalSession(userId, chatId, sessionId, event) {
  const feed = getOrCreateRetrievalFeed(userId, chatId);
  const session = {
    id: sessionId,
    chatId,
    mode: event.mode,
    startedAt: event.timestamp,
    endedAt: null,
    status: "running",
    controllerUsed: false,
    resolvedConnectionId: null,
    fallbackReason: null,
    items: [createSessionStartItem(event)]
  };
  feed.sessions = sortAndTrimRetrievalSessions([session, ...feed.sessions.filter((item) => item.id !== sessionId)]);
}
function appendRetrievalSessionItem(userId, chatId, sessionId, item) {
  const feed = getOrCreateRetrievalFeed(userId, chatId);
  const session = feed.sessions.find((candidate) => candidate.id === sessionId);
  if (!session)
    return;
  session.items = [...session.items, cloneRetrievalFeedItem(item)];
  feed.sessions = sortAndTrimRetrievalSessions(feed.sessions);
}
function finishRetrievalSession(userId, chatId, sessionId, event) {
  const feed = getOrCreateRetrievalFeed(userId, chatId);
  const session = feed.sessions.find((candidate) => candidate.id === sessionId);
  if (!session)
    return;
  session.status = event.status;
  session.endedAt = event.timestamp;
  session.controllerUsed = event.controllerUsed;
  session.resolvedConnectionId = event.resolvedConnectionId;
  session.fallbackReason = event.fallbackReason;
  feed.sessions = sortAndTrimRetrievalSessions(feed.sessions);
}
function scheduleLiveStatePush(userId, chatId) {
  const key = getPreviewCacheKey(userId, chatId);
  const existing = scheduledStatePushes.get(key);
  if (existing)
    clearTimeout(existing);
  const handle = setTimeout(() => {
    scheduledStatePushes.delete(key);
    resolveActiveChat(userId).then((activeChat) => {
      if (activeChat?.id !== chatId)
        return;
      return pushState(userId, chatId);
    }).catch((error) => {
      spindle.log.warn(`Lore Recall state push failed for chat ${chatId}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, RETRIEVAL_FEED_PUSH_DELAY_MS);
  scheduledStatePushes.set(key, handle);
}
async function buildState(userId, chatId) {
  const stateIssues = [];
  const [activeChat, settings, connections] = await Promise.all([
    resolveActiveChat(userId, chatId).catch((error) => {
      stateIssues.push({
        id: "active-chat-unavailable",
        severity: "warn",
        bookId: null,
        title: "Active chat could not be loaded",
        detail: error instanceof Error ? error.message : String(error)
      });
      return null;
    }),
    loadGlobalSettings(userId).catch((error) => {
      stateIssues.push({
        id: "settings-unavailable",
        severity: "warn",
        bookId: null,
        title: "Lore Recall settings could not be loaded",
        detail: error instanceof Error ? error.message : String(error)
      });
      return { ...DEFAULT_GLOBAL_SETTINGS };
    }),
    listConnectionsCached(userId)
  ]);
  const cachedPreview = activeChat?.id ? previewCache.get(getPreviewCacheKey(userId, activeChat.id)) ?? null : null;
  const cachedRetrievalFeed = activeChat?.id ? cloneRetrievalFeedState(retrievalFeedCache.get(getPreviewCacheKey(userId, activeChat.id))) : { sessions: [] };
  const baseState = {
    activeChatId: activeChat?.id ?? null,
    activeCharacterId: activeChat?.character_id ?? null,
    activeCharacterName: null,
    globalSettings: settings,
    hostSelectionAvailable: extensionTakeoverAvailable,
    characterConfig: null,
    allWorldBooks: [],
    attachedBookSources: {},
    attachedBookScopes: {},
    managedEntries: {},
    bookConfigs: {},
    bookStatuses: {},
    treeIndexes: {},
    unassignedCounts: {},
    availableConnections: connections.map(buildConnectionOption).sort((left, right) => left.name.localeCompare(right.name)),
    diagnosticsResults: stateIssues,
    suggestedBookIds: [],
    retrievalFeed: cachedRetrievalFeed,
    preview: cachedPreview,
    jevKeyStored: await hasJevKey(settings.jevProvider, userId).catch(() => false)
  };
  if (!activeChat) {
    return { state: baseState };
  }
  const character = activeChat.character_id ? await spindle.characters.get(activeChat.character_id, userId).catch(() => null) : null;
  const characterConfig = character ? await loadCharacterConfig(character.id, userId, character).catch(() => ({ ...DEFAULT_CHARACTER_CONFIG })) : { ...DEFAULT_CHARACTER_CONFIG };
  const attachedBookScopes = await getTurnAttachmentScopes(activeChat, userId, null, character, false).catch((error) => {
    stateIssues.push({
      id: "attachment-sources-unavailable",
      severity: "warn",
      bookId: null,
      title: "Attached lorebooks could not be listed",
      detail: error instanceof Error ? error.message : String(error)
    });
    return {};
  });
  const attachedBookIds = Object.keys(attachedBookScopes);
  const { runtimeBooks, staleIssues, loadIssues, missingBookIds } = await getRuntimeBooks(attachedBookIds, attachedBookIds, userId, 15000);
  const attachmentState = buildAttachedWorkspaceState(attachedBookScopes, runtimeBooks, missingBookIds);
  const { attachedBookSources } = attachmentState;
  const managedEntries = Object.fromEntries(runtimeBooks.map((book) => [
    book.summary.id,
    book.cache.entries.map(toWorkspaceEntry)
  ]));
  const bookConfigs = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.config]));
  const bookStatuses = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.status]));
  const treeIndexes = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree]));
  const unassignedCounts = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree.unassignedEntryIds.length]));
  const previewFallbackPath = cachedPreview?.fallbackPath ?? [];
  const previewDiagnostics = cachedPreview ? [
    ...previewFallbackPath.length ? [
      {
        id: "preview-fallback",
        severity: "info",
        bookId: null,
        title: "Last retrieval used fallback behavior",
        detail: previewFallbackPath.join(" ")
      }
    ] : [],
    ...cachedPreview.recentConversation && /\[narrative|important note:|black box|you represent/i.test(cachedPreview.recentConversation) ? [
      {
        id: "preview-protocol-heavy-context",
        severity: "warn",
        bookId: null,
        title: "Recent retrieval context still contains protocol text",
        detail: "The sanitized recent conversation still appears to contain narrative protocol or policy text, which can distort node and entry selection."
      }
    ] : []
  ] : [];
  const diagnosticsResults = stateIssues.concat(buildDiagnostics(runtimeBooks.filter((book) => attachedBookSources[book.summary.id]), staleIssues, settings, characterConfig, connections), previewDiagnostics);
  for (const [bookId, reason] of Object.entries(loadIssues)) {
    if (missingBookIds.includes(bookId)) {
      diagnosticsResults.push({
        id: `stale-attached-book:${bookId}`,
        severity: "info",
        bookId,
        title: "Stale lorebook attachment omitted",
        detail: "Lumiverse still has this ID in its saved attachments, but the lorebook no longer exists."
      });
      continue;
    }
    diagnosticsResults.push({
      id: `attached-book-load:${bookId}`,
      severity: "warn",
      bookId,
      title: "Attached lorebook could not be loaded",
      detail: `${reason} Lumiverse will handle this book natively until it can be loaded.`
    });
  }
  if (!extensionTakeoverAvailable)
    diagnosticsResults.unshift({
      id: "host-selection-unavailable",
      severity: "warn",
      bookId: null,
      title: missingRecallHookPermissions().length ? "Lore Recall needs extension permissions" : "Lore Recall host support is unavailable",
      detail: missingRecallHookPermissions().length ? "Grant these Lore Recall permissions in Extensions: " + missingRecallHookPermissions().join(", ") + ". Native lorebook activation remains active." : "This Lumiverse build does not expose the pre-generation and prompt hooks Lore Recall needs. Native lorebook activation remains active."
    });
  const nextState = {
    ...baseState,
    ...attachmentState,
    activeCharacterId: character?.id ?? null,
    activeCharacterName: character?.name ?? null,
    characterConfig,
    managedEntries,
    bookConfigs,
    bookStatuses,
    treeIndexes,
    unassignedCounts,
    diagnosticsResults,
    suggestedBookIds: []
  };
  return {
    state: nextState
  };
}
async function pushState(userId, chatId) {
  const sequence = (latestStateSequence.get(userId) ?? 0) + 1;
  latestStateSequence.set(userId, sequence);
  const envelope = await buildState(userId, chatId);
  if (latestStateSequence.get(userId) !== sequence)
    return;
  rememberChatUser(envelope.state.activeChatId, userId);
  send({ type: "state", state: envelope.state }, userId);
}
var activeTrackedOperations = new Map;
function createOperationId(kind) {
  return `${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}
function sendOperation(userId, operation) {
  send({ type: "operation", operation }, userId);
}
function getOperationTitle(kind) {
  switch (kind) {
    case "build_tree_from_metadata":
      return "Build Tree From Metadata";
    case "build_tree_with_llm":
      return "Build Tree With LLM";
    case "regenerate_summaries":
      return "Regenerate Summaries";
    case "export_snapshot":
      return "Export Snapshot";
    case "import_snapshot":
      return "Import Snapshot";
  }
}
function summarizeOutcome(kind, outcome, issues) {
  const issueCount = issues.length;
  switch (kind) {
    case "build_tree_with_llm":
      if (issueCount)
        return `Built ${outcome.completed} of ${outcome.total} book(s) with ${issueCount} issue(s).`;
      return `Built ${outcome.completed} book(s) with the LLM.`;
    case "build_tree_from_metadata":
      if (issueCount)
        return `Built ${outcome.completed} of ${outcome.total} metadata tree(s) with ${issueCount} issue(s).`;
      return `Built ${outcome.completed} metadata tree(s).`;
    case "regenerate_summaries":
      if (issueCount)
        return `Updated ${outcome.completed} of ${outcome.total} summary target(s) with ${issueCount} issue(s).`;
      return `Updated ${outcome.completed} summary target(s).`;
    case "export_snapshot":
      return "Lore Recall snapshot is ready to download.";
    case "import_snapshot":
      if (issueCount)
        return `Imported Lore Recall snapshot with ${issueCount} issue(s).`;
      return "Imported Lore Recall snapshot.";
  }
}
function createInitialOperation(id, kind, message) {
  return {
    id,
    kind,
    status: "started",
    title: getOperationTitle(kind),
    message: "Starting operation...",
    percent: 0,
    current: null,
    total: null,
    phase: "starting",
    bookId: null,
    bookName: null,
    chunkCurrent: null,
    chunkTotal: null,
    retryable: false,
    finishedAt: null,
    scope: {
      chatId: "chatId" in message ? message.chatId ?? null : null,
      bookIds: "bookIds" in message && Array.isArray(message.bookIds) ? message.bookIds : undefined,
      bookId: "bookId" in message && typeof message.bookId === "string" ? message.bookId : null,
      entryIds: "entryIds" in message && Array.isArray(message.entryIds) ? message.entryIds : undefined,
      nodeIds: "nodeIds" in message && Array.isArray(message.nodeIds) ? message.nodeIds : undefined
    },
    issues: []
  };
}
async function runTrackedOperation(userId, message, kind, runner, onSuccess) {
  if (activeTrackedOperations.has(userId)) {
    send({
      type: "error",
      message: "Another Lore Recall operation is already running. Wait for it to finish before starting a new one."
    }, userId);
    return;
  }
  const id = createOperationId(kind);
  const issues = [];
  let operation = createInitialOperation(id, kind, message);
  activeTrackedOperations.set(userId, id);
  sendOperation(userId, operation);
  const context = {
    progress(update) {
      operation = {
        ...operation,
        status: operation.status === "started" ? "running" : operation.status,
        ...update,
        percent: typeof update.percent === "number" ? Math.max(0, Math.min(100, update.percent)) : operation.percent,
        current: typeof update.current === "number" ? update.current : operation.current,
        total: typeof update.total === "number" ? update.total : operation.total,
        phase: typeof update.phase === "undefined" ? operation.phase : update.phase ?? null,
        bookId: typeof update.bookId === "undefined" ? operation.bookId : update.bookId ?? null,
        bookName: typeof update.bookName === "undefined" ? operation.bookName : update.bookName ?? null,
        chunkCurrent: typeof update.chunkCurrent === "undefined" ? operation.chunkCurrent : update.chunkCurrent ?? null,
        chunkTotal: typeof update.chunkTotal === "undefined" ? operation.chunkTotal : update.chunkTotal ?? null,
        message: update.message ?? operation.message,
        issues: [...issues]
      };
      sendOperation(userId, operation);
    },
    addIssue(issue) {
      issues.push(issue);
      operation = {
        ...operation,
        issues: [...issues]
      };
      sendOperation(userId, operation);
    }
  };
  try {
    const outcome = await runner(context);
    const allIssues = outcome.issues.length ? outcome.issues : issues;
    const failed = outcome.completed === 0 && outcome.total > 0 && allIssues.length > 0;
    if (onSuccess && typeof outcome.value !== "undefined" && !failed) {
      await onSuccess(outcome.value);
    }
    operation = {
      ...operation,
      status: failed ? "failed" : "completed",
      message: summarizeOutcome(kind, outcome, allIssues),
      percent: failed ? operation.percent : 100,
      current: outcome.total > 0 ? outcome.completed : operation.current,
      total: outcome.total > 0 ? outcome.total : operation.total,
      retryable: failed,
      finishedAt: Date.now(),
      issues: allIssues
    };
    sendOperation(userId, operation);
    await pushState(userId, "chatId" in message ? message.chatId : null);
  } catch (error) {
    const issue = {
      severity: "error",
      message: error instanceof Error ? error.message : "Unknown Lore Recall operation error",
      phase: operation.phase ?? null,
      bookId: operation.bookId ?? null,
      bookName: operation.bookName ?? null
    };
    issues.push(issue);
    operation = {
      ...operation,
      status: "failed",
      message: issue.message,
      retryable: true,
      finishedAt: Date.now(),
      issues: [...issues]
    };
    spindle.log.error(`Lore Recall ${kind} failed: ${issue.message}`);
    sendOperation(userId, operation);
  } finally {
    activeTrackedOperations.delete(userId);
  }
}
var recallHostApi = spindle;
var hostCapabilities = spindle.host?.capabilities;
var requiredPromptInterceptorAvailable = (hostCapabilities?.["required-interceptors-v1"] ?? 0) >= 1;
var extensionHookSupportAvailable = typeof recallHostApi.registerContextHandler === "function" && typeof recallHostApi.registerWorldInfoInterceptor === "function" && typeof recallHostApi.registerInterceptor === "function" && (recallHostApi.contracts?.preAssemblyGenerationContext ?? 0) >= 1;
var extensionTakeoverAvailable = false;
var recallHooksRegistered = false;
function missingRecallHookPermissions() {
  return ["generation", "context_handler", "interceptor"].filter((permission) => !spindle.permissions.has(permission));
}
function recordNativeFallback(userId, chatId, reason, existingSessionId) {
  const sessionId = existingSessionId ?? "fallback:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
  const cached = previewCache.get(getPreviewCacheKey(userId, chatId));
  if (cached) {
    cached.activationSource = "native";
    cached.injectedNodes = [];
    cached.injectedText = "";
  }
  const existing = retrievalFeedCache.get(getPreviewCacheKey(userId, chatId))?.sessions.find((session) => session.id === sessionId);
  if (!existing)
    beginRetrievalSession(userId, chatId, sessionId, {
      type: "start",
      mode: "collapsed",
      timestamp: Date.now(),
      label: "Native lorebook fallback",
      summary: "Lore Recall did not take over this turn."
    });
  appendRetrievalSessionItem(userId, chatId, sessionId, {
    id: "native:" + Date.now(),
    kind: "issue",
    label: "Native lorebook fallback",
    summary: reason,
    timestamp: Date.now(),
    phase: "fallback",
    tone: "warn"
  });
  finishRetrievalSession(userId, chatId, sessionId, {
    type: "finish",
    timestamp: Date.now(),
    status: "fallback",
    controllerUsed: existing?.controllerUsed ?? false,
    resolvedConnectionId: existing?.resolvedConnectionId ?? null,
    fallbackReason: reason
  });
  scheduleLiveStatePush(userId, chatId);
}
function registerRecallHooks() {
  extensionTakeoverAvailable = extensionHookSupportAvailable && !missingRecallHookPermissions().length;
  if (!extensionTakeoverAvailable || recallHooksRegistered)
    return;
  recallHooksRegistered = true;
  recallHostApi.registerContextHandler(async (rawContext, signal) => {
    if (!extensionTakeoverAvailable)
      return rawContext;
    const context = rawContext;
    const chatId = context.chatId;
    const userId = context.userId ?? (chatId ? resolveUserId(chatId) : null);
    if (!chatId || !userId)
      return rawContext;
    const runId = "recall:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
    const preparedContext = { ...context, loreRecallRunId: runId };
    preparedRecallRuns.begin(runId, userId, chatId);
    let staged = false;
    const deadlineAt = Date.now() + 115000;
    let sessionId;
    try {
      signal?.throwIfAborted();
      await ensureStorageFolders(userId);
      const settings = await loadGlobalSettings(userId);
      if (!settings.enabled)
        return preparedContext;
      const chat = await spindle.chats.get(chatId, userId);
      if (!chat)
        return preparedContext;
      const scopes = await getTurnAttachmentScopes(chat, userId, context.personaId);
      const attachedIds = Object.keys(scopes);
      if (!attachedIds.length)
        return preparedContext;
      const { runtimeBooks } = await getRuntimeBooks(attachedIds, attachedIds, userId, 15000);
      const readableBooks = runtimeBooks.filter((book) => book.config.enabled && isReadableBook(book.config));
      if (!readableBooks.length)
        return preparedContext;
      const character = chat.character_id ? await spindle.characters.get(chat.character_id, userId) : null;
      const config = character ? await loadCharacterConfig(character.id, userId, character) : { ...DEFAULT_CHARACTER_CONFIG };
      const chatMessages = await spindle.chat.getMessages(chatId);
      const messages = chatMessages.map((message) => ({ role: message.role, content: message.content }));
      const cacheKey = getPreviewCacheKey(userId, chatId);
      previewCache.set(cacheKey, null);
      if (!context.dryRun)
        processPendingDynamicFeedback(cacheKey, messages);
      sessionId = "retrieval:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
      const activeSessionId = sessionId;
      const handleProgress = (event) => {
        switch (event.type) {
          case "start":
            beginRetrievalSession(userId, chatId, activeSessionId, event);
            break;
          case "item":
            appendRetrievalSessionItem(userId, chatId, activeSessionId, event.item);
            break;
          case "finish":
            finishRetrievalSession(userId, chatId, activeSessionId, event);
            break;
        }
        scheduleLiveStatePush(userId, chatId);
      };
      const preview = await buildRetrievalPreview(messages, settings, config, readableBooks, userId, {
        connectionId: context.connectionId,
        isActual: !context.dryRun,
        capturedAt: Date.now(),
        reportProgress: handleProgress,
        dynamicFeedback: buildDynamicFeedbackSnapshot(cacheKey),
        signal,
        deadlineAt
      });
      signal?.throwIfAborted();
      if (preview) {
        preview.attachedBookSources = Object.fromEntries(readableBooks.map((book) => [book.summary.id, scopes[book.summary.id]?.join(", ") ?? "attached"]));
        previewCache.set(cacheKey, preview);
      }
      if (!preview?.retrievalComplete || Date.now() >= deadlineAt) {
        recordNativeFallback(userId, chatId, Date.now() >= deadlineAt ? "Lore Recall exceeded its pre-generation deadline." : preview?.fallbackReason ?? "Lore Recall could not complete retrieval.", sessionId);
        return preparedContext;
      }
      const handledBookIds = readableBooks.map((book) => book.summary.id);
      const handledSet = new Set(handledBookIds);
      const selectedIds = [...new Set(preview.injectedNodes.map((node) => node.entryId))];
      const selectedRows = await Promise.all(selectedIds.map((id) => spindle.world_books.entries.get(id, userId)));
      signal?.throwIfAborted();
      if (selectedRows.some((entry) => !entry || entry.disabled || !entry.content.trim() || !handledSet.has(entry.world_book_id))) {
        recordNativeFallback(userId, chatId, "A selected entry changed or became unavailable.", sessionId);
        return preparedContext;
      }
      const sourceEntries = selectedRows;
      const sourceContents = Object.fromEntries(sourceEntries.map((entry) => [entry.id, entry.content]));
      const entries = (await Promise.all(sourceEntries.map(async (entry) => ({
        ...entry,
        content: (await spindle.macros.resolve(entry.content, {
          chatId,
          characterId: chat.character_id,
          userId,
          commit: false
        })).text
      })))).filter((entry) => entry.content.trim());
      signal?.throwIfAborted();
      if (Date.now() >= deadlineAt) {
        recordNativeFallback(userId, chatId, "Lore Recall exceeded its pre-generation deadline.", sessionId);
        return preparedContext;
      }
      preview.activationSource = "preview";
      staged = preparedRecallRuns.put({
        id: runId,
        userId,
        chatId,
        createdAt: Date.now(),
        handledBookIds,
        entries,
        sourceContents,
        preview,
        runtimeBooks: readableBooks,
        sessionId,
        status: "prepared"
      });
      if (!staged) {
        recordNativeFallback(userId, chatId, "Overlapping generations prevented a safe Recall takeover.", sessionId);
      }
      scheduleLiveStatePush(userId, chatId);
      return preparedContext;
    } catch (error) {
      if (signal?.aborted)
        return preparedContext;
      const reason = error instanceof Error ? error.message : String(error);
      recordNativeFallback(userId, chatId, reason, sessionId);
      spindle.log.warn("Lore Recall preparation failed; native activation continues: " + reason);
      return preparedContext;
    } finally {
      if (!staged)
        preparedRecallRuns.stayNative(runId);
    }
  }, 95, { timeoutMs: 120000 });
  recallHostApi.registerWorldInfoInterceptor(async (context) => {
    if (!extensionTakeoverAvailable)
      return;
    const userId = context.userId ?? resolveUserId(context.chatId);
    if (!userId)
      return;
    const claim = preparedRecallRuns.claim(userId, context.chatId, context.entries);
    if (!claim.run) {
      if (claim.reason) {
        for (const run of claim.rejected)
          recordNativeFallback(userId, context.chatId, claim.reason, run.sessionId);
      }
      return;
    }
    const disabled = suppressedNativeEntryIds(claim.run, context.entries);
    return { disabled };
  }, 95);
  recallHostApi.registerInterceptor(async (messages, rawContext) => {
    const context = rawContext;
    const runId = context.loreRecallRunId;
    if (!runId)
      return messages;
    const run = preparedRecallRuns.get(runId);
    if (!run) {
      if (preparedRecallRuns.isPassThrough(runId)) {
        preparedRecallRuns.remove(runId);
        return messages;
      }
      throw new Error("Lore Recall's prepared selection expired after native activation.");
    }
    if (run.status !== "claimed") {
      if (run.status === "prepared") {
        recordNativeFallback(run.userId, run.chatId, "World-info activation did not run, so Recall did not take over.", run.sessionId);
      }
      preparedRecallRuns.remove(runId);
      return messages;
    }
    const injected = injectRecallEntries(messages, run.entries);
    const injectedIds = new Set(run.entries.map((entry) => entry.id));
    run.preview.injectedNodes = run.preview.injectedNodes.filter((node) => injectedIds.has(node.entryId));
    run.preview.activationSource = "recall";
    run.preview.injectedText = run.entries.map((entry) => entry.content).join(`

`);
    run.preview.estimatedTokens = Math.ceil(run.preview.injectedText.length / 4);
    previewCache.set(getPreviewCacheKey(run.userId, run.chatId), run.preview);
    if (!context.dryRun)
      recordDynamicInjection(getPreviewCacheKey(run.userId, run.chatId), run.preview, run.runtimeBooks);
    appendRetrievalSessionItem(run.userId, run.chatId, run.sessionId, {
      id: "activation:" + Date.now(),
      kind: "injected",
      label: "Recall activation",
      summary: "Inserted " + run.entries.length + " selected entries from " + run.handledBookIds.length + " attached books.",
      timestamp: Date.now(),
      phase: "inject",
      count: run.entries.length,
      entries: run.preview.injectedNodes,
      tone: "success",
      details: run.entries.some((entry) => ![0, 1, 4].includes(entry.position)) ? ["Author-note, example, marker, and outlet positions are placed before chat history by Lore Recall."] : []
    });
    preparedRecallRuns.remove(runId);
    scheduleLiveStatePush(run.userId, run.chatId);
    return injected;
  }, 95, requiredPromptInterceptorAvailable ? { required: true } : undefined);
}
registerRecallHooks();
spindle.permissions.getGranted().then(registerRecallHooks).catch(() => {});
spindle.permissions.onChanged(() => {
  registerRecallHooks();
  const userId = resolveUserId();
  if (userId)
    pushState(userId).catch(() => {});
});
if (!extensionHookSupportAvailable) {
  spindle.log.warn("Lore Recall cannot register its pre-generation and prompt hooks; native lorebook activation remains active.");
}
spindle.onFrontendMessage(async (payload, userId) => {
  setLastFrontendUserId(userId);
  const message = payload;
  rememberChatUser(readChatIdFromMessage(message), userId);
  try {
    await ensureStorageFolders(userId);
    switch (message.type) {
      case "ready":
        await pushState(userId, message.chatId);
        break;
      case "refresh":
      case "run_diagnostics":
        invalidateWorldBookListCache(userId);
        await pushState(userId, message.chatId);
        break;
      case "save_global_settings":
        await saveGlobalSettings(message.patch, userId);
        await pushState(userId, message.chatId);
        break;
      case "save_jev_key":
        await saveJevKey(message.provider, message.apiKey, userId);
        await saveGlobalSettings({ jevProvider: message.provider }, userId);
        await pushState(userId, message.chatId);
        break;
      case "clear_jev_key":
        await clearJevKey(message.provider, userId);
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
      case "patch_entry_flags":
        await patchEntryFlags(message.entryIds, message.patch, userId);
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
        await runTrackedOperation(userId, message, "build_tree_from_metadata", (operation) => buildTreeFromMetadata(message.bookIds, userId, operation));
        break;
      case "build_tree_with_llm":
        await runTrackedOperation(userId, message, "build_tree_with_llm", (operation) => buildTreeWithLlm(message.bookIds, userId, operation));
        break;
      case "regenerate_summaries":
        await runTrackedOperation(userId, message, "regenerate_summaries", (operation) => regenerateSummaries(message.bookId, message.entryIds, message.nodeIds, userId, operation));
        break;
      case "export_snapshot":
        await runTrackedOperation(userId, message, "export_snapshot", (operation) => exportSnapshot(userId, operation), async (snapshot) => {
          send({
            type: "export_snapshot_ready",
            filename: `lore-recall-${new Date(snapshot.exportedAt).toISOString().slice(0, 10)}.json`,
            snapshot
          }, userId);
        });
        break;
      case "import_snapshot":
        await runTrackedOperation(userId, message, "import_snapshot", (operation) => importSnapshot(message.snapshot, userId, operation));
        break;
      case "apply_suggested_books":
        await applySuggestedBooks(message.characterId, message.bookIds, message.mode, userId);
        await pushState(userId, message.chatId);
        break;
    }
  } catch (error) {
    const description = error instanceof Error ? error.message : "Unknown Lore Recall error";
    spindle.log.error(`Lore Recall ${message.type} error: ${error instanceof Error ? error.stack ?? description : description}`);
    send({ type: "error", message: description }, userId);
  }
});
spindle.log.info("Lore Recall loaded.");
