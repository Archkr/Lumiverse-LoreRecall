import type { CharacterRetrievalConfig, EntryTreeMeta } from "./types";

export const EXTENSION_KEY = "lore_recall";
export const DEFAULT_MAX_RESULTS = 6;
export const DEFAULT_MAX_TRAVERSAL_DEPTH = 3;
export const DEFAULT_TOKEN_BUDGET = 900;

export const DEFAULT_CHARACTER_CONFIG: CharacterRetrievalConfig = {
  enabled: false,
  managedBookIds: [],
  defaultMode: "collapsed",
  maxResults: DEFAULT_MAX_RESULTS,
  maxTraversalDepth: DEFAULT_MAX_TRAVERSAL_DEPTH,
  tokenBudget: DEFAULT_TOKEN_BUDGET,
  rerankEnabled: false,
};

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
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
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function normalizeCharacterConfig(value?: Partial<CharacterRetrievalConfig> | null): CharacterRetrievalConfig {
  const next = value ?? {};

  return {
    enabled: !!next.enabled,
    managedBookIds: uniqueStrings(Array.isArray(next.managedBookIds) ? next.managedBookIds : []),
    defaultMode: next.defaultMode === "traversal" ? "traversal" : "collapsed",
    maxResults: clampInt(
      typeof next.maxResults === "number" ? next.maxResults : DEFAULT_CHARACTER_CONFIG.maxResults,
      1,
      12,
    ),
    maxTraversalDepth: clampInt(
      typeof next.maxTraversalDepth === "number" ? next.maxTraversalDepth : DEFAULT_CHARACTER_CONFIG.maxTraversalDepth,
      1,
      6,
    ),
    tokenBudget: clampInt(
      typeof next.tokenBudget === "number" ? next.tokenBudget : DEFAULT_CHARACTER_CONFIG.tokenBudget,
      200,
      4000,
    ),
    rerankEnabled: !!next.rerankEnabled,
  };
}

export function defaultEntryTreeMeta(seed: { entryId: string; comment?: string; key?: string[] }): EntryTreeMeta {
  const fallbackLabel = seed.comment?.trim() || seed.key?.find(Boolean)?.trim() || `Node ${seed.entryId.slice(0, 8)}`;

  return {
    nodeId: seed.entryId,
    parentNodeId: null,
    label: fallbackLabel,
    aliases: [],
    summary: "",
    childrenOrder: [],
    collapsedText: "",
    tags: [],
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean),
  );
}

export function normalizeEntryTreeMeta(
  raw: unknown,
  seed: { entryId: string; comment?: string; key?: string[] },
): EntryTreeMeta {
  const fallback = defaultEntryTreeMeta(seed);
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const nodeId = typeof value.nodeId === "string" && value.nodeId.trim() ? value.nodeId.trim() : fallback.nodeId;
  const parentNodeId =
    typeof value.parentNodeId === "string" && value.parentNodeId.trim() ? value.parentNodeId.trim() : null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label.trim() : fallback.label;

  return {
    nodeId,
    parentNodeId: parentNodeId && parentNodeId !== nodeId ? parentNodeId : null,
    label,
    aliases: asStringArray(value.aliases),
    summary: typeof value.summary === "string" ? value.summary.trim() : "",
    childrenOrder: asStringArray(value.childrenOrder),
    collapsedText: typeof value.collapsedText === "string" ? value.collapsedText.trim() : "",
    tags: asStringArray(value.tags),
  };
}
