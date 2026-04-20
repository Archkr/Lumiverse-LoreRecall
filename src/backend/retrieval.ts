declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import { clampInt, getEntryCategoryPath, getNodeDepth, truncateText, uniqueStrings } from "../shared";
import type {
  BookTreeIndex,
  CharacterRetrievalConfig,
  GlobalLoreRecallSettings,
  PreviewNode,
  PreviewScope,
  RetrievalPreview,
  TraversalTraceStep,
} from "../types";
import type { ChatLikeMessage, RuntimeBook, ScoredEntry } from "./contracts";
import { isReadableBook } from "./storage";

interface RetrievalPreviewOptions {
  allowController?: boolean;
  connectionId?: string | null;
  capturedAt?: number;
  isActual?: boolean;
}

interface ControllerSession {
  settings: GlobalLoreRecallSettings;
  userId: string;
  connectionId: string | null;
  controllerUsed: boolean;
  deadlineAt: number;
  callCount: number;
}

interface ControllerResponse {
  parsed: Record<string, unknown> | null;
  error: string | null;
}

interface TraversalScope {
  book: RuntimeBook;
  nodeId: string;
}

interface TraversalSelectionResult {
  selected: ScoredEntry[];
  retrievedScopes: TraversalScope[];
  fallbackReason: string | null;
  steps: string[];
  trace: TraversalTraceStep[];
}

interface TraversalCategoryChoice {
  choiceId: string;
  book: RuntimeBook;
  nodeId: string;
  label: string;
  summary: string;
  depth: number;
  childCount: number;
  entryCount: number;
}

interface TraversalFrontier {
  scopeLabel: string;
  categories: TraversalCategoryChoice[];
  entries: ScoredEntry[];
}

const CONTROLLER_TIMEOUT_MS = 45_000;
const CONTROLLER_TOTAL_BUDGET_MS = 175_000;
const CONTROLLER_MAX_CALLS = 12;
const TRAVERSAL_CATEGORY_LIMIT = 24;
const TRAVERSAL_ENTRY_LIMIT = 14;

function stripCodeFences(content: string): string {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = stripCodeFences(content);
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
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

function resolveControllerConnectionId(
  settings: GlobalLoreRecallSettings,
  fallbackConnectionId?: string | null,
): string | null {
  if (settings.controllerConnectionId?.trim()) return settings.controllerConnectionId.trim();
  if (fallbackConnectionId?.trim()) return fallbackConnectionId.trim();
  return null;
}

function pushTrace(
  trace: TraversalTraceStep[],
  phase: TraversalTraceStep["phase"],
  label: string,
  summary: string,
  extra: Partial<Omit<TraversalTraceStep, "step" | "phase" | "label" | "summary">> = {},
): void {
  trace.push({
    step: trace.length + 1,
    phase,
    label,
    summary,
    bookId: extra.bookId ?? null,
    nodeId: extra.nodeId ?? null,
    entryCount: extra.entryCount ?? null,
  });
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

function buildQueryText(messages: ChatLikeMessage[], contextMessages: number): string {
  return messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .slice(-contextMessages)
    .map((message) => `${message.role}: ${stripSearchMarkup(message.content)}`)
    .join("\n");
}

function getEntryBody(entry: RuntimeBook["cache"]["entries"][number]): string {
  return entry.collapsedText.trim() || entry.content.trim();
}

function getEntryBreadcrumb(entry: RuntimeBook["cache"]["entries"][number], tree: BookTreeIndex): string {
  const path = getEntryCategoryPath(tree, entry.entryId)
    .map((node) => node.label)
    .filter((label) => label && label !== "Root");
  return [...path, entry.label].join(" > ");
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

function scoreEntry(
  entry: RuntimeBook["cache"]["entries"][number],
  tree: BookTreeIndex,
  queryText: string,
  queryTokens: string[],
): ScoredEntry {
  const reasons: string[] = [];
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

  if (labelMatches > 0) reasons.push("label");
  if (aliasMatches > 0) reasons.push("alias");
  if (keyMatches > 0) reasons.push("keyword");
  if (tagMatches > 0) reasons.push("tag");
  if (summaryMatches > 0) reasons.push("summary");
  if (bodyMatches > 0) reasons.push("content");
  if (breadcrumbMatches > 0) reasons.push("branch");
  if (commentMatches > 0) reasons.push("comment");
  if (groupMatches > 0) reasons.push("group");

  score += labelMatches * 4;
  score += aliasMatches * 3;
  score += keyMatches * 3;
  score += tagMatches * 2;
  score += summaryMatches * 2;
  score += bodyMatches;
  score += breadcrumbMatches * 2;
  score += commentMatches * 2;
  score += groupMatches;
  if (entry.constant) score += 0.2;
  if (entry.selective) score += 0.1;

  return { entry, score, reasons: Array.from(new Set(reasons)) };
}

function scoreEntries(queryText: string, books: RuntimeBook[]): ScoredEntry[] {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  if (!normalized || !queryTokens.length) return [];

  return books
    .flatMap((book) =>
      book.cache.entries
        .filter((entry) => !entry.disabled)
        .map((entry) => scoreEntry(entry, book.tree, normalized, queryTokens)),
    )
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}

async function runControllerJson(
  prompt: string,
  controller: ControllerSession,
): Promise<ControllerResponse> {
  if (controller.callCount >= CONTROLLER_MAX_CALLS) {
    return { parsed: null, error: "Traversal controller hit its call limit." };
  }

  const remainingMs = controller.deadlineAt - Date.now();
  if (remainingMs <= 1_000) {
    return { parsed: null, error: "Traversal controller ran out of time." };
  }

  controller.callCount += 1;
  const abortController = new AbortController();
  const timeoutMs = Math.min(CONTROLLER_TIMEOUT_MS, remainingMs);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const requestPromise: Promise<ControllerResponse> = spindle.generate
      .quiet({
        type: "quiet",
        messages: [{ role: "user", content: prompt }],
        parameters: {
          temperature: controller.settings.controllerTemperature,
          max_tokens: controller.settings.controllerMaxTokens,
        },
        ...(controller.connectionId ? { connection_id: controller.connectionId } : {}),
        userId: controller.userId,
        signal: abortController.signal,
      } as unknown as Parameters<typeof spindle.generate.quiet>[0])
      .then((result) => {
        const parsed = parseJsonObject(getGenerationContent(result));
        if (parsed) {
          controller.controllerUsed = true;
          return { parsed, error: null };
        }
        spindle.log.warn("Lore Recall controller call returned invalid JSON.");
        return { parsed: null, error: "Traversal controller returned invalid JSON." };
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const isAbort = error instanceof Error && error.name === "AbortError";
        spindle.log.warn(`Lore Recall controller call failed: ${isAbort ? "request timed out" : message}`);
        return {
          parsed: null,
          error: isAbort ? "Traversal controller timed out." : `Traversal controller failed: ${message}`,
        };
      });

    const timeoutPromise = new Promise<ControllerResponse>((resolve) => {
      timer = setTimeout(() => {
        abortController.abort();
        spindle.log.warn("Lore Recall controller call failed: request timed out");
        resolve({
          parsed: null,
          error: "Traversal controller timed out before the interceptor budget was exhausted.",
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
    if (timer) clearTimeout(timer);
  }
}

async function maybeChooseBooks(
  queryText: string,
  books: RuntimeBook[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
): Promise<{ books: RuntimeBook[]; trace: TraversalTraceStep[] }> {
  if (!allowController || config.multiBookMode !== "per_book" || books.length <= 1) {
    return { books, trace: [] };
  }

  const prompt = [
    "Choose the most relevant lore books for the query.",
    'Return ONLY JSON in this exact shape: {"bookIds":["book-id-1","book-id-2"]}.',
    `Choose up to ${Math.min(3, books.length)} books.`,
    "",
    `Query: ${queryText}`,
    "",
    "Books:",
    ...books.map((book) =>
      `- id=${book.summary.id}; name=${book.summary.name}; description=${truncateText(
        book.config.description || book.summary.description,
        140,
      )}; categories=${Math.max(0, Object.keys(book.tree.nodes).length - 1)}; entries=${book.cache.entries.length}`,
    ),
  ].join("\n");

  const { parsed } = await runControllerJson(prompt, controller);
  const ids = Array.isArray(parsed?.bookIds)
    ? parsed.bookIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!ids.length) return { books, trace: [] };
  const chosen = books.filter((book) => ids.includes(book.summary.id));
  const nextBooks = chosen.length ? chosen : books;
  const trace: TraversalTraceStep[] = [];
  pushTrace(
    trace,
    "choose_book",
    "Book selection",
    nextBooks.length
      ? `Controller selected ${nextBooks.length} book(s): ${nextBooks.map((book) => book.summary.name).join(", ")}.`
      : "Controller kept all readable books in scope.",
    { entryCount: nextBooks.reduce((total, book) => total + book.cache.entries.length, 0) },
  );
  return { books: nextBooks, trace };
}

async function maybeRerankEntries(
  queryText: string,
  scored: ScoredEntry[],
  controller: ControllerSession,
  allowController: boolean,
): Promise<ScoredEntry[]> {
  if (!allowController || scored.length <= 1) return scored;
  const prompt = [
    "You rank lore nodes for retrieval relevance.",
    'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
    "Use only entryIds from the candidate list.",
    "",
    `Query: ${queryText}`,
    "",
    "Candidates:",
    ...scored.map((item) =>
      `- entryId=${item.entry.entryId}; label=${item.entry.label}; book=${item.entry.worldBookName}; summary=${truncateText(
        item.entry.summary,
        120,
      )}; preview=${truncateText(getEntryBody(item.entry), 160)}`,
    ),
  ].join("\n");

  const { parsed } = await runControllerJson(prompt, controller);
  const ids = Array.isArray(parsed?.entryIds)
    ? parsed.entryIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!ids.length) return scored;

  const byId = new Map(scored.map((item) => [item.entry.entryId, item]));
  const ordered: ScoredEntry[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const match = byId.get(id);
    if (!match || seen.has(id)) continue;
    seen.add(id);
    ordered.push(match);
  }
  for (const item of scored) {
    if (seen.has(item.entry.entryId)) continue;
    ordered.push(item);
  }
  return ordered;
}

async function maybeSelectEntries(
  queryText: string,
  candidates: ScoredEntry[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
): Promise<ScoredEntry[]> {
  if (!allowController || !config.selectiveRetrieval || !candidates.length) return candidates.slice(0, config.maxResults);

  const prompt = [
    "Select the exact lore entries that should be injected.",
    'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
    `Choose up to ${config.maxResults} entryIds.`,
    "",
    `Query: ${queryText}`,
    "",
    "Entry manifest:",
    ...candidates.slice(0, Math.max(config.maxResults * 3, 12)).map((item) =>
      `- entryId=${item.entry.entryId}; label=${item.entry.label}; book=${item.entry.worldBookName}; summary=${truncateText(
        item.entry.summary,
        140,
      )}; preview=${truncateText(getEntryBody(item.entry), 180)}`,
    ),
  ].join("\n");

  const { parsed } = await runControllerJson(prompt, controller);
  const ids = Array.isArray(parsed?.entryIds)
    ? parsed.entryIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!ids.length) return candidates.slice(0, config.maxResults);

  const byId = new Map(candidates.map((item) => [item.entry.entryId, item]));
  const chosen: ScoredEntry[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const match = byId.get(id);
    if (!match || seen.has(id)) continue;
    seen.add(id);
    chosen.push(match);
    if (chosen.length >= config.maxResults) break;
  }
  if (!chosen.length) return candidates.slice(0, config.maxResults);
  for (const item of candidates) {
    if (chosen.length >= config.maxResults) break;
    if (seen.has(item.entry.entryId)) continue;
    chosen.push(item);
  }
  return chosen;
}

function getDescendantCategoryIds(tree: BookTreeIndex, nodeId: string, depthLimit: number): string[] {
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

function makeCategoryChoiceId(bookId: string, nodeId: string): string {
  return `category:${bookId}:${nodeId}`;
}

function parseCategoryChoiceId(choiceId: string): { bookId: string; nodeId: string } | null {
  const match = choiceId.match(/^category:([^:]+):(.+)$/);
  if (!match) return null;
  return { bookId: match[1], nodeId: match[2] };
}

function makeEntryChoiceId(entryId: string): string {
  return `entry:${entryId}`;
}

function parseEntryChoiceId(choiceId: string): string | null {
  const match = choiceId.match(/^entry:(.+)$/);
  return match?.[1] ?? null;
}

function getScopedEntryIds(book: RuntimeBook, nodeId: string, includeDescendants: boolean): string[] {
  const node = book.tree.nodes[nodeId];
  if (!node) return [];

  const nodeIds = includeDescendants ? getDescendantCategoryIds(book.tree, nodeId, Number.MAX_SAFE_INTEGER) : [nodeId];
  const scopedEntryIds = uniqueStrings(nodeIds.flatMap((currentNodeId) => book.tree.nodes[currentNodeId]?.entryIds ?? []));
  if (nodeId === book.tree.rootId) {
    scopedEntryIds.push(...book.tree.unassignedEntryIds);
  }
  return uniqueStrings(scopedEntryIds);
}

function getScopeBreadcrumb(book: RuntimeBook, nodeId: string): string {
  if (nodeId === book.tree.rootId) return "Root";
  const labels: string[] = [];
  const visited = new Set<string>();
  let cursor: BookTreeIndex["nodes"][string] | undefined = book.tree.nodes[nodeId];
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (cursor.id !== book.tree.rootId) labels.push(cursor.label);
    cursor = cursor.parentId ? book.tree.nodes[cursor.parentId] : undefined;
  }
  return labels.reverse().join(" > ") || "Root";
}

function buildPreviewScopes(scopes: TraversalScope[]): PreviewScope[] {
  const seen = new Set<string>();
  const previews: PreviewScope[] = [];
  for (const scope of scopes) {
    const key = `${scope.book.summary.id}:${scope.nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = scope.book.tree.nodes[scope.nodeId];
    if (!node) continue;
    previews.push({
      nodeId: node.id,
      label: node.label || scope.book.summary.name,
      worldBookId: scope.book.summary.id,
      worldBookName: scope.book.summary.name,
      breadcrumb: getScopeBreadcrumb(scope.book, scope.nodeId),
      summary: truncateText(node.summary || "", 220),
      descendantEntryCount: getScopedEntryIds(scope.book, scope.nodeId, true).length,
    });
  }
  return previews;
}

function collectCandidatesForScopes(
  queryText: string,
  scopes: TraversalScope[],
  directEntryIds: string[] = [],
  fallbackById?: Map<string, ScoredEntry>,
): ScoredEntry[] {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  const selected: ScoredEntry[] = [];
  const seen = new Set<string>();

  for (const scope of scopes) {
    const entriesById = new Map(scope.book.cache.entries.map((entry) => [entry.entryId, entry]));
    for (const entryId of getScopedEntryIds(scope.book, scope.nodeId, true)) {
      if (seen.has(entryId)) continue;
      const entry = entriesById.get(entryId);
      if (!entry || entry.disabled) continue;
      seen.add(entryId);
      const scored = normalized && queryTokens.length ? scoreEntry(entry, scope.book.tree, normalized, queryTokens) : { entry, score: 0, reasons: [] };
      const reasons = uniqueStrings([...scored.reasons, "branch"]);
      selected.push({
        entry,
        score: scored.score > 0 ? scored.score + 0.25 : 0.25,
        reasons,
      });
    }
  }

  if (directEntryIds.length) {
    const allBooks = new Map(scopes.map((scope) => [scope.book.summary.id, scope.book]));
    for (const entryId of directEntryIds) {
      if (seen.has(entryId)) continue;
      let resolved = false;
      for (const book of allBooks.values()) {
        const entriesById = new Map(book.cache.entries.map((entry) => [entry.entryId, entry]));
        const entry = entriesById.get(entryId);
        if (!entry || entry.disabled) continue;
        seen.add(entryId);
        const scored = normalized && queryTokens.length ? scoreEntry(entry, book.tree, normalized, queryTokens) : { entry, score: 0, reasons: [] };
        selected.push({
          entry,
          score: scored.score > 0 ? scored.score : 0.5,
          reasons: uniqueStrings([...scored.reasons, "direct"]),
        });
        resolved = true;
        break;
      }
      if (resolved || !fallbackById) continue;
      const fallback = fallbackById.get(entryId);
      if (!fallback) continue;
      seen.add(entryId);
      selected.push({
        entry: fallback.entry,
        score: fallback.score > 0 ? fallback.score : 0.5,
        reasons: uniqueStrings([...fallback.reasons, "direct"]),
      });
    }
  }

  return selected.sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}

function backfillSupportingEntries(selected: ScoredEntry[], deterministic: ScoredEntry[], maxResults: number): ScoredEntry[] {
  if (selected.length >= maxResults) return selected.slice(0, maxResults);
  const next = [...selected];
  const seen = new Set(selected.map((item) => item.entry.entryId));
  for (const item of deterministic) {
    if (next.length >= maxResults) break;
    if (seen.has(item.entry.entryId)) continue;
    next.push(item);
    seen.add(item.entry.entryId);
  }
  return next;
}

function collectEntriesByIds(entryIds: string[], deterministicById: Map<string, ScoredEntry>): ScoredEntry[] {
  const selected: ScoredEntry[] = [];
  const seen = new Set<string>();
  for (const entryId of entryIds) {
    if (seen.has(entryId)) continue;
    const match = deterministicById.get(entryId);
    if (!match) continue;
    seen.add(entryId);
    selected.push(match);
  }
  return selected;
}

function rescoreEntries(
  queryText: string,
  candidates: ScoredEntry[],
  booksById: Map<string, RuntimeBook>,
): ScoredEntry[] {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  if (!normalized || !queryTokens.length || !candidates.length) return [];

  return candidates
    .map((candidate) => {
      const book = booksById.get(candidate.entry.worldBookId);
      if (!book) return null;
      return scoreEntry(candidate.entry, book.tree, normalized, queryTokens);
    })
    .filter((item): item is ScoredEntry => !!item && item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}

function buildTraversalFrontier(
  scopes: TraversalScope[],
  deterministicById: Map<string, ScoredEntry>,
  config: CharacterRetrievalConfig,
  overrideEntries: ScoredEntry[] | null,
): TraversalFrontier {
  const categories: TraversalCategoryChoice[] = [];
  const entries: ScoredEntry[] = [];
  const seenCategories = new Set<string>();
  const seenEntries = new Set<string>();

  for (const scope of scopes) {
    const node = scope.book.tree.nodes[scope.nodeId];
    if (!node) continue;

    if (getNodeDepth(scope.book.tree, scope.nodeId) < config.maxTraversalDepth) {
      for (const childId of node.childIds) {
        const child = scope.book.tree.nodes[childId];
        if (!child) continue;
        const choiceId = makeCategoryChoiceId(scope.book.summary.id, child.id);
        if (seenCategories.has(choiceId)) continue;
        seenCategories.add(choiceId);
        categories.push({
          choiceId,
          book: scope.book,
          nodeId: child.id,
          label: `${scope.book.summary.name} :: ${child.label}`,
          summary: truncateText(child.summary, 160),
          depth: getNodeDepth(scope.book.tree, child.id),
          childCount: child.childIds.length,
          entryCount: getScopedEntryIds(scope.book, child.id, true).length,
        });
      }
    }

    if (overrideEntries) continue;
    for (const entry of collectEntriesByIds(getScopedEntryIds(scope.book, scope.nodeId, false), deterministicById)) {
      if (seenEntries.has(entry.entry.entryId)) continue;
      seenEntries.add(entry.entry.entryId);
      entries.push(entry);
    }
  }

  if (overrideEntries) {
    for (const entry of overrideEntries) {
      if (seenEntries.has(entry.entry.entryId)) continue;
      seenEntries.add(entry.entry.entryId);
      entries.push(entry);
    }
  }

  return {
    scopeLabel: scopes
      .map((scope) => {
        const node = scope.book.tree.nodes[scope.nodeId];
        if (!node || scope.nodeId === scope.book.tree.rootId) return scope.book.summary.name;
        return `${scope.book.summary.name} :: ${node.label}`;
      })
      .join(" | "),
    categories: categories
      .sort((left, right) => left.depth - right.depth || left.label.localeCompare(right.label))
      .slice(0, TRAVERSAL_CATEGORY_LIMIT),
    entries: entries
      .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label))
      .slice(0, TRAVERSAL_ENTRY_LIMIT),
  };
}

function buildTraversalPrompt(
  queryText: string,
  frontier: TraversalFrontier,
  step: number,
  config: CharacterRetrievalConfig,
): string {
  return [
    "You are the Lore Recall traversal controller.",
    'Return ONLY JSON in this exact shape: {"action":"navigate|retrieve|search|finish","choiceIds":["..."],"query":"optional search query","reason":"short reason"}.',
    "Rules:",
    "- Use action navigate to drill into category choiceIds from the current frontier.",
    "- Use action retrieve to pull content from one or more category or entry choiceIds in the current frontier.",
    "- Retrieving a category choice pulls ALL descendant entries under that branch, then Lore Recall narrows to the best matching entries.",
    "- Use action search to narrow the current scope with a short search query.",
    "- Use action finish only when the current scope already contains enough relevant context to resolve entries without another retrieval choice.",
    "- Prefer specific nodes over root-wide branches, but retrieve multiple sibling/supporting nodes when the scene clearly involves multiple people, factions, locations, or rules.",
    `- Stay within ${config.traversalStepLimit} total steps and retrieve 1-5 useful nodes maximum.`,
    "",
    `Original query: ${queryText}`,
    `Traversal step: ${step + 1} of ${config.traversalStepLimit}`,
    `Current scope: ${frontier.scopeLabel || "All selected books"}`,
    "",
    "Category choices:",
    ...(frontier.categories.length
      ? frontier.categories.map((category) =>
          `- choiceId=${category.choiceId}; label=${category.label}; depth=${category.depth}; childCategories=${category.childCount}; descendantEntries=${category.entryCount}; summary=${category.summary || "No summary."}`,
        )
      : ["- none"]),
    "",
    "Direct entry choices:",
    ...(frontier.entries.length
      ? frontier.entries.map((entry) =>
          `- choiceId=${makeEntryChoiceId(entry.entry.entryId)}; label=${entry.entry.label}; book=${entry.entry.worldBookName}; breadcrumb=${entry.entry.worldBookName} :: ${entry.entry.label}; summary=${truncateText(
            entry.entry.summary || getEntryBody(entry.entry),
            180,
          )}`,
        )
      : ["- none"]),
  ].join("\n");
}

async function selectTraversalEntries(
  queryText: string,
  books: RuntimeBook[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
) : Promise<TraversalSelectionResult> {
  const deterministic = scoreEntries(queryText, books);
  const trace: TraversalTraceStep[] = [];
  if (!deterministic.length) {
    pushTrace(trace, "fallback", "No traversal candidates", "Traversal found no scored entries, so nothing was injected.");
    return {
      selected: [],
      retrievedScopes: [],
      fallbackReason: "Traversal found no scored entries, so nothing was injected.",
      steps: ["No traversal candidates scored above zero."],
      trace,
    };
  }

  if (!allowController) {
    pushTrace(
      trace,
      "fallback",
      "Traversal controller skipped",
      "Fast preview mode skipped traversal controller selection and used deterministic fallback results.",
      { entryCount: Math.min(config.maxResults, deterministic.length) },
    );
    return {
      selected: deterministic.slice(0, config.maxResults),
      retrievedScopes: [],
      fallbackReason: "Fast preview skipped traversal controller selection and used deterministic fallback results.",
      steps: ["Fast preview mode skipped controller-driven traversal."],
      trace,
    };
  }

  const deterministicById = new Map(deterministic.map((item) => [item.entry.entryId, item]));
  const booksById = new Map(books.map((book) => [book.summary.id, book]));
  let scopes: TraversalScope[] = books.map((book) => ({ book, nodeId: book.tree.rootId }));
  let overrideEntries: ScoredEntry[] | null = null;
  const steps = [
    `${books.length} book(s) considered for traversal.`,
    `${deterministic.length} scored entry candidate(s) available for traversal.`,
  ];

  for (let step = 0; step < config.traversalStepLimit; step += 1) {
    const frontier = buildTraversalFrontier(scopes, deterministicById, config, overrideEntries);
    if (!frontier.categories.length && !frontier.entries.length) {
      pushTrace(trace, "fallback", "Empty frontier", "Traversal reached an empty frontier, so collapsed retrieval was used.");
      return {
        selected: deterministic.slice(0, config.maxResults),
        retrievedScopes: [],
        fallbackReason: "Traversal reached an empty frontier, so collapsed retrieval was used instead.",
        steps: [...steps, "Collapsed fallback used because traversal had no frontier choices."],
        trace,
      };
    }

    const response = await runControllerJson(buildTraversalPrompt(queryText, frontier, step, config), controller);
    if (!response.parsed) {
      const fallbackReason = response.error ?? "Traversal controller returned no usable response.";
      pushTrace(trace, "fallback", "Controller failed", fallbackReason);
      return {
        selected: deterministic.slice(0, config.maxResults),
        retrievedScopes: [],
        fallbackReason: `${fallbackReason} Collapsed retrieval was used instead.`,
        steps: [...steps, "Collapsed fallback used because traversal controller output was invalid."],
        trace,
      };
    }

    const action = typeof response.parsed.action === "string" ? response.parsed.action.trim().toLowerCase() : "";
    const choiceIds = Array.isArray(response.parsed.choiceIds)
      ? response.parsed.choiceIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const reason =
      typeof response.parsed.reason === "string" && response.parsed.reason.trim()
        ? response.parsed.reason.trim()
        : "No controller reason provided.";

    if (action === "navigate") {
      const nextScopes = choiceIds
        .map(parseCategoryChoiceId)
        .filter((value): value is { bookId: string; nodeId: string } => !!value)
        .map((value) => ({ book: booksById.get(value.bookId) ?? null, nodeId: value.nodeId }))
        .filter((value): value is TraversalScope => !!value.book && !!value.book.tree.nodes[value.nodeId]);

      if (!nextScopes.length) {
        pushTrace(trace, "fallback", "Invalid navigate", "Controller picked no valid traversal branches.");
        return {
          selected: deterministic.slice(0, config.maxResults),
          retrievedScopes: [],
          fallbackReason: "Traversal controller chose no valid branches, so collapsed retrieval was used instead.",
          steps: [...steps, "Collapsed fallback used because no valid traversal branch was selected."],
          trace,
        };
      }

      scopes = nextScopes;
      overrideEntries = null;
      pushTrace(
        trace,
        "navigate",
        "Navigate deeper",
        `${reason} Opened ${nextScopes.length} branch(es).`,
        {
          bookId: nextScopes[0]?.book.summary.id ?? null,
          nodeId: nextScopes[0]?.nodeId ?? null,
        },
      );
      continue;
    }

    if (action === "search") {
      const searchQuery =
        typeof response.parsed.query === "string" && response.parsed.query.trim()
          ? response.parsed.query.trim()
          : queryText;
      const scopeEntries = collectEntriesByIds(
        uniqueStrings(scopes.flatMap((scope) => getScopedEntryIds(scope.book, scope.nodeId, true))),
        deterministicById,
      );
      const rescored = rescoreEntries(searchQuery, scopeEntries, booksById).slice(0, Math.max(config.maxResults * 2, 10));
      if (!rescored.length) {
        pushTrace(trace, "fallback", "Search found nothing", `Search "${searchQuery}" found no scoped traversal matches.`);
        return {
          selected: deterministic.slice(0, config.maxResults),
          retrievedScopes: [],
          fallbackReason: `Traversal search "${searchQuery}" found no usable results, so collapsed retrieval was used instead.`,
          steps: [...steps, `Collapsed fallback used because traversal search "${searchQuery}" found nothing.`],
          trace,
        };
      }
      overrideEntries = rescored;
      pushTrace(
        trace,
        "search",
        `Search: ${searchQuery}`,
        `${reason} Search surfaced ${rescored.length} direct entry option(s).`,
        { entryCount: rescored.length },
      );
      continue;
    }

    if (action === "retrieve" || action === "finish") {
      let selectedCandidates: ScoredEntry[] = [];
      let retrievedScopes: TraversalScope[] = [];
      if (action === "finish") {
        if (overrideEntries?.length) {
          selectedCandidates = overrideEntries.slice(0, Math.max(config.maxResults * 2, 10));
        } else {
          retrievedScopes = scopes;
          selectedCandidates = collectCandidatesForScopes(queryText, scopes, [], deterministicById);
        }
      } else {
        const directEntryIds: string[] = [];
        const selectedScopeMap = new Map<string, TraversalScope>();
        for (const choiceId of choiceIds) {
          const categoryChoice = parseCategoryChoiceId(choiceId);
          if (categoryChoice) {
            const book = booksById.get(categoryChoice.bookId);
            if (!book || !book.tree.nodes[categoryChoice.nodeId]) continue;
            selectedScopeMap.set(`${book.summary.id}:${categoryChoice.nodeId}`, { book, nodeId: categoryChoice.nodeId });
            continue;
          }
          const entryId = parseEntryChoiceId(choiceId);
          if (entryId) directEntryIds.push(entryId);
        }
        retrievedScopes = Array.from(selectedScopeMap.values());
        selectedCandidates = collectCandidatesForScopes(queryText, retrievedScopes, directEntryIds, deterministicById);
      }

      if (!selectedCandidates.length) {
        pushTrace(trace, "fallback", "Retrieve resolved nothing", "Traversal did not resolve any entries from the selected choices.");
        return {
          selected: deterministic.slice(0, config.maxResults),
          retrievedScopes: [],
          fallbackReason: "Traversal controller returned no usable entries, so collapsed retrieval was used instead.",
          steps: [...steps, "Collapsed fallback used because traversal did not resolve any entries."],
          trace,
        };
      }

      let finalSelected = config.selectiveRetrieval
        ? await maybeSelectEntries(queryText, selectedCandidates, config, controller, allowController)
        : selectedCandidates.slice(0, config.maxResults);

      if (finalSelected.length < Math.min(config.maxResults, 4)) {
        const before = finalSelected.length;
        finalSelected = backfillSupportingEntries(finalSelected, deterministic, config.maxResults);
        const added = finalSelected.length - before;
        if (added > 0) {
          pushTrace(
            trace,
            "retrieve",
            "Supplement supporting context",
            `Added ${added} supporting entr${added === 1 ? "y" : "ies"} from the global candidate pool to avoid an over-narrow retrieval.`,
            { entryCount: finalSelected.length },
          );
        }
      }

      pushTrace(
        trace,
        action === "finish" ? "finish" : "retrieve",
        action === "finish" ? "Finish traversal" : "Retrieve entries",
        `${reason} Resolved ${finalSelected.length} entry candidate(s) from ${Math.max(retrievedScopes.length, 1)} retrieval scope(s).`,
        { entryCount: finalSelected.length },
      );

      return {
        selected: finalSelected,
        retrievedScopes,
        fallbackReason: null,
        steps: [...steps, `Traversal selected ${finalSelected.length} entry candidate(s).`],
        trace,
      };
    }

    pushTrace(trace, "fallback", "Unknown action", `Traversal controller returned unsupported action "${action || "empty"}".`);
    return {
      selected: deterministic.slice(0, config.maxResults),
      retrievedScopes: [],
      fallbackReason: "Traversal controller returned an unsupported action, so collapsed retrieval was used instead.",
      steps: [...steps, "Collapsed fallback used because traversal controller returned an unsupported action."],
      trace,
    };
  }

  pushTrace(trace, "fallback", "Step limit reached", `Traversal hit the ${config.traversalStepLimit}-step limit and fell back to collapsed retrieval.`);
  return {
    selected: deterministic.slice(0, config.maxResults),
    retrievedScopes: [],
    fallbackReason: `Traversal exhausted its ${config.traversalStepLimit}-step limit, so collapsed retrieval was used instead.`,
    steps: [...steps, "Collapsed fallback used because traversal exceeded the configured step limit."],
    trace,
  };
}

function buildPreviewNodes(selected: ScoredEntry[], booksById: Map<string, RuntimeBook>): PreviewNode[] {
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
    };
  });
}

function buildInjectionText(
  selected: ScoredEntry[],
  booksById: Map<string, RuntimeBook>,
  injectedEntryLimit: number,
  collapsedDepth: number,
): { text: string; included: ScoredEntry[]; estimatedTokens: number } | null {
  if (!selected.length) return null;

  const maxEntries = clampInt(injectedEntryLimit, 1, 32);
  const parts: string[] = [
    "[Lore Recall Retrieved Context]",
    "Use this retrieved reference only if it is relevant to the current reply. Do not mention Lore Recall or describe this block explicitly.",
  ];
  const included: ScoredEntry[] = [];

  for (const item of selected.slice(0, maxEntries)) {
    const book = booksById.get(item.entry.worldBookId);
    const path = book ? getEntryCategoryPath(book.tree, item.entry.entryId).slice(-collapsedDepth) : [];
    const pathLabels = path.map((node) => node.label);
    const branchSummary = path
      .map((node) => node.summary.trim())
      .filter(Boolean)
      .join(" | ");

    const section = [
      "",
      `${included.length + 1}. ${[...pathLabels, item.entry.label].join(" > ")}`,
      `Book: ${item.entry.worldBookName}`,
      item.entry.aliases.length ? `Aliases: ${item.entry.aliases.join(", ")}` : "",
      branchSummary ? `Branch summary: ${branchSummary}` : "",
      getEntryBody(item.entry),
    ]
      .filter(Boolean)
      .join("\n");
    parts.push(section);
    included.push(item);
  }

  const text = parts.join("\n").trim();
  if (!included.length || !text) return null;
  return {
    text,
    included,
    estimatedTokens: Math.ceil(text.length / 4),
  };
}

export async function buildRetrievalPreview(
  messages: ChatLikeMessage[],
  settings: GlobalLoreRecallSettings,
  config: CharacterRetrievalConfig,
  books: RuntimeBook[],
  userId: string,
  options: RetrievalPreviewOptions = {},
): Promise<RetrievalPreview | null> {
  const allowController = options.allowController !== false;
  const queryText = buildQueryText(messages, config.contextMessages);
  if (!queryText.trim()) return null;

  const readableBooks = books.filter((book) => isReadableBook(book.config));
  if (!readableBooks.length) return null;

  const controller: ControllerSession = {
    settings,
    userId,
    connectionId: resolveControllerConnectionId(settings, options.connectionId),
    controllerUsed: false,
    deadlineAt: Date.now() + CONTROLLER_TOTAL_BUDGET_MS,
    callCount: 0,
  };
  const chosenBooksResult = await maybeChooseBooks(queryText, readableBooks, config, controller, allowController);
  const chosenBooks = chosenBooksResult.books;
  const steps = [
    `${books.length} managed book(s) loaded.`,
    `${chosenBooks.length} readable book(s) selected for search.`,
  ];
  const trace: TraversalTraceStep[] = [...chosenBooksResult.trace];
  let retrievedScopes: TraversalScope[] = [];

  let selected: ScoredEntry[] = [];
  let fallbackReason: string | null = null;

  if (config.searchMode === "traversal") {
    const traversal = await selectTraversalEntries(queryText, chosenBooks, config, controller, allowController);
    selected = traversal.selected;
    retrievedScopes = traversal.retrievedScopes;
    fallbackReason = traversal.fallbackReason;
    steps.push(...traversal.steps);
    trace.push(...traversal.trace);
  } else {
    let collapsed = scoreEntries(queryText, chosenBooks);
    if (config.rerankEnabled && allowController) {
      collapsed = await maybeRerankEntries(queryText, collapsed, controller, allowController);
      steps.push("Collapsed retrieval reranked top candidates.");
    }
    selected = config.selectiveRetrieval
      ? await maybeSelectEntries(queryText, collapsed, config, controller, allowController)
      : collapsed.slice(0, config.maxResults);
    steps.push(`Collapsed retrieval selected ${selected.length} candidate(s).`);
    pushTrace(
      trace,
      "retrieve",
      "Collapsed retrieval",
      `Collapsed mode resolved ${selected.length} entry candidate(s).`,
      { entryCount: selected.length },
    );
  }

  const booksById = new Map(chosenBooks.map((book) => [book.summary.id, book]));
  const injection = buildInjectionText(selected, booksById, config.tokenBudget, config.collapsedDepth);
  const included = injection?.included ?? selected;
  const pulledNodes = buildPreviewNodes(selected, booksById);
  const injectedNodes = buildPreviewNodes(included, booksById);

  return {
    mode: config.searchMode,
    queryText,
    estimatedTokens: injection?.estimatedTokens ?? 0,
    injectedText: injection?.text ?? "",
    retrievedScopes: buildPreviewScopes(retrievedScopes),
    pulledNodes,
    injectedNodes,
    selectedNodes: injectedNodes,
    fallbackReason,
    selectedBookIds: chosenBooks.map((book) => book.summary.id),
    steps,
    trace,
    capturedAt: options.capturedAt ?? Date.now(),
    isActual: options.isActual === true,
    controllerUsed: controller.controllerUsed,
    resolvedConnectionId: controller.controllerUsed ? controller.connectionId : null,
  };
}
