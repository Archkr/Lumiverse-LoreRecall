declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import { clampInt, getEntryCategoryPath, getNodeDepth, truncateText, uniqueStrings } from "../shared";
import type {
  BookTreeIndex,
  CharacterRetrievalConfig,
  GlobalLoreRecallSettings,
  PreviewNode,
  PreviewScope,
  PreviewScopeManifest,
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
  relevance: number;
  matchHints: string[];
}

interface TraversalFrontier {
  scopeLabel: string;
  categories: TraversalCategoryChoice[];
  fullTreeOverview: string;
}

interface ScopedManifest {
  scope: TraversalScope;
  candidates: ScoredEntry[];
}

interface EntrySelectionResult {
  selected: ScoredEntry[];
  candidates: ScoredEntry[];
  manifests: ScopedManifest[];
  fallbackPath: string[];
}

const CONTROLLER_TIMEOUT_MS = 45_000;
const CONTROLLER_TOTAL_BUDGET_MS = 175_000;
const CONTROLLER_MAX_CALLS = 12;
const TRAVERSAL_CATEGORY_LIMIT = 24;
const TRAVERSAL_FULL_OVERVIEW_LIMIT = 10_000;
const RECENT_MESSAGE_LIMIT = 500;
const MAX_SCOPE_CHOICES = 5;

const RETRIEVAL_SCOPE_SYSTEM_PROMPT =
  "You are a retrieval assistant. Choose only category node IDs from the provided knowledge tree. Return only the requested JSON with no commentary or markdown.";
const RETRIEVAL_MANIFEST_SYSTEM_PROMPT =
  "You are a retrieval assistant. Choose only entry IDs from the provided scoped manifests. Return only the requested JSON with no commentary or markdown.";

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
    .map((message) => {
      const role = message.role === "user" ? "User" : "Assistant";
      return `${role}: ${truncateText(stripSearchMarkup(message.content), RECENT_MESSAGE_LIMIT)}`;
    })
    .join("\n");
}

function buildCompactSceneSummary(queryText: string): string {
  const lines = queryText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3);

  if (!lines.length) return "";

  const latestUser = [...lines]
    .reverse()
    .find((line) => /^user:/i.test(line))
    ?.replace(/^user:\s*/i, "");
  const latestAssistant = [...lines]
    .reverse()
    .find((line) => /^assistant:/i.test(line))
    ?.replace(/^assistant:\s*/i, "");

  const parts = [
    latestUser ? `Latest user move: ${truncateText(latestUser, 320)}` : "",
    latestAssistant ? `Latest scene context: ${truncateText(latestAssistant, 320)}` : "",
  ].filter(Boolean);

  return parts.map((line) => `- ${line}`).join("\n");
}

function buildPromptFocusTerms(queryText: string, scored: ScoredEntry[] = []): string[] {
  const importantLabels = uniqueStrings(
    scored
      .filter((item) => item.score >= 18)
      .slice(0, 6)
      .map((item) => item.entry.label),
  );

  const genericStarts = new Set([
    "The",
    "A",
    "An",
    "And",
    "But",
    "Or",
    "If",
    "When",
    "What",
    "Why",
    "How",
    "Not",
    "This",
    "That",
    "There",
    "Then",
    "Working",
    "Good",
    "Because",
    "Latest",
  ]);

  const weighted = new Map<string, number>();
  const pushTerm = (value: string, weight: number) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 2) return;
    if (genericStarts.has(trimmed)) return;
    const key = trimmed.toLowerCase();
    weighted.set(trimmed, Math.max(weighted.get(trimmed) ?? 0, weight));
  };

  for (const label of importantLabels) pushTerm(label, 100);

  const acronymPattern = /\b[A-Z]{2,}(?:-[A-Z]{2,})?\b/g;
  for (const match of queryText.matchAll(acronymPattern)) {
    if (!match[0]) continue;
    pushTerm(match[0], 80 - match.index! / 2000);
  }

  const namePattern = /\b[A-Z][A-Za-z0-9'_-]+(?:\s+[A-Z][A-Za-z0-9'_-]+){0,2}\b/g;
  for (const match of queryText.matchAll(namePattern)) {
    const value = match[0]?.trim();
    if (!value || genericStarts.has(value)) continue;
    const looksLikeName = value.includes(" ") || /[A-Z].*[A-Z]/.test(value) || value.endsWith("-sensei");
    if (!looksLikeName) continue;
    pushTerm(value, 60 - match.index! / 3000);
  }

  const cuePattern = /\b(spacequake|angel|spirit|fraxinus|ratatoskr|dem|ast|wizard|realizer|territory|seal(?:ing)?|neighboring world|tengu city)\b/gi;
  for (const match of queryText.matchAll(cuePattern)) {
    if (!match[0]) continue;
    pushTerm(match[0], 40 - match.index! / 4000);
  }

  return Array.from(weighted.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([value]) => value);
}

function buildPromptContext(queryText: string, scored: ScoredEntry[] = []): string {
  if (!queryText.trim()) return "";
  return `RECENT CONVERSATION:\n${queryText}`;
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
  systemPrompt?: string,
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
        messages: [
          ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
          { role: "user", content: prompt },
        ],
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
    buildPromptContext(queryText),
    "",
    "Books:",
    ...books.map((book) =>
      `- id=${book.summary.id}; name=${book.summary.name}; description=${truncateText(
        book.config.description || book.tree.nodes[book.tree.rootId]?.summary || book.summary.description,
        140,
      )}; categories=${Math.max(0, Object.keys(book.tree.nodes).length - 1)}; entries=${book.cache.entries.length}`,
    ),
  ].join("\n");

  const { parsed } = await runControllerJson(prompt, controller, RETRIEVAL_MANIFEST_SYSTEM_PROMPT);
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
    buildPromptContext(queryText, scored),
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
  scopes: TraversalScope[] = [],
): Promise<ScoredEntry[]> {
  if (!allowController || !config.selectiveRetrieval || !candidates.length) return candidates.slice(0, config.maxResults);

  const scopedManifests = buildScopedManifests(candidates, scopes, 8);
  const buildScopedFallbackSelection = (): ScoredEntry[] => {
    if (!scopedManifests.length) {
      return candidates.slice(0, Math.min(candidates.length, Math.min(config.maxResults, 4)));
    }
    if (scopedManifests.length === 1) {
      return scopedManifests[0].candidates.slice(
        0,
        Math.min(scopedManifests[0].candidates.length, Math.min(config.maxResults, 4)),
      );
    }
    return scopedManifests
      .map((item) => item.candidates[0])
      .filter((item): item is ScoredEntry => !!item)
      .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label))
      .slice(0, config.maxResults);
  };

  const prompt = [
    "Select the exact lore entries that should be injected.",
    'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
    `Choose up to ${config.maxResults} entryIds, but only include entries that materially help the next reply.`,
    "It is fine to return far fewer than the limit.",
    "Prefer the smallest useful set.",
    "Prefer a balanced set across characters, factions, places, rules, incidents, or powers when those angles genuinely matter.",
    "When a person, faction, place, creature, or item is central, include adjacent support entries only if they explain abilities, threat profile, relationships, command response, or operational context.",
    "Good support examples include powers, organizations, bases/vehicles, threat frameworks, species/world rules, or incident context when those help explain reactions.",
    "Treat each retrieved scope separately.",
    "It is okay to choose zero or one entry from a scope if the rest are only loosely related siblings.",
    "Do not select extra entries from a broad leaf category just because they share the same branch.",
    "Do not pad the list with generic sibling characters or branch-adjacent trivia just because they are available.",
    "",
    buildPromptContext(queryText, candidates),
    "",
    ...(scopedManifests.length
      ? [
          "Entry manifest by retrieved scope:",
          ...scopedManifests.flatMap((item) => {
            const node = item.scope.book.tree.nodes[item.scope.nodeId];
            const scopeHeader = `Scope: ${getScopeBreadcrumb(item.scope.book, item.scope.nodeId)} (${node?.label || item.scope.book.summary.name})`;
            return [
              scopeHeader,
              ...item.candidates.map(
                (entry) =>
                  `- entryId=${entry.entry.entryId}; label=${entry.entry.label}; score=${entry.score.toFixed(2)}; summary=${truncateText(
                    entry.entry.summary,
                    140,
                  )}; preview=${truncateText(getEntryBody(entry.entry), 180)}`,
              ),
              "",
            ];
          }),
        ]
      : [
          "Entry manifest:",
          ...candidates.slice(0, Math.min(Math.max(config.maxResults * 2, 12), 24)).map((item) =>
            `- entryId=${item.entry.entryId}; label=${item.entry.label}; score=${item.score.toFixed(2)}; book=${item.entry.worldBookName}; summary=${truncateText(
              item.entry.summary,
              140,
            )}; preview=${truncateText(getEntryBody(item.entry), 180)}`,
          ),
        ]),
  ].join("\n");

  const { parsed } = await runControllerJson(prompt, controller);
  const ids = Array.isArray(parsed?.entryIds)
    ? parsed.entryIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!ids.length) return buildScopedFallbackSelection();

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
  if (!chosen.length) return buildScopedFallbackSelection();
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

function buildPreviewScopes(
  scopes: TraversalScope[],
  manifestCounts: Map<string, number> = new Map(),
  selectionReasons: Map<string, string> = new Map(),
): PreviewScope[] {
  const seen = new Set<string>();
  const previews: PreviewScope[] = [];
  for (const scope of scopes) {
    const key = `${scope.book.summary.id}:${scope.nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = scope.book.tree.nodes[scope.nodeId];
    if (!node) continue;
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
      selectionReason: selectionReasons.get(key),
    });
  }
  return previews;
}

function buildPreviewScopeManifests(manifests: ScopedManifest[]): PreviewScopeManifest[] {
  return manifests.map((item) => ({
    nodeId: item.scope.nodeId,
    label:
      item.scope.nodeId === item.scope.book.tree.rootId
        ? item.scope.book.summary.name
        : item.scope.book.tree.nodes[item.scope.nodeId]?.label || item.scope.book.summary.name,
    worldBookId: item.scope.book.summary.id,
    worldBookName: item.scope.book.summary.name,
    breadcrumb: getScopeBreadcrumb(item.scope.book, item.scope.nodeId),
    manifestEntryCount: item.candidates.length,
    selectedEntryIds: [],
  }));
}

function buildScopedManifests(
  candidates: ScoredEntry[],
  scopes: TraversalScope[],
  maxPerScope = 8,
): ScopedManifest[] {
  const candidatesById = new Map(candidates.map((item) => [item.entry.entryId, item]));
  return scopes
    .map((scope) => {
      const scopeCandidates = getScopedEntryIds(scope.book, scope.nodeId, true)
        .map((entryId) => candidatesById.get(entryId))
        .filter((item): item is ScoredEntry => !!item)
        .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label))
        .slice(0, maxPerScope);
      if (!scopeCandidates.length) return null;
      return {
        scope,
        candidates: scopeCandidates,
      };
    })
    .filter((item): item is ScopedManifest => !!item);
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

function makeScopeKey(scope: TraversalScope): string {
  return `${scope.book.summary.id}:${scope.nodeId}`;
}

function isNodeAncestor(tree: BookTreeIndex, ancestorId: string, nodeId: string): boolean {
  if (ancestorId === nodeId) return true;
  const visited = new Set<string>();
  let cursor = tree.nodes[nodeId];
  while (cursor?.parentId && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (cursor.parentId === ancestorId) return true;
    cursor = tree.nodes[cursor.parentId];
  }
  return false;
}

function collectChildScopeChoices(
  scopes: TraversalScope[],
  deterministicById: Map<string, ScoredEntry>,
  config: CharacterRetrievalConfig,
): TraversalCategoryChoice[] {
  const categories: TraversalCategoryChoice[] = [];
  const seen = new Set<string>();

  for (const scope of scopes) {
    const node = scope.book.tree.nodes[scope.nodeId];
    if (!node || getNodeDepth(scope.book.tree, scope.nodeId) >= config.maxTraversalDepth) continue;

    for (const childId of node.childIds) {
      const child = scope.book.tree.nodes[childId];
      if (!child) continue;
      const choiceId = makeCategoryChoiceId(scope.book.summary.id, child.id);
      if (seen.has(choiceId)) continue;
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
        matchHints: [],
      });
    }
  }

  return categories;
}

function collectRecursiveScopeChoices(
  scopes: TraversalScope[],
  deterministicById: Map<string, ScoredEntry>,
): TraversalCategoryChoice[] {
  const categories: TraversalCategoryChoice[] = [];
  const seen = new Set<string>();

  const pushNode = (book: RuntimeBook, nodeId: string, depth: number): void => {
    const node = book.tree.nodes[nodeId];
    if (!node) return;
    const choiceId = makeCategoryChoiceId(book.summary.id, node.id);
    if (!seen.has(choiceId)) {
      seen.add(choiceId);
      const matchMeta = describeScopeMatches(book, node.id, deterministicById);
      categories.push({
        choiceId,
        book,
        nodeId: node.id,
        label: `${book.summary.name} :: ${getScopeBreadcrumb(book, node.id)}`,
        summary: truncateText(node.summary || "", 160),
        depth,
        childCount: node.childIds.length,
        entryCount: getScopedEntryIds(book, node.id, true).length,
        relevance: matchMeta.relevance,
        matchHints: [],
      });
    }
    for (const childId of node.childIds) {
      pushNode(book, childId, depth + 1);
    }
  };

  for (const scope of scopes) {
    const node = scope.book.tree.nodes[scope.nodeId];
    if (!node) continue;
    if (scope.nodeId === scope.book.tree.rootId) {
      for (const childId of node.childIds) {
        pushNode(scope.book, childId, 0);
      }
      continue;
    }
    pushNode(scope.book, scope.nodeId, 0);
  }

  return categories;
}

function sortScopeChoices(choices: TraversalCategoryChoice[]): TraversalCategoryChoice[] {
  return choices
    .slice()
    .sort(
      (left, right) =>
        right.relevance - left.relevance ||
        right.depth - left.depth ||
        left.entryCount - right.entryCount ||
        left.label.localeCompare(right.label),
    );
}

function resolveScopeChoices(
  nodeIds: string[],
  booksById: Map<string, RuntimeBook>,
): TraversalScope[] {
  const scopes = new Map<string, TraversalScope>();
  for (const nodeId of nodeIds) {
    const choice = parseCategoryChoiceId(nodeId);
    if (!choice) continue;
    const book = booksById.get(choice.bookId);
    if (!book || !book.tree.nodes[choice.nodeId]) continue;
    scopes.set(`${book.summary.id}:${choice.nodeId}`, { book, nodeId: choice.nodeId });
  }
  return Array.from(scopes.values());
}

function chooseDeterministicScopes(
  currentScopes: TraversalScope[],
  deterministicById: Map<string, ScoredEntry>,
  config: CharacterRetrievalConfig,
  recursive: boolean,
): TraversalScope[] {
  const choices = recursive
    ? collectRecursiveScopeChoices(currentScopes, deterministicById)
    : collectChildScopeChoices(currentScopes, deterministicById, config);
  const ranked = sortScopeChoices(choices).filter((choice) => choice.entryCount > 0);
  if (!ranked.length) return currentScopes;

  const selected: TraversalScope[] = [];
  for (const choice of ranked) {
    const scope = { book: choice.book, nodeId: choice.nodeId };
    const overlaps = selected.some(
      (existing) =>
        existing.book.summary.id === scope.book.summary.id &&
        (isNodeAncestor(scope.book.tree, existing.nodeId, scope.nodeId) ||
          isNodeAncestor(scope.book.tree, scope.nodeId, existing.nodeId)),
    );
    if (overlaps) continue;
    selected.push(scope);
    if (selected.length >= MAX_SCOPE_CHOICES) break;
  }

  return selected.length ? selected : currentScopes;
}

function buildInitialScopePrompt(queryText: string, treeOverview: string): string {
  return [
    'Return ONLY JSON in this exact shape: {"nodeIds":["node-id-1"],"reason":"brief explanation"}.',
    `Pick 1-${MAX_SCOPE_CHOICES} category nodeIds maximum.`,
    "Rules:",
    "- Prefer specific leaves over broad branches.",
    "- Pick only category nodeIds from the knowledge tree index.",
    "- Pick nodes whose content would be most useful for the next reply.",
    "- Do not choose entries directly. Exact entry selection happens later after node retrieval.",
    "- If nothing seems relevant, return an empty nodeIds array.",
    "",
    "KNOWLEDGE TREE INDEX:",
    treeOverview || "- none",
    "",
    buildPromptContext(queryText),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildChildScopePrompt(
  queryText: string,
  scopes: TraversalScope[],
  categories: TraversalCategoryChoice[],
  step: number,
  config: CharacterRetrievalConfig,
): string {
  return [
    'Return ONLY JSON in this exact shape: {"action":"refine|retrieve","nodeIds":["node-id-1"],"reason":"brief explanation"}.',
    `Traversal step ${step + 1} of ${config.traversalStepLimit}.`,
    "Rules:",
    `- Pick 1-${MAX_SCOPE_CHOICES} category nodeIds maximum from the choices below.`,
    "- Use action \"refine\" when child categories should be opened before retrieval.",
    "- Use action \"retrieve\" when the chosen nodeIds are already specific enough to resolve entries.",
    "- Prefer specific leaves over broad branches.",
    "- Do not choose entries directly. Exact entry selection happens later after node retrieval.",
    "- Keep the result small instead of padding it.",
    "",
    buildPromptContext(queryText),
    `Current scopes: ${scopes.map((scope) => `${scope.book.summary.name} :: ${getScopeBreadcrumb(scope.book, scope.nodeId)}`).join(" | ")}`,
    "",
    "CATEGORY CHOICES:",
    ...(categories.length
      ? categories.map(
          (category) =>
            `- nodeId=${category.choiceId}; label=${category.label}; depth=${category.depth}; childCategories=${category.childCount}; descendantEntries=${category.entryCount}; summary=${category.summary || "No summary."}`,
        )
      : ["- none"]),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTraceScopeSummary(scopes: TraversalScope[]): string {
  if (!scopes.length) return "No scopes selected.";
  return scopes.map((scope) => `${scope.book.summary.name} :: ${getScopeBreadcrumb(scope.book, scope.nodeId)}`).join(" | ");
}

function buildFallbackReason(fallbackPath: string[]): string | null {
  return fallbackPath.length ? fallbackPath.join(" ") : null;
}

async function chooseCollapsedScopes(
  queryText: string,
  books: RuntimeBook[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
  deterministicById: Map<string, ScoredEntry>,
  trace: TraversalTraceStep[],
): Promise<{ scopes: TraversalScope[]; fallbackPath: string[]; selectionReason: string }> {
  const rootScopes = books.map((book) => ({ book, nodeId: book.tree.rootId }));
  const booksById = new Map(books.map((book) => [book.summary.id, book]));
  const fallbackPath: string[] = [];
  let scopes: TraversalScope[] = [];
  let selectionReason = "Controller selected retrieval scopes.";

  if (allowController) {
    const response = await runControllerJson(
      buildInitialScopePrompt(queryText, buildFullTraversalTreeOverview(rootScopes)),
      controller,
      RETRIEVAL_SCOPE_SYSTEM_PROMPT,
    );
    scopes = resolveScopeChoices(
      Array.isArray(response.parsed?.nodeIds)
        ? response.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      booksById,
    );
    const controllerReason =
      typeof response.parsed?.reason === "string" && response.parsed.reason.trim()
        ? response.parsed.reason.trim()
        : "Controller selected retrieval scopes.";
    if (scopes.length) {
      selectionReason = controllerReason;
    } else {
      fallbackPath.push(response.error ?? "Collapsed node selection returned no valid nodeIds; used deterministic node fallback.");
      scopes = chooseDeterministicScopes(rootScopes, deterministicById, config, true);
      selectionReason = fallbackPath[fallbackPath.length - 1];
    }
  } else {
    fallbackPath.push("Collapsed node selection skipped the controller and used deterministic scope fallback.");
    scopes = chooseDeterministicScopes(rootScopes, deterministicById, config, true);
    selectionReason = fallbackPath[fallbackPath.length - 1];
  }

  pushTrace(
    trace,
    "choose_scope",
    "Choose scopes",
    `${selectionReason} Selected ${scopes.length} scope(s): ${buildTraceScopeSummary(scopes)}.`,
    {
      bookId: scopes[0]?.book.summary.id ?? null,
      nodeId: scopes[0]?.nodeId ?? null,
      entryCount: scopes.reduce((total, scope) => total + getScopedEntryIds(scope.book, scope.nodeId, true).length, 0),
    },
  );

  if (shouldRefineRetrievedScopes(scopes, config)) {
    const categories = collectChildScopeChoices(scopes, deterministicById, config);
    if (categories.length) {
      let refinedScopes: TraversalScope[] = [];
      let refinedReason = "Refined broad scopes.";
      if (allowController) {
        const refinement = await runControllerJson(
          buildChildScopePrompt(queryText, scopes, categories, 1, config),
          controller,
          RETRIEVAL_SCOPE_SYSTEM_PROMPT,
        );
        refinedScopes = resolveScopeChoices(
          Array.isArray(refinement.parsed?.nodeIds)
            ? refinement.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : [],
          booksById,
        );
        refinedReason =
          typeof refinement.parsed?.reason === "string" && refinement.parsed.reason.trim()
            ? refinement.parsed.reason.trim()
            : "Refined broad scopes.";
        if (!refinedScopes.length) {
          fallbackPath.push(refinement.error ?? "Collapsed scope refinement returned no valid child nodes; used deterministic narrowing.");
          refinedScopes = chooseDeterministicScopes(scopes, deterministicById, config, false);
          refinedReason = fallbackPath[fallbackPath.length - 1];
        }
      } else {
        fallbackPath.push("Collapsed scope refinement skipped the controller and used deterministic child scopes.");
        refinedScopes = chooseDeterministicScopes(scopes, deterministicById, config, false);
        refinedReason = fallbackPath[fallbackPath.length - 1];
      }

      if (refinedScopes.length) {
        scopes = refinedScopes;
        selectionReason = refinedReason;
        pushTrace(
          trace,
          "refine_scope",
          "Refine scopes",
          `${refinedReason} Narrowed retrieval to ${scopes.length} scope(s): ${buildTraceScopeSummary(scopes)}.`,
          {
            bookId: scopes[0]?.book.summary.id ?? null,
            nodeId: scopes[0]?.nodeId ?? null,
            entryCount: scopes.reduce((total, scope) => total + getScopedEntryIds(scope.book, scope.nodeId, true).length, 0),
          },
        );
      }
    }
  }

  return { scopes, fallbackPath, selectionReason };
}

async function chooseTraversalScopes(
  queryText: string,
  books: RuntimeBook[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
  deterministicById: Map<string, ScoredEntry>,
  trace: TraversalTraceStep[],
): Promise<{ scopes: TraversalScope[]; fallbackPath: string[]; selectionReason: string }> {
  const rootScopes = books.map((book) => ({ book, nodeId: book.tree.rootId }));
  const booksById = new Map(books.map((book) => [book.summary.id, book]));
  const fallbackPath: string[] = [];
  let scopes: TraversalScope[] = [];
  let selectionReason = "Controller selected traversal scopes.";

  if (allowController) {
    const response = await runControllerJson(
      buildInitialScopePrompt(queryText, buildFullTraversalTreeOverview(rootScopes)),
      controller,
      RETRIEVAL_SCOPE_SYSTEM_PROMPT,
    );
    scopes = resolveScopeChoices(
      Array.isArray(response.parsed?.nodeIds)
        ? response.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
      booksById,
    );
    const controllerReason =
      typeof response.parsed?.reason === "string" && response.parsed.reason.trim()
        ? response.parsed.reason.trim()
        : "Controller selected traversal scopes.";
    if (scopes.length) {
      selectionReason = controllerReason;
    } else {
      fallbackPath.push(response.error ?? "Traversal scope selection returned no valid nodeIds; used deterministic node fallback.");
      scopes = chooseDeterministicScopes(rootScopes, deterministicById, config, true);
      selectionReason = fallbackPath[fallbackPath.length - 1];
    }
  } else {
    fallbackPath.push("Traversal scope selection skipped the controller and used deterministic scope fallback.");
    scopes = chooseDeterministicScopes(rootScopes, deterministicById, config, true);
    selectionReason = fallbackPath[fallbackPath.length - 1];
  }

  pushTrace(
    trace,
    "choose_scope",
    "Choose scopes",
    `${selectionReason} Selected ${scopes.length} scope(s): ${buildTraceScopeSummary(scopes)}.`,
    {
      bookId: scopes[0]?.book.summary.id ?? null,
      nodeId: scopes[0]?.nodeId ?? null,
      entryCount: scopes.reduce((total, scope) => total + getScopedEntryIds(scope.book, scope.nodeId, true).length, 0),
    },
  );

  for (let step = 1; step < config.traversalStepLimit; step += 1) {
    if (!shouldRefineRetrievedScopes(scopes, config)) break;
    const categories = collectChildScopeChoices(scopes, deterministicById, config);
    if (!categories.length) break;

    let nextScopes: TraversalScope[] = [];
    let nextReason = "Traversal scope refinement narrowed the current scopes.";
    let shouldContinue = false;

    if (allowController) {
      const response = await runControllerJson(
        buildChildScopePrompt(queryText, scopes, categories, step, config),
        controller,
        RETRIEVAL_SCOPE_SYSTEM_PROMPT,
      );
      nextScopes = resolveScopeChoices(
        Array.isArray(response.parsed?.nodeIds)
          ? response.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [],
        booksById,
      );
      nextReason =
        typeof response.parsed?.reason === "string" && response.parsed.reason.trim()
          ? response.parsed.reason.trim()
          : "Traversal scope refinement narrowed the current scopes.";
      const action = typeof response.parsed?.action === "string" ? response.parsed.action.trim().toLowerCase() : "retrieve";
      if (!nextScopes.length) {
        fallbackPath.push(response.error ?? "Traversal refinement returned no valid child nodes; used deterministic child-scope fallback.");
        nextScopes = chooseDeterministicScopes(scopes, deterministicById, config, false);
        nextReason = fallbackPath[fallbackPath.length - 1];
      }
      shouldContinue = action === "refine" && nextScopes.length > 0;
    } else {
      fallbackPath.push("Traversal refinement skipped the controller and used deterministic child scopes.");
      nextScopes = chooseDeterministicScopes(scopes, deterministicById, config, false);
      nextReason = fallbackPath[fallbackPath.length - 1];
      shouldContinue = false;
    }

    if (!nextScopes.length) break;
    scopes = nextScopes;
    selectionReason = nextReason;
    pushTrace(
      trace,
      "refine_scope",
      "Refine scopes",
      `${nextReason} Narrowed retrieval to ${scopes.length} scope(s): ${buildTraceScopeSummary(scopes)}.`,
      {
        bookId: scopes[0]?.book.summary.id ?? null,
        nodeId: scopes[0]?.nodeId ?? null,
        entryCount: scopes.reduce((total, scope) => total + getScopedEntryIds(scope.book, scope.nodeId, true).length, 0),
      },
    );

    if (!shouldContinue) break;
  }

  return { scopes, fallbackPath, selectionReason };
}

function populateScopeManifestSelections(
  scopeManifestCounts: PreviewScopeManifest[],
  selected: ScoredEntry[],
  scopes: TraversalScope[],
): PreviewScopeManifest[] {
  const previews = scopeManifestCounts.map((item) => ({ ...item, selectedEntryIds: [...item.selectedEntryIds] }));
  for (const item of selected) {
    for (const scope of scopes) {
      const scopeEntryIds = getScopedEntryIds(scope.book, scope.nodeId, true);
      if (!scopeEntryIds.includes(item.entry.entryId)) continue;
      const key = `${scope.book.summary.id}:${scope.nodeId}`;
      const preview = previews.find((candidate) => `${candidate.worldBookId}:${candidate.nodeId}` === key);
      if (!preview) continue;
      if (!preview.selectedEntryIds.includes(item.entry.entryId)) {
        preview.selectedEntryIds.push(item.entry.entryId);
      }
      break;
    }
  }
  return previews;
}

async function selectEntriesForScopes(
  queryText: string,
  scopes: TraversalScope[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
  deterministicById: Map<string, ScoredEntry>,
  trace: TraversalTraceStep[],
): Promise<EntrySelectionResult> {
  const candidates = collectCandidatesForScopes(queryText, scopes, [], deterministicById);
  const manifests = buildScopedManifests(candidates, scopes, 8);
  const fallbackPath: string[] = [];

  if (!candidates.length) {
    pushTrace(trace, "fallback", "No scoped entries", "The chosen scopes did not resolve any candidate entries.");
    return { selected: [], candidates, manifests, fallbackPath: ["Chosen scopes did not resolve any candidate entries."] };
  }

  let selected: ScoredEntry[];
  if (config.selectiveRetrieval) {
    const beforeCalls = controller.callCount;
    selected = await maybeSelectEntries(queryText, candidates, config, controller, allowController, scopes);
    if (controller.callCount === beforeCalls && !allowController) {
      fallbackPath.push("Selective manifest selection skipped the controller and used deterministic scoped fallback.");
    }
    pushTrace(
      trace,
      "manifest_select",
      "Select manifest entries",
      `Scoped manifests exposed ${candidates.length} candidate entries across ${Math.max(manifests.length, 1)} chosen scope(s), and ${selected.length} entry candidate(s) were kept for injection.`,
      { entryCount: selected.length },
    );
  } else {
    selected = candidates.slice(0, config.maxResults);
    pushTrace(
      trace,
      "retrieve",
      "Resolve scoped entries",
      `Selected ${selected.length} entry candidate(s) directly from ${Math.max(scopes.length, 1)} chosen scope(s).`,
      { entryCount: selected.length },
    );
  }

  return { selected, candidates, manifests, fallbackPath };
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

function describeScopeMatches(
  book: RuntimeBook,
  nodeId: string,
  deterministicById: Map<string, ScoredEntry>,
): { relevance: number; matchHints: string[] } {
  const matches = getScopedEntryIds(book, nodeId, true)
    .map((entryId) => deterministicById.get(entryId))
    .filter((item): item is ScoredEntry => !!item)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label))
    .slice(0, 3);

  return {
    relevance: matches.reduce((total, item, index) => total + item.score / (index + 1), 0),
    matchHints: matches.map((item) => item.entry.label),
  };
}

function buildFullTraversalTreeOverview(scopes: TraversalScope[]): string {
  const lines: string[] = [];
  const seenScopes = new Set<string>();
  const visitedNodes = new Set<string>();

  const pushNode = (book: RuntimeBook, nodeId: string, depth: number): void => {
    const visitKey = `${book.summary.id}:${nodeId}`;
    if (visitedNodes.has(visitKey)) return;
    visitedNodes.add(visitKey);

    const node = book.tree.nodes[nodeId];
    if (!node) return;

    const indent = "  ".repeat(depth);
    const type = node.childIds.length ? "branch" : "leaf";
    const labelPrefix = depth === 0 ? `${book.summary.name} :: ` : "";
    lines.push(
      `${indent}- nodeId=${makeCategoryChoiceId(book.summary.id, node.id)}; label=${labelPrefix}${node.label}; type=${type}; descendantEntries=${getScopedEntryIds(
        book,
        node.id,
        true,
      ).length}; summary=${truncateText(node.summary || "No summary.", 140)}`,
    );

    for (const childId of node.childIds) {
      pushNode(book, childId, depth + 1);
    }
  };

  for (const scope of scopes) {
    const scopeKey = `${scope.book.summary.id}:${scope.nodeId}`;
    if (seenScopes.has(scopeKey)) continue;
    seenScopes.add(scopeKey);

    const scopeNode = scope.book.tree.nodes[scope.nodeId];
    if (!scopeNode) continue;

    if (scope.nodeId === scope.book.tree.rootId) {
      lines.push(`Book: ${scope.book.summary.name}`);
      for (const childId of scopeNode.childIds) {
        pushNode(scope.book, childId, 0);
      }
      if (scope.book.tree.unassignedEntryIds.length) {
        lines.push(
          `- nodeId=${makeCategoryChoiceId(scope.book.summary.id, scope.book.tree.rootId)}; label=${scope.book.summary.name} :: Root / Unassigned; type=leaf; descendantEntries=${scope.book.tree.unassignedEntryIds.length}; summary=Root-level or unassigned entries.`,
        );
      }
      lines.push("");
      continue;
    }

    lines.push(`Scope: ${getScopeBreadcrumb(scope.book, scope.nodeId)} (${scope.book.summary.name})`);
    pushNode(scope.book, scope.nodeId, 0);
    lines.push("");
  }

  const text = lines.join("\n").trim();
  if (text.length <= TRAVERSAL_FULL_OVERVIEW_LIMIT) return text;
  return `${text.slice(0, TRAVERSAL_FULL_OVERVIEW_LIMIT - 28).trimEnd()}\n... (tree index truncated)`;
}

function buildTraversalFrontier(
  scopes: TraversalScope[],
  deterministicById: Map<string, ScoredEntry>,
  config: CharacterRetrievalConfig,
  overrideScoresById: Map<string, ScoredEntry> | null,
  step: number,
): TraversalFrontier {
  const categories: TraversalCategoryChoice[] = [];
  const seenCategories = new Set<string>();
  const showAllCurrentCategories =
    step === 0 && scopes.length > 0 && scopes.every((scope) => scope.nodeId === scope.book.tree.rootId);

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
        const matchMeta = describeScopeMatches(scope.book, child.id, overrideScoresById ?? deterministicById);
        categories.push({
          choiceId,
          book: scope.book,
          nodeId: child.id,
          label: `${scope.book.summary.name} :: ${child.label}`,
          summary: truncateText(child.summary, 160),
          depth: getNodeDepth(scope.book.tree, child.id),
          childCount: child.childIds.length,
          entryCount: getScopedEntryIds(scope.book, child.id, true).length,
          relevance: matchMeta.relevance,
          matchHints: matchMeta.matchHints,
        });
      }
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
    fullTreeOverview: showAllCurrentCategories ? buildFullTraversalTreeOverview(scopes) : "",
    categories: showAllCurrentCategories
      ? categories
      : categories
          .sort(
            (left, right) =>
              right.relevance - left.relevance || left.depth - right.depth || left.label.localeCompare(right.label),
          )
          .slice(0, TRAVERSAL_CATEGORY_LIMIT),
  };
}

function buildTraversalPrompt(
  queryText: string,
  frontier: TraversalFrontier,
  step: number,
  config: CharacterRetrievalConfig,
): string {
  const hasFullTreeOverview = frontier.fullTreeOverview.trim().length > 0;
  return [
    "You are a retrieval assistant for a hierarchical knowledge tree.",
    'Return ONLY JSON in this exact shape: {"action":"navigate|retrieve|search|finish","nodeIds":["node-id-1"],"query":"optional search query","reason":"brief explanation"}.',
    "Task:",
    "- Pick the most relevant node IDs from the tree to retrieve for the next response.",
    "Rules:",
    "- Pick 1-5 nodeIds maximum and prefer specific nodes over broad branches.",
    hasFullTreeOverview
      ? "- The full tree index below already includes categories from across the selected books. You may choose nodeIds from anywhere in that index."
      : "- Choose nodeIds only from the category list shown below.",
    "- Use action navigate when a shown category still needs to be opened before retrieval.",
    "- Use action retrieve when one or more shown nodes are specific enough to retrieve content from.",
    hasFullTreeOverview
      ? "- Use action search only if the needed concept is not clearly represented in the shown tree index."
      : "- Use action search only to narrow the current scope with a short keyword query.",
    "- Use action finish only when the current scope is already specific enough to resolve entries without choosing another node.",
    "- Do not pick entries directly. Exact entry selection happens later after node retrieval.",
    "- Pick nodes whose content would be most useful for the next response.",
    "- Consider world info, rules, places, systems, organizations, incidents, abilities, or factions when they matter to the scene, not just named people.",
    "- Do not stop at Characters if other categories better explain powers, organizations, command response, locations, vehicles, rules, or ongoing incidents.",
    "- If nothing seems relevant, keep the result small instead of padding it.",
    `- Stay within ${config.traversalStepLimit} total steps.`,
    "",
    buildPromptContext(queryText),
    `Traversal step: ${step + 1} of ${config.traversalStepLimit}`,
    `Current scope: ${frontier.scopeLabel || "All selected books"}`,
    "",
    hasFullTreeOverview ? "Full tree index:" : "Category choices:",
    ...(hasFullTreeOverview
      ? [frontier.fullTreeOverview]
      : frontier.categories.length
        ? frontier.categories.map((category) =>
            `- nodeId=${category.choiceId}; label=${category.label}; depth=${category.depth}; childCategories=${category.childCount}; descendantEntries=${category.entryCount}; summary=${category.summary || "No summary."}`,
          )
        : ["- none"]),
  ].join("\n");
}

function shouldRefineRetrievedScopes(scopes: TraversalScope[], config: CharacterRetrievalConfig): boolean {
  return scopes.some((scope) => {
    const node = scope.book.tree.nodes[scope.nodeId];
    if (!node) return false;
    const descendantCount = getScopedEntryIds(scope.book, scope.nodeId, true).length;
    return node.childIds.length > 0 ? descendantCount > 8 : descendantCount > 10;
  });
}

function buildScopeRefinementPrompt(
  queryText: string,
  frontier: TraversalFrontier,
  config: CharacterRetrievalConfig,
): string {
  return [
    "You already selected broad retrieval branches for a knowledge tree.",
    'Return ONLY JSON in this exact shape: {"nodeIds":["node-id-1"],"reason":"brief explanation"}.',
    `Choose 1-${Math.min(5, Math.max(2, config.maxResults))} more specific nodeIds from the current frontier.`,
    "Rules:",
    "- Prefer leaf categories over broad branches.",
    "- Pick the smallest set of specific nodes that still covers the people, factions, places, rules, incidents, and world state needed for the reply.",
    "- If a broad branch contains many unrelated descendants, narrow it before retrieval.",
    "- If the current set is only people-focused, add 1-2 specific support choices for powers, faction procedure, bases/vehicles, threat systems, or world mechanics when clearly relevant.",
    "- Do not pad the result. It is fine to keep this very small.",
    "",
    buildPromptContext(queryText),
    `Current broad scopes: ${frontier.scopeLabel || "Selected branches"}`,
    "",
    "Category choices:",
    ...(frontier.categories.length
      ? frontier.categories.map((category) =>
          `- nodeId=${category.choiceId}; label=${category.label}; depth=${category.depth}; childCategories=${category.childCount}; descendantEntries=${category.entryCount}; summary=${category.summary || "No summary."}`,
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
  let overrideScoresById: Map<string, ScoredEntry> | null = null;
  let activeSelectionQuery = queryText;
  const steps = [
    `${books.length} book(s) considered for traversal.`,
    `${deterministic.length} scored entry candidate(s) available for traversal.`,
  ];

  for (let step = 0; step < config.traversalStepLimit; step += 1) {
    const frontier = buildTraversalFrontier(scopes, deterministicById, config, overrideScoresById, step);
    if (!frontier.categories.length) {
      const autoSelected = collectCandidatesForScopes(activeSelectionQuery, scopes, [], deterministicById);
      if (!autoSelected.length) {
        pushTrace(trace, "fallback", "Empty frontier", "Traversal reached an empty frontier, so collapsed retrieval was used.");
        return {
          selected: deterministic.slice(0, config.maxResults),
          retrievedScopes: [],
          fallbackReason: "Traversal reached an empty frontier, so collapsed retrieval was used instead.",
          steps: [...steps, "Collapsed fallback used because traversal had no frontier choices."],
          trace,
        };
      }
      const finalAutoSelected = config.selectiveRetrieval
        ? await maybeSelectEntries(activeSelectionQuery, autoSelected, config, controller, allowController, scopes)
        : autoSelected.slice(0, config.maxResults);
      pushTrace(
        trace,
        "retrieve",
        "Retrieve current scope",
        `Current scope had no deeper categories, so Lore Recall resolved ${finalAutoSelected.length} entry candidate(s) from the current node scope.`,
        { entryCount: finalAutoSelected.length },
      );
      return {
        selected: finalAutoSelected,
        retrievedScopes: scopes,
        fallbackReason: null,
        steps: [...steps, `Traversal selected ${finalAutoSelected.length} entry candidate(s).`],
        trace,
      };
    }

    const response = await runControllerJson(buildTraversalPrompt(activeSelectionQuery, frontier, step, config), controller);
    if (!response.parsed) {
      pushTrace(trace, "fallback", "Empty frontier", "Traversal reached an empty frontier, so collapsed retrieval was used.");
      return {
        selected: deterministic.slice(0, config.maxResults),
        retrievedScopes: [],
        fallbackReason: "Traversal reached an empty frontier, so collapsed retrieval was used instead.",
        steps: [...steps, "Collapsed fallback used because traversal had no frontier choices."],
        trace,
      };
    }
    const fallbackReason = response.error ?? "Traversal controller returned no usable response.";
    if (!response.parsed) {
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
    const nodeIds = Array.isArray(response.parsed.nodeIds)
      ? response.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : Array.isArray(response.parsed.choiceIds)
        ? response.parsed.choiceIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const reason =
      typeof response.parsed.reason === "string" && response.parsed.reason.trim()
        ? response.parsed.reason.trim()
        : "No controller reason provided.";

    if (action === "navigate") {
      const nextScopes = nodeIds
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
          : activeSelectionQuery;
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
      overrideScoresById = new Map(rescored.map((item) => [item.entry.entryId, item]));
      activeSelectionQuery = searchQuery;
      pushTrace(
        trace,
        "search",
        `Search: ${searchQuery}`,
        `${reason} Search re-ranked the current scope using ${rescored.length} matching entry candidate(s).`,
        { entryCount: rescored.length },
      );
      continue;
    }

    if (action === "retrieve" || action === "finish") {
      let selectedCandidates: ScoredEntry[] = [];
      let retrievedScopes: TraversalScope[] = [];
      if (action === "finish") {
        retrievedScopes = scopes;
      } else {
        const selectedScopeMap = new Map<string, TraversalScope>();
        for (const nodeId of nodeIds) {
          const categoryChoice = parseCategoryChoiceId(nodeId);
          if (categoryChoice) {
            const book = booksById.get(categoryChoice.bookId);
            if (!book || !book.tree.nodes[categoryChoice.nodeId]) continue;
            selectedScopeMap.set(`${book.summary.id}:${categoryChoice.nodeId}`, { book, nodeId: categoryChoice.nodeId });
          }
        }
        retrievedScopes = selectedScopeMap.size ? Array.from(selectedScopeMap.values()) : scopes;
      }

      if (!selectedCandidates.length && retrievedScopes.length && shouldRefineRetrievedScopes(retrievedScopes, config)) {
        const refinementFrontier = buildTraversalFrontier(retrievedScopes, deterministicById, config, overrideScoresById, step + 1);
        const refinement = await runControllerJson(
          buildScopeRefinementPrompt(activeSelectionQuery, refinementFrontier, config),
          controller,
        );
        if (refinement.parsed) {
          const refinedNodeIds = Array.isArray(refinement.parsed.nodeIds)
            ? refinement.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : Array.isArray(refinement.parsed.choiceIds)
              ? refinement.parsed.choiceIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : [];
          const refinedReason =
            typeof refinement.parsed.reason === "string" && refinement.parsed.reason.trim()
              ? refinement.parsed.reason.trim()
              : "No controller reason provided.";
          const refinedScopeMap = new Map<string, TraversalScope>();
          for (const nodeId of refinedNodeIds) {
            const categoryChoice = parseCategoryChoiceId(nodeId);
            if (categoryChoice) {
              const book = booksById.get(categoryChoice.bookId);
              if (!book || !book.tree.nodes[categoryChoice.nodeId]) continue;
              refinedScopeMap.set(`${book.summary.id}:${categoryChoice.nodeId}`, { book, nodeId: categoryChoice.nodeId });
            }
          }
          if (refinedScopeMap.size) {
            retrievedScopes = Array.from(refinedScopeMap.values());
            pushTrace(
              trace,
              "navigate",
              "Refine retrieved branches",
              `${refinedReason} Narrowed broad retrieval branches into ${retrievedScopes.length} more specific node choice(s).`,
              {
                bookId: retrievedScopes[0]?.book.summary.id ?? null,
                nodeId: retrievedScopes[0]?.nodeId ?? null,
              },
            );
          }
        }
      }

      if (!selectedCandidates.length) {
        selectedCandidates = collectCandidatesForScopes(activeSelectionQuery, retrievedScopes, [], deterministicById);
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
        ? await maybeSelectEntries(activeSelectionQuery, selectedCandidates, config, controller, allowController, retrievedScopes)
        : selectedCandidates.slice(0, config.maxResults);

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
  const booksById = new Map(chosenBooks.map((book) => [book.summary.id, book]));
  const trace: TraversalTraceStep[] = [...chosenBooksResult.trace];
  const deterministic = scoreEntries(queryText, chosenBooks);
  const deterministicById = new Map(deterministic.map((item) => [item.entry.entryId, item]));
  let selectedScopes: TraversalScope[] = [];
  let pulledCandidates: ScoredEntry[] = [];
  let selected: ScoredEntry[] = [];
  let manifests: ScopedManifest[] = [];
  let selectionReason = "";
  const fallbackPath: string[] = [];

  if (!deterministic.length) {
    fallbackPath.push("Deterministic scoring found no matching entries, so Lore Recall injected nothing.");
    pushTrace(trace, "fallback", "No scored entries", fallbackPath[0]);
  } else {
    const scopeSelection =
      config.searchMode === "traversal"
        ? await chooseTraversalScopes(queryText, chosenBooks, config, controller, allowController, deterministicById, trace)
        : await chooseCollapsedScopes(queryText, chosenBooks, config, controller, allowController, deterministicById, trace);
    selectedScopes = scopeSelection.scopes;
    selectionReason = scopeSelection.selectionReason;
    fallbackPath.push(...scopeSelection.fallbackPath);
    steps.push(`Node-first ${config.searchMode} retrieval selected ${selectedScopes.length} scope(s).`);

    const entrySelection = await selectEntriesForScopes(
      queryText,
      selectedScopes,
      config,
      controller,
      allowController,
      deterministicById,
      trace,
    );
    pulledCandidates = entrySelection.candidates;
    selected = entrySelection.selected;
    manifests = entrySelection.manifests;
    fallbackPath.push(...entrySelection.fallbackPath);
    steps.push(`Resolved ${pulledCandidates.length} pulled entry candidate(s) across ${Math.max(selectedScopes.length, 1)} scope(s).`);
    steps.push(`Kept ${selected.length} entry candidate(s) for injection.`);
  }

  const injection = buildInjectionText(selected, booksById, config.tokenBudget, config.collapsedDepth);
  const included = injection?.included ?? selected;
  const pulledNodes = buildPreviewNodes(pulledCandidates.length ? pulledCandidates : selected, booksById);
  const injectedNodes = buildPreviewNodes(included, booksById);
  const manifestSelectedEntries = buildPreviewNodes(selected, booksById);
  const manifestCounts = new Map<string, number>(
    manifests.map((item) => [makeScopeKey(item.scope), item.candidates.length]),
  );
  const selectionReasons = new Map<string, string>(
    selectedScopes.map((scope) => [makeScopeKey(scope), selectionReason]),
  );
  const scopeManifestCounts = populateScopeManifestSelections(
    buildPreviewScopeManifests(manifests),
    selected,
    selectedScopes,
  );

  if (injection?.included.length) {
    pushTrace(
      trace,
      "inject",
      "Inject entries",
      `Injected ${injection.included.length} entry reference(s) into the interceptor prompt.`,
      { entryCount: injection.included.length },
    );
  }

  const fallbackReason = buildFallbackReason(fallbackPath);

  return {
    mode: config.searchMode,
    queryText,
    recentConversation: queryText,
    estimatedTokens: injection?.estimatedTokens ?? 0,
    injectedText: injection?.text ?? "",
    selectedScopes: buildPreviewScopes(selectedScopes, manifestCounts, selectionReasons),
    retrievedScopes: buildPreviewScopes(selectedScopes, manifestCounts, selectionReasons),
    scopeManifestCounts,
    pulledNodes,
    injectedNodes,
    manifestSelectedEntries,
    selectedNodes: buildPreviewScopes(selectedScopes, manifestCounts, selectionReasons),
    fallbackReason,
    fallbackPath,
    selectedBookIds: chosenBooks.map((book) => book.summary.id),
    steps,
    trace,
    capturedAt: options.capturedAt ?? Date.now(),
    isActual: options.isActual === true,
    controllerUsed: controller.controllerUsed,
    resolvedConnectionId: controller.controllerUsed ? controller.connectionId : null,
  };
}
