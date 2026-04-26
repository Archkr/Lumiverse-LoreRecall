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
    controllerMaxTokens: clampInt(typeof next.controllerMaxTokens === "number" ? next.controllerMaxTokens : DEFAULT_GLOBAL_SETTINGS.controllerMaxTokens, 256, 32768),
    buildDetail: next.buildDetail === "full" || next.buildDetail === "names" ? next.buildDetail : "lite",
    treeGranularity: clampInt(typeof next.treeGranularity === "number" ? next.treeGranularity : DEFAULT_GLOBAL_SETTINGS.treeGranularity, 0, 4),
    chunkTokens: clampInt(typeof next.chunkTokens === "number" ? next.chunkTokens : DEFAULT_GLOBAL_SETTINGS.chunkTokens, 1000, 120000),
    dedupMode: next.dedupMode === "lexical" || next.dedupMode === "llm" ? next.dedupMode : "none"
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
      temperature: settings.controllerTemperature,
      max_tokens: options.maxTokensOverride ?? settings.controllerMaxTokens,
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
  const attachedBookIdSet = new Set(attachedBookIds);
  const staleIssues = {};
  const runtimeBooks = (await Promise.all(selectedBookIds.map(async (bookId) => {
    const [cache, config] = await Promise.all([loadBookCache(bookId, userId), loadBookConfig(bookId, userId)]);
    if (!cache)
      return null;
    const loadedTree = await loadTreeIndex(bookId, cache.entries, userId);
    staleIssues[bookId] = { staleEntryRefs: loadedTree.staleEntryRefs, staleNodeRefs: loadedTree.staleNodeRefs };
    return {
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
    };
  }))).filter((book) => !!book);
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
var TRACE_REPORTER = Symbol("traceReporter");
var CONTROLLER_TIMEOUT_MS = 45000;
var CONTROLLER_TOTAL_BUDGET_MS = 175000;
var CONTROLLER_MAX_CALLS = 12;
var TRAVERSAL_FULL_OVERVIEW_LIMIT = 1e4;
var RECENT_MESSAGE_LIMIT = 500;
var MAX_SCOPE_CHOICES = 5;
var DOCUMENT_CHOICE_PREFIX = "doc:";
var EMPTY_ENTRY_ID_SET = new Set;
var RETRIEVAL_SCOPE_SYSTEM_PROMPT = "You are a retrieval assistant. Choose only node IDs exactly as shown in the provided knowledge tree. Use raw node IDs or doc:<bookId> selectors when shown. Return only the requested JSON with no commentary or markdown.";
var RETRIEVAL_BOOK_SYSTEM_PROMPT = "You are a retrieval assistant. Choose only lore book IDs from the provided list. Return only the requested JSON with no commentary or markdown.";
function createTraceBuffer(reporter) {
  const trace = [];
  trace[TRACE_REPORTER] = reporter;
  return trace;
}
function getTraceReporter(trace) {
  return trace[TRACE_REPORTER];
}
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
    details: options.details ? [...options.details] : undefined,
    tone: options.tone,
    durationMs: typeof options.durationMs === "number" ? options.durationMs : null
  };
}
function emitTraceFeedItem(trace, label, summary, options = {}) {
  const reporter = getTraceReporter(trace);
  if (!reporter)
    return;
  emitProgress(reporter, {
    type: "item",
    item: createFeedItem("trace", label, summary, options)
  });
}
function pushTrace(trace, phase, label, summary, extra = {}) {
  trace.push({
    step: trace.length + 1,
    phase,
    label,
    summary,
    bookId: extra.bookId ?? null,
    nodeId: extra.nodeId ?? null,
    entryCount: extra.entryCount ?? null
  });
  emitTraceFeedItem(trace, label, summary, {
    phase,
    count: typeof extra.entryCount === "number" ? extra.entryCount : null,
    tone: phase === "fallback" ? "warn" : phase === "finish" ? "success" : "info",
    durationMs: typeof extra.durationMs === "number" ? extra.durationMs : null
  });
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
  return messages.filter((message) => message.role !== "system" && message.content.trim()).slice(-contextMessages).map((message) => {
    const role = message.role === "user" ? "User" : "Assistant";
    return `${role}: ${truncateText(stripSearchMarkup(message.content), RECENT_MESSAGE_LIMIT)}`;
  }).join(`
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
function sanitizeRetrievalMessage(role, content) {
  let text = stripSearchMarkup(content).replace(/\r\n?/g, `
`);
  if (role !== "user") {
    const cutIndex = findNarrativeProtocolCutIndex(text);
    if (cutIndex >= 0) {
      text = text.slice(0, cutIndex);
    }
  }
  return truncateText(text.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim(), RECENT_MESSAGE_LIMIT);
}
function buildRecentConversation(messages, contextMessages) {
  return messages.filter((message) => message.role !== "system" && message.content.trim()).slice(-contextMessages).map((message) => {
    const role = message.role === "user" ? "User" : "Character";
    const sanitized = sanitizeRetrievalMessage(message.role, message.content);
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
function buildSceneSelectionSignals(recentConversation) {
  const lines = recentConversation.split(`
`).map((line) => line.trim()).filter(Boolean);
  const latestExchange = normalizeSearchText(lines.slice(-2).join(" "));
  const normalizedConversation = normalizeSearchText(lines.join(" "));
  return {
    normalizedConversation,
    latestExchange
  };
}
function countPhraseOccurrences(haystack, phrase) {
  if (!haystack || !phrase)
    return 0;
  const normalizedHaystack = ` ${normalizeSearchText(haystack)} `;
  const normalizedPhrase = normalizeSearchText(phrase);
  if (!normalizedPhrase)
    return 0;
  let count = 0;
  let fromIndex = 0;
  const needle = ` ${normalizedPhrase} `;
  while (fromIndex < normalizedHaystack.length) {
    const matchIndex = normalizedHaystack.indexOf(needle, fromIndex);
    if (matchIndex === -1)
      break;
    count += 1;
    fromIndex = matchIndex + needle.length;
  }
  return count;
}
function normalizeVariantList(values) {
  return uniqueStrings(values).map((value) => normalizeSearchText(value)).filter((value) => value.length >= 3);
}
function inferSelectionSignal(entry, reasons, signals) {
  const labelVariants = normalizeVariantList([entry.label]);
  const aliasVariants = normalizeVariantList(entry.aliases);
  const latestLabelMentions = labelVariants.reduce((total, phrase) => total + countPhraseOccurrences(signals.latestExchange, phrase), 0);
  const latestAliasMentions = aliasVariants.reduce((total, phrase) => total + countPhraseOccurrences(signals.latestExchange, phrase), 0);
  const overallLabelMentions = labelVariants.reduce((total, phrase) => total + countPhraseOccurrences(signals.normalizedConversation, phrase), 0);
  const overallAliasMentions = aliasVariants.reduce((total, phrase) => total + countPhraseOccurrences(signals.normalizedConversation, phrase), 0);
  const latestMentionCount = latestLabelMentions + latestAliasMentions;
  const overallMentionCount = overallLabelMentions + overallAliasMentions;
  if (latestMentionCount > 0) {
    return {
      role: "recent_mention",
      latestMentionCount,
      overallMentionCount: Math.max(overallMentionCount, latestMentionCount)
    };
  }
  if (overallMentionCount > 0) {
    return {
      role: "context_mention",
      latestMentionCount,
      overallMentionCount
    };
  }
  if (reasons.includes("label")) {
    return { role: "label_match", latestMentionCount, overallMentionCount };
  }
  if (reasons.includes("alias")) {
    return { role: "alias_match", latestMentionCount, overallMentionCount };
  }
  if (reasons.includes("keyword")) {
    return { role: "keyword_match", latestMentionCount, overallMentionCount };
  }
  if (reasons.includes("branch")) {
    return { role: "branch_match", latestMentionCount, overallMentionCount };
  }
  if (reasons.some((reason) => reason === "summary" || reason === "content" || reason === "comment" || reason === "tag")) {
    return { role: "content_match", latestMentionCount, overallMentionCount };
  }
  return { role: "score_fallback", latestMentionCount, overallMentionCount };
}
function rankSelectionCandidates(recentConversation, candidates, scopes) {
  const signals = buildSceneSelectionSignals(recentConversation);
  const roleWeight = {
    recent_mention: 640,
    context_mention: 540,
    label_match: 420,
    alias_match: 380,
    keyword_match: 320,
    branch_match: 260,
    content_match: 220,
    score_fallback: 120
  };
  return candidates.map((candidate) => {
    const scope = scopes.find((item) => getScopedEntryIds(item.book, item.nodeId, true).includes(candidate.entry.entryId));
    const inferred = inferSelectionSignal(candidate.entry, candidate.reasons, signals);
    let priority = roleWeight[inferred.role] + candidate.score * 10 + inferred.latestMentionCount * 45 + inferred.overallMentionCount * 20;
    if (candidate.reasons.includes("label"))
      priority += 18;
    if (candidate.reasons.includes("alias"))
      priority += 12;
    if (candidate.reasons.includes("keyword"))
      priority += 8;
    if (candidate.reasons.includes("branch"))
      priority += 4;
    return {
      candidate: { ...candidate, selectionRole: inferred.role },
      selectionRole: inferred.role,
      priority,
      scopeBreadcrumb: scope ? getScopeBreadcrumb(scope.book, scope.nodeId) : "Unscoped",
      latestMentionCount: inferred.latestMentionCount,
      overallMentionCount: inferred.overallMentionCount
    };
  }).sort((left, right) => right.priority - left.priority || right.candidate.score - left.candidate.score || left.candidate.entry.label.localeCompare(right.candidate.entry.label));
}
function buildDeterministicSelection(rankedCandidates, maxResults) {
  if (!rankedCandidates.length || maxResults <= 0)
    return [];
  return rankedCandidates.slice(0, maxResults).map((item) => ({ ...item.candidate, selectionRole: item.selectionRole }));
}
function getDynamicEntryLimit(config, remainingDynamicSlots) {
  if (remainingDynamicSlots <= 0)
    return 0;
  return clampInt(Math.min(config.maxResults, remainingDynamicSlots), 1, 32);
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
function summarizeSelection(selection, reservedConstantCount = 0, remainingDynamicSlots) {
  if (!selection.length) {
    if (reservedConstantCount > 0) {
      const free = typeof remainingDynamicSlots === "number" ? ` ${Math.max(0, remainingDynamicSlots)} dynamic slot(s) remained free.` : "";
      return `Reserved ${reservedConstantCount} constant entr${reservedConstantCount === 1 ? "y" : "ies"} and selected no dynamic entries.${free}`;
    }
    return "No entries selected.";
  }
  const mentionCount = selection.filter((item) => item.selectionRole === "recent_mention" || item.selectionRole === "context_mention").length;
  const reservedPrefix = reservedConstantCount > 0 ? `Reserved ${reservedConstantCount} constant entr${reservedConstantCount === 1 ? "y" : "ies"}; ` : "";
  const freeSuffix = typeof remainingDynamicSlots === "number" ? ` Dynamic slot budget after constants: ${Math.max(0, remainingDynamicSlots)}.` : "";
  if (mentionCount > 0) {
    return `${reservedPrefix}final selection contains ${selection.length} dynamic entry candidate(s), led by direct query mentions.${freeSuffix}`.replace(/^f/, (match) => match.toUpperCase());
  }
  return `${reservedPrefix}final selection contains ${selection.length} dynamic entry candidate(s) from the chosen node manifests.${freeSuffix}`.replace(/^f/, (match) => match.toUpperCase());
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
  if (entry.selective)
    score += 0.1;
  return { entry, score, reasons: Array.from(new Set(reasons)) };
}
function scoreEntries(queryText, books, excludedEntryIds = EMPTY_ENTRY_ID_SET) {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  if (!normalized || !queryTokens.length)
    return [];
  return books.flatMap((book) => book.cache.entries.filter((entry) => !entry.disabled && !excludedEntryIds.has(entry.entryId)).map((entry) => scoreEntry(entry, book.tree, normalized, queryTokens))).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}
async function runControllerJson2(prompt, controller, systemPrompt, requestLabel = "Controller request") {
  if (controller.callCount >= CONTROLLER_MAX_CALLS) {
    return { parsed: null, error: "Traversal controller hit its call limit.", durationMs: null };
  }
  const remainingMs = controller.deadlineAt - Date.now();
  if (remainingMs <= 1000) {
    return { parsed: null, error: "Traversal controller ran out of time.", durationMs: null };
  }
  controller.callCount += 1;
  const requestStartedAt = Date.now();
  emitProgress(controller.reportProgress, {
    type: "item",
    item: createFeedItem("trace", `Controller: ${requestLabel}`, "Waiting for controller response.", {
      phase: "controller",
      tone: "info"
    })
  });
  const abortController = new AbortController;
  const timeoutMs = Math.min(CONTROLLER_TIMEOUT_MS, remainingMs);
  let timer = null;
  let timeoutHandled = false;
  try {
    const requestPromise = runControllerJson(prompt, controller.settings, controller.userId, {
      systemPrompt,
      connectionId: controller.connectionId,
      signal: abortController.signal
    }).then((result) => {
      const durationMs = Date.now() - requestStartedAt;
      if (result.parsed) {
        controller.controllerUsed = true;
        if (result.parsedFrom === "reasoning") {
          emitProgress(controller.reportProgress, {
            type: "item",
            item: createFeedItem("issue", `Controller parse fallback: ${requestLabel}`, "Controller JSON was recovered from reasoning text because the main content channel was unusable.", {
              phase: "controller",
              tone: "warn",
              durationMs
            })
          });
        }
        emitProgress(controller.reportProgress, {
          type: "item",
          item: createFeedItem("trace", `Controller finished: ${requestLabel}`, `Parsed JSON from ${result.parsedFrom === "reasoning" ? "reasoning" : "content"} response.`, {
            phase: "controller",
            tone: "info",
            durationMs
          })
        });
        return { parsed: result.parsed, error: null, durationMs };
      }
      spindle.log.warn("Lore Recall controller call returned invalid JSON.");
      emitProgress(controller.reportProgress, {
        type: "item",
        item: createFeedItem("issue", `Controller issue: ${requestLabel}`, "Controller returned invalid JSON, so Lore Recall will fall back where it can.", {
          phase: "controller",
          tone: "warn",
          durationMs,
          details: [
            `parsedFrom=${result.parsedFrom ?? "none"}`,
            `finishReason=${result.finishReason ?? "unknown"}`
          ]
        })
      });
      return { parsed: null, error: "Traversal controller returned invalid JSON.", durationMs };
    }).catch((error) => {
      const durationMs = Date.now() - requestStartedAt;
      const message = error instanceof Error ? error.message : String(error);
      const isAbort = error instanceof Error && error.name === "AbortError";
      if (isAbort && timeoutHandled) {
        return {
          parsed: null,
          error: "Traversal controller timed out before the interceptor budget was exhausted.",
          durationMs
        };
      }
      spindle.log.warn(`Lore Recall controller call failed: ${isAbort ? "request timed out" : message}`);
      emitProgress(controller.reportProgress, {
        type: "item",
        item: createFeedItem("issue", `${isAbort ? "Controller timeout" : "Controller error"}: ${requestLabel}`, isAbort ? "Controller request timed out and Lore Recall will keep going with fallback behavior when possible." : `Controller request failed: ${message}`, {
          phase: "controller",
          tone: isAbort ? "warn" : "error",
          durationMs,
          details: isAbort ? [`Timeout after ${timeoutMs} ms.`] : [message]
        })
      });
      return {
        parsed: null,
        error: isAbort ? "Traversal controller timed out." : `Traversal controller failed: ${message}`,
        durationMs
      };
    });
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => {
        timeoutHandled = true;
        abortController.abort();
        const durationMs = Date.now() - requestStartedAt;
        spindle.log.warn("Lore Recall controller call failed: request timed out");
        emitProgress(controller.reportProgress, {
          type: "item",
          item: createFeedItem("issue", `Controller timeout: ${requestLabel}`, "Controller request timed out before Lore Recall finished retrieval.", {
            phase: "controller",
            tone: "warn",
            durationMs,
            details: [`Timeout after ${timeoutMs} ms.`]
          })
        });
        resolve({
          parsed: null,
          error: "Traversal controller timed out before the interceptor budget was exhausted.",
          durationMs
        });
      }, timeoutMs);
    });
    const response = await Promise.race([requestPromise, timeoutPromise]);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return response;
  } finally {
    if (timer)
      clearTimeout(timer);
  }
}
async function maybeChooseBooks(recentConversation, books, config, controller, allowController) {
  if (!allowController || config.multiBookMode !== "per_book" || books.length <= 1) {
    return { books, trace: [] };
  }
  const prompt = [
    "Choose the most relevant lore books for the query.",
    'Return ONLY JSON in this exact shape: {"bookIds":["book-id-1","book-id-2"]}.',
    `Choose up to ${Math.min(3, books.length)} books.`,
    "",
    buildPromptContext(recentConversation),
    "",
    "Books:",
    ...books.map((book) => `- id=${book.summary.id}; name=${book.summary.name}; description=${truncateText(book.config.description || book.tree.nodes[book.tree.rootId]?.summary || book.summary.description, 140)}; categories=${Math.max(0, Object.keys(book.tree.nodes).length - 1)}; entries=${book.cache.entries.length}`)
  ].join(`
`);
  const { parsed } = await runControllerJson2(prompt, controller, RETRIEVAL_BOOK_SYSTEM_PROMPT, "Choose books");
  const ids = Array.isArray(parsed?.bookIds) ? parsed.bookIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  if (!ids.length)
    return { books, trace: [] };
  const chosen = books.filter((book) => ids.includes(book.summary.id));
  const nextBooks = chosen.length ? chosen : books;
  const trace = createTraceBuffer(controller.reportProgress);
  pushTrace(trace, "choose_book", "Book selection", nextBooks.length ? `Controller selected ${nextBooks.length} book(s): ${nextBooks.map((book) => book.summary.name).join(", ")}.` : "Controller kept all readable books in scope.", { entryCount: nextBooks.reduce((total, book) => total + book.cache.entries.length, 0) });
  return { books: nextBooks, trace };
}
async function maybeSelectEntries(queryText, candidates, config, controller, allowController, scopes = [], maxFinalEntries = clampInt(Math.min(config.maxResults, config.tokenBudget), 1, 32)) {
  const rankedCandidates = rankSelectionCandidates(queryText, candidates, scopes);
  const clampedFinalEntries = Math.min(candidates.length, Math.max(0, maxFinalEntries));
  if (!clampedFinalEntries)
    return [];
  const buildScopedFallbackSelection = () => buildDeterministicSelection(rankedCandidates, clampedFinalEntries);
  const rankedEntries = rankedCandidates.map((item) => ({ ...item.candidate, selectionRole: item.selectionRole }));
  const manifests = buildScopedManifests(rankedEntries, scopes);
  if (!config.selectiveRetrieval || !rankedCandidates.length) {
    return buildScopedFallbackSelection();
  }
  if (!allowController) {
    return buildScopedFallbackSelection();
  }
  const prompt = [
    "Select the exact lore entries that should be injected as the final set from the chosen node manifests.",
    'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
    `Choose up to ${clampedFinalEntries} entryIds from the manifests below.`,
    "Use only entryIds that appear in the manifests.",
    "The selected scopes are already the retrieval decision. The returned entryIds are the final entries that will be injected.",
    "Entries may come from any listed scope, and some scopes may contribute zero entries.",
    "If none of the listed entries would help, return an empty entryIds array.",
    "",
    buildPromptContext(queryText),
    "",
    "Chosen scopes:",
    ...scopes.length ? scopes.map((scope) => `- ${scope.book.summary.name} :: ${getScopeBreadcrumb(scope.book, scope.nodeId)}`) : ["- none"],
    "",
    "Scoped entry manifests:",
    ...manifests.length ? manifests.flatMap((manifest) => [
      `Scope: ${manifest.scope.book.summary.name} :: ${getScopeBreadcrumb(manifest.scope.book, manifest.scope.nodeId)} (${manifest.candidates.length} entries)`,
      ...manifest.candidates.map((item) => `- entryId=${item.entry.entryId}; signal=${item.selectionRole ?? "score_fallback"}; label=${item.entry.label}; score=${item.score.toFixed(2)}; reasons=${item.reasons.join(", ")}; summary=${truncateText(item.entry.summary, 140)}; preview=${truncateText(getEntryBody(item.entry), 180)}`)
    ]) : rankedCandidates.map((item) => `- entryId=${item.candidate.entry.entryId}; signal=${item.selectionRole}; scope=${item.scopeBreadcrumb}; label=${item.candidate.entry.label}; score=${item.candidate.score.toFixed(2)}; reasons=${item.candidate.reasons.join(", ")}; summary=${truncateText(item.candidate.entry.summary, 140)}; preview=${truncateText(getEntryBody(item.candidate.entry), 180)}`)
  ].join(`
`);
  const byId = new Map(rankedCandidates.map((item) => [item.candidate.entry.entryId, item]));
  const { parsed } = await runControllerJson2(prompt, controller, undefined, "Select manifest entries");
  const parsedEntryIds = parsed?.entryIds;
  const hasExplicitEntryIds = Array.isArray(parsedEntryIds);
  const requestedIds = hasExplicitEntryIds ? parsedEntryIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  if (hasExplicitEntryIds && requestedIds.length === 0) {
    return [];
  }
  const uniqueRequestedIds = uniqueStrings(requestedIds);
  const unmappedIds = uniqueRequestedIds.filter((id) => !byId.has(id));
  const mappedIds = uniqueRequestedIds.filter((id) => byId.has(id));
  const selectedAllManifestEntries = rankedCandidates.length > clampedFinalEntries && mappedIds.length === rankedCandidates.length && rankedCandidates.length > 0;
  const invalidSelectionReasons = [];
  if (!hasExplicitEntryIds) {
    invalidSelectionReasons.push("Controller did not return an entryIds array.");
  }
  if (requestedIds.length !== uniqueRequestedIds.length) {
    invalidSelectionReasons.push("Controller returned duplicate entry IDs.");
  }
  if (unmappedIds.length) {
    invalidSelectionReasons.push(`Controller returned unmapped entry IDs: ${unmappedIds.join(", ")}.`);
  }
  if (mappedIds.length > clampedFinalEntries) {
    invalidSelectionReasons.push(`Controller returned ${mappedIds.length} entry IDs, which exceeds the final inject cap of ${clampedFinalEntries}.`);
  }
  if (selectedAllManifestEntries) {
    invalidSelectionReasons.push(`Controller selected every manifest entry from a broad scope set (${rankedCandidates.length} entries for a final cap of ${clampedFinalEntries}).`);
  }
  if (invalidSelectionReasons.length) {
    spindle.log.warn(`Lore Recall manifest selection fell back to deterministic final ranking: ${invalidSelectionReasons.join(" ")}`);
    emitProgress(controller.reportProgress, {
      type: "item",
      item: createFeedItem("issue", "Manifest selection fell back", `Controller manifest output could not be used as the final injected set, so Lore Recall fell back to the globally ranked top ${clampedFinalEntries}.`, {
        phase: "manifest_select",
        tone: "warn",
        details: invalidSelectionReasons
      })
    });
    return buildScopedFallbackSelection();
  }
  const mappedIdSet = new Set(mappedIds);
  const chosen = rankedCandidates.filter((item) => mappedIdSet.has(item.candidate.entry.entryId)).slice(0, clampedFinalEntries).map((item) => item.candidate);
  return chosen.length ? chosen : buildScopedFallbackSelection();
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
function parseCategoryChoiceId(choiceId) {
  const match = choiceId.match(/^category:([^:]+):(.+)$/);
  if (!match)
    return null;
  return { bookId: match[1], nodeId: match[2] };
}
function makeDocumentChoiceId(bookId) {
  return `${DOCUMENT_CHOICE_PREFIX}${bookId}`;
}
function parseDocumentChoiceId(choiceId) {
  if (!choiceId.startsWith(DOCUMENT_CHOICE_PREFIX))
    return null;
  const bookId = choiceId.slice(DOCUMENT_CHOICE_PREFIX.length).trim();
  return bookId || null;
}
function getScopedEntryIds(book, nodeId, includeDescendants) {
  const node = book.tree.nodes[nodeId];
  if (!node)
    return [];
  const nodeIds = includeDescendants ? getDescendantCategoryIds(book.tree, nodeId, Number.MAX_SAFE_INTEGER) : [nodeId];
  const scopedEntryIds = uniqueStrings(nodeIds.flatMap((currentNodeId) => book.tree.nodes[currentNodeId]?.entryIds ?? []));
  if (nodeId === book.tree.rootId) {
    scopedEntryIds.push(...book.tree.unassignedEntryIds);
  }
  return uniqueStrings(scopedEntryIds);
}
function getScopeBreadcrumb(book, nodeId) {
  if (nodeId === book.tree.rootId)
    return "Root";
  const labels = [];
  const visited = new Set;
  let cursor = book.tree.nodes[nodeId];
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (cursor.id !== book.tree.rootId)
      labels.push(cursor.label);
    cursor = cursor.parentId ? book.tree.nodes[cursor.parentId] : undefined;
  }
  return labels.reverse().join(" > ") || "Root";
}
function buildPreviewScopes(scopes, manifestCounts = new Map, selectionReasons = new Map) {
  const seen = new Set;
  const previews = [];
  for (const scope of scopes) {
    const key = `${scope.book.summary.id}:${scope.nodeId}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    const node = scope.book.tree.nodes[scope.nodeId];
    if (!node)
      continue;
    const isRootScope = scope.nodeId === scope.book.tree.rootId;
    previews.push({
      nodeId: node.id,
      label: isRootScope ? scope.book.summary.name : node.label || scope.book.summary.name,
      worldBookId: scope.book.summary.id,
      worldBookName: scope.book.summary.name,
      breadcrumb: getScopeBreadcrumb(scope.book, scope.nodeId),
      summary: truncateText(node.summary || "", 220),
      descendantEntryCount: getScopedEntryIds(scope.book, scope.nodeId, true).length,
      manifestEntryCount: manifestCounts.get(key),
      selectionReason: selectionReasons.get(key)
    });
  }
  return previews;
}
function buildPreviewScopeManifests(manifests) {
  return manifests.map((item) => ({
    nodeId: item.scope.nodeId,
    label: item.scope.nodeId === item.scope.book.tree.rootId ? item.scope.book.summary.name : item.scope.book.tree.nodes[item.scope.nodeId]?.label || item.scope.book.summary.name,
    worldBookId: item.scope.book.summary.id,
    worldBookName: item.scope.book.summary.name,
    breadcrumb: getScopeBreadcrumb(item.scope.book, item.scope.nodeId),
    manifestEntryCount: item.candidates.length,
    selectedEntryIds: []
  }));
}
function buildScopedManifests(candidates, scopes) {
  const candidatesById = new Map(candidates.map((item) => [item.entry.entryId, item]));
  const candidateOrder = new Map(candidates.map((item, index) => [item.entry.entryId, index]));
  return scopes.map((scope) => {
    const scopeCandidates = getScopedEntryIds(scope.book, scope.nodeId, true).map((entryId) => candidatesById.get(entryId)).filter((item) => !!item).sort((left, right) => {
      const leftOrder = candidateOrder.get(left.entry.entryId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = candidateOrder.get(right.entry.entryId) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || right.score - left.score || left.entry.label.localeCompare(right.entry.label);
    });
    if (!scopeCandidates.length)
      return null;
    return {
      scope,
      candidates: scopeCandidates
    };
  }).filter((item) => !!item);
}
function collectCandidatesForScopes(queryText, scopes, directEntryIds = [], fallbackById, preserveScopeOrder = false, excludedEntryIds = EMPTY_ENTRY_ID_SET) {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  const selected = [];
  const seen = new Set;
  for (const scope of scopes) {
    const entriesById = new Map(scope.book.cache.entries.map((entry) => [entry.entryId, entry]));
    for (const entryId of getScopedEntryIds(scope.book, scope.nodeId, true)) {
      if (seen.has(entryId))
        continue;
      if (excludedEntryIds.has(entryId))
        continue;
      const entry = entriesById.get(entryId);
      if (!entry || entry.disabled)
        continue;
      seen.add(entryId);
      const scored = normalized && queryTokens.length ? scoreEntry(entry, scope.book.tree, normalized, queryTokens) : { entry, score: 0, reasons: [] };
      const reasons = uniqueStrings([...scored.reasons, "branch"]);
      selected.push({
        entry,
        score: scored.score > 0 ? scored.score + 0.25 : 0.25,
        reasons
      });
    }
  }
  if (directEntryIds.length) {
    const allBooks = new Map(scopes.map((scope) => [scope.book.summary.id, scope.book]));
    for (const entryId of directEntryIds) {
      if (seen.has(entryId))
        continue;
      if (excludedEntryIds.has(entryId))
        continue;
      let resolved = false;
      for (const book of allBooks.values()) {
        const entriesById = new Map(book.cache.entries.map((entry2) => [entry2.entryId, entry2]));
        const entry = entriesById.get(entryId);
        if (!entry || entry.disabled)
          continue;
        seen.add(entryId);
        const scored = normalized && queryTokens.length ? scoreEntry(entry, book.tree, normalized, queryTokens) : { entry, score: 0, reasons: [] };
        selected.push({
          entry,
          score: scored.score > 0 ? scored.score : 0.5,
          reasons: uniqueStrings([...scored.reasons, "direct"])
        });
        resolved = true;
        break;
      }
      if (resolved || !fallbackById)
        continue;
      const fallback = fallbackById.get(entryId);
      if (!fallback)
        continue;
      seen.add(entryId);
      selected.push({
        entry: fallback.entry,
        score: fallback.score > 0 ? fallback.score : 0.5,
        reasons: uniqueStrings([...fallback.reasons, "direct"])
      });
    }
  }
  if (preserveScopeOrder)
    return selected;
  return selected.sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}
function makeScopeKey(scope) {
  return `${scope.book.summary.id}:${scope.nodeId}`;
}
function dedupeScopes(scopes) {
  const unique = new Map;
  for (const scope of scopes) {
    unique.set(makeScopeKey(scope), scope);
  }
  return Array.from(unique.values());
}
function isNodeAncestor(tree, ancestorId, nodeId) {
  if (ancestorId === nodeId)
    return true;
  const visited = new Set;
  let cursor = tree.nodes[nodeId];
  while (cursor?.parentId && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (cursor.parentId === ancestorId)
      return true;
    cursor = tree.nodes[cursor.parentId];
  }
  return false;
}
function collectChildScopeChoices(scopes, deterministicById, config) {
  const categories = [];
  const seen = new Set;
  for (const scope of scopes) {
    const node = scope.book.tree.nodes[scope.nodeId];
    if (!node || getNodeDepth(scope.book.tree, scope.nodeId) >= config.maxTraversalDepth)
      continue;
    for (const childId of node.childIds) {
      const child = scope.book.tree.nodes[childId];
      if (!child)
        continue;
      const choiceId = child.id;
      if (seen.has(choiceId))
        continue;
      seen.add(choiceId);
      const matchMeta = describeScopeMatches(scope.book, child.id, deterministicById);
      categories.push({
        choiceId,
        book: scope.book,
        nodeId: child.id,
        label: `${scope.book.summary.name} :: ${child.label}`,
        summary: truncateText(child.summary || "", 160),
        depth: getNodeDepth(scope.book.tree, child.id),
        childCount: child.childIds.length,
        entryCount: getScopedEntryIds(scope.book, child.id, true).length,
        relevance: matchMeta.relevance,
        matchHints: []
      });
    }
  }
  return categories;
}
function sortScopeChoices(choices) {
  return choices.slice().sort((left, right) => right.relevance - left.relevance || right.depth - left.depth || left.entryCount - right.entryCount || left.label.localeCompare(right.label));
}
function resolveScopeChoices(nodeIds, books) {
  const booksById = new Map(books.map((book) => [book.summary.id, book]));
  const scopes = new Map;
  for (const choiceId of nodeIds) {
    const documentBookId = parseDocumentChoiceId(choiceId);
    if (documentBookId) {
      const book2 = booksById.get(documentBookId);
      if (!book2)
        continue;
      scopes.set(makeScopeKey({ book: book2, nodeId: book2.tree.rootId }), { book: book2, nodeId: book2.tree.rootId });
      continue;
    }
    const legacyChoice = parseCategoryChoiceId(choiceId);
    if (legacyChoice) {
      const book2 = booksById.get(legacyChoice.bookId);
      if (!book2 || !book2.tree.nodes[legacyChoice.nodeId])
        continue;
      scopes.set(makeScopeKey({ book: book2, nodeId: legacyChoice.nodeId }), { book: book2, nodeId: legacyChoice.nodeId });
      continue;
    }
    const matchingBooks = books.filter((book2) => !!book2.tree.nodes[choiceId]);
    if (matchingBooks.length !== 1)
      continue;
    const [book] = matchingBooks;
    scopes.set(makeScopeKey({ book, nodeId: choiceId }), { book, nodeId: choiceId });
  }
  return Array.from(scopes.values());
}
function chooseDeterministicScopes(currentScopes, deterministicById, config) {
  const choices = collectChildScopeChoices(currentScopes, deterministicById, config);
  const ranked = sortScopeChoices(choices).filter((choice) => choice.entryCount > 0);
  if (!ranked.length)
    return currentScopes;
  const selected = [];
  for (const choice of ranked) {
    const scope = { book: choice.book, nodeId: choice.nodeId };
    const overlaps = selected.some((existing) => existing.book.summary.id === scope.book.summary.id && (isNodeAncestor(scope.book.tree, existing.nodeId, scope.nodeId) || isNodeAncestor(scope.book.tree, scope.nodeId, existing.nodeId)));
    if (overlaps)
      continue;
    selected.push(scope);
    if (selected.length >= MAX_SCOPE_CHOICES)
      break;
  }
  return selected.length ? selected : currentScopes;
}
function buildInitialScopePrompt(recentConversation, treeOverview) {
  return [
    'Return ONLY JSON in this exact shape: {"nodeIds":["node-id-1"],"reason":"brief explanation"}.',
    `Pick 1-${MAX_SCOPE_CHOICES} nodeIds maximum.`,
    "Rules:",
    "- Prefer specific leaves over broad branches.",
    "- Pick only nodeIds exactly as shown in the knowledge tree index.",
    "- If document selectors like doc:<bookId> are shown, you may pick them to narrow to a single lorebook before refining deeper.",
    "- Pick nodes whose content would be most useful for the next reply.",
    "- Do not choose entries directly. Exact entry selection happens later after node retrieval.",
    "- If nothing seems relevant, return an empty nodeIds array.",
    "",
    "KNOWLEDGE TREE INDEX:",
    treeOverview || "- none",
    "",
    buildPromptContext(recentConversation)
  ].filter(Boolean).join(`
`);
}
function buildChildScopePrompt(recentConversation, scopes, categories, step, config) {
  return [
    'Return ONLY JSON in this exact shape: {"action":"refine|retrieve","nodeIds":["node-id-1"],"reason":"brief explanation"}.',
    `Traversal step ${step + 1} of ${config.traversalStepLimit}.`,
    "Rules:",
    `- Pick 1-${MAX_SCOPE_CHOICES} category nodeIds maximum from the choices below.`,
    '- Use action "refine" when child categories should be opened before retrieval.',
    '- Use action "retrieve" when the chosen nodeIds are already specific enough to resolve entries.',
    "- Prefer specific leaves over broad branches.",
    "- Do not choose entries directly. Exact entry selection happens later after node retrieval.",
    "",
    buildPromptContext(recentConversation),
    `Current scopes: ${scopes.map((scope) => `${scope.book.summary.name} :: ${getScopeBreadcrumb(scope.book, scope.nodeId)}`).join(" | ")}`,
    "",
    "CATEGORY CHOICES:",
    ...categories.length ? categories.map((category) => `- [${category.nodeId}] ${category.label} [${category.childCount > 0 ? "branch" : "leaf"}] (${category.entryCount} entries)
  ${category.summary || "No summary."}`) : ["- none"]
  ].filter(Boolean).join(`
`);
}
function buildTraceScopeSummary(scopes) {
  if (!scopes.length)
    return "No scopes selected.";
  return scopes.map((scope) => `${scope.book.summary.name} :: ${getScopeBreadcrumb(scope.book, scope.nodeId)}`).join(" | ");
}
function buildFallbackReason(fallbackPath) {
  return fallbackPath.length ? fallbackPath.join(" ") : null;
}
async function chooseCollapsedScopes(recentConversation, books, config, controller, allowController, deterministicById, trace) {
  const rootScopes = books.map((book) => ({ book, nodeId: book.tree.rootId }));
  const fallbackPath = [];
  let scopes = [];
  let selectionReason = "Controller selected retrieval scopes.";
  if (allowController) {
    const response = await runControllerJson2(buildInitialScopePrompt(recentConversation, buildFullTraversalTreeOverview(rootScopes)), controller, RETRIEVAL_SCOPE_SYSTEM_PROMPT, "Choose collapsed scopes");
    const requestedNodeIds = Array.isArray(response.parsed?.nodeIds) ? response.parsed.nodeIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
    scopes = resolveScopeChoices(requestedNodeIds, books);
    const controllerReason = typeof response.parsed?.reason === "string" && response.parsed.reason.trim() ? response.parsed.reason.trim() : "Controller selected retrieval scopes.";
    if (scopes.length) {
      selectionReason = controllerReason;
    } else {
      fallbackPath.push(response.error ?? (requestedNodeIds.length ? "Collapsed scope selection returned nodeIds that did not map to visible scopes; used top-level deterministic scope fallback." : "Collapsed scope selection returned an empty nodeIds array; used top-level deterministic scope fallback."));
      scopes = chooseDeterministicScopes(rootScopes, deterministicById, config);
      selectionReason = fallbackPath[fallbackPath.length - 1];
    }
  } else {
    fallbackPath.push("Collapsed scope selection skipped the controller and used top-level deterministic scope fallback.");
    scopes = chooseDeterministicScopes(rootScopes, deterministicById, config);
    selectionReason = fallbackPath[fallbackPath.length - 1];
  }
  pushTrace(trace, "choose_scope", "Choose scopes", `${selectionReason} Selected ${scopes.length} scope(s): ${buildTraceScopeSummary(scopes)}.`, {
    bookId: scopes[0]?.book.summary.id ?? null,
    nodeId: scopes[0]?.nodeId ?? null,
    entryCount: scopes.reduce((total, scope) => total + getScopedEntryIds(scope.book, scope.nodeId, true).length, 0)
  });
  if (shouldRefineRetrievedScopes(scopes, config)) {
    const categories = collectChildScopeChoices(scopes, deterministicById, config);
    if (categories.length) {
      let refinedScopes = [];
      let refinedReason = "Refined broad scopes.";
      if (allowController) {
        const refinement = await runControllerJson2(buildChildScopePrompt(recentConversation, scopes, categories, 1, config), controller, RETRIEVAL_SCOPE_SYSTEM_PROMPT, "Refine collapsed scopes");
        const requestedNodeIds = Array.isArray(refinement.parsed?.nodeIds) ? refinement.parsed.nodeIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
        refinedScopes = resolveScopeChoices(requestedNodeIds, books);
        refinedReason = typeof refinement.parsed?.reason === "string" && refinement.parsed.reason.trim() ? refinement.parsed.reason.trim() : "Refined broad scopes.";
        if (!refinedScopes.length) {
          fallbackPath.push(refinement.error ?? (requestedNodeIds.length ? "Collapsed scope refinement returned nodeIds that did not map to current child scopes; used deterministic child-scope fallback." : "Collapsed scope refinement returned an empty nodeIds array; used deterministic child-scope fallback."));
          refinedScopes = chooseDeterministicScopes(scopes, deterministicById, config);
          refinedReason = fallbackPath[fallbackPath.length - 1];
        }
      } else {
        fallbackPath.push("Collapsed scope refinement skipped the controller and used deterministic child scopes.");
        refinedScopes = chooseDeterministicScopes(scopes, deterministicById, config);
        refinedReason = fallbackPath[fallbackPath.length - 1];
      }
      if (refinedScopes.length) {
        scopes = refinedScopes;
        selectionReason = refinedReason;
        pushTrace(trace, "refine_scope", "Refine scopes", `${refinedReason} Narrowed retrieval to ${scopes.length} scope(s): ${buildTraceScopeSummary(scopes)}.`, {
          bookId: scopes[0]?.book.summary.id ?? null,
          nodeId: scopes[0]?.nodeId ?? null,
          entryCount: scopes.reduce((total, scope) => total + getScopedEntryIds(scope.book, scope.nodeId, true).length, 0)
        });
      }
    }
  }
  return { scopes, fallbackPath, selectionReason };
}
async function chooseTraversalScopes(recentConversation, books, config, controller, allowController, deterministicById, trace) {
  const rootScopes = books.map((book) => ({ book, nodeId: book.tree.rootId }));
  const fallbackPath = [];
  let scopes = [];
  let selectionReason = "Controller selected traversal scopes.";
  if (allowController) {
    const response = await runControllerJson2(buildInitialScopePrompt(recentConversation, buildFullTraversalTreeOverview(rootScopes)), controller, RETRIEVAL_SCOPE_SYSTEM_PROMPT, "Choose traversal scopes");
    const requestedNodeIds = Array.isArray(response.parsed?.nodeIds) ? response.parsed.nodeIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
    scopes = resolveScopeChoices(requestedNodeIds, books);
    const controllerReason = typeof response.parsed?.reason === "string" && response.parsed.reason.trim() ? response.parsed.reason.trim() : "Controller selected traversal scopes.";
    if (scopes.length) {
      selectionReason = controllerReason;
    } else {
      fallbackPath.push(response.error ?? (requestedNodeIds.length ? "Traversal scope selection returned nodeIds that did not map to visible scopes; used top-level deterministic scope fallback." : "Traversal scope selection returned an empty nodeIds array; used top-level deterministic scope fallback."));
      scopes = chooseDeterministicScopes(rootScopes, deterministicById, config);
      selectionReason = fallbackPath[fallbackPath.length - 1];
    }
  } else {
    fallbackPath.push("Traversal scope selection skipped the controller and used top-level deterministic scope fallback.");
    scopes = chooseDeterministicScopes(rootScopes, deterministicById, config);
    selectionReason = fallbackPath[fallbackPath.length - 1];
  }
  pushTrace(trace, "choose_scope", "Choose scopes", `${selectionReason} Selected ${scopes.length} scope(s): ${buildTraceScopeSummary(scopes)}.`, {
    bookId: scopes[0]?.book.summary.id ?? null,
    nodeId: scopes[0]?.nodeId ?? null,
    entryCount: scopes.reduce((total, scope) => total + getScopedEntryIds(scope.book, scope.nodeId, true).length, 0)
  });
  for (let step = 1;step < config.traversalStepLimit; step += 1) {
    if (!shouldRefineRetrievedScopes(scopes, config))
      break;
    const categories = collectChildScopeChoices(scopes, deterministicById, config);
    if (!categories.length)
      break;
    let nextScopes = [];
    let nextReason = "Traversal scope refinement narrowed the current scopes.";
    let shouldContinue = false;
    if (allowController) {
      const response = await runControllerJson2(buildChildScopePrompt(recentConversation, scopes, categories, step, config), controller, RETRIEVAL_SCOPE_SYSTEM_PROMPT, "Refine traversal scopes");
      const requestedNodeIds = Array.isArray(response.parsed?.nodeIds) ? response.parsed.nodeIds.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
      nextScopes = resolveScopeChoices(requestedNodeIds, books);
      nextReason = typeof response.parsed?.reason === "string" && response.parsed.reason.trim() ? response.parsed.reason.trim() : "Traversal scope refinement narrowed the current scopes.";
      const action = typeof response.parsed?.action === "string" ? response.parsed.action.trim().toLowerCase() : "retrieve";
      if (!nextScopes.length) {
        fallbackPath.push(response.error ?? (requestedNodeIds.length ? "Traversal scope refinement returned nodeIds that did not map to current child scopes; used deterministic child-scope fallback." : "Traversal scope refinement returned an empty nodeIds array; used deterministic child-scope fallback."));
        nextScopes = chooseDeterministicScopes(scopes, deterministicById, config);
        nextReason = fallbackPath[fallbackPath.length - 1];
      }
      shouldContinue = action === "refine" && nextScopes.length > 0;
    } else {
      fallbackPath.push("Traversal refinement skipped the controller and used deterministic child scopes.");
      nextScopes = chooseDeterministicScopes(scopes, deterministicById, config);
      nextReason = fallbackPath[fallbackPath.length - 1];
      shouldContinue = false;
    }
    if (!nextScopes.length)
      break;
    scopes = nextScopes;
    selectionReason = nextReason;
    pushTrace(trace, "refine_scope", "Refine scopes", `${nextReason} Narrowed retrieval to ${scopes.length} scope(s): ${buildTraceScopeSummary(scopes)}.`, {
      bookId: scopes[0]?.book.summary.id ?? null,
      nodeId: scopes[0]?.nodeId ?? null,
      entryCount: scopes.reduce((total, scope) => total + getScopedEntryIds(scope.book, scope.nodeId, true).length, 0)
    });
    if (!shouldContinue)
      break;
  }
  return { scopes, fallbackPath, selectionReason };
}
function populateScopeManifestSelections(scopeManifestCounts, selected, scopes) {
  const previews = scopeManifestCounts.map((item) => ({ ...item, selectedEntryIds: [...item.selectedEntryIds] }));
  for (const item of selected) {
    for (const scope of scopes) {
      const scopeEntryIds = getScopedEntryIds(scope.book, scope.nodeId, true);
      if (!scopeEntryIds.includes(item.entry.entryId))
        continue;
      const key = `${scope.book.summary.id}:${scope.nodeId}`;
      const preview = previews.find((candidate) => `${candidate.worldBookId}:${candidate.nodeId}` === key);
      if (!preview)
        continue;
      if (!preview.selectedEntryIds.includes(item.entry.entryId)) {
        preview.selectedEntryIds.push(item.entry.entryId);
      }
      break;
    }
  }
  return previews;
}
async function selectEntriesForScopes(recentConversation, scopes, config, controller, allowController, deterministicById, trace, maxDynamicEntries, excludedEntryIds = EMPTY_ENTRY_ID_SET) {
  const fallbackPath = [];
  let activeScopes = dedupeScopes(scopes);
  let selectionReason = null;
  const rawCandidates = collectCandidatesForScopes(recentConversation, activeScopes, [], deterministicById, !config.selectiveRetrieval, excludedEntryIds);
  const rankedCandidates = rankSelectionCandidates(recentConversation, rawCandidates, activeScopes);
  const candidates = rankedCandidates.map((item) => ({ ...item.candidate, selectionRole: item.selectionRole }));
  const manifests = buildScopedManifests(candidates, activeScopes);
  if (!candidates.length) {
    pushTrace(trace, "fallback", "No scoped entries", "The chosen scopes did not resolve any candidate entries.");
    return {
      scopes: activeScopes,
      selected: [],
      candidates,
      manifests,
      fallbackPath: [...fallbackPath, "Chosen scopes did not resolve any candidate entries."],
      selectionReason
    };
  }
  let selected;
  if (config.selectiveRetrieval) {
    const beforeCalls = controller.callCount;
    selected = await maybeSelectEntries(recentConversation, candidates, config, controller, allowController, activeScopes, maxDynamicEntries);
    if (controller.callCount === beforeCalls && !allowController) {
      fallbackPath.push("Selective manifest selection skipped the controller and used deterministic scoped fallback.");
    }
    pushTrace(trace, "manifest_select", "Select manifest entries", `Scoped manifests exposed ${candidates.length} candidate entr${candidates.length === 1 ? "y" : "ies"} across ${Math.max(manifests.length, 1)} chosen scope(s), and ${selected.length} final dynamic entry candidate(s) were selected for injection (cap ${maxDynamicEntries}).`, { entryCount: selected.length });
  } else {
    selected = candidates;
    pushTrace(trace, "retrieve", "Resolve scoped entries", `Resolved ${selected.length} scoped entry candidate(s) directly from ${Math.max(activeScopes.length, 1)} chosen scope(s).`, { entryCount: selected.length });
  }
  return { scopes: activeScopes, selected, candidates, manifests, fallbackPath, selectionReason };
}
function describeScopeMatches(book, nodeId, deterministicById) {
  const matches = getScopedEntryIds(book, nodeId, true).map((entryId) => deterministicById.get(entryId)).filter((item) => !!item).sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label)).slice(0, 3);
  return {
    relevance: matches.reduce((total, item, index) => total + item.score / (index + 1), 0),
    matchHints: matches.map((item) => item.entry.label)
  };
}
function buildFullTraversalTreeOverview(scopes) {
  const lines = [];
  const seenScopes = new Set;
  const visitedNodes = new Set;
  const rootScopes = dedupeScopes(scopes.filter((scope) => scope.nodeId === scope.book.tree.rootId));
  const multiBook = rootScopes.length > 1;
  const pushNode = (book, nodeId, depth) => {
    const visitKey = `${book.summary.id}:${nodeId}`;
    if (visitedNodes.has(visitKey))
      return;
    visitedNodes.add(visitKey);
    const node = book.tree.nodes[nodeId];
    if (!node)
      return;
    const indent = "  ".repeat(depth);
    const type = node.childIds.length ? "branch" : "leaf";
    lines.push(`${indent}[${node.id}] ${node.label || "Unnamed"} [${type}] (${getScopedEntryIds(book, node.id, true).length} entries)`);
    if (node.summary?.trim()) {
      lines.push(`${indent}  ${truncateText(node.summary.trim(), 180)}`);
    }
    for (const childId of node.childIds) {
      pushNode(book, childId, depth + 1);
    }
  };
  for (const scope of scopes) {
    const scopeKey = `${scope.book.summary.id}:${scope.nodeId}`;
    if (seenScopes.has(scopeKey))
      continue;
    seenScopes.add(scopeKey);
    const scopeNode = scope.book.tree.nodes[scope.nodeId];
    if (!scopeNode)
      continue;
    if (scope.nodeId === scope.book.tree.rootId) {
      if (multiBook) {
        lines.push(`[${makeDocumentChoiceId(scope.book.summary.id)}] ${scope.book.summary.name} (${scope.book.cache.entries.length} entries total)`);
      } else {
        lines.push(`Lorebook: ${scope.book.summary.name}`);
      }
      const rootSummary = truncateText(scopeNode.summary || scope.book.config.description || scope.book.summary.description || "", 180);
      if (rootSummary) {
        lines.push(`  ${rootSummary}`);
      }
      if (scope.book.tree.unassignedEntryIds.length) {
        lines.push(`  [${scope.book.tree.rootId}] ROOT [leaf] (${scope.book.tree.unassignedEntryIds.length} entries)`);
      }
      for (const childId of scopeNode.childIds) {
        pushNode(scope.book, childId, 0);
      }
      lines.push("");
      continue;
    }
    lines.push(`Scope: ${getScopeBreadcrumb(scope.book, scope.nodeId)} (${scope.book.summary.name})`);
    pushNode(scope.book, scope.nodeId, 0);
    lines.push("");
  }
  const text = lines.join(`
`).trim();
  if (text.length <= TRAVERSAL_FULL_OVERVIEW_LIMIT)
    return text;
  return `${text.slice(0, TRAVERSAL_FULL_OVERVIEW_LIMIT - 28).trimEnd()}
... (tree index truncated)`;
}
function shouldRefineRetrievedScopes(scopes, config) {
  return scopes.some((scope) => {
    const node = scope.book.tree.nodes[scope.nodeId];
    if (!node)
      return false;
    const descendantCount = getScopedEntryIds(scope.book, scope.nodeId, true).length;
    return node.childIds.length > 0 ? descendantCount > 8 : descendantCount > 10;
  });
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
      previewText: truncateText(getEntryBody(item.entry), 240),
      selectionRole: item.selectionRole
    };
  });
}
function areSameScopes(left, right) {
  const leftKeys = left.map(makeScopeKey);
  const rightKeys = right.map(makeScopeKey);
  if (leftKeys.length !== rightKeys.length)
    return false;
  return leftKeys.every((key, index) => key === rightKeys[index]);
}
function buildInjectionText(selected, booksById, injectedEntryLimit, collapsedDepth) {
  if (!selected.length)
    return null;
  const maxEntries = clampInt(injectedEntryLimit, 1, 32);
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
      branchSummary ? `Branch summary: ${branchSummary}` : "",
      getEntryBody(item.entry)
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
  const allowController = options.allowController !== false;
  const queryText = buildQueryText(messages, config.contextMessages);
  const recentConversation = buildRecentConversation(messages, config.contextMessages) || queryText;
  if (!queryText.trim())
    return null;
  const readableBooks = books.filter((book) => isReadableBook(book.config));
  if (!readableBooks.length)
    return null;
  const reportProgress = options.reportProgress;
  const startedAt = options.capturedAt ?? Date.now();
  emitProgress(reportProgress, {
    type: "start",
    mode: config.searchMode,
    timestamp: startedAt,
    label: "Start retrieval",
    summary: `Started ${config.searchMode} retrieval across ${readableBooks.length} readable book(s).`,
    details: [`Recent conversation: ${truncateText(recentConversation, 260)}`]
  });
  const controller = {
    settings,
    userId,
    connectionId: resolveControllerConnectionId(settings, options.connectionId),
    controllerUsed: false,
    deadlineAt: Date.now() + CONTROLLER_TOTAL_BUDGET_MS,
    callCount: 0,
    reportProgress
  };
  const chooseBooksStartedAt = Date.now();
  const chosenBooksResult = await maybeChooseBooks(recentConversation, readableBooks, config, controller, allowController);
  const chooseBooksDurationMs = Date.now() - chooseBooksStartedAt;
  const chosenBooks = chosenBooksResult.books;
  const steps = [
    `${books.length} managed book(s) loaded.`,
    `${chosenBooks.length} readable book(s) selected for search in ${chooseBooksDurationMs} ms.`
  ];
  const booksById = new Map(chosenBooks.map((book) => [book.summary.id, book]));
  const trace = createTraceBuffer(reportProgress);
  trace.push(...chosenBooksResult.trace);
  const reservedConstants = collectReservedConstantEntries(chosenBooks);
  const reservedConstantCount = reservedConstants.length;
  const reservedEntryIds = new Set(reservedConstants.map((item) => item.entry.entryId));
  const configuredInjectCap = clampInt(config.tokenBudget, 1, 32);
  const remainingDynamicSlots = Math.max(0, configuredInjectCap - reservedConstantCount);
  const maxDynamicEntries = getDynamicEntryLimit(config, remainingDynamicSlots);
  const reservedConstantNodes = buildPreviewNodes(reservedConstants, booksById);
  if (reservedConstantCount) {
    const reservedSummary = `Reserved ${reservedConstantCount} native constant entr${reservedConstantCount === 1 ? "y" : "ies"} before dynamic retrieval, leaving ${remainingDynamicSlots} dynamic slot(s).`;
    steps.push(reservedSummary);
    pushTrace(trace, "inject", "Reserve constants", reservedSummary, { entryCount: reservedConstantCount });
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem("reserved", "Reserved constants", reservedSummary, {
        phase: "inject",
        count: reservedConstantCount,
        entries: reservedConstantNodes,
        tone: "info"
      })
    });
  } else {
    steps.push(`No native constant entries were reserved; ${remainingDynamicSlots} dynamic slot(s) are available.`);
  }
  const deterministic = scoreEntries(recentConversation, chosenBooks, reservedEntryIds);
  const deterministicById = new Map(deterministic.map((item) => [item.entry.entryId, item]));
  let selectedScopes = [];
  let pulledCandidates = [];
  let selected = [];
  let manifests = [];
  let selectionReason = "";
  let entrySelectionDurationMs = null;
  const fallbackPath = [];
  if (remainingDynamicSlots <= 0) {
    steps.push("Reserved constants consumed the full injection budget, so Lore Recall skipped dynamic retrieval.");
  } else if (!deterministic.length) {
    fallbackPath.push("Deterministic scoring found no matching entries, so Lore Recall injected nothing.");
    pushTrace(trace, "fallback", "No scored entries", fallbackPath[0]);
  } else {
    const scopeSelectionStartedAt = Date.now();
    const scopeSelection = config.searchMode === "traversal" ? await chooseTraversalScopes(recentConversation, chosenBooks, config, controller, allowController, deterministicById, trace) : await chooseCollapsedScopes(recentConversation, chosenBooks, config, controller, allowController, deterministicById, trace);
    const scopeSelectionDurationMs = Date.now() - scopeSelectionStartedAt;
    const initiallySelectedScopes = scopeSelection.scopes;
    selectedScopes = scopeSelection.scopes;
    selectionReason = scopeSelection.selectionReason;
    fallbackPath.push(...scopeSelection.fallbackPath);
    steps.push(`Node-first ${config.searchMode} retrieval selected ${selectedScopes.length} scope(s).`);
    const initialSelectionReasons = new Map(selectedScopes.map((scope) => [makeScopeKey(scope), selectionReason]));
    const initialScopePreviews = buildPreviewScopes(selectedScopes, new Map, initialSelectionReasons);
    if (initialScopePreviews.length) {
      emitProgress(reportProgress, {
        type: "item",
        item: createFeedItem("scope", "Selected scopes", `Working from ${initialScopePreviews.length} scope(s) across ${chosenBooks.length} readable book(s).`, {
          phase: "choose_scope",
          count: initialScopePreviews.length,
          scopes: initialScopePreviews,
          details: selectionReason ? [selectionReason] : undefined,
          tone: "info",
          durationMs: scopeSelectionDurationMs
        })
      });
    }
    const entrySelectionStartedAt = Date.now();
    const entrySelection = await selectEntriesForScopes(recentConversation, selectedScopes, config, controller, allowController, deterministicById, trace, maxDynamicEntries, reservedEntryIds);
    entrySelectionDurationMs = Date.now() - entrySelectionStartedAt;
    selectedScopes = entrySelection.scopes;
    pulledCandidates = entrySelection.candidates;
    selected = entrySelection.selected;
    manifests = entrySelection.manifests;
    fallbackPath.push(...entrySelection.fallbackPath);
    if (entrySelection.selectionReason) {
      selectionReason = entrySelection.selectionReason;
    }
    steps.push(`Resolved ${pulledCandidates.length} pulled entry candidate(s) across ${Math.max(selectedScopes.length, 1)} scope(s).`);
    steps.push(`Kept ${selected.length} entry candidate(s) for injection.`);
    if (!areSameScopes(initiallySelectedScopes, selectedScopes)) {
      const refinedReasons = new Map(selectedScopes.map((scope) => [makeScopeKey(scope), selectionReason]));
      const refinedScopePreviews = buildPreviewScopes(selectedScopes, new Map, refinedReasons);
      if (refinedScopePreviews.length) {
        emitProgress(reportProgress, {
          type: "item",
          item: createFeedItem("scope", "Refined scopes", `Narrowed retrieval to ${refinedScopePreviews.length} scope(s) before final selection.`, {
            phase: "refine_scope",
            count: refinedScopePreviews.length,
            scopes: refinedScopePreviews,
            details: selectionReason ? [selectionReason] : undefined,
            tone: "info",
            durationMs: scopeSelectionDurationMs
          })
        });
      }
    }
  }
  const pulledNodes = buildPreviewNodes(pulledCandidates.length ? pulledCandidates : selected, booksById);
  if (pulledNodes.length) {
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem("pulled", "Pulled candidates", `Resolved ${pulledNodes.length} pulled candidate entr${pulledNodes.length === 1 ? "y" : "ies"} from ${Math.max(selectedScopes.length, 1)} scope(s).`, {
        phase: "retrieve",
        count: pulledNodes.length,
        entries: pulledNodes,
        tone: "info",
        durationMs: entrySelectionDurationMs
      })
    });
  }
  const manifestCounts = new Map(manifests.map((item) => [makeScopeKey(item.scope), item.candidates.length]));
  const selectionReasons = new Map(selectedScopes.map((scope) => [makeScopeKey(scope), selectionReason]));
  const selectedScopePreviews = buildPreviewScopes(selectedScopes, manifestCounts, selectionReasons);
  const scopeManifestCounts = populateScopeManifestSelections(buildPreviewScopeManifests(manifests), selected, selectedScopes);
  const manifestSelectedEntries = buildPreviewNodes(selected, booksById);
  if (config.selectiveRetrieval || manifests.length) {
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem("manifest", "Manifest selection", `Selected ${manifestSelectedEntries.length} final entry candidate entr${manifestSelectedEntries.length === 1 ? "y" : "ies"} from ${pulledNodes.length} scoped manifest entr${pulledNodes.length === 1 ? "y" : "ies"}.`, {
        phase: "manifest_select",
        count: manifestSelectedEntries.length,
        scopes: selectedScopePreviews,
        entries: manifestSelectedEntries,
        tone: "info",
        durationMs: entrySelectionDurationMs
      })
    });
  }
  const maxInjectedEntries = remainingDynamicSlots;
  if (config.selectiveRetrieval && selected.length > maxInjectedEntries) {
    spindle.log.warn(`Lore Recall selective retrieval exceeded the inject cap before prompt assembly (${selected.length} > ${maxInjectedEntries}); applying safety clamp.`);
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem("issue", "Selective retrieval exceeded inject cap", `Selective retrieval produced ${selected.length} entries before injection, so Lore Recall had to safety-clamp to ${maxInjectedEntries}.`, {
        phase: "inject",
        tone: "warn",
        details: [
          `selected=${selected.length}`,
          `injectCap=${maxInjectedEntries}`
        ]
      })
    });
  }
  const injectionStartedAt = Date.now();
  const injection = remainingDynamicSlots > 0 ? buildInjectionText(selected, booksById, remainingDynamicSlots, config.collapsedDepth) : null;
  const injectionDurationMs = Date.now() - injectionStartedAt;
  const included = injection?.included ?? selected;
  const injectedNodes = buildPreviewNodes(included, booksById);
  const selectionSummary = summarizeSelection(selected, reservedConstantCount, remainingDynamicSlots);
  if (injection?.included.length) {
    pushTrace(trace, "inject", "Inject entries", `Injected ${injection.included.length} entry reference(s) into the interceptor prompt.`, { entryCount: injection.included.length, durationMs: injectionDurationMs });
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem("injected", "Injected entries", `Prepared ${injectedNodes.length} entr${injectedNodes.length === 1 ? "y" : "ies"} for prompt injection.`, {
        phase: "inject",
        count: injectedNodes.length,
        entries: injectedNodes,
        tone: "success",
        durationMs: injectionDurationMs
      })
    });
  } else {
    const skippedSummary = reservedConstantCount > 0 && remainingDynamicSlots <= 0 ? `Reserved constants consumed the full injection budget, so Lore Recall injected no additional dynamic entries.` : reservedConstantCount > 0 ? `No additional dynamic entries were injected after reserving ${reservedConstantCount} constant entr${reservedConstantCount === 1 ? "y" : "ies"}.` : "No retrieved entries were injected for this turn.";
    if (reservedConstantCount > 0 && remainingDynamicSlots <= 0) {
      pushTrace(trace, "inject", "Dynamic injection skipped", skippedSummary, { entryCount: 0, durationMs: injectionDurationMs });
    }
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem("injected", "Injection skipped", skippedSummary, {
        phase: "inject",
        count: 0,
        tone: selected.length ? "warn" : reservedConstantCount > 0 ? "success" : "info",
        durationMs: injectionDurationMs
      })
    });
  }
  const fallbackReason = buildFallbackReason(fallbackPath);
  if (fallbackReason) {
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem("issue", "Fallback path active", fallbackReason, {
        phase: "fallback",
        tone: "warn",
        details: fallbackPath
      })
    });
  }
  const resolvedConnectionId = controller.controllerUsed ? controller.connectionId : null;
  emitProgress(reportProgress, {
    type: "finish",
    timestamp: Date.now(),
    status: fallbackReason ? "fallback" : "completed",
    controllerUsed: controller.controllerUsed,
    resolvedConnectionId,
    fallbackReason
  });
  return {
    mode: config.searchMode,
    queryText,
    recentConversation,
    estimatedTokens: injection?.estimatedTokens ?? 0,
    injectedText: injection?.text ?? "",
    selectionSummary,
    reservedConstantCount,
    remainingDynamicSlots,
    selectedScopes: selectedScopePreviews,
    retrievedScopes: selectedScopePreviews,
    scopeManifestCounts,
    reservedConstantNodes,
    pulledNodes,
    injectedNodes,
    manifestSelectedEntries,
    selectedNodes: selectedScopePreviews,
    fallbackReason,
    fallbackPath,
    selectedBookIds: chosenBooks.map((book) => book.summary.id),
    steps,
    trace,
    capturedAt: options.capturedAt ?? Date.now(),
    isActual: options.isActual === true,
    controllerUsed: controller.controllerUsed,
    resolvedConnectionId
  };
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
    `Final top-level category target for the whole book: ${granularity.targetCategories}. Hard cap: ${granularity.targetTopLevelMax} top-level categories total.`
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
  const entryIds = getDescendantCategoryIds2(tree, nodeId, Number.MAX_SAFE_INTEGER).flatMap((currentNodeId) => tree.nodes[currentNodeId]?.entryIds ?? []);
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
        `Target: keep subcategories around ${granularity.maxEntries} entries or fewer when practical.`,
        "Rules:",
        "- Use short reusable subcategory labels.",
        "- The path should be relative to the current category, not the full tree.",
        "- Create at least 2 useful subcategories when a split is possible.",
        "- Leave path [] only if an entry truly belongs directly on the current category.",
        "",
        "Entries:",
        ...nodeEntries.map((entry) => JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail)))
      ].join(`
`);
      const controllerResult = await runControllerJson3(prompt, settings, userId, "assignments", "lore_recall_tree_subdivide", ASSIGNMENTS_SCHEMA, {
        systemPrompt: CATEGORIZATION_SYSTEM_PROMPT,
        maxTokensOverride: Math.min(settings.controllerMaxTokens, 900)
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
    controllerSettings: {
      controllerConnectionId: input.settings.controllerConnectionId,
      controllerTemperature: input.settings.controllerTemperature,
      controllerMaxTokens: input.settings.controllerMaxTokens,
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
async function runControllerJson3(prompt, settings, userId, primaryKey, schemaName, schema, options = {}) {
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
        required: ["entryId"]
      }
    }
  },
  required: ["entries"]
};
function collectCategorySummaryContext(tree, nodeId, entries) {
  const node = tree.nodes[nodeId];
  if (!node)
    return { childLabels: [], sampleEntries: [] };
  const descendantIds = getDescendantCategoryIds2(tree, nodeId, 2);
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
  const controllerResult = await runControllerJson3(prompt, settings, userId, "summaries", "lore_recall_category_summaries", CATEGORY_SUMMARIES_SCHEMA, {
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    maxTokensOverride: Math.min(settings.controllerMaxTokens, 700)
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
    'Return ONLY JSON in this exact shape: {"entries":[{"entryId":"...","summary":"...","collapsedText":"..."}]}',
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
  const controllerResult = await runControllerJson3(buildEntrySummaryPrompt(entries), settings, userId, "entries", "lore_recall_entry_summaries", ENTRY_SUMMARIES_SCHEMA, {
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    maxTokensOverride: Math.min(settings.controllerMaxTokens, 1400)
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
      const tree = createEmptyTreeIndex(bookId);
      const updates = [];
      const chunks = chunkEntries(cache.entries, settings.chunkTokens, (entry) => JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail)).length);
      const granularity = getEffectiveTreeGranularity(settings.treeGranularity, cache.entries.length);
      const allEntryManifest = chunks.length > 1 ? cache.entries.map((entry) => truncateText(entry.label || entry.comment || entry.entryId, 80)).filter(Boolean).join(`
- `) : "";
      const entrySummaryBatchSize = 8;
      const entrySummaryBatches = Array.from({ length: Math.ceil(cache.entries.length / entrySummaryBatchSize) }, (_, index) => cache.entries.slice(index * entrySummaryBatchSize, (index + 1) * entrySummaryBatchSize)).filter((batch) => batch.length > 0);
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
        const prompt = [
          "Organize these lore entries into a compact retrieval tree.",
          'Return ONLY JSON in this exact shape: {"assignments":[{"entryId":"...","path":["Category","Subcategory"]}]}',
          `Build detail: ${getBuildDetailLabel(settings.buildDetail)}. ${getBuildDetailDescription(settings.buildDetail)}`,
          `Tree granularity: ${granularity.label}${granularity.isAuto ? " (auto)" : ""}. Aim for ${granularity.targetCategories} top-level categories and no more than ${granularity.maxEntries} entries per leaf category.`,
          ...buildExistingTreeGuidance(tree, granularity, chunkIndex, chunkCount),
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
        const controllerResult = await runControllerJson3(prompt, settings, userId, "assignments", "lore_recall_tree_assignments", ASSIGNMENTS_SCHEMA, {
          systemPrompt: CATEGORIZATION_SYSTEM_PROMPT,
          maxTokensOverride: Math.min(settings.controllerMaxTokens, 1200)
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
        const assignments = parsed.assignments.filter((value) => !!value && typeof value === "object");
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
        }
        completedUnits += 1;
      }
      await subdivideLargeLeafNodes(tree, cache.entries, granularity, settings, userId);
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
          updates.push(...await generateEntrySummaryBatch(entryBatch, settings, userId));
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
      const updates = await generateEntrySummaryBatch(targetEntries, settings, userId);
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
      operation?.progress({
        phase: "entries_complete",
        message: `Updated ${targetEntries.length} entry summary${targetEntries.length === 1 ? "" : "ies"} for ${bookName}.`,
        current: completed,
        total: totalTargets,
        percent: Math.round(completed / totalTargets * 100),
        bookId,
        bookName,
        chunkCurrent: 1,
        chunkTotal: 1
      });
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
  if (characterConfig?.searchMode === "traversal" && characterConfig.selectiveRetrieval && characterConfig.traversalStepLimit < 3) {
    diagnostics.push({
      id: "selective-traversal-limit",
      severity: "warn",
      bookId: null,
      title: "Traversal step limit is low for selective retrieval",
      detail: "Selective retrieval in traversal mode works best with at least 3 traversal steps so Lore Recall can choose useful scopes before picking exact entries from their manifests."
    });
  }
  if (!readableBooks.length && runtimeBooks.length) {
    diagnostics.push({
      id: "no-readable-books",
      severity: "warn",
      bookId: null,
      title: "No readable managed books",
      detail: "All managed books are currently disabled or write-only, so Lore Recall has nothing it can search during retrieval."
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
    const oversizedLeafNodes = categoryNodes.filter((node) => node.childIds.length === 0 && node.entryIds.length >= 20);
    const overviewEstimate = categoryNodes.reduce((total, node) => total + 48 + node.label.length + Math.min(node.summary.length, 120), 0);
    const rootSummary = book.tree.nodes[book.tree.rootId]?.summary?.trim() ?? "";
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
    if (categoryNodes.length && categorySummaryCount < categoryNodes.length) {
      diagnostics.push({
        id: `category-summary:${book.summary.id}`,
        severity: categorySummaryCount === 0 ? "warn" : "info",
        bookId: book.summary.id,
        title: "Category summary coverage is incomplete",
        detail: `${book.summary.name} has ${categorySummaryCount}/${categoryNodes.length} category summaries. Tree navigation works better when categories have short summaries.`
      });
    }
    if (oversizedLeafNodes.length) {
      diagnostics.push({
        id: `oversized-leaf:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Some leaf categories are oversized",
        detail: `${book.summary.name} has ${oversizedLeafNodes.length} leaf categor${oversizedLeafNodes.length === 1 ? "y" : "ies"} with 20 or more direct entries. Rebuild with LLM to split oversized leaves into more specific branches.`
      });
    }
    if (overviewEstimate > 1e4) {
      diagnostics.push({
        id: `overview-size:${book.summary.id}`,
        severity: "info",
        bookId: book.summary.id,
        title: "Tree overview is large",
        detail: `${book.summary.name} has a large category index, so collapsed or full-tree traversal prompts may need tighter categories and stronger summaries to stay readable.`
      });
    }
    if (multiBookMode && !book.config.description.trim() && !rootSummary) {
      diagnostics.push({
        id: `multibook-description:${book.summary.id}`,
        severity: "info",
        bookId: book.summary.id,
        title: "Book lacks a disambiguating description",
        detail: `${book.summary.name} has no Lore Recall book description and no root summary yet, which makes multi-book retrieval harder to disambiguate.`
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
var LORE_RECALL_BREAKDOWN_NAME = "Retrieved Lore";
var CONNECTION_CACHE_TTL_MS = 5000;
var RETRIEVAL_FEED_SESSION_LIMIT = 25;
var RETRIEVAL_FEED_PUSH_DELAY_MS = 180;
var connectionCache = new Map;
var latestStateSequence = new Map;
var previewCache = new Map;
var retrievalFeedCache = new Map;
var scheduledStatePushes = new Map;
async function resolveActiveChat(userId, chatId) {
  if (chatId)
    return spindle.chats.get(chatId, userId);
  return spindle.chats.getActive(userId);
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
function summarizeTrace(preview) {
  if (!preview.trace.length)
    return "no traversal trace";
  return preview.trace.map((step) => `${step.step}:${step.phase}:${step.label}`).slice(0, 6).join(" | ");
}
async function buildState(userId, chatId) {
  const [allBooks, activeChat, settings, connections] = await Promise.all([
    listAllWorldBooks(userId),
    resolveActiveChat(userId, chatId),
    loadGlobalSettings(userId),
    listConnectionsCached(userId)
  ]);
  const sortedBooks = allBooks.slice().sort((left, right) => left.name.localeCompare(right.name)).map(toBookSummary);
  const cachedPreview = activeChat?.id ? previewCache.get(getPreviewCacheKey(userId, activeChat.id)) ?? null : null;
  const cachedRetrievalFeed = activeChat?.id ? cloneRetrievalFeedState(retrievalFeedCache.get(getPreviewCacheKey(userId, activeChat.id))) : { sessions: [] };
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
    retrievalFeed: cachedRetrievalFeed,
    preview: cachedPreview
  };
  if (!activeChat?.character_id) {
    return { state: baseState };
  }
  const character = await spindle.characters.get(activeChat.character_id, userId);
  if (!character) {
    return { state: baseState };
  }
  const characterConfig = await loadCharacterConfig(character.id, userId, character);
  const validBookIds = new Set(allBooks.map((book) => book.id));
  const selectedBookIds = characterConfig.managedBookIds.filter((bookId) => validBookIds.has(bookId));
  const attachedWorldBookIds = character.world_book_ids;
  const { runtimeBooks, staleIssues } = await getRuntimeBooks(selectedBookIds, attachedWorldBookIds, userId);
  const managedEntries = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.cache.entries]));
  const bookConfigs = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.config]));
  const bookStatuses = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.status]));
  const treeIndexes = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree]));
  const unassignedCounts = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree.unassignedEntryIds.length]));
  const previewDiagnostics = cachedPreview ? [
    ...cachedPreview.fallbackPath?.length ? [
      {
        id: "preview-fallback",
        severity: "info",
        bookId: null,
        title: "Last retrieval used fallback behavior",
        detail: cachedPreview.fallbackPath.join(" ")
      }
    ] : [],
    ...cachedPreview.fallbackPath?.some((detail) => /invalid json|did not map|empty nodeids array/i.test(detail)) ? [
      {
        id: "preview-scope-selection-failure",
        severity: "warn",
        bookId: null,
        title: "Last retrieval had controller scope-selection trouble",
        detail: "The most recent retrieval fell back because the controller returned invalid JSON, empty nodeIds, or nodeIds that did not map to visible scopes."
      }
    ] : [],
    ...cachedPreview.selectedScopes.length > 0 && cachedPreview.pulledNodes.length === 0 ? [
      {
        id: "preview-empty-scopes",
        severity: "warn",
        bookId: null,
        title: "Last retrieval scopes resolved no entries",
        detail: "The most recent retrieval chose one or more scopes but resolved no pulled entries. This usually points to overly broad or poorly summarized categories."
      }
    ] : [],
    ...cachedPreview.selectedScopes.some((scope) => scope.descendantEntryCount > 24 && typeof scope.manifestEntryCount === "number" && scope.manifestEntryCount < scope.descendantEntryCount) ? [
      {
        id: "preview-broad-manifest-scope",
        severity: "warn",
        bookId: null,
        title: "Last retrieval still had a broad manifest scope",
        detail: "One or more selected scopes exposed more than 24 descendant entries, so exact entry choice depended on a broad manifest. Retrieval may still be too wide for clean entry selection."
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
  const diagnosticsResults = buildDiagnostics(runtimeBooks, staleIssues, settings, characterConfig, connections).concat(previewDiagnostics);
  const suggestedBookIds = computeSuggestedBookIds(sortedBooks, selectedBookIds, settings);
  const nextState = {
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
    suggestedBookIds
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
spindle.registerInterceptor(async (messages, context) => {
  let liveChatId = null;
  let liveUserId = null;
  let retrievalSessionId = null;
  let retrievalSessionStarted = false;
  let retrievalSessionFinished = false;
  try {
    const chatId = context && typeof context === "object" && typeof context.chatId === "string" ? context.chatId : null;
    const connectionId = context && typeof context === "object" && typeof context.connectionId === "string" ? context.connectionId : null;
    if (!chatId)
      return messages;
    liveChatId = chatId;
    const userId = resolveUserId(chatId);
    if (!userId) {
      spindle.log.warn(`Lore Recall skipped retrieval for chat ${chatId} because no user context was available yet.`);
      return messages;
    }
    liveUserId = userId;
    await ensureStorageFolders(userId);
    const settings = await loadGlobalSettings(userId);
    if (!settings.enabled)
      return messages;
    const chat = await spindle.chats.get(chatId, userId);
    if (!chat?.character_id)
      return messages;
    const character = await spindle.characters.get(chat.character_id, userId);
    if (!character)
      return messages;
    const config = await loadCharacterConfig(chat.character_id, userId, character);
    if (!config.enabled || !config.managedBookIds.length)
      return messages;
    const attachedWorldBookIds = character.world_book_ids;
    const { runtimeBooks } = await getRuntimeBooks(config.managedBookIds, attachedWorldBookIds, userId);
    if (!runtimeBooks.length)
      return messages;
    retrievalSessionId = `retrieval:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const handleProgress = (event) => {
      if (!retrievalSessionId)
        return;
      switch (event.type) {
        case "start":
          retrievalSessionStarted = true;
          beginRetrievalSession(userId, chatId, retrievalSessionId, event);
          scheduleLiveStatePush(userId, chatId);
          return;
        case "item":
          if (!retrievalSessionStarted)
            return;
          appendRetrievalSessionItem(userId, chatId, retrievalSessionId, event.item);
          scheduleLiveStatePush(userId, chatId);
          return;
        case "finish":
          if (!retrievalSessionStarted)
            return;
          retrievalSessionFinished = true;
          finishRetrievalSession(userId, chatId, retrievalSessionId, event);
          scheduleLiveStatePush(userId, chatId);
          return;
      }
    };
    const preview = await buildRetrievalPreview(messages, settings, config, runtimeBooks, userId, {
      connectionId,
      isActual: true,
      capturedAt: Date.now(),
      reportProgress: handleProgress
    });
    previewCache.set(getPreviewCacheKey(userId, chatId), preview);
    scheduleLiveStatePush(userId, chatId);
    if (preview) {
      if (preview.mode === "traversal" && preview.fallbackReason) {
        spindle.log.info(`Lore Recall traversal fell back for chat ${chatId}: ${preview.fallbackReason} [trace=${summarizeTrace(preview)}]`);
      } else if (preview.mode === "traversal" && preview.controllerUsed) {
        spindle.log.info(`Lore Recall traversal used controller for chat ${chatId}: scopes=${preview.retrievedScopes.length}, pulled=${preview.pulledNodes.length}, injected=${preview.injectedNodes.length}, connection=${preview.resolvedConnectionId ?? "default"}, trace=${summarizeTrace(preview)}`);
      } else if (preview.mode === "collapsed" && preview.fallbackReason) {
        spindle.log.info(`Lore Recall collapsed retrieval used fallback behavior for chat ${chatId}: ${preview.fallbackReason}`);
      }
    }
    if (!preview?.injectedText.trim())
      return messages;
    const injected = { role: "system", content: preview.injectedText };
    const result = {
      messages: [injected, ...messages],
      breakdown: [{ messageIndex: 0, name: LORE_RECALL_BREAKDOWN_NAME }]
    };
    return result;
  } catch (error) {
    if (liveChatId && liveUserId && retrievalSessionId && retrievalSessionStarted && !retrievalSessionFinished) {
      const activeSession = retrievalFeedCache.get(getPreviewCacheKey(liveUserId, liveChatId))?.sessions.find((session) => session.id === retrievalSessionId);
      appendRetrievalSessionItem(liveUserId, liveChatId, retrievalSessionId, {
        id: `issue:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        kind: "issue",
        label: "Retrieval failed",
        summary: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        phase: "fallback",
        tone: "error"
      });
      finishRetrievalSession(liveUserId, liveChatId, retrievalSessionId, {
        type: "finish",
        timestamp: Date.now(),
        status: "failed",
        controllerUsed: activeSession?.controllerUsed ?? false,
        resolvedConnectionId: activeSession?.resolvedConnectionId ?? null,
        fallbackReason: error instanceof Error ? error.message : String(error)
      });
      scheduleLiveStatePush(liveUserId, liveChatId);
    }
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
    spindle.log.error(`Lore Recall error: ${description}`);
    send({ type: "error", message: description }, userId);
  }
});
spindle.log.info("Lore Recall loaded.");
