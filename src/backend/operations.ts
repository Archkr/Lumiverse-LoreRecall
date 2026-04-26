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
  getBuildDetailDescription,
  getBuildDetailLabel,
  getEffectiveTreeGranularity,
  makeNodeId,
  moveCategoryNode,
  normalizeEntryRecallMeta,
  splitHierarchy,
  titleCase,
  truncateText,
  uniqueStrings,
} from "../shared";
import type {
  BookTreeIndex,
  BookTreeNode,
  CharacterRetrievalConfig,
  DiagnosticFinding,
  EntryRecallMeta,
  ExportSnapshot,
  GlobalLoreRecallSettings,
  NativeEntryFlagPatch,
  OperationIssue,
} from "../types";
import type { IndexedEntry, RuntimeBook } from "./contracts";
import {
  normalizeArrayPayload,
  parseJsonValue,
  runControllerJson as runSharedControllerJson,
  type ControllerJsonOptions,
  type ControllerJsonResult,
} from "./controller-json";
import {
  BOOK_CONFIG_DIR,
  CHARACTER_CONFIG_DIR,
  GLOBAL_SETTINGS_PATH,
  TREE_DIR,
  getBookConfigPath,
  getTreePath,
} from "./runtime";
import {
  canEditBook,
  characterHasStoredConfig,
  getRuntimeBooks,
  invalidateBookCache,
  listAllCharacters,
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

export interface OperationProgressUpdate {
  message?: string;
  percent?: number | null;
  current?: number | null;
  total?: number | null;
  phase?: string | null;
  bookId?: string | null;
  bookName?: string | null;
  chunkCurrent?: number | null;
  chunkTotal?: number | null;
}

export interface OperationContext {
  progress(update: OperationProgressUpdate): void;
  addIssue(issue: OperationIssue): void;
}

export interface OperationOutcome<T = void> {
  value?: T;
  issues: OperationIssue[];
  completed: number;
  total: number;
}

const CATEGORIZATION_SYSTEM_PROMPT =
  "You are a categorization assistant. Return only the requested JSON. Do not include commentary, markdown fences, or reasoning text.";
const SUMMARY_SYSTEM_PROMPT =
  "You are a summarization assistant. Return only the requested JSON. Do not include commentary, markdown fences, or reasoning text.";

function buildAssignmentEntryPayload(entry: IndexedEntry, detail: GlobalLoreRecallSettings["buildDetail"]): Record<string, unknown> {
  const base: Record<string, unknown> = {
    entryId: entry.entryId,
    comment: entry.comment,
  };

  if (detail === "names") {
    return base;
  }

  const expanded = {
    ...base,
    keys: [...entry.key, ...entry.keysecondary],
    groupName: entry.groupName,
    constant: entry.constant,
    selective: entry.selective,
  };

  if (detail === "full") {
    return {
      ...expanded,
      content: entry.content,
    };
  }

  return {
    ...expanded,
    preview: truncateText(entry.content, 260),
  };
}

function getCategoryLabelPath(tree: BookTreeIndex, nodeId: string): string[] {
  const labels: string[] = [];
  const visited = new Set<string>();
  let cursor: string | null = nodeId;

  while (cursor && cursor !== tree.rootId && !visited.has(cursor)) {
    visited.add(cursor);
    const node: BookTreeNode | undefined = tree.nodes[cursor];
    if (!node) break;
    if (node.label.trim()) labels.push(node.label.trim());
    cursor = node.parentId;
  }

  return labels.reverse();
}

function buildExistingTreeGuidance(
  tree: BookTreeIndex,
  granularity: ReturnType<typeof getEffectiveTreeGranularity>,
  chunkIndex: number,
  chunkCount: number,
): string[] {
  const root = tree.nodes[tree.rootId];
  const topLevelIds = root?.childIds.filter((nodeId) => !!tree.nodes[nodeId]) ?? [];
  const topLevelLabels = topLevelIds.map((nodeId) => tree.nodes[nodeId].label.trim()).filter(Boolean);
  const remainingTopLevelSlots = Math.max(0, granularity.targetTopLevelMax - topLevelLabels.length);
  const leafSummaries = Object.values(tree.nodes)
    .filter((node) => node.id !== tree.rootId && node.childIds.length === 0)
    .map((node) => ({
      path: getCategoryLabelPath(tree, node.id).join(" > "),
      entryCount: node.entryIds.length,
    }))
    .sort((left, right) => right.entryCount - left.entryCount || left.path.localeCompare(right.path))
    .slice(0, 48);

  const guidance = [
    `This is chunk ${chunkIndex + 1} of ${chunkCount} for one shared final tree. Keep category choices consistent with earlier chunks.`,
    `Final top-level category target for the whole book: ${granularity.targetCategories}. Hard cap: ${granularity.targetTopLevelMax} top-level categories total.`,
  ];

  if (topLevelLabels.length > 0) {
    guidance.push(
      `Existing top-level categories (${topLevelLabels.length}/${granularity.targetTopLevelMax}): ${topLevelLabels.join(" | ")}.`,
    );
    if (remainingTopLevelSlots === 0) {
      guidance.push("Do not create any new top-level categories. Reuse one of the existing top-level categories.");
    } else {
      guidance.push(
        `Reuse an existing top-level category whenever possible. Only create a new top-level category if none fit, and create at most ${remainingTopLevelSlots} more top-level categor${remainingTopLevelSlots === 1 ? "y" : "ies"}.`,
      );
    }
  } else {
    guidance.push(
      `No top-level categories exist yet. Start with broad, reusable top-level categories and create no more than ${granularity.targetTopLevelMax} top-level categories in this chunk.`,
    );
  }

  if (leafSummaries.length > 0) {
    guidance.push("Existing leaf categories and current entry counts:");
    guidance.push(...leafSummaries.map((item) => `- ${item.path} [${item.entryCount} entries]`));
    guidance.push(
      `If an existing leaf category is already near or above ${granularity.maxEntries} entries, create or reuse a sibling subcategory under the same top-level category instead of overfilling that leaf.`,
    );
  }

  guidance.push(
    "Prefer broader reusable categories over one-off niche labels, and avoid near-duplicate top-level categories that overlap with existing ones.",
  );

  return guidance;
}

function ensureCategoryPathFromParent(
  tree: BookTreeIndex,
  parentId: string,
  labels: string[],
  createdBy: BookTreeNode["createdBy"],
): string {
  let currentParentId = parentId;
  for (const rawLabel of labels) {
    const label = rawLabel.trim();
    if (!label) continue;
    const parent = tree.nodes[currentParentId];
    if (!parent) break;
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
      createdBy,
    };
    parent.childIds.push(nodeId);
    currentParentId = nodeId;
  }
  return currentParentId;
}

function collectNodeKeywordHints(tree: BookTreeIndex, nodeId: string, entries: IndexedEntry[]): string[] {
  const entryIds = getDescendantCategoryIds(tree, nodeId, Number.MAX_SAFE_INTEGER).flatMap(
    (currentNodeId) => tree.nodes[currentNodeId]?.entryIds ?? [],
  );
  if (nodeId === tree.rootId) {
    entryIds.push(...tree.unassignedEntryIds);
  }
  const entriesById = new Map(entries.map((entry) => [entry.entryId, entry]));
  return uniqueStrings(
    uniqueStrings(entryIds)
      .map((entryId) => entriesById.get(entryId))
      .filter((entry): entry is IndexedEntry => !!entry)
      .flatMap((entry) => [...entry.key, ...entry.keysecondary])
      .map((value) => value.trim())
      .filter((value) => value && !value.startsWith("[") && value.length <= 32),
  ).slice(0, 8);
}

function appendKeywordHints(summary: string, keywords: string[]): string {
  const trimmed = summary.trim();
  if (!trimmed || !keywords.length || /\[Keywords:/i.test(trimmed)) return trimmed;
  return `${trimmed} [Keywords: ${keywords.join(", ")}]`;
}

function buildRootSummary(tree: BookTreeIndex, bookName: string): string {
  const root = tree.nodes[tree.rootId];
  if (!root) return `Top-level index for ${bookName}.`;
  const topLevel = root.childIds
    .map((childId) => tree.nodes[childId])
    .filter((node): node is BookTreeNode => !!node);
  if (!topLevel.length) {
    return `Top-level index for ${bookName}.`;
  }

  const labels = topLevel.map((node) => node.label.trim()).filter(Boolean);
  const summarySnippets = topLevel
    .map((node) => node.summary.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((value) => truncateText(value, 90));

  const parts = [`Top-level index for ${bookName}.`];
  if (labels.length) {
    parts.push(`Categories: ${labels.slice(0, 8).join(", ")}${labels.length > 8 ? ` (+${labels.length - 8} more)` : ""}.`);
  }
  if (summarySnippets.length) {
    parts.push(summarySnippets.join(" | "));
  }
  return parts.join(" ");
}

async function subdivideLargeLeafNodes(
  tree: BookTreeIndex,
  entries: IndexedEntry[],
  granularity: ReturnType<typeof getEffectiveTreeGranularity>,
  settings: GlobalLoreRecallSettings,
  userId: string,
): Promise<void> {
  const entriesById = new Map(entries.map((entry) => [entry.entryId, entry]));

  for (let pass = 0; pass < 3; pass += 1) {
    const oversizedLeafIds = Object.values(tree.nodes)
      .filter(
        (node) =>
          node.id !== tree.rootId &&
          node.childIds.length === 0 &&
          node.entryIds.length > granularity.maxEntries &&
          node.entryIds.length >= 4,
      )
      .sort((left, right) => right.entryIds.length - left.entryIds.length || left.label.localeCompare(right.label))
      .map((node) => node.id);

    if (!oversizedLeafIds.length) break;

    let subdividedAny = false;

    for (const nodeId of oversizedLeafIds) {
      const node = tree.nodes[nodeId];
      if (!node || node.childIds.length > 0 || node.entryIds.length <= granularity.maxEntries) continue;

      const nodeEntries = node.entryIds
        .map((entryId) => entriesById.get(entryId))
        .filter((entry): entry is IndexedEntry => !!entry);
      if (nodeEntries.length <= granularity.maxEntries) continue;

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
        ...nodeEntries.map((entry) => JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail))),
      ].join("\n");

      const controllerResult = await runControllerJson(
        prompt,
        settings,
        userId,
        "assignments",
        "lore_recall_tree_subdivide",
        ASSIGNMENTS_SCHEMA,
        {
          systemPrompt: CATEGORIZATION_SYSTEM_PROMPT,
          maxTokensOverride: Math.min(settings.controllerMaxTokens, 900),
        },
      );
      const parsed =
        controllerResult.parsed ?? normalizeAssignmentsPayload(parseJsonValue(controllerResult.rawContent || controllerResult.rawReasoning));
      if (!parsed || !Array.isArray(parsed.assignments)) continue;

      const grouped = new Map<string, string[]>();
      for (const assignment of parsed.assignments) {
        if (!assignment || typeof assignment !== "object") continue;
        const entryId = typeof assignment.entryId === "string" ? assignment.entryId : "";
        const path = Array.isArray(assignment.path)
          ? assignment.path.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        if (!entryId || !path.length) continue;
        const key = path.join(" > ");
        const list = grouped.get(key) ?? [];
        list.push(entryId);
        grouped.set(key, list);
      }

      if (grouped.size < 2) continue;

      for (const assignment of parsed.assignments) {
        if (!assignment || typeof assignment !== "object") continue;
        const entryId = typeof assignment.entryId === "string" ? assignment.entryId : "";
        const path = Array.isArray(assignment.path)
          ? assignment.path.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        if (!entryId || !path.length) continue;
        const categoryId = ensureCategoryPathFromParent(tree, nodeId, path, "llm");
        assignEntryToTarget(tree, entryId, { categoryId });
      }

      subdividedAny = true;
    }

    if (!subdividedAny) break;
  }
}

class ControllerJsonError extends Error {
  debugPayload: string;

  constructor(message: string, debugPayload: string) {
    super(message);
    this.name = "ControllerJsonError";
    this.debugPayload = debugPayload;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildControllerDebugPayload(input: {
  phase: string;
  expectedKey: string;
  error: string;
  bookId?: string | null;
  bookName?: string | null;
  chunkIndex?: number | null;
  chunkTotal?: number | null;
  provider?: string | null;
  model?: string | null;
  connectionId?: string | null;
  finishReason?: string | null;
  toolCallsCount?: number | null;
  usage?: Record<string, unknown> | null;
  parsedFrom?: "content" | "reasoning" | null;
  reasoningLength?: number | null;
  settings: GlobalLoreRecallSettings;
  prompt: string;
  rawContent: string;
  rawReasoning?: string;
  entrySample?: Array<{ entryId: string; label: string }>;
}): string {
  return JSON.stringify(
    {
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
        dedupMode: input.settings.dedupMode,
      },
      promptLength: input.prompt.length,
      responseLength: input.rawContent.length,
      promptPreview: truncateText(input.prompt, 12000),
      responsePreview: truncateText(input.rawContent || "<empty response>", 12000),
      reasoningPreview: truncateText(input.rawReasoning || "<empty reasoning>", 12000),
      entrySample: input.entrySample ?? [],
      capturedAt: Date.now(),
    },
    null,
    2,
  );
}

async function runControllerJson(
  prompt: string,
  settings: GlobalLoreRecallSettings,
  userId: string,
  primaryKey?: string,
  schemaName?: string,
  schema?: Record<string, unknown>,
  options: ControllerJsonOptions = {},
): Promise<ControllerJsonResult> {
  const result = await runSharedControllerJson(prompt, settings, userId, {
    ...options,
    primaryKey,
    schemaName,
    schema,
  });
  if (result.parsed || !primaryKey) return result;

  spindle.log.warn(
    `Lore Recall controller returned unusable ${primaryKey} JSON. Provider=${result.provider ?? "default"} parsedFrom=${result.parsedFrom ?? "none"} content=${result.rawContent.slice(0, 180)} reasoning=${result.rawReasoning.slice(0, 180)}`,
  );
  return result;
}

function normalizeAssignmentsPayload(parsed: unknown): Record<string, unknown> | null {
  const normalized = normalizeArrayPayload(parsed, "assignments");
  if (normalized && Array.isArray(normalized.assignments)) return normalized;

  const flattenCategories = (
    categories: unknown[],
    parentPath: string[] = [],
    collector: Array<{ entryId: string; path: string[] }> = [],
  ): Array<{ entryId: string; path: string[] }> => {
    for (const item of categories) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const nextPath = label ? [...parentPath, label] : parentPath;

      const entries = Array.isArray(record.entries)
        ? record.entries
            .map((value) => (typeof value === "string" ? value : value != null ? String(value) : ""))
            .map((value) => value.trim())
            .filter(Boolean)
        : [];

      for (const entryId of entries) {
        collector.push({ entryId, path: [...nextPath] });
      }

      if (Array.isArray(record.children)) {
        flattenCategories(record.children, nextPath, collector);
      }
    }
    return collector;
  };

  const source =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).categories
      : null;

  if (Array.isArray(source)) {
    return { assignments: flattenCategories(source) };
  }

  const resultSource =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).result
      : null;

  if (resultSource && typeof resultSource === "object" && Array.isArray((resultSource as Record<string, unknown>).categories)) {
    return { assignments: flattenCategories((resultSource as Record<string, unknown>).categories as unknown[]) };
  }

  return null;
}

const ASSIGNMENTS_SCHEMA = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entryId: { type: "string" },
          path: { type: "array", items: { type: "string" } },
        },
        required: ["entryId", "path"],
      },
    },
  },
  required: ["assignments"],
} satisfies Record<string, unknown>;

const CATEGORY_SUMMARIES_SCHEMA = {
  type: "object",
  properties: {
    summaries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          summary: { type: "string" },
        },
        required: ["nodeId", "summary"],
      },
    },
  },
  required: ["summaries"],
} satisfies Record<string, unknown>;

const ENTRY_SUMMARIES_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entryId: { type: "string" },
          summary: { type: "string" },
          collapsedText: { type: "string" },
        },
        required: ["entryId"],
      },
    },
  },
  required: ["entries"],
} satisfies Record<string, unknown>;

function collectCategorySummaryContext(
  tree: any,
  nodeId: string,
  entries: IndexedEntry[],
): { childLabels: string[]; sampleEntries: IndexedEntry[] } {
  const node = tree.nodes[nodeId];
  if (!node) return { childLabels: [], sampleEntries: [] };
  const descendantIds = getDescendantCategoryIds(tree, nodeId, 2);
  const childLabels = uniqueStrings(
    descendantIds
      .filter((id) => id !== nodeId)
      .map((id) => tree.nodes[id]?.label)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  ).slice(0, 8);
  const sampleEntryIds = uniqueStrings(descendantIds.flatMap((id) => tree.nodes[id]?.entryIds ?? [])).slice(0, 8);
  const sampleEntries = sampleEntryIds
    .map((entryId) => entries.find((entry) => entry.entryId === entryId))
    .filter((entry): entry is IndexedEntry => !!entry);
  return { childLabels, sampleEntries };
}

async function generateCategorySummary(
  tree: any,
  nodeIds: string[],
  entries: IndexedEntry[],
  settings: GlobalLoreRecallSettings,
  userId: string,
) : Promise<Record<string, string>> {
  const targets = uniqueStrings(nodeIds)
    .map((nodeId) => ({
      nodeId,
      node: tree.nodes[nodeId],
      context: collectCategorySummaryContext(tree, nodeId, entries),
    }))
    .filter(
      (value): value is {
        nodeId: string;
        node: { label: string };
        context: { childLabels: string[]; sampleEntries: IndexedEntry[] };
      } => !!value.node,
    );
  if (!targets.length) return {};

  const prompt = [
    "Write short category summaries for these lore branches.",
    'Return ONLY JSON in this exact shape: {"summaries":[{"nodeId":"...","summary":"..."}]}',
    "",
    "Categories:",
    ...targets.map(({ nodeId, node, context }) =>
      JSON.stringify({
        nodeId,
        label: node.label,
        childCategories: context.childLabels,
        entries: context.sampleEntries.map((entry) => ({
          label: entry.label,
          text: truncateText(entry.summary || entry.content, 180),
        })),
      }),
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const controllerResult = await runControllerJson(
    prompt,
    settings,
    userId,
    "summaries",
    "lore_recall_category_summaries",
    CATEGORY_SUMMARIES_SCHEMA,
    {
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      maxTokensOverride: Math.min(settings.controllerMaxTokens, 700),
    },
  );
  const parsed = controllerResult.parsed;
  if (!Array.isArray(parsed?.summaries)) {
    throw new Error("The controller did not return usable category summary JSON.");
  }
  const result: Record<string, string> = {};
  for (const item of parsed.summaries) {
    if (!item || typeof item !== "object") continue;
    const nodeId = typeof item.nodeId === "string" ? item.nodeId : "";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    if (!nodeId || !summary) continue;
    result[nodeId] = summary;
  }
  return result;
}

function buildEntrySummaryPrompt(entries: IndexedEntry[]): string {
  return [
    "Write short retrieval summaries for these lore entries.",
    'Return ONLY JSON in this exact shape: {"entries":[{"entryId":"...","summary":"...","collapsedText":"..."}]}',
    "",
    "Entries:",
    ...entries.map((entry) =>
      JSON.stringify({
        entryId: entry.entryId,
        label: entry.label,
        comment: entry.comment,
        keys: [...entry.key, ...entry.keysecondary],
        content: truncateText(entry.content, 500),
      }),
    ),
  ].join("\n");
}

async function generateEntrySummaryBatch(
  entries: IndexedEntry[],
  settings: GlobalLoreRecallSettings,
  userId: string,
): Promise<Array<{ entryId: string; summary?: string; collapsedText?: string }>> {
  if (!entries.length) return [];

  const controllerResult = await runControllerJson(
    buildEntrySummaryPrompt(entries),
    settings,
    userId,
    "entries",
    "lore_recall_entry_summaries",
    ENTRY_SUMMARIES_SCHEMA,
    {
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      maxTokensOverride: Math.min(settings.controllerMaxTokens, 1400),
    },
  );
  const parsed = controllerResult.parsed;
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error("The controller did not return usable entry summary JSON.");
  }

  return parsed.entries
    .filter((value): value is Record<string, unknown> => !!value && typeof value === "object")
    .map((update) => ({
      entryId: typeof update.entryId === "string" ? update.entryId : "",
      summary: typeof update.summary === "string" ? update.summary.trim() : undefined,
      collapsedText: typeof update.collapsedText === "string" ? update.collapsedText.trim() : undefined,
    }))
    .filter((update) => !!update.entryId);
}

export async function updateEntryMeta(entryId: string, meta: EntryRecallMeta, userId: string): Promise<void> {
  const entry = await spindle.world_books.entries.get(entryId, userId);
  if (!entry) throw new Error("That world book entry no longer exists.");
  const config = await loadBookConfig(entry.world_book_id, userId);
  if (!canEditBook(config)) throw new Error("This book is read-only inside Lore Recall.");
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

function normalizeEntryFlagPatch(patch: NativeEntryFlagPatch): NativeEntryFlagPatch {
  const next: NativeEntryFlagPatch = {};
  if (typeof patch.disabled === "boolean") next.disabled = patch.disabled;
  if (typeof patch.constant === "boolean") next.constant = patch.constant;
  if (typeof patch.selective === "boolean") next.selective = patch.selective;
  return next;
}

export async function patchEntryFlags(entryIds: string[], patch: NativeEntryFlagPatch, userId: string): Promise<void> {
  const normalizedPatch = normalizeEntryFlagPatch(patch);
  const patchKeys = Object.keys(normalizedPatch);
  if (!patchKeys.length) return;

  const ids = uniqueStrings(entryIds);
  if (!ids.length) return;

  const entries = (
    await Promise.all(ids.map((entryId) => spindle.world_books.entries.get(entryId, userId).catch(() => null)))
  ).filter((entry): entry is NonNullable<typeof entry> => !!entry);
  if (!entries.length) return;

  const configByBookId = new Map<string, Awaited<ReturnType<typeof loadBookConfig>>>();
  for (const entry of entries) {
    if (!configByBookId.has(entry.world_book_id)) {
      configByBookId.set(entry.world_book_id, await loadBookConfig(entry.world_book_id, userId));
    }
    const config = configByBookId.get(entry.world_book_id);
    if (!config || !canEditBook(config)) {
      throw new Error("One or more targeted books are read-only inside Lore Recall.");
    }
  }

  const touchedBookIds = new Set<string>();
  for (const entry of entries) {
    await spindle.world_books.entries.update(
      entry.id,
      {
        disabled: normalizedPatch.disabled ?? entry.disabled ?? false,
        constant: normalizedPatch.constant ?? entry.constant ?? false,
        selective: normalizedPatch.selective ?? entry.selective ?? false,
      },
      userId,
    );
    touchedBookIds.add(entry.world_book_id);
  }

  await Promise.all(Array.from(touchedBookIds).map((bookId) => invalidateBookCache(bookId, userId)));
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

export async function buildTreeFromMetadata(
  bookIds: string[],
  userId: string,
  operation?: OperationContext,
): Promise<OperationOutcome> {
  const issues: OperationIssue[] = [];
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
      percent: Math.round((index / ids.length) * 100),
      bookId,
      bookName,
      chunkCurrent: null,
      chunkTotal: null,
    });

    try {
      const config = await loadBookConfig(bookId, userId);
      if (!canEditBook(config)) {
        const issue: OperationIssue = {
          severity: "warn",
          message: "Skipped because this book is read-only inside Lore Recall.",
          bookId,
          bookName,
          phase: "loading",
        };
        issues.push(issue);
        operation?.addIssue(issue);
        continue;
      }

      const cache = await loadBookCache(bookId, userId);
      if (!cache) {
        const issue: OperationIssue = {
          severity: "warn",
          message: "Skipped because this world book no longer exists.",
          bookId,
          bookName,
          phase: "loading",
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
        percent: Math.round((index / ids.length) * 100),
        bookId,
        bookName,
        chunkCurrent: null,
        chunkTotal: null,
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
        percent: Math.round(((index + 0.75) / ids.length) * 100),
        bookId,
        bookName,
        chunkCurrent: null,
        chunkTotal: null,
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
        percent: Math.round(((index + 1) / ids.length) * 100),
        bookId,
        bookName,
        chunkCurrent: null,
        chunkTotal: null,
      });
    } catch (error: unknown) {
      const issue: OperationIssue = {
        severity: "error",
        message: `Metadata build failed: ${describeError(error)}`,
        bookId,
        bookName,
        phase: "saving",
      };
      issues.push(issue);
      operation?.addIssue(issue);
    }
  }

  return {
    issues,
    completed,
    total: ids.length,
  };
}

function chunkEntries<T extends { content: string; previewText: string }>(
  items: T[],
  chunkTokens: number,
  measure?: (item: T) => number,
): T[][] {
  const maxChars = Math.max(2000, chunkTokens * 4);
  const maxItems = 12;
  const chunks: T[][] = [];
  let current: T[] = [];
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
  if (current.length) chunks.push(current);
  return chunks;
}

export async function buildTreeWithLlm(
  bookIds: string[],
  userId: string,
  operation?: OperationContext,
): Promise<OperationOutcome> {
  const settings = await loadGlobalSettings(userId);
  const ids = uniqueStrings(bookIds);
  const issues: OperationIssue[] = [];

  if (!ids.length) {
    return { issues, completed: 0, total: 0 };
  }

  const preparedBooks: Array<{
    bookId: string;
    bookName: string;
    cache: NonNullable<Awaited<ReturnType<typeof loadBookCache>>>;
    chunkCount: number;
    entrySummaryBatchCount: number;
    originalIndex: number;
  }> = [];

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
      chunkTotal: null,
    });

    try {
      const config = await loadBookConfig(bookId, userId);
      if (!canEditBook(config)) {
        const issue: OperationIssue = {
          severity: "warn",
          message: "Skipped because this book is read-only inside Lore Recall.",
          bookId,
          bookName,
          phase: "loading",
        };
        issues.push(issue);
        operation?.addIssue(issue);
        continue;
      }

      const cache = await loadBookCache(bookId, userId);
      if (!cache) {
        const issue: OperationIssue = {
          severity: "warn",
          message: "Skipped because this world book no longer exists.",
          bookId,
          bookName,
          phase: "loading",
        };
        issues.push(issue);
        operation?.addIssue(issue);
        continue;
      }

      bookName = cache.name || bookId;
      if (!cache.entries.length) {
        const issue: OperationIssue = {
          severity: "warn",
          message: "Skipped because this book has no entries to build from.",
          bookId,
          bookName,
          phase: "loading",
        };
        issues.push(issue);
        operation?.addIssue(issue);
        continue;
      }

      preparedBooks.push({
        bookId,
        bookName,
        cache,
        chunkCount: Math.max(
          1,
          chunkEntries(cache.entries, settings.chunkTokens, (entry) =>
            JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail)).length,
          ).length,
        ),
        entrySummaryBatchCount: Math.max(1, Math.ceil(cache.entries.length / 8)),
        originalIndex: index,
      });
    } catch (error: unknown) {
      const issue: OperationIssue = {
        severity: "error",
        message: `Failed to prepare this book: ${describeError(error)}`,
        bookId,
        bookName,
        phase: "loading",
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
      const updates: Array<{ entryId: string; summary?: string; collapsedText?: string }> = [];
      const chunks = chunkEntries(cache.entries, settings.chunkTokens, (entry) =>
        JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail)).length,
      );
      const granularity = getEffectiveTreeGranularity(settings.treeGranularity, cache.entries.length);
      const allEntryManifest =
        chunks.length > 1
          ? cache.entries
              .map((entry) => truncateText(entry.label || entry.comment || entry.entryId, 80))
              .filter(Boolean)
              .join("\n- ")
          : "";
      const entrySummaryBatchSize = 8;
      const entrySummaryBatches = Array.from(
        { length: Math.ceil(cache.entries.length / entrySummaryBatchSize) },
        (_, index) => cache.entries.slice(index * entrySummaryBatchSize, (index + 1) * entrySummaryBatchSize),
      ).filter((batch) => batch.length > 0);

      for (const [chunkIndex, chunk] of chunks.entries()) {
        operation?.progress({
          phase: "controller",
          message: `Analyzing ${bookName} chunk ${chunkIndex + 1} of ${chunkCount}.`,
          current: originalIndex + 1,
          total: ids.length,
          percent: totalUnits ? Math.round((completedUnits / totalUnits) * 100) : null,
          bookId,
          bookName,
          chunkCurrent: chunkIndex + 1,
          chunkTotal: chunkCount,
        });

        const prompt = [
          "Organize these lore entries into a compact retrieval tree.",
          'Return ONLY JSON in this exact shape: {"assignments":[{"entryId":"...","path":["Category","Subcategory"]}]}',
          `Build detail: ${getBuildDetailLabel(settings.buildDetail)}. ${getBuildDetailDescription(settings.buildDetail)}`,
          `Tree granularity: ${granularity.label}${granularity.isAuto ? " (auto)" : ""}. Aim for ${granularity.targetCategories} top-level categories and no more than ${granularity.maxEntries} entries per leaf category.`,
          ...buildExistingTreeGuidance(tree, granularity, chunkIndex, chunkCount),
          ...(chunkIndex === 0 && allEntryManifest
            ? [
                `This book has ${cache.entries.length} total entries across ${chunkCount} chunks. Design the category structure to accommodate the whole book, not just this chunk.`,
                "All entry names in the book:",
                `- ${allEntryManifest}`,
              ]
            : []),
          "Use empty path [] when an entry should stay unassigned.",
          "",
          "Entries:",
          ...chunk.map((entry) => JSON.stringify(buildAssignmentEntryPayload(entry, settings.buildDetail))),
        ].join("\n");

        const controllerResult = await runControllerJson(
          prompt,
          settings,
          userId,
          "assignments",
          "lore_recall_tree_assignments",
          ASSIGNMENTS_SCHEMA,
          {
            systemPrompt: CATEGORIZATION_SYSTEM_PROMPT,
            maxTokensOverride: Math.min(settings.controllerMaxTokens, 1200),
          },
        );
        const parsed =
          controllerResult.parsed ??
          normalizeAssignmentsPayload(parseJsonValue(controllerResult.rawContent || controllerResult.rawReasoning));
        if (!parsed || !Array.isArray(parsed.assignments)) {
          throw new ControllerJsonError(
            `The controller did not return usable assignment JSON for chunk ${chunkIndex + 1}.`,
            buildControllerDebugPayload({
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
                label: entry.label,
              })),
            }),
          );
        }
        const assignments = parsed.assignments.filter(
          (value): value is Record<string, unknown> => !!value && typeof value === "object",
        );

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
        }

        completedUnits += 1;
      }

      await subdivideLargeLeafNodes(tree, cache.entries, granularity, settings, userId);

      const categoryNodeIds = Object.keys(tree.nodes).filter((nodeId) => {
        if (nodeId === tree.rootId) return false;
        const node = tree.nodes[nodeId];
        return !!node && (node.entryIds.length > 0 || node.childIds.length > 0);
      });

      const categoryBatchSize = 6;
      const categoryBatches = Array.from({ length: Math.ceil(categoryNodeIds.length / categoryBatchSize) }, (_, index) =>
        categoryNodeIds.slice(index * categoryBatchSize, (index + 1) * categoryBatchSize),
      ).filter((batch) => batch.length > 0);

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
          chunkTotal: categoryBatches.length,
        });

        try {
          const summaries = await generateCategorySummary(tree, nodeBatch, cache.entries, settings, userId);
          for (const nodeId of nodeBatch) {
            const node = tree.nodes[nodeId];
            if (!node) continue;
            const summary = summaries[nodeId];
            if (summary) {
              node.summary = appendKeywordHints(summary, collectNodeKeywordHints(tree, nodeId, cache.entries));
              continue;
            }
            const issue: OperationIssue = {
              severity: "warn",
              message: `No category summary was returned for ${node.label}.`,
              bookId,
              bookName,
              phase: "category_controller",
            };
            issues.push(issue);
            operation?.addIssue(issue);
          }
        } catch (error: unknown) {
          for (const nodeId of nodeBatch) {
            const node = tree.nodes[nodeId];
            const issue: OperationIssue = {
              severity: "error",
              message: `Category summary generation failed for ${node?.label ?? nodeId}: ${describeError(error)}`,
              bookId,
              bookName,
              phase: "category_controller",
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
        percent: totalUnits ? Math.round((completedUnits / totalUnits) * 100) : null,
        bookId,
        bookName,
        chunkCurrent: chunkCount,
        chunkTotal: chunkCount,
      });

      for (const entry of cache.entries) {
        const assigned =
          tree.unassignedEntryIds.includes(entry.entryId) || Object.values(tree.nodes).some((node) => node.entryIds.includes(entry.entryId));
        if (!assigned) assignEntryToTarget(tree, entry.entryId, "unassigned");
      }

      tree.nodes[tree.rootId].summary = appendKeywordHints(
        buildRootSummary(tree, bookName),
        collectNodeKeywordHints(tree, tree.rootId, cache.entries),
      );
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
          percent: totalUnits ? Math.round((completedUnits / totalUnits) * 100) : null,
          bookId,
          bookName,
          chunkCurrent: batchIndex + 1,
          chunkTotal: entrySummaryBatches.length,
        });

        try {
          updates.push(...(await generateEntrySummaryBatch(entryBatch, settings, userId)));
        } catch (error: unknown) {
          const issue: OperationIssue = {
            severity: "warn",
            message: `Entry summary batch ${batchIndex + 1} failed for ${bookName}: ${describeError(error)}`,
            bookId,
            bookName,
            phase: "entry_controller",
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
        percent: totalUnits ? Math.round((completedUnits / totalUnits) * 100) : null,
        bookId,
        bookName,
        chunkCurrent: chunkCount,
        chunkTotal: chunkCount,
      });

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
      completedUnits += 1;
      completedBooks += 1;

      operation?.progress({
        phase: "complete",
        message: `Finished LLM tree build for ${bookName}.`,
        current: originalIndex + 1,
        total: ids.length,
        percent: totalUnits ? Math.round((completedUnits / totalUnits) * 100) : 100,
        bookId,
        bookName,
        chunkCurrent: chunkCount,
        chunkTotal: chunkCount,
      });
    } catch (error: unknown) {
      const issue: OperationIssue = {
        severity: "error",
        message: `LLM tree build failed: ${describeError(error)}`,
        bookId,
        bookName,
        phase: "controller",
        debugPayload: error instanceof ControllerJsonError ? error.debugPayload : null,
      };
      issues.push(issue);
      operation?.addIssue(issue);
    }
  }

  return {
    issues,
    completed: completedBooks,
    total: ids.length,
  };
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
  operation?: OperationContext,
): Promise<OperationOutcome> {
  const settings = await loadGlobalSettings(userId);
  const cache = await loadBookCache(bookId, userId);
  if (!cache) throw new Error("That world book no longer exists.");
  const loaded = await loadTreeIndex(bookId, cache.entries, userId);
  const bookName = cache.name || bookId;

  const targetEntries = (entryIds?.length
    ? cache.entries.filter((entry) => entryIds.includes(entry.entryId))
    : cache.entries.filter((entry) => !entry.summary.trim() || !entry.collapsedText.trim())
  ).slice(0, 24);

  const targetNodeIds = uniqueStrings(nodeIds ?? []).filter((id) => loaded.tree.nodes[id] && id !== loaded.tree.rootId).slice(0, 16);
  const totalTargets = targetEntries.length + targetNodeIds.length;
  let completed = 0;
  const issues: OperationIssue[] = [];

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
      chunkTotal: 1,
    });

    try {
      const updates = await generateEntrySummaryBatch(targetEntries, settings, userId);

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
      completed += targetEntries.length;
      operation?.progress({
        phase: "entries_complete",
        message: `Updated ${targetEntries.length} entry summary${targetEntries.length === 1 ? "" : "ies"} for ${bookName}.`,
        current: completed,
        total: totalTargets,
        percent: Math.round((completed / totalTargets) * 100),
        bookId,
        bookName,
        chunkCurrent: 1,
        chunkTotal: 1,
      });
    } catch (error: unknown) {
      const issue: OperationIssue = {
        severity: "error",
        message: `Entry summary regeneration failed: ${describeError(error)}`,
        bookId,
        bookName,
        phase: "controller",
      };
      issues.push(issue);
      operation?.addIssue(issue);
    }
  }

  const categoryBatchSize = 6;
  const nodeBatches = Array.from({ length: Math.ceil(targetNodeIds.length / categoryBatchSize) }, (_, index) =>
    targetNodeIds.slice(index * categoryBatchSize, (index + 1) * categoryBatchSize),
  ).filter((batch) => batch.length > 0);

  for (const [batchIndex, nodeBatch] of nodeBatches.entries()) {
    const firstNode = loaded.tree.nodes[nodeBatch[0]];

    operation?.progress({
      phase: "category_controller",
      message: `Generating category summaries batch ${batchIndex + 1} of ${nodeBatches.length} in ${bookName}.`,
      current: completed,
      total: totalTargets,
      percent: Math.round((completed / totalTargets) * 100),
      bookId,
      bookName,
      chunkCurrent: batchIndex + 1,
      chunkTotal: nodeBatches.length,
    });

    try {
      const summaries = await generateCategorySummary(loaded.tree, nodeBatch, cache.entries, settings, userId);
      for (const nodeId of nodeBatch) {
        const node = loaded.tree.nodes[nodeId];
        if (!node) continue;
        const summary = summaries[nodeId];
        if (summary) {
          node.summary = appendKeywordHints(summary, collectNodeKeywordHints(loaded.tree, nodeId, cache.entries));
          completed += 1;
          continue;
        }
        const issue: OperationIssue = {
          severity: "warn",
          message: `No category summary was returned for ${node.label}.`,
          bookId,
          bookName,
          phase: "category_controller",
        };
        issues.push(issue);
        operation?.addIssue(issue);
      }
      operation?.progress({
        phase: "category_complete",
        message: `Updated category summaries for ${firstNode?.label ?? bookName}.`,
        current: completed,
        total: totalTargets,
        percent: Math.round((completed / totalTargets) * 100),
        bookId,
        bookName,
        chunkCurrent: batchIndex + 1,
        chunkTotal: nodeBatches.length,
      });
    } catch (error: unknown) {
      for (const nodeId of nodeBatch) {
        const node = loaded.tree.nodes[nodeId];
        const issue: OperationIssue = {
          severity: "error",
          message: `Category summary regeneration failed for ${node?.label ?? nodeId}: ${describeError(error)}`,
          bookId,
          bookName,
          phase: "category_controller",
        };
        issues.push(issue);
        operation?.addIssue(issue);
      }
    }
  }

  if (targetNodeIds.length) {
    loaded.tree.nodes[loaded.tree.rootId].summary = appendKeywordHints(
      buildRootSummary(loaded.tree, bookName),
      collectNodeKeywordHints(loaded.tree, loaded.tree.rootId, cache.entries),
    );
    loaded.tree.lastBuiltAt = Date.now();
    loaded.tree.buildSource = "manual";
    await saveTreeIndex(bookId, loaded.tree, cache.entries.map((entry) => entry.entryId), userId);
  }

  return {
    issues,
    completed,
    total: totalTargets,
  };
}

export function buildDiagnostics(
  runtimeBooks: RuntimeBook[],
  staleIssues: Record<string, { staleEntryRefs: number; staleNodeRefs: number }>,
  settings?: Pick<GlobalLoreRecallSettings, "controllerConnectionId">,
  characterConfig?: CharacterRetrievalConfig | null,
  availableConnections: Array<{ id: string }> = [],
): DiagnosticFinding[] {
  const diagnostics: DiagnosticFinding[] = [];
  const multiBookMode = !!characterConfig && runtimeBooks.length > 1;
  const readableBooks = runtimeBooks.filter((book) => book.config.enabled && book.config.permission !== "write_only");

  if (characterConfig?.searchMode === "traversal" && characterConfig.selectiveRetrieval && characterConfig.traversalStepLimit < 3) {
    diagnostics.push({
      id: "selective-traversal-limit",
      severity: "warn",
      bookId: null,
      title: "Traversal step limit is low for selective retrieval",
      detail:
        "Selective retrieval in traversal mode works best with at least 3 traversal steps so Lore Recall can choose useful scopes before picking exact entries from their manifests.",
    });
  }

  if (!readableBooks.length && runtimeBooks.length) {
    diagnostics.push({
      id: "no-readable-books",
      severity: "warn",
      bookId: null,
      title: "No readable managed books",
      detail: "All managed books are currently disabled or write-only, so Lore Recall has nothing it can search during retrieval.",
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
        detail: "The controller connection selected in Lore Recall settings is no longer available, so controller-guided retrieval may silently fall back.",
      });
    }
  } else if (!availableConnections.length && runtimeBooks.length) {
    diagnostics.push({
      id: "controller-unavailable",
      severity: "warn",
      bookId: null,
      title: "No controller connections are available",
      detail: "No connection profiles are currently available for controller-guided retrieval, tree building, or summary generation.",
    });
  }

  for (const book of runtimeBooks) {
    const issues = staleIssues[book.summary.id];
    const categoryNodes = Object.values(book.tree.nodes).filter((node) => node.id !== book.tree.rootId);
    const categorySummaryCount = categoryNodes.filter((node) => node.summary.trim()).length;
    const oversizedLeafNodes = categoryNodes.filter((node) => node.childIds.length === 0 && node.entryIds.length >= 20);
    const overviewEstimate = categoryNodes.reduce(
      (total, node) => total + 48 + node.label.length + Math.min(node.summary.length, 120),
      0,
    );
    const rootSummary = book.tree.nodes[book.tree.rootId]?.summary?.trim() ?? "";

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
    if (categoryNodes.length && categorySummaryCount < categoryNodes.length) {
      diagnostics.push({
        id: `category-summary:${book.summary.id}`,
        severity: categorySummaryCount === 0 ? "warn" : "info",
        bookId: book.summary.id,
        title: "Category summary coverage is incomplete",
        detail: `${book.summary.name} has ${categorySummaryCount}/${categoryNodes.length} category summaries. Tree navigation works better when categories have short summaries.`,
      });
    }
    if (oversizedLeafNodes.length) {
      diagnostics.push({
        id: `oversized-leaf:${book.summary.id}`,
        severity: "warn",
        bookId: book.summary.id,
        title: "Some leaf categories are oversized",
        detail: `${book.summary.name} has ${oversizedLeafNodes.length} leaf categor${oversizedLeafNodes.length === 1 ? "y" : "ies"} with 20 or more direct entries. Rebuild with LLM to split oversized leaves into more specific branches.`,
      });
    }
    if (overviewEstimate > 10_000) {
      diagnostics.push({
        id: `overview-size:${book.summary.id}`,
        severity: "info",
        bookId: book.summary.id,
        title: "Tree overview is large",
        detail: `${book.summary.name} has a large category index, so collapsed or full-tree traversal prompts may need tighter categories and stronger summaries to stay readable.`,
      });
    }
    if (multiBookMode && !book.config.description.trim() && !rootSummary) {
      diagnostics.push({
        id: `multibook-description:${book.summary.id}`,
        severity: "info",
        bookId: book.summary.id,
        title: "Book lacks a disambiguating description",
        detail: `${book.summary.name} has no Lore Recall book description and no root summary yet, which makes multi-book retrieval harder to disambiguate.`,
      });
    }
  }

  return diagnostics;
}

export async function exportSnapshot(
  userId: string,
  operation?: OperationContext,
): Promise<OperationOutcome<ExportSnapshot>> {
  operation?.progress({
    phase: "loading",
    message: "Collecting Lore Recall settings, trees, and metadata for export.",
    current: 0,
    total: 1,
    percent: 0,
    chunkCurrent: null,
    chunkTotal: null,
  });
  const [globalSettings, characters, characterFiles, bookFiles, treeFiles, books] = await Promise.all([
    loadGlobalSettings(userId),
    listAllCharacters(userId),
    spindle.userStorage.list(`${CHARACTER_CONFIG_DIR}/`, userId).catch(() => [] as string[]),
    spindle.userStorage.list(`${BOOK_CONFIG_DIR}/`, userId).catch(() => [] as string[]),
    spindle.userStorage.list(`${TREE_DIR}/`, userId).catch(() => [] as string[]),
    listAllWorldBooks(userId),
  ]);

  const legacyCharacterIds = new Set(
    characterFiles
      .filter((file) => file.endsWith(".json"))
      .map((path) => path.split("/").pop()?.replace(/\.json$/i, "") ?? "")
      .filter(Boolean),
  );
  const characterConfigs: Record<string, CharacterRetrievalConfig> = {};
  for (const character of characters) {
    if (!characterHasStoredConfig(character) && !legacyCharacterIds.has(character.id)) continue;
    characterConfigs[character.id] = await loadCharacterConfig(character.id, userId, character);
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

  const snapshot: ExportSnapshot = {
    version: 2,
    exportedAt: Date.now(),
    globalSettings,
    characterConfigs,
    bookConfigs,
    treeIndexes,
    entryMeta,
  };

  operation?.progress({
    phase: "complete",
    message: "Lore Recall snapshot is ready to download.",
    current: 1,
    total: 1,
    percent: 100,
    chunkCurrent: null,
    chunkTotal: null,
  });

  return {
    value: snapshot,
    issues: [],
    completed: 1,
    total: 1,
  };
}

export async function importSnapshot(
  snapshot: ExportSnapshot,
  userId: string,
  operation?: OperationContext,
): Promise<OperationOutcome> {
  const totalSteps =
    1 +
    Object.keys(snapshot.characterConfigs ?? {}).length +
    Object.keys(snapshot.bookConfigs ?? {}).length +
    Object.keys(snapshot.treeIndexes ?? {}).length +
    Object.keys(snapshot.entryMeta ?? {}).reduce((sum, bookId) => sum + Object.keys(snapshot.entryMeta?.[bookId] ?? {}).length, 0);
  let completed = 0;
  const issues: OperationIssue[] = [];

  operation?.progress({
    phase: "global_settings",
    message: "Importing Lore Recall global settings.",
    current: completed,
    total: totalSteps,
    percent: totalSteps ? 0 : 100,
    chunkCurrent: null,
    chunkTotal: null,
  });
  await saveGlobalSettings(snapshot.globalSettings, userId);
  completed += 1;

  for (const [characterId, config] of Object.entries(snapshot.characterConfigs ?? {})) {
    operation?.progress({
      phase: "character_configs",
      message: `Importing character settings for ${characterId}.`,
      current: completed,
      total: totalSteps,
      percent: totalSteps ? Math.round((completed / totalSteps) * 100) : 100,
      chunkCurrent: null,
      chunkTotal: null,
    });
    const character = await spindle.characters.get(characterId, userId);
    if (!character) {
      const issue: OperationIssue = {
        severity: "warn",
        message: `Skipped character settings for missing character ${characterId}.`,
        phase: "character_configs",
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
      percent: totalSteps ? Math.round((completed / totalSteps) * 100) : 100,
      bookId,
      bookName: bookId,
      chunkCurrent: null,
      chunkTotal: null,
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
      percent: totalSteps ? Math.round((completed / totalSteps) * 100) : 100,
      bookId,
      bookName: bookId,
      chunkCurrent: null,
      chunkTotal: null,
    });
    const cache = await loadBookCache(bookId, userId);
    if (!cache) continue;
    await spindle.userStorage.setJson(
      getTreePath(bookId),
      ensureTreeIndexShape(tree as any, bookId, cache.entries.map((entry) => entry.entryId)),
      { indent: 2, userId },
    );
    completed += 1;
  }

  for (const [bookId, perBook] of Object.entries(snapshot.entryMeta ?? {})) {
    for (const [entryId, meta] of Object.entries(perBook)) {
      operation?.progress({
        phase: "entry_metadata",
        message: `Importing entry metadata for ${bookId}.`,
        current: completed,
        total: totalSteps,
        percent: totalSteps ? Math.round((completed / totalSteps) * 100) : 100,
        bookId,
        bookName: bookId,
        chunkCurrent: null,
        chunkTotal: null,
      });
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
    chunkTotal: null,
  });

  return {
    issues,
    completed,
    total: totalSteps,
  };
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
