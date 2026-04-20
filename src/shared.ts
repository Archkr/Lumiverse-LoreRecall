import type {
  BookRetrievalConfig,
  BookTreeIndex,
  BookTreeNode,
  BuildDetail,
  CharacterRetrievalConfig,
  EntryRecallMeta,
  GlobalLoreRecallSettings,
  LegacyEntryTreeMeta,
} from "./types";

export const EXTENSION_KEY = "lore_recall";
export const TREE_VERSION = 2 as const;
export const ROOT_NODE_ID = "root";

export const DEFAULT_GLOBAL_SETTINGS: GlobalLoreRecallSettings = {
  enabled: true,
  autoDetectPattern: "*recall*",
  controllerConnectionId: null,
  controllerTemperature: 0.2,
  controllerMaxTokens: 8192,
  buildDetail: "lite",
  treeGranularity: 0,
  chunkTokens: 30000,
  dedupMode: "none",
};

export const DEFAULT_CHARACTER_CONFIG: CharacterRetrievalConfig = {
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
  contextMessages: 10,
};

export const DEFAULT_BOOK_CONFIG: BookRetrievalConfig = {
  enabled: true,
  description: "",
  permission: "read_write",
};

export const TREE_GRANULARITY_PRESETS = {
  1: {
    targetCategories: "3-5",
    targetTopLevelMin: 3,
    targetTopLevelMax: 5,
    maxEntries: 20,
    label: "Minimal",
    description: "Keep entries grouped broadly.",
  },
  2: {
    targetCategories: "5-8",
    targetTopLevelMin: 5,
    targetTopLevelMax: 8,
    maxEntries: 12,
    label: "Moderate",
    description: "Balanced split for most books.",
  },
  3: {
    targetCategories: "8-15",
    targetTopLevelMin: 8,
    targetTopLevelMax: 15,
    maxEntries: 8,
    label: "Detailed",
    description: "Break books into more specific groups.",
  },
  4: {
    targetCategories: "12-20",
    targetTopLevelMin: 12,
    targetTopLevelMax: 20,
    maxEntries: 5,
    label: "Extensive",
    description: "Maximum splitting into small groups.",
  },
} as const;

export interface EffectiveTreeGranularity {
  level: number;
  label: string;
  targetCategories: string;
  targetTopLevelMin: number;
  targetTopLevelMax: number;
  maxEntries: number;
  description: string;
  isAuto: boolean;
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampFloat(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function splitCommaList(value: string): string[] {
  return uniqueStrings(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function joinCommaList(values: string[]): string {
  return values.join(", ");
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return value.slice(0, maxLength);
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function normalizeGlobalSettings(value?: Partial<GlobalLoreRecallSettings> | null): GlobalLoreRecallSettings {
  const next = value ?? {};
  return {
    enabled: next.enabled !== false,
    autoDetectPattern:
      typeof next.autoDetectPattern === "string" && next.autoDetectPattern.trim()
        ? next.autoDetectPattern.trim()
        : DEFAULT_GLOBAL_SETTINGS.autoDetectPattern,
    controllerConnectionId:
      typeof next.controllerConnectionId === "string" && next.controllerConnectionId.trim()
        ? next.controllerConnectionId.trim()
        : null,
    controllerTemperature: clampFloat(
      typeof next.controllerTemperature === "number"
        ? next.controllerTemperature
        : DEFAULT_GLOBAL_SETTINGS.controllerTemperature,
      0,
      2,
    ),
    controllerMaxTokens: clampInt(
      typeof next.controllerMaxTokens === "number"
        ? next.controllerMaxTokens
        : DEFAULT_GLOBAL_SETTINGS.controllerMaxTokens,
      256,
      32768,
    ),
    buildDetail: next.buildDetail === "full" || next.buildDetail === "names" ? next.buildDetail : "lite",
    treeGranularity: clampInt(
      typeof next.treeGranularity === "number" ? next.treeGranularity : DEFAULT_GLOBAL_SETTINGS.treeGranularity,
      0,
      4,
    ),
    chunkTokens: clampInt(
      typeof next.chunkTokens === "number" ? next.chunkTokens : DEFAULT_GLOBAL_SETTINGS.chunkTokens,
      1000,
      120000,
    ),
    dedupMode: next.dedupMode === "lexical" || next.dedupMode === "llm" ? next.dedupMode : "none",
  };
}

export function getEffectiveTreeGranularity(setting: number, entryCount = 0): EffectiveTreeGranularity {
  let level = clampInt(setting, 0, 4);
  const isAuto = level === 0;

  if (level === 0) {
    if (entryCount >= 3000) level = 4;
    else if (entryCount >= 1000) level = 3;
    else if (entryCount >= 200) level = 2;
    else level = 1;
  }

  const preset = TREE_GRANULARITY_PRESETS[level as keyof typeof TREE_GRANULARITY_PRESETS];
  return {
    level,
    isAuto,
    ...preset,
  };
}

export function getBuildDetailLabel(detail: BuildDetail): string {
  switch (detail) {
    case "full":
      return "Full";
    case "names":
      return "Names only";
    default:
      return "Lite";
  }
}

export function getBuildDetailDescription(detail: BuildDetail): string {
  switch (detail) {
    case "full":
      return "Send complete entry content and metadata for stronger categorization.";
    case "names":
      return "Send labels only. Cheapest, but the model can only group by names.";
    default:
      return "Send a trimmed content preview plus metadata. Good balance of quality and cost.";
  }
}

export function normalizeCharacterConfig(value?: Partial<CharacterRetrievalConfig> | null): CharacterRetrievalConfig {
  const next = (value ?? {}) as Partial<CharacterRetrievalConfig> & { defaultMode?: string };
  const searchMode = next.searchMode === "traversal" || next.defaultMode === "traversal" ? "traversal" : "collapsed";
  const legacyBudget =
    typeof next.tokenBudget === "number" && Number.isFinite(next.tokenBudget) ? Math.floor(next.tokenBudget) : null;
  const injectedEntryLimit =
    legacyBudget == null
      ? DEFAULT_CHARACTER_CONFIG.tokenBudget
      : legacyBudget > 64
        ? typeof next.maxResults === "number" && Number.isFinite(next.maxResults)
          ? Math.floor(next.maxResults)
          : DEFAULT_CHARACTER_CONFIG.tokenBudget
        : legacyBudget;

  return {
    enabled: !!next.enabled,
    managedBookIds: uniqueStrings(Array.isArray(next.managedBookIds) ? next.managedBookIds : []),
    searchMode,
    collapsedDepth: clampInt(
      typeof next.collapsedDepth === "number" ? next.collapsedDepth : DEFAULT_CHARACTER_CONFIG.collapsedDepth,
      1,
      6,
    ),
    maxResults: clampInt(
      typeof next.maxResults === "number" ? next.maxResults : DEFAULT_CHARACTER_CONFIG.maxResults,
      1,
      16,
    ),
    maxTraversalDepth: clampInt(
      typeof next.maxTraversalDepth === "number" ? next.maxTraversalDepth : DEFAULT_CHARACTER_CONFIG.maxTraversalDepth,
      1,
      8,
    ),
    traversalStepLimit: clampInt(
      typeof next.traversalStepLimit === "number"
        ? next.traversalStepLimit
        : DEFAULT_CHARACTER_CONFIG.traversalStepLimit,
      1,
      12,
    ),
    tokenBudget: clampInt(injectedEntryLimit, 1, 32),
    rerankEnabled: !!next.rerankEnabled,
    selectiveRetrieval: next.selectiveRetrieval !== false,
    multiBookMode: next.multiBookMode === "per_book" ? "per_book" : "unified",
    contextMessages: clampInt(
      typeof next.contextMessages === "number" ? next.contextMessages : DEFAULT_CHARACTER_CONFIG.contextMessages,
      2,
      60,
    ),
  };
}

export function normalizeBookConfig(value?: Partial<BookRetrievalConfig> | null): BookRetrievalConfig {
  const next = value ?? {};
  return {
    enabled: next.enabled !== false,
    description: typeof next.description === "string" ? next.description.trim() : "",
    permission:
      next.permission === "read_only" || next.permission === "write_only" ? next.permission : "read_write",
  };
}

export function defaultEntryRecallMeta(seed: { entryId: string; comment?: string; key?: string[] }): EntryRecallMeta {
  const fallbackLabel = seed.comment?.trim() || seed.key?.find(Boolean)?.trim() || `Entry ${seed.entryId.slice(0, 8)}`;
  return {
    label: fallbackLabel,
    aliases: [],
    summary: "",
    collapsedText: "",
    tags: [],
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean));
}

export function normalizeEntryRecallMeta(
  raw: unknown,
  seed: { entryId: string; comment?: string; key?: string[] },
): EntryRecallMeta {
  const fallback = defaultEntryRecallMeta(seed);
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : fallback.label,
    aliases: asStringArray(value.aliases),
    summary: typeof value.summary === "string" ? value.summary.trim() : "",
    collapsedText: typeof value.collapsedText === "string" ? value.collapsedText.trim() : "",
    tags: asStringArray(value.tags),
  };
}

export function readLegacyEntryTreeMeta(
  raw: unknown,
  seed: { entryId: string; comment?: string; key?: string[] },
): LegacyEntryTreeMeta | null {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!value) return null;
  const entryMeta = normalizeEntryRecallMeta(value, seed);
  const nodeId = typeof value.nodeId === "string" && value.nodeId.trim() ? value.nodeId.trim() : seed.entryId;
  const parentNodeId =
    typeof value.parentNodeId === "string" && value.parentNodeId.trim() ? value.parentNodeId.trim() : null;
  const childrenOrder = asStringArray(value.childrenOrder);
  if (!("nodeId" in value) && !("parentNodeId" in value) && !("childrenOrder" in value)) {
    return null;
  }
  return {
    nodeId,
    parentNodeId: parentNodeId && parentNodeId !== nodeId ? parentNodeId : null,
    childrenOrder,
    ...entryMeta,
  };
}

export function makeTreeNode(
  id: string,
  label: string,
  parentId: string | null,
  createdBy: BookTreeNode["createdBy"],
  summary = "",
): BookTreeNode {
  return {
    id,
    kind: id === ROOT_NODE_ID ? "root" : "category",
    label,
    summary,
    parentId,
    childIds: [],
    entryIds: [],
    collapsed: false,
    createdBy,
  };
}

export function createEmptyTreeIndex(bookId: string): BookTreeIndex {
  return {
    version: TREE_VERSION,
    bookId,
    rootId: ROOT_NODE_ID,
    nodes: {
      [ROOT_NODE_ID]: makeTreeNode(ROOT_NODE_ID, "Root", null, "system"),
    },
    unassignedEntryIds: [],
    lastBuiltAt: null,
    buildSource: null,
  };
}

export function ensureTreeIndexShape(tree: BookTreeIndex | null | undefined, bookId: string, entryIds: string[]): BookTreeIndex {
  const base = tree && tree.version === TREE_VERSION ? tree : createEmptyTreeIndex(bookId);
  const root =
    base.nodes[base.rootId] ??
    makeTreeNode(base.rootId || ROOT_NODE_ID, "Root", null, "system");
  const nodes: Record<string, BookTreeNode> = {
    ...base.nodes,
    [root.id]: {
      ...root,
      kind: "root",
      parentId: null,
      label: root.label || "Root",
    },
  };

  for (const [nodeId, node] of Object.entries(nodes)) {
    nodes[nodeId] = {
      ...node,
      kind: nodeId === base.rootId ? "root" : "category",
      childIds: uniqueStrings(node.childIds ?? []).filter((childId) => childId !== nodeId),
      entryIds: uniqueStrings(node.entryIds ?? []),
      parentId:
        nodeId === base.rootId
          ? null
          : typeof node.parentId === "string" && node.parentId.trim()
            ? node.parentId.trim()
            : base.rootId,
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

  const assigned = new Set<string>();
  for (const node of Object.values(nodes)) {
    for (const entryId of node.entryIds) assigned.add(entryId);
  }

  const unassignedEntryIds = uniqueStrings(base.unassignedEntryIds ?? []).filter((entryId) => validEntryIds.has(entryId));
  for (const entryId of entryIds) {
    if (assigned.has(entryId)) continue;
    if (!unassignedEntryIds.includes(entryId)) unassignedEntryIds.push(entryId);
  }

  return {
    version: TREE_VERSION,
    bookId,
    rootId: base.rootId || ROOT_NODE_ID,
    nodes,
    unassignedEntryIds,
    lastBuiltAt: typeof base.lastBuiltAt === "number" ? base.lastBuiltAt : null,
    buildSource: base.buildSource ?? null,
  };
}

export function treeHasContent(tree: BookTreeIndex): boolean {
  const categoryCount = Object.keys(tree.nodes).length - 1;
  return categoryCount > 0 || tree.unassignedEntryIds.length > 0 || (tree.nodes[tree.rootId]?.entryIds.length ?? 0) > 0;
}

export function slugifyLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "category";
}

export function makeNodeId(prefix: string, label: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${slugifyLabel(label)}_${suffix}`;
}

export function ensureCategoryPath(
  tree: BookTreeIndex,
  labels: string[],
  createdBy: BookTreeNode["createdBy"],
): string {
  let parentId = tree.rootId;
  for (const rawLabel of labels) {
    const label = rawLabel.trim();
    if (!label) continue;
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

export function removeEntryFromTree(tree: BookTreeIndex, entryId: string): void {
  tree.unassignedEntryIds = tree.unassignedEntryIds.filter((id) => id !== entryId);
  for (const node of Object.values(tree.nodes)) {
    node.entryIds = node.entryIds.filter((id) => id !== entryId);
  }
}

export function assignEntryToTarget(
  tree: BookTreeIndex,
  entryId: string,
  target: "root" | "unassigned" | { categoryId: string },
): void {
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

export function getNodeDepth(tree: BookTreeIndex, nodeId: string): number {
  let depth = 0;
  let cursor = tree.nodes[nodeId];
  const visited = new Set<string>();
  while (cursor && cursor.parentId && cursor.parentId !== cursor.id && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    depth += 1;
    cursor = tree.nodes[cursor.parentId];
  }
  return depth;
}

export function getNodePath(tree: BookTreeIndex, nodeId: string): BookTreeNode[] {
  const path: BookTreeNode[] = [];
  const visited = new Set<string>();
  let cursor = tree.nodes[nodeId];
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    path.push(cursor);
    if (!cursor.parentId) break;
    cursor = tree.nodes[cursor.parentId];
  }
  return path.reverse();
}

export function getEntryCategoryPath(tree: BookTreeIndex, entryId: string): BookTreeNode[] {
  for (const node of Object.values(tree.nodes)) {
    if (!node.entryIds.includes(entryId)) continue;
    return getNodePath(tree, node.id).filter((item) => item.id !== tree.rootId);
  }
  return [];
}

export function deleteCategoryNode(
  tree: BookTreeIndex,
  nodeId: string,
  target: "root" | "unassigned" | { categoryId: string },
): void {
  if (nodeId === tree.rootId) return;
  const node = tree.nodes[nodeId];
  if (!node) return;

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

export function moveCategoryNode(tree: BookTreeIndex, nodeId: string, parentId: string | null): void {
  if (nodeId === tree.rootId) return;
  const node = tree.nodes[nodeId];
  if (!node) return;

  const nextParentId = parentId && tree.nodes[parentId] ? parentId : tree.rootId;
  if (node.parentId && tree.nodes[node.parentId]) {
    tree.nodes[node.parentId].childIds = tree.nodes[node.parentId].childIds.filter((childId) => childId !== nodeId);
  }

  node.parentId = nextParentId;
  const nextParent = tree.nodes[nextParentId];
  if (!nextParent.childIds.includes(nodeId)) nextParent.childIds.push(nodeId);
}

export function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function splitHierarchy(value: string): string[] {
  return value
    .split(/(?:>|\/|::|→|\|)/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function createAutoDetectRegex(pattern: string): RegExp | null {
  const source = pattern.trim();
  if (!source) return null;
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
