declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import { clampInt, getEntryCategoryPath, getNodeDepth, truncateText, uniqueStrings } from "../shared";
import type {
  BookTreeIndex,
  CharacterRetrievalConfig,
  GlobalLoreRecallSettings,
  PreviewNode,
  RetrievalSearchEvent,
  PreviewScope,
  PreviewScopeManifest,
  RetrievalFeedItem,
  RetrievalFeedItemTone,
  RetrievalPreview,
  RetrievalProgressEvent,
  TraversalTraceStep,
} from "../types";
import type { ChatLikeMessage, RuntimeBook, ScoredEntry } from "./contracts";
import {
  resolveControllerConnectionId,
  runControllerJson as runSharedControllerJson,
} from "./controller-json";
import { isReadableBook } from "./storage";

interface RetrievalPreviewOptions {
  allowController?: boolean;
  connectionId?: string | null;
  capturedAt?: number;
  isActual?: boolean;
  reportProgress?: (event: RetrievalProgressEvent) => void;
  dynamicFeedback?: DynamicRetrievalFeedbackSnapshot;
}

interface ControllerSession {
  settings: GlobalLoreRecallSettings;
  userId: string;
  connectionId: string | null;
  controllerUsed: boolean;
  deadlineAt: number;
  callCount: number;
  reportProgress?: (event: RetrievalProgressEvent) => void;
}

interface ControllerResponse {
  parsed: Record<string, unknown> | null;
  error: string | null;
  durationMs: number | null;
}

interface TraversalScope {
  book: RuntimeBook;
  nodeId: string;
}

interface TraversalSelectionResult {
  scopes: TraversalScope[];
  selected: ScoredEntry[];
  candidates: ScoredEntry[];
  manifests: ScopedManifest[];
  retrievedScopes: TraversalScope[];
  fallbackReason: string | null;
  selectionReason: string | null;
  usedSearchFrontier: boolean;
  searchEvents: RetrievalSearchEvent[];
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
  mode: "tree" | "search";
  scopeLabel: string;
  categories: TraversalCategoryChoice[];
  searchResults: TraversalEntryChoice[];
  fullTreeOverview: string;
  searchQuery?: string;
  totalResults?: number;
}

interface TraversalEntryChoice {
  choiceId: string;
  entry: ScoredEntry;
  breadcrumb: string;
  summary: string;
  preview: string;
}

interface TraversalSearchFrontier {
  query: string;
  results: ScoredEntry[];
}

interface ScopedManifest {
  scope: TraversalScope;
  candidates: ScoredEntry[];
}

interface SceneSelectionSignals {
  normalizedConversation: string;
  latestExchange: string;
  activeText: string;
  backgroundText: string;
  constraintText: string;
}

export interface DynamicRetrievalFeedbackEntry {
  injections: number;
  references: number;
  missStreak: number;
  lastReferenced: number;
  recentInjectionCount: number;
}

export interface DynamicRetrievalFeedbackSnapshot {
  entries: Record<string, DynamicRetrievalFeedbackEntry>;
}

interface RetrievalTextSegments {
  fullText: string;
  latestUserText: string;
  latestAssistantText: string;
  activeText: string;
  backgroundText: string;
  constraintText: string;
}

interface RankedSelectionCandidate {
  candidate: ScoredEntry;
  selectionRole: NonNullable<PreviewNode["selectionRole"]>;
  priority: number;
  scopeBreadcrumb: string;
  latestMentionCount: number;
  overallMentionCount: number;
}

interface FeedItemOptions {
  timestamp?: number;
  phase?: RetrievalFeedItem["phase"];
  count?: number | null;
  scopes?: PreviewScope[];
  entries?: PreviewNode[];
  searchQuery?: string | null;
  searchGlobal?: boolean | null;
  details?: string[];
  tone?: RetrievalFeedItemTone;
  durationMs?: number | null;
}

interface EntrySelectionResult {
  scopes: TraversalScope[];
  selected: ScoredEntry[];
  candidates: ScoredEntry[];
  manifests: ScopedManifest[];
  fallbackPath: string[];
  selectionReason: string | null;
  usedSearchFrontier?: boolean;
  searchEvents?: RetrievalSearchEvent[];
}

type RetrievalProgressReporter = NonNullable<RetrievalPreviewOptions["reportProgress"]>;
const TRACE_REPORTER = Symbol("traceReporter");
type TraceCollection = TraversalTraceStep[] & { [TRACE_REPORTER]?: RetrievalProgressReporter };

const CONTROLLER_TIMEOUT_MS = 45_000;
const CONTROLLER_TOTAL_BUDGET_MS = 175_000;
const CONTROLLER_MAX_CALLS = 12;
const TRAVERSAL_CATEGORY_LIMIT = 24;
const TRAVERSAL_SEARCH_LIMIT = 18;
const TRAVERSAL_FULL_OVERVIEW_LIMIT = 10_000;
const RECENT_MESSAGE_LIMIT = 700;
const RECENT_SCENE_MESSAGE_LIMIT = 6000;
const SCENE_MESSAGE_LOOKBACK = 4;
const MAX_SCOPE_CHOICES = 5;
const DOCUMENT_CHOICE_PREFIX = "doc:";
const EMPTY_ENTRY_ID_SET = new Set<string>();
const DIRECT_MENTION_SEED_LIMIT = 12;
const SCENE_ANCHOR_LIMIT = 12;
const SELECTIVE_FALLBACK_LIMIT = 8;
const ACTIVE_ANCHOR_SCORE_THRESHOLD = 8;
const BACKGROUND_MENTION_SCORE_THRESHOLD = 10;
const SUPPORT_CONTEXT_SCORE_THRESHOLD = 14;
const RELATED_SUPPORT_SCORE_THRESHOLD = 10;
const RELATED_SUPPORT_LIMIT = 8;
const HIGH_CONFIDENCE_DYNAMIC_THRESHOLD = 12;
const FEEDBACK_HOT_MS = 2 * 60 * 60 * 1000;
const FEEDBACK_WARM_MS = 12 * 60 * 60 * 1000;
const FEEDBACK_STALE_INJECTION_THRESHOLD = 3;
const SEARCH_STOPWORDS = new Set([
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
  "your",
]);
const RETRIEVAL_SCOPE_SYSTEM_PROMPT =
  "You are a retrieval assistant. Choose only node IDs exactly as shown in the provided knowledge tree. Use raw node IDs or doc:<bookId> selectors when shown. Return only the requested JSON with no commentary or markdown.";
const RETRIEVAL_BOOK_SYSTEM_PROMPT =
  "You are a retrieval assistant. Choose only lore book IDs from the provided list. Return only the requested JSON with no commentary or markdown.";
const RETRIEVAL_MANIFEST_SYSTEM_PROMPT =
  "You are a retrieval assistant. Choose only entry IDs from the provided scoped manifests. Return only the requested JSON with no commentary or markdown.";
const RETRIEVAL_TRAVERSAL_SYSTEM_PROMPT =
  "You are a retrieval assistant. Choose only the shown action and choice IDs exactly as presented in the traversal frontier. Return only the requested JSON with no commentary or markdown.";

function createTraceBuffer(reporter?: RetrievalProgressReporter): TraceCollection {
  const trace = [] as TraceCollection;
  trace[TRACE_REPORTER] = reporter;
  return trace;
}

function getTraceReporter(trace: TraversalTraceStep[]): RetrievalProgressReporter | undefined {
  return (trace as TraceCollection)[TRACE_REPORTER];
}

function emitProgress(
  reporter: RetrievalProgressReporter | undefined,
  event: RetrievalProgressEvent,
): void {
  if (!reporter) return;
  try {
    reporter(event);
  } catch (error) {
    spindle.log.warn(`Lore Recall progress update failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createFeedItem(
  kind: RetrievalFeedItem["kind"],
  label: string,
  summary: string,
  options: FeedItemOptions = {},
): RetrievalFeedItem {
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
    durationMs: typeof options.durationMs === "number" ? options.durationMs : null,
  };
}

function emitTraceFeedItem(
  trace: TraversalTraceStep[],
  label: string,
  summary: string,
  options: FeedItemOptions = {},
): void {
  const reporter = getTraceReporter(trace);
  if (!reporter) return;
  emitProgress(reporter, {
    type: "item",
    item: createFeedItem("trace", label, summary, options),
  });
}

function pushTrace(
  trace: TraversalTraceStep[],
  phase: TraversalTraceStep["phase"],
  label: string,
  summary: string,
  extra: Partial<Omit<TraversalTraceStep, "step" | "phase" | "label" | "summary">> & FeedItemOptions = {},
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
  if (phase === "fallback") {
    emitTraceFeedItem(trace, label, summary, {
      phase,
      count: typeof extra.entryCount === "number" ? extra.entryCount : null,
      tone: "warn",
      durationMs: typeof extra.durationMs === "number" ? extra.durationMs : null,
    });
  }
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
        .filter((token) => token.length >= 2 && !SEARCH_STOPWORDS.has(token)),
    ),
  );
}

function buildQueryText(messages: ChatLikeMessage[], contextMessages: number): string {
  const recentMessages = messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .slice(-contextMessages);
  return recentMessages
    .map((message, index) => {
      const role = message.role === "user" ? "User" : "Assistant";
      const messageLimit =
        recentMessages.length - index <= SCENE_MESSAGE_LOOKBACK ? RECENT_SCENE_MESSAGE_LIMIT : RECENT_MESSAGE_LIMIT;
      const sanitized = sanitizeRetrievalMessage(message.role, message.content, messageLimit);
      return sanitized ? `${role}: ${sanitized}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function findNarrativeProtocolCutIndex(value: string): number {
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
    /^unreciprocated attraction\b/im,
  ];

  let cutIndex = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (!match || typeof match.index !== "number") continue;
    cutIndex = cutIndex === -1 ? match.index : Math.min(cutIndex, match.index);
  }
  return cutIndex;
}

function findUserProtocolCutIndex(value: string): number {
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
    /^unreciprocated attraction\b/im,
  ];

  let cutIndex = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (!match || typeof match.index !== "number") continue;
    cutIndex = cutIndex === -1 ? match.index : Math.min(cutIndex, match.index);
  }
  return cutIndex;
}

function sanitizeRetrievalMessage(role: ChatLikeMessage["role"], content: string, maxLength = RECENT_MESSAGE_LIMIT): string {
  let text = stripSearchMarkup(content).replace(/\r\n?/g, "\n");
  const cutIndex = role === "user" ? findUserProtocolCutIndex(text) : findNarrativeProtocolCutIndex(text);
  if (cutIndex >= 0) {
    text = text.slice(0, cutIndex);
  }

  return truncateText(text.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim(), maxLength);
}

function buildRecentConversation(messages: ChatLikeMessage[], contextMessages: number): string {
  const recentMessages = messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .slice(-contextMessages);
  return recentMessages
    .map((message, index) => {
      const role = message.role === "user" ? "User" : "Character";
      const messageLimit =
        recentMessages.length - index <= SCENE_MESSAGE_LOOKBACK ? RECENT_SCENE_MESSAGE_LIMIT : RECENT_MESSAGE_LIMIT;
      const sanitized = sanitizeRetrievalMessage(message.role, message.content, messageLimit);
      return sanitized ? `${role}: ${sanitized}` : "";
    })
    .filter(Boolean)
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
    .find((line) => /^(assistant|character):/i.test(line))
    ?.replace(/^(assistant|character):\s*/i, "");

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

  const cuePattern = /\b(ability|artifact|base|beast|city|domain|event|group|kingdom|location|organization|power|realm|rule|system|territory|threat|village|weapon|world)\b/gi;
  for (const match of queryText.matchAll(cuePattern)) {
    if (!match[0]) continue;
    pushTerm(match[0], 40 - match.index! / 4000);
  }

  return Array.from(weighted.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([value]) => value);
}

function buildPromptContext(recentConversation: string): string {
  if (!recentConversation.trim()) return "";
  return `RECENT CONVERSATION:\n${recentConversation}`;
}

function getTailText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(-maxLength).trim();
}

function isConstraintUserLine(text: string): boolean {
  const normalized = text.trim();
  return /^(?:note|timeline|context|setting|canon|continuity)\s*:/i.test(normalized) ||
    /\bstory\s+takes\s+place\b/i.test(normalized);
}

function buildRetrievalTextSegments(recentConversation: string): RetrievalTextSegments {
  const parsed = recentConversation
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(User|Assistant|Character):\s*(.*)$/i.exec(line);
      return {
        role: match?.[1]?.toLowerCase() ?? "",
        text: match?.[2]?.trim() ?? line,
        raw: line,
      };
    });

  const latestUserIndex = (() => {
    for (let index = parsed.length - 1; index >= 0; index -= 1) {
      if (parsed[index]?.role === "user" && !isConstraintUserLine(parsed[index].text)) return index;
    }
    return -1;
  })();
  const latestAssistantIndex = (() => {
    for (let index = parsed.length - 1; index >= 0; index -= 1) {
      const role = parsed[index]?.role;
      if (role === "assistant" || role === "character") return index;
    }
    return -1;
  })();

  const constraintLines = parsed
    .filter((item) => item.role === "user" && isConstraintUserLine(item.text))
    .map((item) => item.text);
  const latestUserText = latestUserIndex >= 0 ? parsed[latestUserIndex].text : "";
  const latestAssistantText = latestAssistantIndex >= 0 ? getTailText(parsed[latestAssistantIndex].text, 1400) : "";
  const activeIndexes = new Set([latestUserIndex, latestAssistantIndex].filter((index) => index >= 0));
  const backgroundText = parsed
    .filter((item, index) => !activeIndexes.has(index) && !(item.role === "user" && isConstraintUserLine(item.text)))
    .map((item) => item.text)
    .join(" ");

  const fallbackText = parsed.length ? parsed.map((item) => item.text).join(" ") : recentConversation;
  return {
    fullText: normalizeSearchText(fallbackText),
    latestUserText: normalizeSearchText(latestUserText),
    latestAssistantText: normalizeSearchText(latestAssistantText),
    activeText: normalizeSearchText([latestUserText, latestAssistantText].filter(Boolean).join(" ")),
    backgroundText: normalizeSearchText(backgroundText),
    constraintText: normalizeSearchText(constraintLines.join(" ")),
  };
}

function buildSceneSelectionSignals(recentConversation: string): SceneSelectionSignals {
  const segments = buildRetrievalTextSegments(recentConversation);
  return {
    normalizedConversation: segments.fullText,
    latestExchange: segments.activeText,
    activeText: segments.activeText,
    backgroundText: segments.backgroundText,
    constraintText: segments.constraintText,
  };
}

function countPhraseOccurrences(haystack: string, phrase: string): number {
  if (!haystack || !phrase) return 0;
  const normalizedHaystack = ` ${normalizeSearchText(haystack)} `;
  const normalizedPhrase = normalizeSearchText(phrase);
  if (!normalizedPhrase) return 0;
  let count = 0;
  let fromIndex = 0;
  const needle = ` ${normalizedPhrase} `;
  while (fromIndex < normalizedHaystack.length) {
    const matchIndex = normalizedHaystack.indexOf(needle, fromIndex);
    if (matchIndex === -1) break;
    count += 1;
    fromIndex = matchIndex + needle.length;
  }
  return count;
}

function normalizeVariantList(values: string[]): string[] {
  return uniqueStrings(values)
    .map((value) => normalizeSearchText(value))
    .filter((value) => value.length >= 3);
}

function buildEntryMentionPhrases(entry: RuntimeBook["cache"]["entries"][number]): string[] {
  return normalizeVariantList([entry.label, ...entry.aliases]);
}

function inferSelectionSignal(
  entry: RuntimeBook["cache"]["entries"][number],
  reasons: string[],
  signals: SceneSelectionSignals,
): {
  role: NonNullable<PreviewNode["selectionRole"]>;
  latestMentionCount: number;
  overallMentionCount: number;
} {
  const labelVariants = normalizeVariantList([entry.label]);
  const aliasVariants = normalizeVariantList(entry.aliases);
  const latestLabelMentions = labelVariants.reduce(
    (total, phrase) => total + Math.min(1, countPhraseOccurrences(signals.activeText, phrase)),
    0,
  );
  const latestAliasMentions = aliasVariants.reduce(
    (total, phrase) => total + Math.min(1, countPhraseOccurrences(signals.activeText, phrase)),
    0,
  );
  const overallLabelMentions = labelVariants.reduce(
    (total, phrase) => total + Math.min(1, countPhraseOccurrences(signals.normalizedConversation, phrase)),
    0,
  );
  const overallAliasMentions = aliasVariants.reduce(
    (total, phrase) => total + Math.min(1, countPhraseOccurrences(signals.normalizedConversation, phrase)),
    0,
  );
  const latestMentionCount = latestLabelMentions + latestAliasMentions;
  const overallMentionCount = overallLabelMentions + overallAliasMentions;

  if (latestMentionCount > 0) {
    return {
      role: "active_anchor",
      latestMentionCount,
      overallMentionCount: Math.max(overallMentionCount, latestMentionCount),
    };
  }
  if (overallMentionCount > 0) {
    return {
      role: "background_mention",
      latestMentionCount,
      overallMentionCount,
    };
  }
  if (reasons.some((reason) => reason === "label" || reason === "alias" || reason === "keyword")) {
    return { role: "support_context", latestMentionCount, overallMentionCount };
  }
  if (reasons.some((reason) => reason === "branch" || reason === "summary" || reason === "content" || reason === "comment" || reason === "tag")) {
    return { role: "support_context", latestMentionCount, overallMentionCount };
  }
  return { role: "score_fallback", latestMentionCount, overallMentionCount };
}

function rankSelectionCandidates(
  recentConversation: string,
  candidates: ScoredEntry[],
  scopes: TraversalScope[],
): RankedSelectionCandidate[] {
  const signals = buildSceneSelectionSignals(recentConversation);
  const roleWeight: Record<NonNullable<PreviewNode["selectionRole"]>, number> = {
    active_anchor: 700,
    background_mention: 420,
    support_context: 300,
    recent_mention: 640,
    context_mention: 540,
    label_match: 420,
    alias_match: 380,
    keyword_match: 320,
    branch_match: 260,
    content_match: 220,
    score_fallback: 120,
  };

  return candidates
    .map((candidate) => {
      const scope = scopes.find((item) =>
        getScopedEntryIds(item.book, item.nodeId, true).includes(candidate.entry.entryId),
      );
      const inferred = inferSelectionSignal(candidate.entry, candidate.reasons, signals);
      const selectionRole = candidate.selectionRole ?? inferred.role;
      let priority =
        roleWeight[selectionRole] +
        candidate.score * 10 +
        inferred.latestMentionCount * 45 +
        inferred.overallMentionCount * 20;
      if (selectionRole === "background_mention") priority -= 60;
      if (selectionRole === "support_context") priority -= 80;
      if (candidate.reasons.includes("label")) priority += 18;
      if (candidate.reasons.includes("alias")) priority += 12;
      if (candidate.reasons.includes("keyword")) priority += 8;
      if (candidate.reasons.includes("branch")) priority += 4;
      return {
        candidate: { ...candidate, selectionRole },
        selectionRole,
        priority,
        scopeBreadcrumb: scope ? getScopeBreadcrumb(scope.book, scope.nodeId) : "Unscoped",
        latestMentionCount: inferred.latestMentionCount,
        overallMentionCount: inferred.overallMentionCount,
      };
    })
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        right.candidate.score - left.candidate.score ||
        left.candidate.entry.label.localeCompare(right.candidate.entry.label),
    );
}

function buildDeterministicSelection(
  rankedCandidates: RankedSelectionCandidate[],
  maxResults: number,
): ScoredEntry[] {
  if (!rankedCandidates.length || maxResults <= 0) return [];
  const eligibleRankedCandidates = rankedCandidates.filter((item) => isDynamicInjectionEligible(item.candidate));
  const activeAnchors = eligibleRankedCandidates.filter(
    (item) => item.selectionRole === "active_anchor" || item.selectionRole === "recent_mention",
  );
  const supportContext = eligibleRankedCandidates
    .filter((item) => item.selectionRole !== "active_anchor" && item.selectionRole !== "recent_mention")
    .sort(
      (left, right) =>
        scoreDensity(right.candidate) - scoreDensity(left.candidate) ||
        right.priority - left.priority ||
        right.candidate.score - left.candidate.score ||
        left.candidate.entry.label.localeCompare(right.candidate.entry.label),
    );
  return [...activeAnchors, ...supportContext]
    .slice(0, maxResults)
    .map((item) => ({ ...item.candidate, selectionRole: item.selectionRole }));
}

function containsToken(normalizedText: string, token: string): boolean {
  return ` ${normalizedText} `.includes(` ${token} `);
}

function looksLikeNamedEntityLabel(label: string): boolean {
  const words = label.match(/[A-Za-z0-9']+/g) ?? [];
  const meaningfulWords = words.filter((word) => !SEARCH_STOPWORDS.has(word.toLowerCase()));
  if (!meaningfulWords.length || meaningfulWords.length > 4) return false;
  if (words.some((word) => SEARCH_STOPWORDS.has(word.toLowerCase()))) return false;
  return meaningfulWords.every((word) => /^[A-Z0-9]/.test(word));
}

function entryHasDirectMentionSignal(
  entry: RuntimeBook["cache"]["entries"][number],
  signals: SceneSelectionSignals,
): boolean {
  if (isCompositeEntryLabel(entry.label) && !hasStrongCompositeEvidence(entry, {
    fullText: signals.normalizedConversation,
    latestUserText: "",
    latestAssistantText: "",
    activeText: signals.activeText,
    backgroundText: signals.backgroundText,
    constraintText: signals.constraintText,
  })) {
    return false;
  }
  const exactPhraseMention = [entry.label, ...entry.aliases]
    .map((value) => normalizeSearchText(value))
    .filter((value) => value.length >= 3)
    .some((phrase) => countPhraseOccurrences(signals.activeText, phrase) > 0);
  if (exactPhraseMention) return true;

  const mentionTokens = uniqueStrings([entry.label, ...entry.aliases].flatMap(tokenize)).filter(
    (token) => token.length >= 3 && !SEARCH_STOPWORDS.has(token),
  );
  const matchingTokens = mentionTokens.filter((token) => containsToken(signals.activeText, token));
  if (!matchingTokens.length) return false;

  const rawLabel = entry.label.toLowerCase();
  if (rawLabel.includes("'s") || rawLabel.includes("&")) return false;

  const labelTokens = tokenize(entry.label).filter((token) => token.length >= 3 && !SEARCH_STOPWORDS.has(token));
  if (matchingTokens.length >= 2) return true;

  return looksLikeNamedEntityLabel(entry.label) && matchingTokens.some((token) => labelTokens.includes(token));
}

function buildDirectMentionCandidates(
  recentConversation: string,
  candidates: ScoredEntry[],
  scopes: TraversalScope[],
  limit = DIRECT_MENTION_SEED_LIMIT,
): ScoredEntry[] {
  if (!candidates.length || limit <= 0) return [];
  const signals = buildSceneSelectionSignals(recentConversation);
  return rankSelectionCandidates(recentConversation, candidates, scopes)
    .filter(
      (item) =>
        item.selectionRole === "active_anchor" ||
        entryHasDirectMentionSignal(item.candidate.entry, signals),
    )
    .slice(0, limit)
    .map((item) => ({
      ...item.candidate,
      reasons: uniqueStrings([...item.candidate.reasons, "mention"]),
      selectionRole: "active_anchor",
    }));
}

function getDynamicEntryLimit(config: CharacterRetrievalConfig, remainingDynamicSlots: number): number {
  if (remainingDynamicSlots <= 0) return 0;
  return clampInt(Math.min(config.maxResults, remainingDynamicSlots), 1, 32);
}

function collectReservedConstantEntries(books: RuntimeBook[]): ScoredEntry[] {
  const reserved: ScoredEntry[] = [];
  const seen = new Set<string>();

  for (const book of books) {
    for (const entry of book.cache.entries) {
      if (!entry.constant || entry.disabled || seen.has(entry.entryId)) continue;
      seen.add(entry.entryId);
      reserved.push({
        entry,
        score: 0,
        reasons: ["constant"],
        selectionRole: "score_fallback",
      });
    }
  }

  return reserved.sort(
    (left, right) =>
      left.entry.worldBookName.localeCompare(right.entry.worldBookName) ||
      left.entry.label.localeCompare(right.entry.label),
  );
}

function summarizeSelection(
  selection: ScoredEntry[],
  reservedConstantCount = 0,
  remainingDynamicSlots?: number,
): string {
  if (!selection.length) {
    if (reservedConstantCount > 0) {
      const free = typeof remainingDynamicSlots === "number" ? ` Dynamic injection cap was ${Math.max(0, remainingDynamicSlots)} entr${remainingDynamicSlots === 1 ? "y" : "ies"}.` : "";
      return `Prepared ${reservedConstantCount} constant entr${reservedConstantCount === 1 ? "y" : "ies"} and selected no dynamic entries.${free}`;
    }
    return "No entries selected.";
  }
  const mentionCount = selection.filter(
    (item) =>
      item.selectionRole === "active_anchor" ||
      item.selectionRole === "background_mention" ||
      item.selectionRole === "recent_mention" ||
      item.selectionRole === "context_mention",
  ).length;
  const reservedPrefix =
    reservedConstantCount > 0 ? `Prepared ${reservedConstantCount} constant entr${reservedConstantCount === 1 ? "y" : "ies"}; ` : "";
  const freeSuffix =
    typeof remainingDynamicSlots === "number" ? ` Dynamic injection cap: ${Math.max(0, remainingDynamicSlots)}.` : "";
  if (mentionCount > 0) {
    return `${reservedPrefix}final selection contains ${selection.length} dynamic entry candidate(s), led by active anchors and direct query mentions.${freeSuffix}`.replace(
      /^f/,
      (match) => match.toUpperCase(),
    );
  }
  return `${reservedPrefix}final selection contains ${selection.length} dynamic entry candidate(s) from final manifest selection.${freeSuffix}`.replace(
    /^f/,
    (match) => match.toUpperCase(),
  );
}

function getEntryBody(entry: RuntimeBook["cache"]["entries"][number]): string {
  const collapsed = entry.collapsedText.trim();
  const content = entry.content.trim();
  if (!collapsed) return content;
  if (!content) return collapsed;

  const normalizedCollapsed = normalizeSearchText(collapsed);
  const normalizedLabel = normalizeSearchText(entry.label);
  const collapsedTokens = tokenize(collapsed);
  const looksLikeLabelOnly =
    normalizedCollapsed === normalizedLabel ||
    (collapsedTokens.length <= 6 && normalizedLabel.length > 0 && normalizedCollapsed.includes(normalizedLabel)) ||
    collapsedTokens.length <= 4;

  return looksLikeLabelOnly ? content : collapsed;
}

function getEntryInjectionBody(entry: RuntimeBook["cache"]["entries"][number]): string {
  const content = entry.content.trim();
  return content || getEntryBody(entry);
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
  for (const token of new Set(queryTokens)) {
    if (targetSet.has(token)) count += 1;
  }
  return count;
}

function countPhraseBonus(queryText: string, value: string): boolean {
  if (!queryText || !value || value.length < 4) return false;
  return queryText.includes(value) || value.includes(queryText);
}

function countSegmentPhrase(segment: string, phrase: string): number {
  if (!segment || !phrase || phrase.length < 2) return 0;
  return countPhraseOccurrences(segment, phrase);
}

function scorePhraseVariants(
  values: string[],
  segments: RetrievalTextSegments,
  weights: { active: number; background: number; constraint: number },
): { score: number; active: number; background: number; constraint: number; overall: number } {
  let score = 0;
  let active = 0;
  let background = 0;
  let constraint = 0;
  let overall = 0;

  for (const phrase of normalizeVariantList(values)) {
    const latestUserMatches = Math.min(2, countSegmentPhrase(segments.latestUserText, phrase));
    const latestAssistantMatches = Math.min(1, countSegmentPhrase(segments.latestAssistantText, phrase));
    const activeMatches = latestUserMatches + latestAssistantMatches;
    const backgroundMatches = Math.min(1, countSegmentPhrase(segments.backgroundText, phrase));
    const constraintMatches = Math.min(1, countSegmentPhrase(segments.constraintText, phrase));
    const fullMatches = countSegmentPhrase(segments.fullText, phrase);
    if (latestUserMatches) {
      active += latestUserMatches;
      score += weights.active * latestUserMatches;
    }
    if (latestAssistantMatches) {
      active += latestAssistantMatches;
      score += Math.max(1, weights.active * 0.65) * latestAssistantMatches;
    }
    if (backgroundMatches) {
      background += backgroundMatches;
      score += weights.background * backgroundMatches;
    }
    if (constraintMatches) {
      constraint += constraintMatches;
      score += weights.constraint * constraintMatches;
    }
    overall += fullMatches;
  }

  return { score, active, background, constraint, overall };
}

const COMPOSITE_LABEL_TERMS = new Set([
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
  "romance",
]);

const SUPPORT_CONTEXT_TERMS = new Set([
  "abilities",
  "ability",
  "angel",
  "artifact",
  "base",
  "doctrine",
  "equipment",
  "faction",
  "facility",
  "group",
  "location",
  "mechanic",
  "mechanics",
  "operation",
  "operations",
  "organization",
  "power",
  "powers",
  "protocol",
  "rule",
  "rules",
  "system",
  "technology",
  "weapon",
]);

function getPrincipalLabelTokens(label: string): string[] {
  return tokenize(label).filter((token) => !COMPOSITE_LABEL_TERMS.has(token));
}

function isCompositeEntryLabel(label: string): boolean {
  const raw = label.toLowerCase();
  const tokens = tokenize(label);
  return (
    /(?:&|\/|\+)|\b(?:and|with)\b|(?:'s|\u2019s)\b/.test(raw) ||
    COMPOSITE_LABEL_TERMS.has(tokens[tokens.length - 1] ?? "") ||
    tokens.some((token) => COMPOSITE_LABEL_TERMS.has(token))
  );
}

function hasStrongCompositeEvidence(
  entry: RuntimeBook["cache"]["entries"][number],
  segments: RetrievalTextSegments,
): boolean {
  const exactVariants = normalizeVariantList([entry.label, ...entry.aliases]);
  if (exactVariants.some((phrase) => countSegmentPhrase(segments.fullText, phrase) > 0)) return true;

  const principalTokens = getPrincipalLabelTokens(entry.label);
  if (principalTokens.length < 2) return false;
  const activeHits = principalTokens.filter((token) => containsToken(segments.activeText, token)).length;
  const requiredHits = principalTokens.length <= 2 ? principalTokens.length : 3;
  return activeHits >= requiredHits;
}

function getDynamicFeedbackBoost(
  entry: RuntimeBook["cache"]["entries"][number],
  feedback?: DynamicRetrievalFeedbackSnapshot,
): number {
  if (entry.constant || !feedback) return 0;
  const data = feedback.entries[entry.entryId];
  if (!data) return 0;

  let boost = 0;
  if (data.lastReferenced) {
    const elapsed = Date.now() - data.lastReferenced;
    if (elapsed < FEEDBACK_HOT_MS) boost += 5;
    else if (elapsed < FEEDBACK_WARM_MS) boost += 3;
  }
  if (data.injections >= 3 && data.references / data.injections > 0.5) boost += 3;
  if (data.missStreak >= 5) boost -= 4;
  else if (data.missStreak >= 3) boost -= 2;
  if (data.injections >= FEEDBACK_STALE_INJECTION_THRESHOLD && data.references === 0) boost -= 3;
  boost -= Math.max(0, data.recentInjectionCount) * 5;
  return boost;
}

function hasPrimaryReason(reasons: string[]): boolean {
  return reasons.includes("label") || reasons.includes("alias") || reasons.includes("keyword");
}

function isDynamicInjectionEligible(candidate: ScoredEntry): boolean {
  if (candidate.entry.constant) return true;
  if (candidate.reasons.includes("related_support")) {
    return candidate.score >= RELATED_SUPPORT_SCORE_THRESHOLD;
  }
  if (!hasPrimaryReason(candidate.reasons)) return false;
  if (candidate.reasons.includes("constraint") && !candidate.reasons.includes("active") && !candidate.reasons.includes("background")) {
    return false;
  }
  switch (candidate.selectionRole) {
    case "active_anchor":
      return candidate.score >= ACTIVE_ANCHOR_SCORE_THRESHOLD;
    case "background_mention":
      return candidate.score >= BACKGROUND_MENTION_SCORE_THRESHOLD;
    case "support_context":
      return candidate.score >= SUPPORT_CONTEXT_SCORE_THRESHOLD;
    default:
      return candidate.score >= HIGH_CONFIDENCE_DYNAMIC_THRESHOLD;
  }
}

function filterDynamicInjectionCandidates(candidates: ScoredEntry[]): ScoredEntry[] {
  return candidates.filter(isDynamicInjectionEligible);
}

function scoreDensity(candidate: ScoredEntry): number {
  return candidate.score / Math.max(getEntryInjectionBody(candidate.entry).length, 1);
}

function entryLooksLikeSupportContext(entry: RuntimeBook["cache"]["entries"][number], tree?: BookTreeIndex): boolean {
  const labelTokens = tokenize(entry.label);
  if (labelTokens.some((token) => SUPPORT_CONTEXT_TERMS.has(token))) return true;
  if ([...entry.tags, entry.groupName, ...entry.key, ...entry.keysecondary].flatMap(tokenize).some((token) => SUPPORT_CONTEXT_TERMS.has(token))) {
    return true;
  }
  if (tree) {
    const breadcrumbTokens = tokenize(getEntryBreadcrumb(entry, tree));
    if (breadcrumbTokens.some((token) => SUPPORT_CONTEXT_TERMS.has(token))) return true;
  }
  return false;
}

function scoreRelatedSupportCandidate(
  candidate: RuntimeBook["cache"]["entries"][number],
  tree: BookTreeIndex,
  seedEntries: ScoredEntry[],
  seedText: string,
  feedback?: DynamicRetrievalFeedbackSnapshot,
): ScoredEntry | null {
  if (candidate.disabled || candidate.constant || !seedEntries.length) return null;

  const reasons: string[] = ["related_support"];
  let score = 0;

  const labelPhrases = normalizeVariantList([candidate.label]);
  const aliasPhrases = normalizeVariantList(candidate.aliases);
  const keyPhrases = normalizeVariantList([...candidate.key, ...candidate.keysecondary]);
  const exactLabelMatches = labelPhrases.reduce((total, phrase) => total + Math.min(2, countSegmentPhrase(seedText, phrase)), 0);
  const aliasMatches = aliasPhrases.reduce((total, phrase) => total + Math.min(2, countSegmentPhrase(seedText, phrase)), 0);
  const keyMatches = keyPhrases.reduce((total, phrase) => total + Math.min(2, countSegmentPhrase(seedText, phrase)), 0);
  if (isCompositeEntryLabel(candidate.label) && exactLabelMatches <= 0 && aliasMatches <= 0) {
    const principalTokens = getPrincipalLabelTokens(candidate.label).filter((token) => token.length >= 4 && !SEARCH_STOPWORDS.has(token));
    const principalHits = principalTokens.filter((token) => containsToken(seedText, token)).length;
    if (principalHits < Math.min(principalTokens.length, 3)) return null;
  }

  if (exactLabelMatches > 0) {
    score += exactLabelMatches * 16;
    reasons.push("label");
  }
  if (aliasMatches > 0) {
    score += aliasMatches * 12;
    reasons.push("alias");
  }
  if (keyMatches > 0) {
    score += keyMatches * 10;
    reasons.push("keyword");
  }

  const candidateLabelTokens = getPrincipalLabelTokens(candidate.label).filter((token) => token.length >= 4 && !SEARCH_STOPWORDS.has(token));
  const labelTokenHits = candidateLabelTokens.filter((token) => containsToken(seedText, token)).length;
  if (labelTokenHits >= Math.min(2, candidateLabelTokens.length)) {
    score += labelTokenHits * 4;
    if (!reasons.includes("label")) reasons.push("label");
  }

  const candidateText = normalizeSearchText([
    candidate.label,
    candidate.summary,
    candidate.comment,
    candidate.groupName,
    candidate.tags.join(" "),
    getEntryBreadcrumb(candidate, tree),
    truncateText(getEntryBody(candidate), 1000),
  ].join(" "));
  const seedPhraseHits = seedEntries.reduce((total, seed) => {
    const phrases = normalizeVariantList([seed.entry.label, ...seed.entry.aliases]);
    return total + phrases.reduce((innerTotal, phrase) => innerTotal + Math.min(1, countSegmentPhrase(candidateText, phrase)), 0);
  }, 0);
  if (seedPhraseHits > 0) {
    score += Math.min(10, seedPhraseHits * 3);
    reasons.push("content");
  }

  if (entryLooksLikeSupportContext(candidate, tree)) {
    score += 4;
    reasons.push("support_context");
  }

  score += getDynamicFeedbackBoost(candidate, feedback);
  if (score < RELATED_SUPPORT_SCORE_THRESHOLD) return null;

  return {
    entry: candidate,
    score,
    reasons: uniqueStrings(reasons),
    selectionRole: "support_context",
  };
}

function buildRelatedSupportCandidates(
  seedEntries: ScoredEntry[],
  books: RuntimeBook[],
  excludedEntryIds: ReadonlySet<string>,
  existingEntryIds: ReadonlySet<string>,
  feedback?: DynamicRetrievalFeedbackSnapshot,
  limit = RELATED_SUPPORT_LIMIT,
): ScoredEntry[] {
  if (!seedEntries.length || limit <= 0) return [];
  const seedText = normalizeSearchText(
    seedEntries
      .map((item) =>
        [
          item.entry.label,
          item.entry.aliases.join(" "),
          item.entry.summary,
          item.entry.comment,
          item.entry.tags.join(" "),
          item.entry.groupName,
          getEntryInjectionBody(item.entry),
        ].join(" "),
      )
      .join(" "),
  );
  if (!seedText) return [];

  return books
    .flatMap((book) =>
      book.cache.entries
        .filter((entry) => !excludedEntryIds.has(entry.entryId) && !existingEntryIds.has(entry.entryId))
        .map((entry) => scoreRelatedSupportCandidate(entry, book.tree, seedEntries, seedText, feedback)),
    )
    .filter((item): item is ScoredEntry => !!item)
    .sort(
      (left, right) =>
        Number(entryLooksLikeSupportContext(right.entry)) - Number(entryLooksLikeSupportContext(left.entry)) ||
        scoreDensity(right) - scoreDensity(left) ||
        right.score - left.score ||
        left.entry.label.localeCompare(right.entry.label),
    )
    .slice(0, limit);
}

function scoreEntry(
  entry: RuntimeBook["cache"]["entries"][number],
  tree: BookTreeIndex,
  queryText: string,
  queryTokens: string[],
  feedback?: DynamicRetrievalFeedbackSnapshot,
): ScoredEntry {
  const reasons: string[] = [];
  let score = 0;
  const segments = buildRetrievalTextSegments(queryText);

  const breadcrumb = normalizeSearchText(getEntryBreadcrumb(entry, tree));
  const labelText = normalizeSearchText(entry.label);
  const summaryText = normalizeSearchText(entry.summary);
  const tagText = normalizeSearchText(entry.tags.join(" "));
  const commentText = normalizeSearchText(entry.comment);
  const bodyText = normalizeSearchText(truncateText(getEntryBody(entry), 500));
  const groupText = normalizeSearchText(entry.groupName);
  const scoringTokens = tokenize(segments.activeText);
  const supportQueryTokens = scoringTokens.length ? scoringTokens : queryTokens;

  const compositeLabel = isCompositeEntryLabel(entry.label);
  const compositeEvidence = !compositeLabel || hasStrongCompositeEvidence(entry, segments);
  const labelEvidence = compositeEvidence
    ? scorePhraseVariants([entry.label], segments, { active: 18, background: 5, constraint: 3 })
    : { score: 0, active: 0, background: 0, constraint: 0, overall: 0 };
  const aliasEvidence = scorePhraseVariants(entry.aliases, segments, { active: 14, background: 4, constraint: 2 });
  const keyEvidence = scorePhraseVariants([...entry.key, ...entry.keysecondary], segments, {
    active: 10,
    background: 3,
    constraint: 2,
  });

  if (labelEvidence.score > 0) reasons.push("label");
  if (aliasEvidence.score > 0) reasons.push("alias");
  if (keyEvidence.score > 0) reasons.push("keyword");

  score += labelEvidence.score + aliasEvidence.score + keyEvidence.score;

  const labelMatches = compositeEvidence ? countTokenMatches(supportQueryTokens, tokenize(labelText)) : 0;
  const aliasMatches = countTokenMatches(supportQueryTokens, uniqueStrings(entry.aliases.flatMap(tokenize)));
  const keyMatches = countTokenMatches(supportQueryTokens, uniqueStrings([...entry.key, ...entry.keysecondary].flatMap(tokenize)));
  const tagMatches = countTokenMatches(supportQueryTokens, tokenize(tagText));
  const summaryMatches = countTokenMatches(supportQueryTokens, tokenize(summaryText));
  const bodyMatches = Math.min(6, countTokenMatches(supportQueryTokens, tokenize(bodyText)));
  const breadcrumbMatches = countTokenMatches(supportQueryTokens, tokenize(breadcrumb));
  const commentMatches = countTokenMatches(supportQueryTokens, tokenize(commentText));
  const groupMatches = countTokenMatches(supportQueryTokens, tokenize(groupText));

  if (labelMatches > 0 && !reasons.includes("label")) reasons.push("label");
  if (aliasMatches > 0 && !reasons.includes("alias")) reasons.push("alias");
  if (keyMatches > 0 && !reasons.includes("keyword")) reasons.push("keyword");
  if (tagMatches > 0) reasons.push("tag");
  if (summaryMatches > 0) reasons.push("summary");
  if (bodyMatches > 0) reasons.push("content");
  if (breadcrumbMatches > 0) reasons.push("branch");
  if (commentMatches > 0) reasons.push("comment");
  if (groupMatches > 0) reasons.push("group");

  score += labelMatches * 2;
  score += aliasMatches * 2;
  score += keyMatches * 2;
  score += tagMatches;
  score += summaryMatches;
  score += Math.min(3, bodyMatches);
  score += breadcrumbMatches;
  score += commentMatches;
  score += groupMatches;
  score += getDynamicFeedbackBoost(entry, feedback);
  if (entry.selective) score += 0.1;

  const primaryActive = labelEvidence.active + aliasEvidence.active + keyEvidence.active;
  const primaryBackground = labelEvidence.background + aliasEvidence.background + keyEvidence.background;
  const primaryConstraint = labelEvidence.constraint + aliasEvidence.constraint + keyEvidence.constraint;
  const primaryOverall = labelEvidence.overall + aliasEvidence.overall + keyEvidence.overall;
  let selectionRole: PreviewNode["selectionRole"] = "score_fallback";
  if (primaryActive > 0) {
    selectionRole = "active_anchor";
    reasons.push("active");
  } else if (primaryBackground > 0) {
    selectionRole = "background_mention";
    reasons.push("background");
  } else if (primaryConstraint > 0) {
    selectionRole = "support_context";
    reasons.push("constraint");
  } else if (primaryOverall > 0) {
    selectionRole = "support_context";
  } else if (score > 0) {
    selectionRole = "support_context";
  }

  return { entry, score, reasons: Array.from(new Set(reasons)), selectionRole };
}

function scoreEntries(
  queryText: string,
  books: RuntimeBook[],
  excludedEntryIds: ReadonlySet<string> = EMPTY_ENTRY_ID_SET,
  feedback?: DynamicRetrievalFeedbackSnapshot,
): ScoredEntry[] {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  if (!normalized || !queryTokens.length) return [];

  return books
    .flatMap((book) =>
      book.cache.entries
        .filter((entry) => !entry.disabled && !excludedEntryIds.has(entry.entryId))
        .map((entry) => scoreEntry(entry, book.tree, queryText, queryTokens, feedback)),
    )
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}

async function runControllerJson(
  prompt: string,
  controller: ControllerSession,
  systemPrompt?: string,
  requestLabel = "Controller request",
): Promise<ControllerResponse> {
  if (controller.callCount >= CONTROLLER_MAX_CALLS) {
    return { parsed: null, error: "Traversal controller hit its call limit.", durationMs: null };
  }

  const remainingMs = controller.deadlineAt - Date.now();
  if (remainingMs <= 1_000) {
    return { parsed: null, error: "Traversal controller ran out of time.", durationMs: null };
  }

  controller.callCount += 1;
  const requestStartedAt = Date.now();
  const abortController = new AbortController();
  const timeoutMs = Math.min(CONTROLLER_TIMEOUT_MS, remainingMs);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timeoutHandled = false;
  try {
    const requestPromise: Promise<ControllerResponse> = runSharedControllerJson(
      prompt,
      controller.settings,
      controller.userId,
      {
        systemPrompt,
        connectionId: controller.connectionId,
        signal: abortController.signal,
      },
    )
      .then((result) => {
        const durationMs = Date.now() - requestStartedAt;
        if (result.parsed) {
          controller.controllerUsed = true;
          if (result.parsedFrom === "reasoning") {
            emitProgress(controller.reportProgress, {
              type: "item",
              item: createFeedItem(
                "issue",
                `Controller parse fallback: ${requestLabel}`,
                "Controller JSON was recovered from reasoning text because the main content channel was unusable.",
                {
                  phase: "controller",
                  tone: "warn",
                  durationMs,
                },
              ),
            });
          }
          return { parsed: result.parsed, error: null, durationMs };
        }
        spindle.log.warn("Lore Recall controller call returned invalid JSON.");
        emitProgress(controller.reportProgress, {
          type: "item",
          item: createFeedItem(
            "issue",
            `Controller issue: ${requestLabel}`,
            "Controller returned invalid JSON, so Lore Recall will fall back where it can.",
            {
              phase: "controller",
              tone: "warn",
              durationMs,
              details: [
                `parsedFrom=${result.parsedFrom ?? "none"}`,
                `finishReason=${result.finishReason ?? "unknown"}`,
              ],
            },
          ),
        });
        return { parsed: null, error: "Traversal controller returned invalid JSON.", durationMs };
      })
      .catch((error: unknown) => {
        const durationMs = Date.now() - requestStartedAt;
        const message = error instanceof Error ? error.message : String(error);
        const isAbort = error instanceof Error && error.name === "AbortError";
        if (isAbort && timeoutHandled) {
          return {
            parsed: null,
            error: "Traversal controller timed out before the interceptor budget was exhausted.",
            durationMs,
          };
        }
        spindle.log.warn(`Lore Recall controller call failed: ${isAbort ? "request timed out" : message}`);
        emitProgress(controller.reportProgress, {
          type: "item",
          item: createFeedItem(
            "issue",
            `${isAbort ? "Controller timeout" : "Controller error"}: ${requestLabel}`,
            isAbort
              ? "Controller request timed out and Lore Recall will keep going with fallback behavior when possible."
              : `Controller request failed: ${message}`,
            {
              phase: "controller",
              tone: isAbort ? "warn" : "error",
              durationMs,
              details: isAbort ? [`Timeout after ${timeoutMs} ms.`] : [message],
            },
          ),
        });
        return {
          parsed: null,
          error: isAbort ? "Traversal controller timed out." : `Traversal controller failed: ${message}`,
          durationMs,
        };
      });

    const timeoutPromise = new Promise<ControllerResponse>((resolve) => {
      timer = setTimeout(() => {
        timeoutHandled = true;
        abortController.abort();
        const durationMs = Date.now() - requestStartedAt;
        spindle.log.warn("Lore Recall controller call failed: request timed out");
        emitProgress(controller.reportProgress, {
          type: "item",
          item: createFeedItem(
            "issue",
            `Controller timeout: ${requestLabel}`,
            "Controller request timed out before Lore Recall finished retrieval.",
            {
              phase: "controller",
              tone: "warn",
              durationMs,
              details: [`Timeout after ${timeoutMs} ms.`],
            },
          ),
        });
        resolve({
          parsed: null,
          error: "Traversal controller timed out before the interceptor budget was exhausted.",
          durationMs,
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
  recentConversation: string,
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
    buildPromptContext(recentConversation),
    "",
    "Books:",
    ...books.map((book) =>
      `- id=${book.summary.id}; name=${book.summary.name}; description=${truncateText(
        book.config.description || book.tree.nodes[book.tree.rootId]?.summary || book.summary.description,
        140,
      )}; categories=${Math.max(0, Object.keys(book.tree.nodes).length - 1)}; entries=${book.cache.entries.length}`,
    ),
  ].join("\n");

  const { parsed } = await runControllerJson(
    prompt,
    controller,
    RETRIEVAL_BOOK_SYSTEM_PROMPT,
    "Choose books",
  );
  const ids = Array.isArray(parsed?.bookIds)
    ? parsed.bookIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!ids.length) return { books, trace: [] };
  const chosen = books.filter((book) => ids.includes(book.summary.id));
  const nextBooks = chosen.length ? chosen : books;
  const trace = createTraceBuffer(controller.reportProgress);
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
    buildPromptContext(queryText),
    "",
    "Candidates:",
    ...scored.map((item) =>
      `- entryId=${item.entry.entryId}; label=${item.entry.label}; book=${item.entry.worldBookName}; summary=${truncateText(
        item.entry.summary,
        120,
      )}; preview=${truncateText(getEntryBody(item.entry), 160)}`,
    ),
  ].join("\n");

  const { parsed } = await runControllerJson(prompt, controller, undefined, "Rerank entries");
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
  maxFinalEntries = clampInt(Math.min(config.maxResults, config.tokenBudget), 1, 32),
): Promise<ScoredEntry[]> {
  const eligibleCandidates = filterDynamicInjectionCandidates(candidates);
  if (!eligibleCandidates.length) return [];
  const initialRankedCandidates = rankSelectionCandidates(queryText, eligibleCandidates, scopes);
  const initialRankedById = new Map(initialRankedCandidates.map((item) => [item.candidate.entry.entryId, item]));
  let orderedEntries: ScoredEntry[] = initialRankedCandidates.map((item) => ({ ...item.candidate, selectionRole: item.selectionRole }));
  if (config.rerankEnabled) {
    orderedEntries = await maybeRerankEntries(queryText, orderedEntries, controller, allowController);
  }
  const rankedCandidates = orderedEntries.map((entry) => {
    const ranked = initialRankedById.get(entry.entry.entryId);
    const selectionRole = ranked?.selectionRole ?? entry.selectionRole ?? "score_fallback";
    return {
      candidate: { ...entry, selectionRole },
      selectionRole,
      priority: ranked?.priority ?? entry.score * 10,
      scopeBreadcrumb: ranked?.scopeBreadcrumb ?? "Unscoped",
      latestMentionCount: ranked?.latestMentionCount ?? 0,
      overallMentionCount: ranked?.overallMentionCount ?? 0,
    };
  });
  const clampedFinalEntries = Math.min(eligibleCandidates.length, Math.max(0, maxFinalEntries));
  if (!clampedFinalEntries) return [];
  const fallbackLimit = config.selectiveRetrieval
    ? Math.min(clampedFinalEntries, SELECTIVE_FALLBACK_LIMIT)
    : clampedFinalEntries;
  const buildScopedFallbackSelection = (limit = fallbackLimit): ScoredEntry[] =>
    buildDeterministicSelection(rankedCandidates, limit);
  const rankedEntries = rankedCandidates.map((item) => ({ ...item.candidate, selectionRole: item.selectionRole }));
  const manifests = buildScopedManifests(rankedEntries, scopes);
  const manifestedIds = new Set(manifests.flatMap((manifest) => manifest.candidates.map((item) => item.entry.entryId)));
  const additionalCandidates = rankedCandidates.filter((item) => !manifestedIds.has(item.candidate.entry.entryId));

  if (!config.selectiveRetrieval || !rankedCandidates.length) {
    return buildScopedFallbackSelection();
  }
  if (!allowController) {
    return buildScopedFallbackSelection();
  }

  const prompt = [
    "Select the exact lore entries that should be injected as the final set from the retrieved manifests and accumulated candidate pool.",
    'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
    `Choose up to ${clampedFinalEntries} entryIds from the candidates below.`,
    "Default to a compact final set: usually 1-6 entries, rarely more than 8. The cap is a maximum, not a target.",
    "Use only entryIds that appear below.",
    "Preserve directly mentioned active anchors such as active characters, places, objects, or factions unless the candidate is plainly a false positive.",
    "The retrieved scopes are already the traversal decision. Additional candidates are pooled entries not represented in a scope manifest, not forced injections.",
    "Entries may come from any listed scope, and some scopes may contribute zero entries.",
    "It is valid to choose fewer entries than the cap when only a sparse set is useful.",
    "Return an empty entryIds array when none of the listed entries should be injected.",
    "Do not select every entry in a broad manifest just because the scope is relevant; reject background entries that will not affect the next reply.",
    "",
    buildPromptContext(queryText),
    "",
    "Chosen scopes:",
    ...(scopes.length
      ? scopes.map((scope) => `- ${scope.book.summary.name} :: ${getScopeBreadcrumb(scope.book, scope.nodeId)}`)
      : ["- none"]),
    "",
    "Scoped entry manifests:",
    ...(manifests.length
      ? manifests.flatMap((manifest) => [
          `Scope: ${manifest.scope.book.summary.name} :: ${getScopeBreadcrumb(manifest.scope.book, manifest.scope.nodeId)} (${manifest.candidates.length} entries)`,
          ...manifest.candidates.map(
            (item) =>
              `- entryId=${item.entry.entryId}; signal=${item.selectionRole ?? "score_fallback"}; label=${item.entry.label}; score=${item.score.toFixed(
                2,
              )}; reasons=${item.reasons.join(", ")}; summary=${truncateText(item.entry.summary, 140)}; preview=${truncateText(
                getEntryBody(item.entry),
                180,
            )}`,
          ),
        ])
      : []),
    ...(additionalCandidates.length
      ? [
          "",
          "Additional candidate entries:",
          ...additionalCandidates.map(
            (item) =>
              `- entryId=${item.candidate.entry.entryId}; signal=${item.selectionRole}; scope=${item.scopeBreadcrumb}; label=${item.candidate.entry.label}; score=${item.candidate.score.toFixed(
                2,
              )}; reasons=${item.candidate.reasons.join(", ")}; summary=${truncateText(
                item.candidate.entry.summary,
                140,
              )}; preview=${truncateText(getEntryBody(item.candidate.entry), 180)}`,
          ),
        ]
      : !manifests.length
        ? rankedCandidates.map(
          (item) =>
            `- entryId=${item.candidate.entry.entryId}; signal=${item.selectionRole}; scope=${item.scopeBreadcrumb}; label=${item.candidate.entry.label}; score=${item.candidate.score.toFixed(
              2,
            )}; reasons=${item.candidate.reasons.join(", ")}; summary=${truncateText(
              item.candidate.entry.summary,
              140,
            )}; preview=${truncateText(getEntryBody(item.candidate.entry), 180)}`,
        )
        : []),
  ].join("\n");

  const byId = new Map(rankedCandidates.map((item) => [item.candidate.entry.entryId, item]));
  const parseManifestSelection = (
    parsedValue: Record<string, unknown> | null,
  ): {
    mappedIds: string[];
    invalidSelectionReasons: string[];
  } => {
    const parsedEntryIds = parsedValue?.entryIds;
    const hasExplicitEntryIds = Array.isArray(parsedEntryIds);
    const requestedIds = hasExplicitEntryIds
      ? parsedEntryIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    const uniqueRequestedIds = uniqueStrings(requestedIds);
    const unmappedIds = uniqueRequestedIds.filter((id) => !byId.has(id));
    const mappedIds = uniqueRequestedIds.filter((id) => byId.has(id));
    const invalidSelectionReasons: string[] = [];

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
      invalidSelectionReasons.push(
        `Controller returned ${mappedIds.length} entry IDs, which exceeds the final inject cap of ${clampedFinalEntries}.`,
      );
    }

    return { mappedIds, invalidSelectionReasons };
  };
  const { parsed } = await runControllerJson(
    prompt,
    controller,
    RETRIEVAL_MANIFEST_SYSTEM_PROMPT,
    "Select manifest entries",
  );
  let { mappedIds, invalidSelectionReasons } = parseManifestSelection(parsed);

  const selectedWholeManifest =
    !invalidSelectionReasons.length &&
    mappedIds.length >= Math.min(rankedCandidates.length, clampedFinalEntries) &&
    mappedIds.length > Math.min(SELECTIVE_FALLBACK_LIMIT, clampedFinalEntries);

  if (selectedWholeManifest) {
    const retryPrompt = [
      prompt,
      "",
      "The previous selection included every available manifest candidate. That is too broad for automatic prompt injection.",
      'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
      "Choose a sparse final set only. Usually 1-6 entries is enough; choose 0 if no dynamic entry is truly needed.",
      "Prioritize direct named entities, currently active characters, and mechanics that directly change the next reply.",
      "Drop general background, duplicate parent/child coverage, and entries that are only loosely related.",
    ].join("\n");
    const retry = await runControllerJson(
      retryPrompt,
      controller,
      RETRIEVAL_MANIFEST_SYSTEM_PROMPT,
      "Retry sparse manifest selection",
    );
    const retrySelection = parseManifestSelection(retry.parsed);
    if (!retrySelection.invalidSelectionReasons.length && retrySelection.mappedIds.length < mappedIds.length) {
      mappedIds = retrySelection.mappedIds;
      invalidSelectionReasons = [];
    } else {
      invalidSelectionReasons.push("Controller selected every manifest entry from a broad candidate pool.");
      invalidSelectionReasons.push(...retrySelection.invalidSelectionReasons);
    }
  }

  if (invalidSelectionReasons.length) {
    spindle.log.warn(`Lore Recall manifest selection fell back to deterministic final ranking: ${invalidSelectionReasons.join(" ")}`);
    emitProgress(controller.reportProgress, {
      type: "item",
      item: createFeedItem(
        "issue",
        "Manifest selection fell back",
        `Controller manifest output could not be used as the final injected set, so Lore Recall fell back to the globally ranked top ${fallbackLimit}.`,
        {
          phase: "manifest_select",
          tone: "warn",
          details: invalidSelectionReasons,
        },
      ),
    });
    return buildScopedFallbackSelection();
  }

  const mappedIdSet = new Set(mappedIds);
  return buildDeterministicSelection(
    rankedCandidates
      .filter((item) => mappedIdSet.has(item.candidate.entry.entryId))
      .slice(0, clampedFinalEntries),
    clampedFinalEntries,
  );
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

function makeDocumentChoiceId(bookId: string): string {
  return `${DOCUMENT_CHOICE_PREFIX}${bookId}`;
}

function parseDocumentChoiceId(choiceId: string): string | null {
  if (!choiceId.startsWith(DOCUMENT_CHOICE_PREFIX)) return null;
  const bookId = choiceId.slice(DOCUMENT_CHOICE_PREFIX.length).trim();
  return bookId || null;
}

function makeEntryChoiceId(entryId: string): string {
  return `entry:${entryId}`;
}

function parseEntryChoiceId(choiceId: string): string | null {
  const match = choiceId.match(/^entry:(.+)$/);
  return match?.[1] ?? null;
}

function stripChoiceIdDecoration(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const choiceIdMatch = /choiceId\s*=\s*([^;\s,)]+)/i.exec(trimmed);
  if (choiceIdMatch?.[1]) return stripChoiceIdDecoration(choiceIdMatch[1]);

  const leadingBracketMatch = /^\[([^\]]+)\]/.exec(trimmed);
  if (leadingBracketMatch?.[1]) return stripChoiceIdDecoration(leadingBracketMatch[1]);

  return trimmed
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[\[(]+/g, "")
    .replace(/[\]),.;]+$/g, "")
    .trim();
}

function expandChoiceIdVariants(choiceId: string): string[] {
  const variants: string[] = [];
  const pushVariant = (value: string): void => {
    const stripped = stripChoiceIdDecoration(value);
    if (stripped && !variants.includes(stripped)) variants.push(stripped);
  };

  pushVariant(choiceId);
  for (const match of choiceId.matchAll(/\[([^\]]+)\]/g)) {
    if (match[1]) pushVariant(match[1]);
  }
  for (const match of choiceId.matchAll(/choiceId\s*=\s*([^;\s,)]+)/gi)) {
    if (match[1]) pushVariant(match[1]);
  }

  return variants;
}

function formatChoiceIdList(choiceIds: string[], limit = 5): string {
  if (!choiceIds.length) return "none";
  const shown = choiceIds.slice(0, limit).map((choiceId) => `"${truncateText(choiceId, 80)}"`);
  return choiceIds.length > limit ? `${shown.join(", ")} (+${choiceIds.length - limit} more)` : shown.join(", ");
}

function resolveTraversalChoiceScopes(
  choiceIds: string[],
  booksById: Map<string, RuntimeBook>,
): TraversalScope[] {
  const scopes = new Map<string, TraversalScope>();

  const addScope = (book: RuntimeBook, nodeId: string): void => {
    if (!book.tree.nodes[nodeId]) return;
    scopes.set(`${book.summary.id}:${nodeId}`, { book, nodeId });
  };

  const addNodeIdAcrossBooks = (nodeId: string): boolean => {
    let resolved = false;
    for (const book of booksById.values()) {
      if (!book.tree.nodes[nodeId]) continue;
      addScope(book, nodeId);
      resolved = true;
    }
    return resolved;
  };

  const labelIndex = new Map<string, TraversalScope[]>();
  const addLabelIndex = (label: string, book: RuntimeBook, nodeId: string): void => {
    const key = normalizeSearchText(label);
    if (!key) return;
    const existing = labelIndex.get(key) ?? [];
    if (!existing.some((scope) => scope.book.summary.id === book.summary.id && scope.nodeId === nodeId)) {
      existing.push({ book, nodeId });
    }
    labelIndex.set(key, existing);
  };

  for (const book of booksById.values()) {
    for (const node of Object.values(book.tree.nodes)) {
      const breadcrumb = getScopeBreadcrumb(book, node.id);
      addLabelIndex(node.id, book, node.id);
      addLabelIndex(node.label, book, node.id);
      addLabelIndex(breadcrumb, book, node.id);
      addLabelIndex(`${book.summary.name} :: ${node.label}`, book, node.id);
      addLabelIndex(`${book.summary.name} :: ${breadcrumb}`, book, node.id);
      addLabelIndex(`${book.summary.id}:${node.id}`, book, node.id);
      if (node.id === book.tree.rootId) {
        addLabelIndex(book.summary.name, book, node.id);
        addLabelIndex("root", book, node.id);
      }
    }
  }

  for (const choiceId of choiceIds) {
    for (const variant of expandChoiceIdVariants(choiceId)) {
      const categoryChoice = parseCategoryChoiceId(variant);
      if (categoryChoice) {
        const book = booksById.get(categoryChoice.bookId);
        if (book && book.tree.nodes[categoryChoice.nodeId]) {
          addScope(book, categoryChoice.nodeId);
        } else {
          addNodeIdAcrossBooks(categoryChoice.nodeId);
        }
        continue;
      }

      const categoryNodeOnly = /^category:(.+)$/i.exec(variant);
      if (categoryNodeOnly?.[1] && addNodeIdAcrossBooks(categoryNodeOnly[1])) continue;

      const documentBookId = parseDocumentChoiceId(variant);
      if (documentBookId) {
        const book = booksById.get(documentBookId);
        if (book) addScope(book, book.tree.rootId);
        continue;
      }

      if (addNodeIdAcrossBooks(variant)) continue;

      const twoPartChoice = /^([^:]+):(.+)$/.exec(variant);
      if (twoPartChoice?.[2] && addNodeIdAcrossBooks(twoPartChoice[2])) continue;

      const labelScopes = labelIndex.get(normalizeSearchText(variant)) ?? [];
      for (const scope of labelScopes) addScope(scope.book, scope.nodeId);
    }
  }
  return Array.from(scopes.values());
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
): ScopedManifest[] {
  const candidatesById = new Map(candidates.map((item) => [item.entry.entryId, item]));
  const candidateOrder = new Map(candidates.map((item, index) => [item.entry.entryId, index]));
  return scopes
    .map((scope) => {
      const scopeCandidates = getScopedEntryIds(scope.book, scope.nodeId, true)
        .map((entryId) => candidatesById.get(entryId))
        .filter((item): item is ScoredEntry => !!item)
        .sort((left, right) => {
          const leftOrder = candidateOrder.get(left.entry.entryId) ?? Number.MAX_SAFE_INTEGER;
          const rightOrder = candidateOrder.get(right.entry.entryId) ?? Number.MAX_SAFE_INTEGER;
          return leftOrder - rightOrder || right.score - left.score || left.entry.label.localeCompare(right.entry.label);
        });
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
  preserveScopeOrder = false,
  excludedEntryIds: ReadonlySet<string> = EMPTY_ENTRY_ID_SET,
  feedback?: DynamicRetrievalFeedbackSnapshot,
): ScoredEntry[] {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  const selected: ScoredEntry[] = [];
  const seen = new Set<string>();

  for (const scope of scopes) {
    const entriesById = new Map(scope.book.cache.entries.map((entry) => [entry.entryId, entry]));
    for (const entryId of getScopedEntryIds(scope.book, scope.nodeId, true)) {
      if (seen.has(entryId)) continue;
      if (excludedEntryIds.has(entryId)) continue;
      const entry = entriesById.get(entryId);
      if (!entry || entry.disabled) continue;
      seen.add(entryId);
      const scored = normalized && queryTokens.length ? scoreEntry(entry, scope.book.tree, queryText, queryTokens, feedback) : { entry, score: 0, reasons: [] };
      const reasons = uniqueStrings([...scored.reasons, "branch"]);
    selected.push({
      entry,
      score: scored.score > 0 ? scored.score + 0.25 : 0.25,
      reasons,
      selectionRole: scored.selectionRole,
    });
    }
  }

  if (directEntryIds.length) {
    const allBooks = new Map(scopes.map((scope) => [scope.book.summary.id, scope.book]));
    for (const entryId of directEntryIds) {
      if (seen.has(entryId)) continue;
      if (excludedEntryIds.has(entryId)) continue;
      let resolved = false;
      for (const book of allBooks.values()) {
        const entriesById = new Map(book.cache.entries.map((entry) => [entry.entryId, entry]));
        const entry = entriesById.get(entryId);
        if (!entry || entry.disabled) continue;
        seen.add(entryId);
        const scored = normalized && queryTokens.length ? scoreEntry(entry, book.tree, queryText, queryTokens, feedback) : { entry, score: 0, reasons: [] };
        selected.push({
          entry,
          score: scored.score > 0 ? scored.score : 0.5,
          reasons: uniqueStrings([...scored.reasons, "direct"]),
          selectionRole: scored.selectionRole,
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
        selectionRole: fallback.selectionRole,
      });
    }
  }

  if (preserveScopeOrder) return selected;
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

function dedupeScopes(scopes: TraversalScope[]): TraversalScope[] {
  const unique = new Map<string, TraversalScope>();
  for (const scope of scopes) {
    unique.set(makeScopeKey(scope), scope);
  }
  return Array.from(unique.values());
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
      const choiceId = child.id;
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
    const choiceId = node.id;
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

function resolveScopeChoices(nodeIds: string[], books: RuntimeBook[]): TraversalScope[] {
  const booksById = new Map(books.map((book) => [book.summary.id, book]));
  const scopes = new Map<string, TraversalScope>();
  for (const choiceId of nodeIds) {
    const documentBookId = parseDocumentChoiceId(choiceId);
    if (documentBookId) {
      const book = booksById.get(documentBookId);
      if (!book) continue;
      scopes.set(makeScopeKey({ book, nodeId: book.tree.rootId }), { book, nodeId: book.tree.rootId });
      continue;
    }

    const legacyChoice = parseCategoryChoiceId(choiceId);
    if (legacyChoice) {
      const book = booksById.get(legacyChoice.bookId);
      if (!book || !book.tree.nodes[legacyChoice.nodeId]) continue;
      scopes.set(makeScopeKey({ book, nodeId: legacyChoice.nodeId }), { book, nodeId: legacyChoice.nodeId });
      continue;
    }

    const matchingBooks = books.filter((book) => !!book.tree.nodes[choiceId]);
    if (matchingBooks.length !== 1) continue;
    const [book] = matchingBooks;
    scopes.set(makeScopeKey({ book, nodeId: choiceId }), { book, nodeId: choiceId });
  }
  return Array.from(scopes.values());
}

function chooseDeterministicScopes(
  currentScopes: TraversalScope[],
  deterministicById: Map<string, ScoredEntry>,
  config: CharacterRetrievalConfig,
): TraversalScope[] {
  const choices = collectChildScopeChoices(currentScopes, deterministicById, config);
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

function buildInitialScopePrompt(recentConversation: string, treeOverview: string): string {
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
    buildPromptContext(recentConversation),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildChildScopePrompt(
  recentConversation: string,
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
    "",
    buildPromptContext(recentConversation),
    `Current scopes: ${scopes.map((scope) => `${scope.book.summary.name} :: ${getScopeBreadcrumb(scope.book, scope.nodeId)}`).join(" | ")}`,
    "",
    "CATEGORY CHOICES:",
    ...(categories.length
      ? categories.map(
          (category) =>
            `- [${category.nodeId}] ${category.label} [${category.childCount > 0 ? "branch" : "leaf"}] (${category.entryCount} entries)\n  ${category.summary || "No summary."}`,
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

function collectAllScopedEntries(
  scopes: TraversalScope[],
  excludedEntryIds: ReadonlySet<string> = EMPTY_ENTRY_ID_SET,
): ScoredEntry[] {
  const seen = new Set<string>();
  const selected: ScoredEntry[] = [];
  for (const scope of scopes) {
    const entriesById = new Map(scope.book.cache.entries.map((entry) => [entry.entryId, entry]));
    for (const entryId of getScopedEntryIds(scope.book, scope.nodeId, true)) {
      if (seen.has(entryId)) continue;
      if (excludedEntryIds.has(entryId)) continue;
      const entry = entriesById.get(entryId);
      if (!entry || entry.disabled) continue;
      seen.add(entryId);
      selected.push({
        entry,
        score: 1,
        reasons: ["scope"],
      });
    }
  }
  return selected;
}

async function selectScopesSinglePass(
  recentConversation: string,
  books: RuntimeBook[],
  controller: ControllerSession,
  allowController: boolean,
  excludedEntryIds: ReadonlySet<string>,
  maxDynamicEntries: number,
  trace: TraversalTraceStep[],
): Promise<{
  scopes: TraversalScope[];
  candidates: ScoredEntry[];
  selected: ScoredEntry[];
  manifests: ScopedManifest[];
  selectionReason: string;
  fallbackPath: string[];
}> {
  const rootScopes = books.map((book) => ({ book, nodeId: book.tree.rootId }));
  const fallbackPath: string[] = [];
  let scopes: TraversalScope[] = [];
  let selectionReason = "Controller selected retrieval scopes.";

  if (allowController) {
    const response = await runControllerJson(
      buildInitialScopePrompt(recentConversation, buildFullTraversalTreeOverview(rootScopes)),
      controller,
      RETRIEVAL_SCOPE_SYSTEM_PROMPT,
      "Choose scopes",
    );
    const requestedNodeIds = Array.isArray(response.parsed?.nodeIds)
      ? response.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    scopes = resolveScopeChoices(requestedNodeIds, books);
    const controllerReason =
      typeof response.parsed?.reason === "string" && response.parsed.reason.trim()
        ? response.parsed.reason.trim()
        : selectionReason;
    if (scopes.length) {
      selectionReason = controllerReason;
    } else {
      fallbackPath.push(
        response.error ??
          (requestedNodeIds.length
            ? "Scope selection returned nodeIds that did not map to visible scopes; nothing was injected."
            : "Scope selection returned an empty nodeIds array; nothing was injected."),
      );
      selectionReason = fallbackPath[fallbackPath.length - 1];
    }
  } else {
    fallbackPath.push("Scope selection skipped the controller; nothing was injected.");
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

  if (!scopes.length) {
    return { scopes: [], candidates: [], selected: [], manifests: [], selectionReason, fallbackPath };
  }

  const candidates = collectAllScopedEntries(scopes, excludedEntryIds);
  const manifests = buildScopedManifests(candidates, scopes);
  const selected = candidates.slice(0, Math.max(0, maxDynamicEntries));

  pushTrace(
    trace,
    "retrieve",
    "Retrieve entries",
    `Resolved ${candidates.length} entr${candidates.length === 1 ? "y" : "ies"} from ${scopes.length} chosen scope(s); kept ${selected.length} for injection.`,
    { entryCount: selected.length },
  );

  return { scopes, candidates, selected, manifests, selectionReason, fallbackPath };
}

async function chooseCollapsedScopes(
  recentConversation: string,
  books: RuntimeBook[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
  deterministicById: Map<string, ScoredEntry>,
  trace: TraversalTraceStep[],
): Promise<{ scopes: TraversalScope[]; fallbackPath: string[]; selectionReason: string }> {
  const rootScopes = books.map((book) => ({ book, nodeId: book.tree.rootId }));
  const fallbackPath: string[] = [];
  let scopes: TraversalScope[] = [];
  let selectionReason = "Controller selected retrieval scopes.";

  if (allowController) {
    const response = await runControllerJson(
      buildInitialScopePrompt(recentConversation, buildFullTraversalTreeOverview(rootScopes)),
      controller,
      RETRIEVAL_SCOPE_SYSTEM_PROMPT,
      "Choose collapsed scopes",
    );
    const requestedNodeIds = Array.isArray(response.parsed?.nodeIds)
      ? response.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    scopes = resolveScopeChoices(requestedNodeIds, books);
    const controllerReason =
      typeof response.parsed?.reason === "string" && response.parsed.reason.trim()
        ? response.parsed.reason.trim()
        : "Controller selected retrieval scopes.";
    if (scopes.length) {
      selectionReason = controllerReason;
    } else {
      fallbackPath.push(
        response.error ??
          (requestedNodeIds.length
            ? "Collapsed scope selection returned nodeIds that did not map to visible scopes; used top-level deterministic scope fallback."
            : "Collapsed scope selection returned an empty nodeIds array; used top-level deterministic scope fallback."),
      );
      scopes = chooseDeterministicScopes(rootScopes, deterministicById, config);
      selectionReason = fallbackPath[fallbackPath.length - 1];
    }
  } else {
    fallbackPath.push("Collapsed scope selection skipped the controller and used top-level deterministic scope fallback.");
    scopes = chooseDeterministicScopes(rootScopes, deterministicById, config);
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
          buildChildScopePrompt(recentConversation, scopes, categories, 1, config),
          controller,
          RETRIEVAL_SCOPE_SYSTEM_PROMPT,
          "Refine collapsed scopes",
        );
        const requestedNodeIds = Array.isArray(refinement.parsed?.nodeIds)
          ? refinement.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        refinedScopes = resolveScopeChoices(requestedNodeIds, books);
        refinedReason =
          typeof refinement.parsed?.reason === "string" && refinement.parsed.reason.trim()
            ? refinement.parsed.reason.trim()
            : "Refined broad scopes.";
        if (!refinedScopes.length) {
          fallbackPath.push(
            refinement.error ??
              (requestedNodeIds.length
                ? "Collapsed scope refinement returned nodeIds that did not map to current child scopes; used deterministic child-scope fallback."
                : "Collapsed scope refinement returned an empty nodeIds array; used deterministic child-scope fallback."),
          );
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
  recentConversation: string,
  books: RuntimeBook[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
  deterministicById: Map<string, ScoredEntry>,
  trace: TraversalTraceStep[],
): Promise<{ scopes: TraversalScope[]; fallbackPath: string[]; selectionReason: string }> {
  const rootScopes = books.map((book) => ({ book, nodeId: book.tree.rootId }));
  const fallbackPath: string[] = [];
  let scopes: TraversalScope[] = [];
  let selectionReason = "Controller selected traversal scopes.";

  if (allowController) {
    const response = await runControllerJson(
      buildInitialScopePrompt(recentConversation, buildFullTraversalTreeOverview(rootScopes)),
      controller,
      RETRIEVAL_SCOPE_SYSTEM_PROMPT,
      "Choose traversal scopes",
    );
    const requestedNodeIds = Array.isArray(response.parsed?.nodeIds)
      ? response.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    scopes = resolveScopeChoices(requestedNodeIds, books);
    const controllerReason =
      typeof response.parsed?.reason === "string" && response.parsed.reason.trim()
        ? response.parsed.reason.trim()
        : "Controller selected traversal scopes.";
    if (scopes.length) {
      selectionReason = controllerReason;
    } else {
      fallbackPath.push(
        response.error ??
          (requestedNodeIds.length
            ? "Traversal scope selection returned nodeIds that did not map to visible scopes; used top-level deterministic scope fallback."
            : "Traversal scope selection returned an empty nodeIds array; used top-level deterministic scope fallback."),
      );
      scopes = chooseDeterministicScopes(rootScopes, deterministicById, config);
      selectionReason = fallbackPath[fallbackPath.length - 1];
    }
  } else {
    fallbackPath.push("Traversal scope selection skipped the controller and used top-level deterministic scope fallback.");
    scopes = chooseDeterministicScopes(rootScopes, deterministicById, config);
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
        buildChildScopePrompt(recentConversation, scopes, categories, step, config),
        controller,
        RETRIEVAL_SCOPE_SYSTEM_PROMPT,
        "Refine traversal scopes",
      );
      const requestedNodeIds = Array.isArray(response.parsed?.nodeIds)
        ? response.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      nextScopes = resolveScopeChoices(requestedNodeIds, books);
      nextReason =
        typeof response.parsed?.reason === "string" && response.parsed.reason.trim()
          ? response.parsed.reason.trim()
          : "Traversal scope refinement narrowed the current scopes.";
      const action = typeof response.parsed?.action === "string" ? response.parsed.action.trim().toLowerCase() : "retrieve";
      if (!nextScopes.length) {
        fallbackPath.push(
          response.error ??
            (requestedNodeIds.length
              ? "Traversal scope refinement returned nodeIds that did not map to current child scopes; used deterministic child-scope fallback."
              : "Traversal scope refinement returned an empty nodeIds array; used deterministic child-scope fallback."),
        );
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
  recentConversation: string,
  scopes: TraversalScope[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
  deterministicById: Map<string, ScoredEntry>,
  trace: TraversalTraceStep[],
  maxDynamicEntries: number,
  excludedEntryIds: ReadonlySet<string> = EMPTY_ENTRY_ID_SET,
  feedback?: DynamicRetrievalFeedbackSnapshot,
): Promise<EntrySelectionResult> {
  const fallbackPath: string[] = [];
  let activeScopes = dedupeScopes(scopes);
  let selectionReason: string | null = null;
  const booksById = new Map(activeScopes.map((scope) => [scope.book.summary.id, scope.book]));
  const sceneAnchors = buildDirectMentionCandidates(
    recentConversation,
    Array.from(deterministicById.values()),
    activeScopes,
    Math.min(SCENE_ANCHOR_LIMIT, maxDynamicEntries),
  ).map((candidate) => ({
    ...candidate,
    reasons: uniqueStrings([...candidate.reasons, "active_anchor"]),
  }));
  if (sceneAnchors.length) {
    const anchorScopes = sceneAnchors
      .map((anchor) => {
        const book = booksById.get(anchor.entry.worldBookId);
        if (!book) return null;
        const path = getEntryCategoryPath(book.tree, anchor.entry.entryId);
        const nodeId = path[path.length - 1]?.id ?? book.tree.rootId;
        return { book, nodeId };
      })
      .filter((scope): scope is TraversalScope => !!scope);
    activeScopes = dedupeScopes([...activeScopes, ...anchorScopes]);
    pushTrace(
      trace,
      "retrieve",
      "Seed active anchors",
      `Seeded ${sceneAnchors.length} directly mentioned active anchor candidate(s) from the current scene before selecting scoped support entries.`,
      { entryCount: sceneAnchors.length },
    );
  }

  const rawCandidates = collectCandidatesForScopes(
    recentConversation,
    activeScopes,
    [],
    deterministicById,
    !config.selectiveRetrieval,
    excludedEntryIds,
    feedback,
  );
  const rawCandidateById = new Map(rawCandidates.map((item) => [item.entry.entryId, item]));
  const supportSeeds = sceneAnchors.length
    ? sceneAnchors
    : rawCandidates.filter((candidate) => candidate.selectionRole === "active_anchor");
  for (const anchor of sceneAnchors) {
    const existing = rawCandidateById.get(anchor.entry.entryId);
    rawCandidateById.set(
      anchor.entry.entryId,
      existing
        ? {
            ...existing,
            score: Math.max(existing.score, anchor.score),
            reasons: uniqueStrings([...existing.reasons, ...anchor.reasons]),
            selectionRole: existing.selectionRole ?? anchor.selectionRole,
          }
        : anchor,
    );
  }
  const relatedSupport = buildRelatedSupportCandidates(
    supportSeeds,
    Array.from(booksById.values()),
    excludedEntryIds,
    new Set(supportSeeds.map((candidate) => candidate.entry.entryId)),
    feedback,
    Math.min(RELATED_SUPPORT_LIMIT, Math.max(0, maxDynamicEntries - sceneAnchors.length)),
  );
  if (relatedSupport.length) {
    for (const candidate of relatedSupport) {
      rawCandidateById.set(candidate.entry.entryId, candidate);
    }
    const relatedScopes = relatedSupport
      .map((candidate) => {
        const book = booksById.get(candidate.entry.worldBookId);
        if (!book) return null;
        const path = getEntryCategoryPath(book.tree, candidate.entry.entryId);
        const nodeId = path[path.length - 1]?.id ?? book.tree.rootId;
        return { book, nodeId };
      })
      .filter((scope): scope is TraversalScope => !!scope);
    activeScopes = dedupeScopes([...activeScopes, ...relatedScopes]);
    pushTrace(
      trace,
      "retrieve",
      "Expand related support",
      `Selected active entries referenced ${relatedSupport.length} related support candidate(s) from their own lore content.`,
      { entryCount: relatedSupport.length },
    );
  }
  const mergedRawCandidates = Array.from(rawCandidateById.values());
  const rankedCandidates = rankSelectionCandidates(recentConversation, mergedRawCandidates, activeScopes);
  const candidates = rankedCandidates.map((item) => ({ ...item.candidate, selectionRole: item.selectionRole }));
  const eligibleCandidates = filterDynamicInjectionCandidates(candidates);
  const manifests = buildScopedManifests(eligibleCandidates, activeScopes);

  if (!candidates.length) {
    pushTrace(trace, "fallback", "No scoped entries", "The chosen scopes did not resolve any candidate entries.");
    return {
      scopes: activeScopes,
      selected: [],
      candidates,
      manifests,
      fallbackPath: [...fallbackPath, "Chosen scopes did not resolve any candidate entries."],
      selectionReason,
    };
  }

  let selected: ScoredEntry[];
  if (config.selectiveRetrieval) {
    const beforeCalls = controller.callCount;
    const rankedSceneAnchors = buildDeterministicSelection(
      rankSelectionCandidates(recentConversation, sceneAnchors, activeScopes),
      Math.min(maxDynamicEntries, sceneAnchors.length),
    );
    const sceneAnchorIds = new Set(rankedSceneAnchors.map((item) => item.entry.entryId));
    const supportCandidates = eligibleCandidates.filter((item) => !sceneAnchorIds.has(item.entry.entryId));
    const remainingSupportSlots = Math.max(0, maxDynamicEntries - rankedSceneAnchors.length);
    const supportSelectionLimit = config.selectiveRetrieval
      ? Math.min(remainingSupportSlots, SELECTIVE_FALLBACK_LIMIT)
      : remainingSupportSlots;
    const supportSelected =
      supportSelectionLimit > 0
        ? await maybeSelectEntries(
            recentConversation,
            supportCandidates,
            config,
            controller,
            allowController,
            activeScopes,
            supportSelectionLimit,
          )
        : [];
    selected = [...rankedSceneAnchors, ...supportSelected].slice(0, maxDynamicEntries);
    if (controller.callCount === beforeCalls && !allowController) {
      fallbackPath.push("Selective manifest selection skipped the controller and used deterministic scoped fallback.");
    }
    const selectedAnchorCount = selected.filter((item) => sceneAnchorIds.has(item.entry.entryId)).length;
    const anchorSummary = selectedAnchorCount ? `, including ${selectedAnchorCount} active anchor(s),` : ",";
    pushTrace(
      trace,
      "manifest_select",
      "Select manifest entries",
      `Scoped manifests exposed ${candidates.length} candidate entr${candidates.length === 1 ? "y" : "ies"} across ${Math.max(manifests.length, 1)} chosen scope(s)${anchorSummary} and ${selected.length} final dynamic entry candidate(s) were selected for injection (cap ${maxDynamicEntries}).`,
      { entryCount: selected.length },
    );
  } else {
    selected = eligibleCandidates;
    pushTrace(
      trace,
      "retrieve",
      "Resolve scoped entries",
      `Resolved ${selected.length} scoped entry candidate(s) directly from ${Math.max(activeScopes.length, 1)} chosen scope(s).`,
      { entryCount: selected.length },
    );
  }

  return { scopes: activeScopes, selected, candidates, manifests, fallbackPath, selectionReason };
}

function rescoreEntries(
  queryText: string,
  candidates: ScoredEntry[],
  booksById: Map<string, RuntimeBook>,
  feedback?: DynamicRetrievalFeedbackSnapshot,
): ScoredEntry[] {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  if (!normalized || !queryTokens.length || !candidates.length) return [];

  return candidates
    .map((candidate) => {
      const book = booksById.get(candidate.entry.worldBookId);
      if (!book) return null;
      return scoreEntry(candidate.entry, book.tree, queryText, queryTokens, feedback);
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
  const rootScopes = dedupeScopes(scopes.filter((scope) => scope.nodeId === scope.book.tree.rootId));
  const multiBook = rootScopes.length > 1;

  const pushNode = (book: RuntimeBook, nodeId: string, depth: number): void => {
    const visitKey = `${book.summary.id}:${nodeId}`;
    if (visitedNodes.has(visitKey)) return;
    visitedNodes.add(visitKey);

    const node = book.tree.nodes[nodeId];
    if (!node) return;

    const indent = "  ".repeat(depth);
    const type = node.childIds.length ? "branch" : "leaf";
    lines.push(
      `${indent}- choiceId=${makeCategoryChoiceId(book.summary.id, node.id)}; label=${node.label || "Unnamed"}; type=${type}; descendantEntries=${getScopedEntryIds(book, node.id, true).length}`,
    );
    if (node.summary?.trim()) {
      lines.push(`${indent}  ${truncateText(node.summary.trim(), 180)}`);
    }

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
      if (multiBook) {
        lines.push(
          `- choiceId=${makeDocumentChoiceId(scope.book.summary.id)}; label=${scope.book.summary.name}; type=document; descendantEntries=${scope.book.cache.entries.length}`,
        );
      } else {
        lines.push(`Lorebook: ${scope.book.summary.name}`);
      }
      const rootSummary = truncateText(
        scopeNode.summary || scope.book.config.description || scope.book.summary.description || "",
        180,
      );
      if (rootSummary) {
        lines.push(`  ${rootSummary}`);
      }
      if (scope.book.tree.unassignedEntryIds.length) {
        lines.push(
          `  - choiceId=${makeCategoryChoiceId(scope.book.summary.id, scope.book.tree.rootId)}; label=ROOT; type=leaf; descendantEntries=${scope.book.tree.unassignedEntryIds.length}`,
        );
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
    mode: "tree",
    scopeLabel: scopes
      .map((scope) => {
        const node = scope.book.tree.nodes[scope.nodeId];
        if (!node || scope.nodeId === scope.book.tree.rootId) return scope.book.summary.name;
        return `${scope.book.summary.name} :: ${node.label}`;
      })
      .join(" | "),
    fullTreeOverview: showAllCurrentCategories ? buildFullTraversalTreeOverview(scopes) : "",
    searchResults: [],
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

function buildSearchTraversalFrontier(
  queryText: string,
  results: ScoredEntry[],
  booksById: Map<string, RuntimeBook>,
): TraversalFrontier {
  const searchResults = results.slice(0, TRAVERSAL_SEARCH_LIMIT).map((item) => {
    const book = booksById.get(item.entry.worldBookId);
    return {
      choiceId: makeEntryChoiceId(item.entry.entryId),
      entry: item,
      breadcrumb: book ? getEntryBreadcrumb(item.entry, book.tree) : item.entry.label,
      summary: truncateText(item.entry.summary || item.entry.label, 140),
      preview: truncateText(getEntryBody(item.entry), 180),
    };
  });

  return {
    mode: "search",
    scopeLabel: "Global search frontier",
    categories: [],
    searchResults,
    fullTreeOverview: "",
    searchQuery: queryText,
    totalResults: results.length,
  };
}

function buildCandidatePoolPromptSummary(candidatePool: ScoredEntry[]): string[] {
  if (!candidatePool.length) return ["Accumulated candidate pool: 0 dynamic candidates."];
  const topCandidates = [...candidatePool]
    .sort(
      (left, right) =>
        Number(right.reasons.includes("active_anchor")) - Number(left.reasons.includes("active_anchor")) ||
        right.score - left.score ||
        left.entry.label.localeCompare(right.entry.label),
    )
    .slice(0, 8);
  return [
    `Accumulated candidate pool: ${candidatePool.length} dynamic candidate${candidatePool.length === 1 ? "" : "s"}.`,
    "Top pooled candidates:",
    ...topCandidates.map(
      (item) =>
        `- ${item.entry.label} (${item.entry.worldBookName}); score=${item.score.toFixed(2)}; reasons=${item.reasons.join(", ")}; summary=${truncateText(
          item.entry.summary || getEntryBody(item.entry),
          120,
        )}`,
    ),
  ];
}

function buildTraversalPrompt(
  queryText: string,
  frontier: TraversalFrontier,
  step: number,
  config: CharacterRetrievalConfig,
  candidatePool: ScoredEntry[] = [],
): string {
  if (frontier.mode === "search") {
    return [
      "You are a retrieval assistant for a global lore search frontier.",
      'Return ONLY JSON in this exact shape: {"action":"retrieve|search|finish","choiceIds":["choice-id-1"],"query":"optional search query","reason":"brief explanation"}.',
      "Task:",
      "- Choose from the global search results below to resolve the best lore entries for the next response.",
      "Rules:",
      "- Use only choiceIds exactly as shown below.",
      "- Return the exact value after choiceId= with no brackets, labels, breadcrumbs, or explanations inside choiceIds.",
      "- Use action retrieve to add one or more shown entry results to the traversal candidate pool, then continue exploring.",
      '- Use action search to replace the current search frontier with a new global keyword search across all readable managed lorebooks. Include a short "query" string when you do this.',
      "- Use action finish when the candidate pool is ready for final manifest selection. If you include no choiceIds, all shown search results are added before finishing.",
      "- The candidate pool is additive. Retrieve only missing context; finish once the pool contains enough candidates for final entry selection.",
      "- Treat directly mentioned active anchors already in the candidate pool as relevant; use search retrieval to add missing named entities or support lore.",
      "- Pick 1-5 choiceIds maximum when using retrieve.",
      "- Do not invent new choiceIds or entry IDs.",
      `- Stay within ${config.traversalStepLimit} total steps.`,
      "",
      buildPromptContext(queryText),
      `Traversal step: ${step + 1} of ${config.traversalStepLimit}`,
      `Current frontier: global search${frontier.searchQuery ? ` for "${frontier.searchQuery}"` : ""}`,
      `Global matches available: ${frontier.totalResults ?? frontier.searchResults.length}`,
      "",
      ...buildCandidatePoolPromptSummary(candidatePool),
      "",
      "Search result choices:",
      ...(frontier.searchResults.length
        ? frontier.searchResults.map(
            (result) =>
              `- choiceId=${result.choiceId}; label=${result.entry.entry.label}; book=${result.entry.entry.worldBookName}; breadcrumb=${result.breadcrumb}; score=${result.entry.score.toFixed(
                2,
              )}; reasons=${result.entry.reasons.join(", ")}; summary=${result.summary}; preview=${result.preview}`,
          )
        : ["- none"]),
    ].join("\n");
  }

  const hasFullTreeOverview = frontier.fullTreeOverview.trim().length > 0;
  return [
    "You are a retrieval assistant for a hierarchical knowledge tree.",
    'Return ONLY JSON in this exact shape: {"action":"navigate|retrieve|search|finish","choiceIds":["choice-id-1"],"query":"optional search query","reason":"brief explanation"}.',
    "Task:",
    "- Pick the most relevant traversal choices from the tree to retrieve for the next response.",
    "Rules:",
    "- Pick 1-5 choiceIds maximum and prefer specific branches over broad branches.",
    "- Return the exact value after choiceId= with no brackets, labels, breadcrumbs, or explanations inside choiceIds.",
    hasFullTreeOverview
      ? "- The full tree index below already includes categories from across the selected books. You may choose choiceIds from anywhere in that index."
      : "- Choose choiceIds only from the category list shown below.",
    "- Use action navigate when a shown category or document root still needs to be opened before retrieval.",
    "- Use action retrieve to add one or more shown categories to the traversal candidate pool, then continue exploring.",
    "- Do not use retrieve with empty choiceIds from a broad or root tree frontier; navigate to specific shown categories or search first.",
    "- Use retrieve on broad parent categories only when you truly need a manifest from the whole branch; otherwise navigate to specific child categories.",
    "- The candidate pool is additive. Avoid retrieving child scopes that are already covered by a retrieved parent unless they add missing specificity.",
    '- Use action search to run a global keyword search across all readable managed lorebooks when the shown tree choices do not clearly expose the needed concept. Include a short "query" string when you do this.',
    "- Use action finish when the candidate pool is ready for final manifest selection. Include choiceIds if unretrieved shown categories should be added before finishing.",
    "- Do not pick entries directly from this tree frontier. Exact entry selection happens later after scope retrieval or search.",
    "- Pick tree choices whose content would be most useful for the next response.",
    "- Preserve directly mentioned active anchors already in the candidate pool; retrieve additional branches for missing named entities or support lore.",
    "- Do not replace active cast, place, object, or faction entries with abstract mechanics; mechanics should supplement the active anchors.",
    "- Consider world info, rules, places, systems, organizations, incidents, abilities, or factions when they matter to the scene, not just named people.",
    "- Do not stop at Characters if other categories better explain powers, organizations, command response, locations, vehicles, rules, or ongoing incidents.",
    `- Stay within ${config.traversalStepLimit} total steps.`,
    "",
    buildPromptContext(queryText),
    `Traversal step: ${step + 1} of ${config.traversalStepLimit}`,
    `Current scope: ${frontier.scopeLabel || "All selected books"}`,
    "",
    ...buildCandidatePoolPromptSummary(candidatePool),
    "",
    hasFullTreeOverview ? "Full tree index:" : "Category choices:",
    ...(hasFullTreeOverview
      ? [frontier.fullTreeOverview]
      : frontier.categories.length
        ? frontier.categories.map((category) =>
            `- choiceId=${category.choiceId}; label=${category.label}; depth=${category.depth}; childCategories=${category.childCount}; descendantEntries=${category.entryCount}; summary=${category.summary || "No summary."}`,
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

async function selectTraversalEntries(
  queryText: string,
  books: RuntimeBook[],
  initialScopes: TraversalScope[],
  config: CharacterRetrievalConfig,
  controller: ControllerSession,
  allowController: boolean,
  deterministicById: Map<string, ScoredEntry>,
  trace: TraversalTraceStep[],
  maxDynamicEntries: number,
  excludedEntryIds: ReadonlySet<string> = EMPTY_ENTRY_ID_SET,
  feedback?: DynamicRetrievalFeedbackSnapshot,
): Promise<TraversalSelectionResult> {
  const deterministic = Array.from(deterministicById.values());
  const booksById = new Map(books.map((book) => [book.summary.id, book]));
  let scopes = dedupeScopes(initialScopes);
  let activeSelectionQuery = queryText;
  let searchFrontier: TraversalSearchFrontier | null = null;
  const searchEvents: RetrievalSearchEvent[] = [];
  const steps = [`Traversal started from ${scopes.length} root scope(s).`];
  let selectionReason: string | null = null;
  let usedSearchFrontier = false;
  const candidatePoolById = new Map<string, ScoredEntry>();
  const sceneAnchorsById = new Map<string, ScoredEntry>();
  let retrievedScopes: TraversalScope[] = [];

  const getCandidatePool = (): ScoredEntry[] => Array.from(candidatePoolById.values());
  const getCollapsedFallbackSelection = (): ScoredEntry[] => {
    const limit = config.selectiveRetrieval ? Math.min(maxDynamicEntries, SELECTIVE_FALLBACK_LIMIT) : maxDynamicEntries;
    return buildDeterministicSelection(
      rankSelectionCandidates(queryText, deterministic, retrievedScopes.length ? retrievedScopes : scopes),
      limit,
    );
  };

  const mergeCandidate = (candidate: ScoredEntry): void => {
    const existing = candidatePoolById.get(candidate.entry.entryId);
    if (!existing) {
      candidatePoolById.set(candidate.entry.entryId, candidate);
      return;
    }
    candidatePoolById.set(candidate.entry.entryId, {
      ...existing,
      score: Math.max(existing.score, candidate.score),
      reasons: uniqueStrings([...existing.reasons, ...candidate.reasons]),
      selectionRole: existing.selectionRole ?? candidate.selectionRole,
    });
  };

  const getEntryPrimaryScope = (entry: ScoredEntry["entry"]): TraversalScope | null => {
    const book = booksById.get(entry.worldBookId);
    if (!book) return null;
    const path = getEntryCategoryPath(book.tree, entry.entryId);
    const nodeId = path[path.length - 1]?.id ?? book.tree.rootId;
    return { book, nodeId };
  };

  const addCandidatesToPool = (candidates: ScoredEntry[], candidateScopes: TraversalScope[]): void => {
    for (const candidate of candidates) mergeCandidate(candidate);
    if (candidateScopes.length) {
      retrievedScopes = dedupeScopes([...retrievedScopes, ...candidateScopes]);
    }
  };

  const addSearchCandidatesToPool = (candidates: ScoredEntry[]): void => {
    const candidateScopes = candidates
      .map((candidate) => getEntryPrimaryScope(candidate.entry))
      .filter((scope): scope is TraversalScope => !!scope);
    addCandidatesToPool(candidates, candidateScopes);
  };

  const resolveDirectEntryChoices = (choiceIds: string[]): ScoredEntry[] => {
    const byId = new Map(deterministicById);
    for (const [entryId, candidate] of candidatePoolById) byId.set(entryId, candidate);
    const entryIds = uniqueStrings(
      choiceIds
        .flatMap(expandChoiceIdVariants)
        .map((choiceId) => parseEntryChoiceId(choiceId) ?? choiceId)
        .filter((entryId) => byId.has(entryId)),
    );
    return collectEntriesByIds(entryIds, byId);
  };

  const seedSceneAnchors = (): void => {
    const anchors = buildDirectMentionCandidates(
      queryText,
      deterministic,
      [],
      Math.min(SCENE_ANCHOR_LIMIT, maxDynamicEntries),
    ).map((candidate) => ({
      ...candidate,
      reasons: uniqueStrings([...candidate.reasons, "active_anchor"]),
    }));
    if (!anchors.length) return;

    for (const anchor of anchors) {
      sceneAnchorsById.set(anchor.entry.entryId, anchor);
    }
    addSearchCandidatesToPool(anchors);
    pushTrace(
      trace,
      "retrieve",
      "Seed active anchors",
      `Seeded ${anchors.length} directly mentioned active anchor candidate(s) from the current scene into the traversal pool before exploring support lore.`,
      { entryCount: anchors.length },
    );
    steps.push(`Traversal seeded ${anchors.length} directly mentioned active anchor candidate(s).`);
  };

  const isBroadScopeSet = (targetScopes: TraversalScope[]): boolean =>
    targetScopes.some((scope) => {
      const node = scope.book.tree.nodes[scope.nodeId];
      if (!node) return false;
      const descendantCount = getScopedEntryIds(scope.book, scope.nodeId, true).length;
      return node.childIds.length > 0 || descendantCount > Math.max(maxDynamicEntries, config.maxResults, 8);
    });

  const navigateBroadImplicitRetrieve = (reason: string, durationMs: number | null): boolean => {
    const nextScopes = chooseDeterministicScopes(scopes, deterministicById, config);
    if (!nextScopes.length || areSameScopes(scopes, nextScopes)) return false;
    scopes = nextScopes;
    searchFrontier = null;
    selectionReason = reason;
    pushTrace(
      trace,
      "navigate",
      "Avoid broad retrieve",
      `${reason} The controller requested the current broad scope without choiceIds, so Lore Recall opened ${nextScopes.length} narrower branch(es) instead of pooling the entire scope.`,
      {
        bookId: nextScopes[0]?.book.summary.id ?? null,
        nodeId: nextScopes[0]?.nodeId ?? null,
        durationMs,
      },
    );
    steps.push(`Traversal avoided broad current-scope retrieval and opened ${nextScopes.length} narrower branch(es).`);
    return true;
  };

  const buildFinalCandidateSet = (): ScoredEntry[] => {
    const pooled = getCandidatePool();
    if (!pooled.length) return [];
    const directMentionCandidates = buildDirectMentionCandidates(
      queryText,
      pooled,
      retrievedScopes,
      Math.min(DIRECT_MENTION_SEED_LIMIT, maxDynamicEntries),
    );
    const directMentionById = new Map(directMentionCandidates.map((item) => [item.entry.entryId, item]));
    const combined = pooled.map((item) => directMentionById.get(item.entry.entryId) ?? item);
    const ranked = rankSelectionCandidates(queryText, combined, retrievedScopes);
    const limit = Math.min(maxDynamicEntries, combined.length);
    return buildDeterministicSelection(ranked, limit);
  };

  const finalizeAccumulatedSelection = async (
    reason: string,
    label: string,
    durationMs: number | null,
  ): Promise<TraversalSelectionResult> => {
    let pooledCandidates = getCandidatePool();
    const supportSeeds = sceneAnchorsById.size
      ? Array.from(sceneAnchorsById.values())
      : pooledCandidates.filter((candidate) => candidate.selectionRole === "active_anchor");
    const relatedSupport = buildRelatedSupportCandidates(
      supportSeeds,
      books,
      excludedEntryIds,
      new Set(supportSeeds.map((candidate) => candidate.entry.entryId)),
      feedback,
      Math.min(RELATED_SUPPORT_LIMIT, Math.max(0, maxDynamicEntries - supportSeeds.length)),
    );
    if (relatedSupport.length) {
      addSearchCandidatesToPool(relatedSupport);
      pooledCandidates = getCandidatePool();
      pushTrace(
        trace,
        "retrieve",
        "Expand related support",
        `Selected active entries referenced ${relatedSupport.length} related support candidate(s) from their own lore content.`,
        { entryCount: relatedSupport.length, durationMs },
      );
      steps.push(`Traversal expanded ${relatedSupport.length} related support candidate(s) from selected entry content.`);
    }
    const finalScopes = dedupeScopes(retrievedScopes);
    const manifestCandidates = buildFinalCandidateSet();
    const rankedSceneAnchors = buildDeterministicSelection(
      rankSelectionCandidates(queryText, Array.from(sceneAnchorsById.values()), finalScopes),
      Math.min(maxDynamicEntries, sceneAnchorsById.size),
    );
    const sceneAnchorIds = new Set(rankedSceneAnchors.map((item) => item.entry.entryId));
    const supportManifestCandidates = manifestCandidates.filter((item) => !sceneAnchorIds.has(item.entry.entryId));
    const finalCandidatePool = [
      ...rankedSceneAnchors,
      ...supportManifestCandidates.slice(0, Math.max(0, maxDynamicEntries - rankedSceneAnchors.length)),
    ];
    const manifests = buildScopedManifests(finalCandidatePool, finalScopes);

    if (!pooledCandidates.length || !finalCandidatePool.length) {
      pushTrace(
        trace,
        "finish",
        label,
        `${reason} Exploration finished without accumulated dynamic candidates.`,
        { entryCount: 0, durationMs },
      );
      return {
        scopes: finalScopes.length ? finalScopes : scopes,
        selected: [],
        candidates: pooledCandidates,
        manifests,
        retrievedScopes: finalScopes,
        fallbackReason: null,
        selectionReason: reason,
        usedSearchFrontier,
        searchEvents,
        steps: [...steps, "Traversal finished with no accumulated dynamic candidates."],
        trace,
      };
    }

    const remainingSupportSlots = Math.max(0, maxDynamicEntries - rankedSceneAnchors.length);
    const supportSelectionLimit = config.selectiveRetrieval
      ? Math.min(remainingSupportSlots, SELECTIVE_FALLBACK_LIMIT)
      : remainingSupportSlots;
    const selectedSupport =
      config.selectiveRetrieval && supportSelectionLimit > 0
        ? await maybeSelectEntries(
            queryText,
            supportManifestCandidates,
            config,
            controller,
            allowController,
            finalScopes,
            supportSelectionLimit,
          )
        : config.selectiveRetrieval
          ? []
          : supportManifestCandidates.slice(0, supportSelectionLimit);
    const selected = [...rankedSceneAnchors, ...selectedSupport].slice(0, maxDynamicEntries);
    const selectedAnchorCount = selected.filter((item) => sceneAnchorIds.has(item.entry.entryId)).length;
    const anchorSummary = selectedAnchorCount ? `, including ${selectedAnchorCount} active anchor(s)` : "";

    pushTrace(
      trace,
      "finish",
      label,
      `${reason} Exploration accumulated ${pooledCandidates.length} dynamic candidate(s) across ${Math.max(finalScopes.length, 1)} retrieved scope(s).`,
      { entryCount: pooledCandidates.length, durationMs },
    );
    pushTrace(
      trace,
      "manifest_select",
      "Select accumulated entries",
      `Final manifest selection kept ${selected.length} dynamic entry candidate(s)${anchorSummary} from ${pooledCandidates.length} pooled candidate(s).`,
      { entryCount: selected.length },
    );

    return {
      scopes: finalScopes.length ? finalScopes : scopes,
      selected,
      candidates: pooledCandidates,
      manifests,
      retrievedScopes: finalScopes,
      fallbackReason: null,
      selectionReason: reason,
      usedSearchFrontier,
      searchEvents,
      steps: [
        ...steps,
        `Traversal accumulated ${pooledCandidates.length} pulled candidate(s).`,
        `Final manifest selection kept ${selected.length} dynamic entry candidate(s).`,
      ],
      trace,
    };
  };

  if (!deterministic.length) {
    pushTrace(trace, "fallback", "No traversal candidates", "Traversal found no scored entries, so nothing was injected.");
    return {
      scopes,
      selected: [],
      candidates: [],
      manifests: [],
      retrievedScopes: [],
      fallbackReason: "Traversal found no scored entries, so nothing was injected.",
      selectionReason,
      usedSearchFrontier: false,
      searchEvents,
      steps: ["No traversal candidates scored above zero."],
      trace,
    };
  }

  seedSceneAnchors();

  if (!allowController) {
    const fallbackSelection = await selectEntriesForScopes(
      queryText,
      scopes,
      config,
      controller,
      false,
      deterministicById,
      trace,
      maxDynamicEntries,
      excludedEntryIds,
      feedback,
    );
    pushTrace(
      trace,
      "fallback",
      "Traversal controller skipped",
      "Fast preview mode skipped traversal controller selection and used deterministic fallback results.",
      { entryCount: fallbackSelection.selected.length },
    );
    return {
      scopes: fallbackSelection.scopes,
      selected: fallbackSelection.selected,
      candidates: fallbackSelection.candidates,
      manifests: fallbackSelection.manifests,
      retrievedScopes: fallbackSelection.scopes,
      fallbackReason: "Fast preview skipped traversal controller selection and used deterministic fallback results.",
      selectionReason: fallbackSelection.selectionReason,
      usedSearchFrontier: false,
      searchEvents,
      steps: ["Fast preview mode skipped controller-driven traversal."],
      trace,
    };
  }

  for (let step = 0; step < config.traversalStepLimit; step += 1) {
    const frontier = searchFrontier
      ? buildSearchTraversalFrontier(searchFrontier.query, searchFrontier.results, booksById)
      : buildTraversalFrontier(scopes, deterministicById, config, null, step);

    if (frontier.mode === "tree" && !frontier.categories.length) {
      const autoSelected = collectCandidatesForScopes(
        queryText,
        scopes,
        [],
        deterministicById,
        false,
        excludedEntryIds,
        feedback,
      );
      if (!autoSelected.length) {
        if (getCandidatePool().length) {
          return finalizeAccumulatedSelection("Traversal reached an empty frontier after retrieving candidates.", "Finish traversal", null);
        }
        pushTrace(trace, "fallback", "Empty frontier", "Traversal reached an empty frontier, so collapsed retrieval was used.");
        return {
          scopes,
          selected: getCollapsedFallbackSelection(),
          candidates: [],
          manifests: [],
          retrievedScopes: [],
          fallbackReason: "Traversal reached an empty frontier, so collapsed retrieval was used instead.",
          selectionReason,
          usedSearchFrontier: false,
          searchEvents,
          steps: [...steps, "Collapsed fallback used because traversal had no frontier choices."],
          trace,
        };
      }
      addCandidatesToPool(autoSelected, scopes);
      pushTrace(
        trace,
        "retrieve",
        "Retrieve current scope",
        `Current scope had no deeper categories, so Lore Recall added ${autoSelected.length} entry candidate(s) to the traversal pool.`,
        { entryCount: autoSelected.length },
      );
      steps.push(`Traversal added ${autoSelected.length} candidate(s) from the current scope.`);
      return finalizeAccumulatedSelection("Traversal reached a leaf frontier.", "Finish traversal", null);
    }

    if (frontier.mode === "search" && !frontier.searchResults.length) {
      if (getCandidatePool().length) {
        return finalizeAccumulatedSelection("Global search had no more results after retrieval.", "Finish traversal", null);
      }
      pushTrace(trace, "fallback", "Empty search frontier", "Global search did not expose any frontier choices, so collapsed retrieval was used.");
      return {
        scopes,
        selected: getCollapsedFallbackSelection(),
        candidates: [],
        manifests: [],
        retrievedScopes: [],
        fallbackReason: "Traversal search exposed no usable frontier choices, so collapsed retrieval was used instead.",
        selectionReason,
        usedSearchFrontier: true,
        searchEvents,
        steps: [...steps, "Collapsed fallback used because traversal search exposed no frontier choices."],
        trace,
      };
    }

    const response = await runControllerJson(
      buildTraversalPrompt(activeSelectionQuery, frontier, step, config, getCandidatePool()),
      controller,
      RETRIEVAL_TRAVERSAL_SYSTEM_PROMPT,
      "Traverse retrieval tree",
    );
    const fallbackReason = response.error ?? "Traversal controller returned no usable response.";
    if (!response.parsed) {
      if (getCandidatePool().length) {
        return finalizeAccumulatedSelection(`${fallbackReason} Finalizing accumulated traversal candidates.`, "Finish traversal", response.durationMs);
      }
      pushTrace(trace, "fallback", "Controller failed", fallbackReason);
      return {
        scopes,
        selected: getCollapsedFallbackSelection(),
        candidates: [],
        manifests: [],
        retrievedScopes: [],
        fallbackReason: `${fallbackReason} Collapsed retrieval was used instead.`,
        selectionReason,
        usedSearchFrontier: usedSearchFrontier || !!searchFrontier,
        searchEvents,
        steps: [...steps, "Collapsed fallback used because traversal controller output was invalid."],
        trace,
      };
    }

    const action = typeof response.parsed.action === "string" ? response.parsed.action.trim().toLowerCase() : "";
    const choiceIds = Array.isArray(response.parsed.choiceIds)
      ? response.parsed.choiceIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : Array.isArray(response.parsed.nodeIds)
      ? response.parsed.nodeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const reason =
      typeof response.parsed.reason === "string" && response.parsed.reason.trim()
        ? response.parsed.reason.trim()
        : "No controller reason provided.";

    if (action === "navigate") {
      if (frontier.mode !== "tree") {
        if (getCandidatePool().length) {
          return finalizeAccumulatedSelection("Controller tried to navigate from a search-result frontier after accumulating candidates.", "Finish traversal", response.durationMs);
        }
        pushTrace(trace, "fallback", "Invalid navigate", "Controller tried to navigate from a search-result frontier.");
        return {
          scopes,
          selected: getCollapsedFallbackSelection(),
          candidates: [],
          manifests: [],
          retrievedScopes: [],
          fallbackReason: "Traversal controller tried to navigate from a search-result frontier, so collapsed retrieval was used instead.",
          selectionReason,
          usedSearchFrontier: true,
          searchEvents,
          steps: [...steps, "Collapsed fallback used because navigation was requested from a search-result frontier."],
          trace,
        };
      }
      const nextScopes = resolveTraversalChoiceScopes(choiceIds, booksById);

      if (!nextScopes.length) {
        if (getCandidatePool().length) {
          return finalizeAccumulatedSelection(
            `Controller picked no valid traversal branches after accumulating candidates. Unresolved choiceIds: ${formatChoiceIdList(choiceIds)}.`,
            "Finish traversal",
            response.durationMs,
          );
        }
        pushTrace(trace, "fallback", "Invalid navigate", `Controller picked no valid traversal branches. Unresolved choiceIds: ${formatChoiceIdList(choiceIds)}.`);
        return {
          scopes,
          selected: getCollapsedFallbackSelection(),
          candidates: [],
          manifests: [],
          retrievedScopes: [],
          fallbackReason: "Traversal controller chose no valid branches, so collapsed retrieval was used instead.",
          selectionReason,
          usedSearchFrontier: usedSearchFrontier || !!searchFrontier,
          searchEvents,
          steps: [...steps, "Collapsed fallback used because no valid traversal branch was selected."],
          trace,
        };
      }

      scopes = nextScopes;
      searchFrontier = null;
      selectionReason = reason;
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
      const rescored = scoreEntries(searchQuery, books, excludedEntryIds, feedback);
      const frontierResults = rescored.slice(0, Math.max(TRAVERSAL_SEARCH_LIMIT, maxDynamicEntries * 3));
      if (!frontierResults.length) {
        if (getCandidatePool().length) {
          return finalizeAccumulatedSelection(`Search "${searchQuery}" found no additional results.`, "Finish traversal", response.durationMs);
        }
        pushTrace(trace, "fallback", "Search found nothing", `Search "${searchQuery}" found no global traversal matches.`);
        return {
          scopes,
          selected: getCollapsedFallbackSelection(),
          candidates: [],
          manifests: [],
          retrievedScopes: [],
          fallbackReason: `Traversal search "${searchQuery}" found no usable global results, so collapsed retrieval was used instead.`,
          selectionReason,
          usedSearchFrontier: true,
          searchEvents,
          steps: [...steps, `Collapsed fallback used because traversal search "${searchQuery}" found nothing.`],
          trace,
        };
      }
      searchFrontier = { query: searchQuery, results: frontierResults };
      activeSelectionQuery = searchQuery;
      usedSearchFrontier = true;
      const previewMatches = buildPreviewNodes(frontierResults.slice(0, Math.min(frontierResults.length, 8)), booksById);
      const searchSummary = `${reason} Global search matched ${rescored.length} entry result${rescored.length === 1 ? "" : "s"} across ${books.length} readable managed book${books.length === 1 ? "" : "s"}.`;
      searchEvents.push({
        query: searchQuery,
        global: true,
        resultCount: rescored.length,
        summary: searchSummary,
        matches: previewMatches,
      });
      pushTrace(
        trace,
        "search",
        `Search: ${searchQuery}`,
        `${reason} Global search built a temporary frontier of ${frontierResults.length} entry result choice(s) from ${rescored.length} readable-book match(es).`,
        { entryCount: rescored.length, durationMs: response.durationMs },
      );
      emitProgress(controller.reportProgress, {
        type: "item",
        item: createFeedItem(
          "search",
          `Global search: ${searchQuery}`,
          `Built a ${frontierResults.length}-result frontier from ${rescored.length} global match${rescored.length === 1 ? "" : "es"}.`,
          {
            phase: "search",
            count: rescored.length,
            entries: previewMatches,
            searchQuery,
            searchGlobal: true,
            tone: "info",
            details: [
              `Reason: ${reason}`,
              `Readable managed books searched: ${books.length}`,
            ],
            durationMs: response.durationMs,
          },
        ),
      });
      continue;
    }

    if (action === "retrieve" || action === "finish") {
      if (frontier.mode === "search") {
        const frontierById = new Map(searchFrontier?.results.map((item) => [item.entry.entryId, item]) ?? []);
        const requestedEntryIds = uniqueStrings(
          choiceIds
            .flatMap(expandChoiceIdVariants)
            .map(parseEntryChoiceId)
            .filter((value): value is string => !!value),
        );
        const selectedCandidates = requestedEntryIds.length
          ? collectEntriesByIds(requestedEntryIds, frontierById)
          : searchFrontier?.results ?? [];
        if (!selectedCandidates.length) {
          if (getCandidatePool().length) {
            return finalizeAccumulatedSelection(
              `${reason} Search-result choices did not resolve after accumulating candidates.`,
              "Finish global search",
              response.durationMs,
            );
          }
          pushTrace(trace, "fallback", "Retrieve resolved nothing", "Traversal search frontier did not resolve any entry results.");
          return {
            scopes,
            selected: getCollapsedFallbackSelection(),
            candidates: [],
            manifests: [],
            retrievedScopes: [],
            fallbackReason: "Traversal search frontier returned no usable entries, so collapsed retrieval was used instead.",
            selectionReason,
            usedSearchFrontier: true,
            searchEvents,
            steps: [...steps, "Collapsed fallback used because traversal search results did not resolve any entries."],
            trace,
          };
        }

        addSearchCandidatesToPool(selectedCandidates);
        selectionReason = reason;
        pushTrace(
          trace,
          "retrieve",
          action === "finish" ? "Retrieve search results before finish" : "Retrieve search results",
          `${reason} Added ${selectedCandidates.length} search result candidate(s) to the traversal pool.`,
          { entryCount: selectedCandidates.length, durationMs: response.durationMs },
        );
        steps.push(`Traversal added ${selectedCandidates.length} candidate(s) from global search.`);

        searchFrontier = null;
        activeSelectionQuery = queryText;
        if (action === "finish") {
          return finalizeAccumulatedSelection(reason, "Finish global search", response.durationMs);
        }
        continue;
      }

      const requestedScopes = resolveTraversalChoiceScopes(choiceIds, booksById);
      if (choiceIds.length > 0 && !requestedScopes.length) {
        const directChoiceCandidates = resolveDirectEntryChoices(choiceIds);
        if (directChoiceCandidates.length) {
          addSearchCandidatesToPool(directChoiceCandidates);
          pushTrace(
            trace,
            "retrieve",
            "Recover direct entry choices",
            `${reason} The controller returned entry IDs while on a tree frontier, so Lore Recall recovered ${directChoiceCandidates.length} matching entry candidate(s) instead of falling back.`,
            { entryCount: directChoiceCandidates.length, durationMs: response.durationMs },
          );
          steps.push(`Traversal recovered ${directChoiceCandidates.length} direct entry candidate(s) from tree-frontier choiceIds.`);
          if (action === "finish") {
            return finalizeAccumulatedSelection(reason, "Finish traversal", response.durationMs);
          }
          continue;
        }
        if (getCandidatePool().length) {
          return finalizeAccumulatedSelection(
            `${reason} Tree choiceIds did not resolve after accumulating candidates. Unresolved choiceIds: ${formatChoiceIdList(choiceIds)}.`,
            "Finish traversal",
            response.durationMs,
          );
        }
        pushTrace(
          trace,
          "fallback",
          "Retrieve resolved no choices",
          `Traversal controller chose tree choiceIds that did not resolve to any category: ${formatChoiceIdList(choiceIds)}.`,
        );
        return {
          scopes,
          selected: getCollapsedFallbackSelection(),
          candidates: [],
          manifests: [],
          retrievedScopes: [],
          fallbackReason: "Traversal controller chose unknown tree choiceIds, so collapsed retrieval was used instead.",
          selectionReason,
          usedSearchFrontier,
          searchEvents,
          steps: [...steps, "Collapsed fallback used because traversal tree choiceIds did not resolve."],
          trace,
        };
      }
      const implicitCurrentScopeRetrieve = !requestedScopes.length && choiceIds.length === 0;
      if (implicitCurrentScopeRetrieve && isBroadScopeSet(scopes)) {
        if (action === "finish" && getCandidatePool().length) {
          return finalizeAccumulatedSelection(reason, "Finish traversal", response.durationMs);
        }
        if (navigateBroadImplicitRetrieve(reason, response.durationMs)) {
          continue;
        }
        if (getCandidatePool().length) {
          return finalizeAccumulatedSelection(reason, "Finish traversal", response.durationMs);
        }
        pushTrace(trace, "fallback", "Avoid broad retrieve", "Traversal controller requested the current broad scope without choiceIds, and no narrower branch was available.");
        return {
          scopes,
          selected: getCollapsedFallbackSelection(),
          candidates: [],
          manifests: [],
          retrievedScopes: [],
          fallbackReason: "Traversal controller requested an implicit broad retrieve, so collapsed retrieval was used instead.",
          selectionReason,
          usedSearchFrontier,
          searchEvents,
          steps: [...steps, "Collapsed fallback used because traversal requested an implicit broad retrieve."],
          trace,
        };
      }
      const scopesToRetrieve =
        requestedScopes.length
          ? requestedScopes
          : action === "finish" && getCandidatePool().length
            ? []
            : scopes;
      const selectedCandidates = scopesToRetrieve.length
        ? collectCandidatesForScopes(queryText, scopesToRetrieve, [], deterministicById, false, excludedEntryIds, feedback)
        : [];

      if (!selectedCandidates.length) {
        if (getCandidatePool().length) {
          return finalizeAccumulatedSelection(
            `${reason} Selected tree choices resolved no new entries after accumulating candidates.`,
            "Finish traversal",
            response.durationMs,
          );
        }
        pushTrace(trace, "fallback", "Retrieve resolved nothing", "Traversal did not resolve any entries from the selected choices.");
        return {
          scopes,
          selected: getCollapsedFallbackSelection(),
          candidates: [],
          manifests: [],
          retrievedScopes: [],
          fallbackReason: "Traversal controller returned no usable entries, so collapsed retrieval was used instead.",
          selectionReason,
          usedSearchFrontier,
          searchEvents,
          steps: [...steps, "Collapsed fallback used because traversal did not resolve any entries."],
          trace,
        };
      }

      addCandidatesToPool(selectedCandidates, scopesToRetrieve);
      selectionReason = reason;

      pushTrace(
        trace,
        "retrieve",
        action === "finish" ? "Retrieve entries before finish" : "Retrieve entries",
        `${reason} Added ${selectedCandidates.length} entry candidate(s) from ${Math.max(scopesToRetrieve.length, 1)} retrieval scope(s) to the traversal pool.`,
        { entryCount: selectedCandidates.length, durationMs: response.durationMs },
      );
      steps.push(`Traversal added ${selectedCandidates.length} candidate(s) from ${Math.max(scopesToRetrieve.length, 1)} scope(s).`);

      if (scopesToRetrieve.length) scopes = scopesToRetrieve;
      if (action === "finish") {
        return finalizeAccumulatedSelection(reason, "Finish traversal", response.durationMs);
      }
      continue;
    }

    if (getCandidatePool().length) {
      return finalizeAccumulatedSelection(`Traversal controller returned unsupported action "${action || "empty"}" after accumulating candidates.`, "Finish traversal", response.durationMs);
    }
    pushTrace(trace, "fallback", "Unknown action", `Traversal controller returned unsupported action "${action || "empty"}".`);
    return {
      scopes,
      selected: getCollapsedFallbackSelection(),
      candidates: [],
      manifests: [],
      retrievedScopes: [],
      fallbackReason: "Traversal controller returned an unsupported action, so collapsed retrieval was used instead.",
      selectionReason,
      usedSearchFrontier: usedSearchFrontier || !!searchFrontier,
      searchEvents,
      steps: [...steps, "Collapsed fallback used because traversal controller returned an unsupported action."],
      trace,
    };
  }

  if (getCandidatePool().length) {
    return finalizeAccumulatedSelection(
      `Traversal hit the ${config.traversalStepLimit}-step limit after accumulating candidates.`,
      "Finish traversal",
      null,
    );
  }

  pushTrace(trace, "fallback", "Step limit reached", `Traversal hit the ${config.traversalStepLimit}-step limit and fell back to collapsed retrieval.`);
  return {
    scopes,
    selected: getCollapsedFallbackSelection(),
    candidates: [],
    manifests: [],
    retrievedScopes: [],
    fallbackReason: `Traversal exhausted its ${config.traversalStepLimit}-step limit, so collapsed retrieval was used instead.`,
    selectionReason,
    usedSearchFrontier: usedSearchFrontier || !!searchFrontier,
    searchEvents,
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
      previewText: truncateText(getEntryInjectionBody(item.entry), 240),
      selectionRole: item.selectionRole,
    };
  });
}

function areSameScopes(left: TraversalScope[], right: TraversalScope[]): boolean {
  const leftKeys = left.map(makeScopeKey);
  const rightKeys = right.map(makeScopeKey);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

function buildInjectionText(
  selected: ScoredEntry[],
  booksById: Map<string, RuntimeBook>,
  injectedEntryLimit: number,
  collapsedDepth: number,
): { text: string; included: ScoredEntry[]; estimatedTokens: number } | null {
  if (!selected.length) return null;

  const maxEntries = Math.max(0, Math.floor(injectedEntryLimit));
  if (maxEntries <= 0) return null;
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
      branchSummary ? `Category summary: ${branchSummary}` : "",
      "Entry content:",
      getEntryInjectionBody(item.entry),
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
  const recentConversation = buildRecentConversation(messages, config.contextMessages) || queryText;
  if (!queryText.trim()) return null;

  const readableBooks = books.filter((book) => isReadableBook(book.config));
  if (!readableBooks.length) return null;

  const reportProgress = options.reportProgress;
  const startedAt = options.capturedAt ?? Date.now();
  emitProgress(reportProgress, {
    type: "start",
    mode: config.searchMode,
    timestamp: startedAt,
    label: "Start retrieval",
    summary: `Started ${config.searchMode} retrieval across ${readableBooks.length} readable book(s).`,
    details: [`Recent conversation: ${truncateText(recentConversation, 260)}`],
  });

  const controller: ControllerSession = {
    settings,
    userId,
    connectionId: resolveControllerConnectionId(settings, options.connectionId),
    controllerUsed: false,
    deadlineAt: Date.now() + CONTROLLER_TOTAL_BUDGET_MS,
    callCount: 0,
    reportProgress,
  };
  const chooseBooksStartedAt = Date.now();
  const chosenBooksResult = await maybeChooseBooks(recentConversation, readableBooks, config, controller, allowController);
  const chooseBooksDurationMs = Date.now() - chooseBooksStartedAt;
  const chosenBooks = chosenBooksResult.books;
  const steps = [
    `${books.length} managed book(s) loaded.`,
    `${chosenBooks.length} readable book(s) selected for search in ${chooseBooksDurationMs} ms.`,
  ];
  const booksById = new Map(readableBooks.map((book) => [book.summary.id, book]));
  const trace = createTraceBuffer(reportProgress);
  trace.push(...chosenBooksResult.trace);
  const reservedConstants = collectReservedConstantEntries(chosenBooks);
  const reservedConstantCount = reservedConstants.length;
  const reservedEntryIds = new Set(reservedConstants.map((item) => item.entry.entryId));
  const configuredInjectCap = clampInt(config.tokenBudget, 1, 64);
  const remainingDynamicSlots = configuredInjectCap;
  const maxDynamicEntries = getDynamicEntryLimit(config, remainingDynamicSlots);
  const reservedConstantNodes = buildPreviewNodes(reservedConstants, booksById);
  if (reservedConstantCount) {
    const reservedSummary = `Prepared ${reservedConstantCount} native constant entr${reservedConstantCount === 1 ? "y" : "ies"} for always-on injection; dynamic retrieval still has ${remainingDynamicSlots} slot(s).`;
    steps.push(reservedSummary);
    pushTrace(trace, "inject", "Reserve constants", reservedSummary, { entryCount: reservedConstantCount });
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem("reserved", "Reserved constants", reservedSummary, {
        phase: "inject",
        count: reservedConstantCount,
        entries: reservedConstantNodes,
        tone: "info",
      }),
    });
  } else {
    steps.push(`No native constant entries were prepared; ${remainingDynamicSlots} dynamic slot(s) are available.`);
  }
  const deterministic = scoreEntries(recentConversation, chosenBooks, reservedEntryIds, options.dynamicFeedback);
  const deterministicById = new Map(deterministic.map((item) => [item.entry.entryId, item]));
  let selectedScopes: TraversalScope[] = [];
  let pulledCandidates: ScoredEntry[] = [];
  let selected: ScoredEntry[] = [];
  let manifests: ScopedManifest[] = [];
  let searchEvents: RetrievalSearchEvent[] = [];
  let selectionReason = "";
  let entrySelectionDurationMs: number | null = null;
  let usedSearchFrontier = false;
  const fallbackPath: string[] = [];

  if (!deterministic.length) {
    fallbackPath.push("Deterministic scoring found no matching dynamic entries.");
    pushTrace(trace, "fallback", "No scored entries", fallbackPath[0]);
  } else {
    const scopeSelectionStartedAt = Date.now();
    const scopeSelection =
      config.searchMode === "traversal"
        ? {
            scopes: chosenBooks.map((book) => ({ book, nodeId: book.tree.rootId })),
            fallbackPath: [] as string[],
            selectionReason: "Exploratory traversal starts from selected book roots.",
          }
        : await chooseCollapsedScopes(recentConversation, chosenBooks, config, controller, allowController, deterministicById, trace);
    const scopeSelectionDurationMs = Date.now() - scopeSelectionStartedAt;
    const initiallySelectedScopes = scopeSelection.scopes;
    selectedScopes = scopeSelection.scopes;
    selectionReason = scopeSelection.selectionReason;
    fallbackPath.push(...scopeSelection.fallbackPath);
    if (config.searchMode === "traversal") {
      pushTrace(
        trace,
        "choose_scope",
        "Start exploratory traversal",
        `${selectionReason} Started from ${selectedScopes.length} root scope(s): ${buildTraceScopeSummary(selectedScopes)}.`,
        {
          bookId: selectedScopes[0]?.book.summary.id ?? null,
          nodeId: selectedScopes[0]?.nodeId ?? null,
          entryCount: selectedScopes.reduce((total, scope) => total + getScopedEntryIds(scope.book, scope.nodeId, true).length, 0),
        },
      );
      steps.push(`Exploratory traversal started from ${selectedScopes.length} root scope(s).`);
    } else {
      steps.push(`Node-first ${config.searchMode} retrieval selected ${selectedScopes.length} scope(s).`);
    }

    const initialSelectionReasons = new Map(
      selectedScopes.map((scope) => [makeScopeKey(scope), selectionReason]),
    );
    const initialScopePreviews = buildPreviewScopes(selectedScopes, new Map(), initialSelectionReasons);
    if (initialScopePreviews.length) {
      emitProgress(reportProgress, {
        type: "item",
        item: createFeedItem(
          "scope",
          "Selected scopes",
          `Working from ${initialScopePreviews.length} scope(s) across ${chosenBooks.length} readable book(s).`,
          {
            phase: "choose_scope",
            count: initialScopePreviews.length,
            scopes: initialScopePreviews,
            details: selectionReason ? [selectionReason] : undefined,
            tone: "info",
            durationMs: scopeSelectionDurationMs,
          },
        ),
      });
    }

    const entrySelectionStartedAt = Date.now();
    const entrySelection =
      config.searchMode === "traversal"
        ? await selectTraversalEntries(
            recentConversation,
            chosenBooks,
            selectedScopes,
            config,
            controller,
            allowController,
            deterministicById,
            trace,
            maxDynamicEntries,
            reservedEntryIds,
            options.dynamicFeedback,
          )
        : await selectEntriesForScopes(
            recentConversation,
            selectedScopes,
            config,
            controller,
            allowController,
            deterministicById,
            trace,
            maxDynamicEntries,
            reservedEntryIds,
            options.dynamicFeedback,
          );
    entrySelectionDurationMs = Date.now() - entrySelectionStartedAt;
    selectedScopes = entrySelection.scopes;
    pulledCandidates = entrySelection.candidates;
    selected = entrySelection.selected;
    manifests = entrySelection.manifests;
    if ("fallbackPath" in entrySelection && Array.isArray((entrySelection as EntrySelectionResult).fallbackPath)) {
      fallbackPath.push(...(entrySelection as EntrySelectionResult).fallbackPath);
    }
    if ("fallbackReason" in entrySelection && entrySelection.fallbackReason) {
      fallbackPath.push(entrySelection.fallbackReason);
    }
    if (Array.isArray(entrySelection.searchEvents) && entrySelection.searchEvents.length) {
      searchEvents = entrySelection.searchEvents;
    }
    if (entrySelection.usedSearchFrontier) {
      usedSearchFrontier = true;
    }
    if (entrySelection.selectionReason) {
      selectionReason = entrySelection.selectionReason;
    }
    steps.push(
      usedSearchFrontier
        ? `Resolved ${pulledCandidates.length} pulled entry candidate(s), including global search contribution(s).`
        : `Resolved ${pulledCandidates.length} pulled entry candidate(s) across ${Math.max(selectedScopes.length, 1)} scope(s).`,
    );
    steps.push(`Kept ${selected.length} entry candidate(s) for injection.`);
    if (!areSameScopes(initiallySelectedScopes, selectedScopes)) {
      const refinedReasons = new Map(selectedScopes.map((scope) => [makeScopeKey(scope), selectionReason]));
      const refinedScopePreviews = buildPreviewScopes(selectedScopes, new Map(), refinedReasons);
      if (refinedScopePreviews.length) {
        const scopeEventLabel = config.searchMode === "traversal" ? "Retrieved scopes" : "Refined scopes";
        const scopeEventSummary =
          config.searchMode === "traversal"
            ? `Traversal accumulated candidates from ${refinedScopePreviews.length} retrieved scope(s).`
            : `Narrowed retrieval to ${refinedScopePreviews.length} scope(s) before final selection.`;
        emitProgress(reportProgress, {
          type: "item",
          item: createFeedItem(
            "scope",
            scopeEventLabel,
            scopeEventSummary,
            {
              phase: config.searchMode === "traversal" ? "retrieve" : "refine_scope",
              count: refinedScopePreviews.length,
              scopes: refinedScopePreviews,
              details: selectionReason ? [selectionReason] : undefined,
              tone: "info",
              durationMs: scopeSelectionDurationMs,
            },
          ),
        });
      }
    }
  }

  const pulledNodes = buildPreviewNodes(pulledCandidates.length ? pulledCandidates : selected, booksById);
  if (pulledNodes.length) {
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem(
        "pulled",
        "Pulled candidates",
        usedSearchFrontier
          ? `Resolved ${pulledNodes.length} pulled candidate entr${pulledNodes.length === 1 ? "y" : "ies"}, including global search contribution(s).`
          : `Resolved ${pulledNodes.length} pulled candidate entr${pulledNodes.length === 1 ? "y" : "ies"} from ${Math.max(selectedScopes.length, 1)} scope(s).`,
        {
          phase: "retrieve",
          count: pulledNodes.length,
          entries: pulledNodes,
          tone: "info",
          durationMs: entrySelectionDurationMs,
        },
      ),
    });
  }

  const manifestCounts = new Map<string, number>(
    manifests.map((item) => [makeScopeKey(item.scope), item.candidates.length]),
  );
  const selectionReasons = new Map<string, string>(
    selectedScopes.map((scope) => [makeScopeKey(scope), selectionReason]),
  );
  const selectedScopePreviews = buildPreviewScopes(selectedScopes, manifestCounts, selectionReasons);
  const scopeManifestCounts = populateScopeManifestSelections(
    buildPreviewScopeManifests(manifests),
    selected,
    selectedScopes,
  );
  const manifestSelectedEntries = buildPreviewNodes(selected, booksById);
  if (config.selectiveRetrieval || manifests.length) {
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem(
        "manifest",
        "Manifest selection",
        usedSearchFrontier
          ? `Selected ${manifestSelectedEntries.length} final entry candidate entr${manifestSelectedEntries.length === 1 ? "y" : "ies"} after traversal and search manifest selection.`
          : `Selected ${manifestSelectedEntries.length} final entry candidate entr${manifestSelectedEntries.length === 1 ? "y" : "ies"} after traversal manifest selection.`,
        {
          phase: "manifest_select",
          count: manifestSelectedEntries.length,
          scopes: selectedScopePreviews,
          entries: manifestSelectedEntries,
          tone: "info",
          durationMs: entrySelectionDurationMs,
        },
      ),
    });
  }

  const maxInjectedEntries = remainingDynamicSlots;
  if (config.selectiveRetrieval && selected.length > maxInjectedEntries) {
    spindle.log.warn(
      `Lore Recall selective retrieval exceeded the inject cap before prompt assembly (${selected.length} > ${maxInjectedEntries}); applying safety clamp.`,
    );
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem(
        "issue",
        "Selective retrieval exceeded inject cap",
        `Selective retrieval produced ${selected.length} entries before injection, so Lore Recall had to safety-clamp to ${maxInjectedEntries}.`,
        {
          phase: "inject",
          tone: "warn",
          details: [
            `selected=${selected.length}`,
            `injectCap=${maxInjectedEntries}`,
          ],
        },
      ),
    });
  }

  const injectionStartedAt = Date.now();
  const selectedForInjection = [...reservedConstants, ...selected];
  const injection = selectedForInjection.length
    ? buildInjectionText(
        selectedForInjection,
        booksById,
        reservedConstantCount + remainingDynamicSlots,
        config.collapsedDepth,
      )
    : null;
  const injectionDurationMs = Date.now() - injectionStartedAt;
  const included = injection?.included ?? [];
  const injectedNodes = buildPreviewNodes(included, booksById);
  const selectionSummary = summarizeSelection(selected, reservedConstantCount, remainingDynamicSlots);

  if (injection?.included.length) {
    const constantInjectionSuffix =
      reservedConstantCount > 0
        ? `, including ${reservedConstantCount} constant entr${reservedConstantCount === 1 ? "y" : "ies"}`
        : "";
    pushTrace(
      trace,
      "inject",
      "Inject entries",
      `Injected ${injection.included.length} entry reference(s) into the interceptor prompt${constantInjectionSuffix}.`,
      { entryCount: injection.included.length, durationMs: injectionDurationMs },
    );
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem(
        "injected",
        "Injected entries",
        `Prepared ${injectedNodes.length} entr${injectedNodes.length === 1 ? "y" : "ies"} for prompt injection.`,
        {
          phase: "inject",
          count: injectedNodes.length,
          entries: injectedNodes,
          tone: "success",
          durationMs: injectionDurationMs,
        },
      ),
    });
  } else {
    const skippedSummary =
      reservedConstantCount > 0
        ? `No entries were injected even though ${reservedConstantCount} constant entr${reservedConstantCount === 1 ? "y was" : "ies were"} available.`
        : "No retrieved entries were injected for this turn.";
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem(
        "injected",
        "Injection skipped",
        skippedSummary,
        {
          phase: "inject",
          count: 0,
          tone: selected.length ? "warn" : reservedConstantCount > 0 ? "success" : "info",
          durationMs: injectionDurationMs,
        },
      ),
    });
  }

  const fallbackReason = buildFallbackReason(fallbackPath);
  if (fallbackReason) {
    emitProgress(reportProgress, {
      type: "item",
      item: createFeedItem("issue", "Fallback path active", fallbackReason, {
        phase: "fallback",
        tone: "warn",
        details: fallbackPath,
      }),
    });
  }
  const resolvedConnectionId = controller.controllerUsed ? controller.connectionId : null;
  emitProgress(reportProgress, {
    type: "finish",
    timestamp: Date.now(),
    status: fallbackReason ? "fallback" : "completed",
    controllerUsed: controller.controllerUsed,
    resolvedConnectionId,
    fallbackReason,
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
    searchEvents,
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
    resolvedConnectionId,
  };
}

export const __testing = {
  buildRecentConversation,
  resolveScopeChoices,
  buildScopedManifests,
  collectCandidatesForScopes,
  rankSelectionCandidates,
  buildDeterministicSelection,
};
