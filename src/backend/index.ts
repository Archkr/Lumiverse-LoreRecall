declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { CharacterDTO, ChatDTO, ConnectionProfileDTO, LlmMessageDTO, WorldBookEntryDTO } from "lumiverse-spindle-types";
import type {
  FrontendState,
  FrontendToBackend,
  OperationIssue,
  OperationKind,
  OperationUpdate,
  RetrievalFeedItem,
  RetrievalFeedState,
  RetrievalPreview,
  RetrievalProgressEvent,
  RetrievalSession,
} from "../types";
import type { RuntimeBook } from "./contracts";
import { DEFAULT_CHARACTER_CONFIG, DEFAULT_GLOBAL_SETTINGS } from "../shared";
import { attachedCharacterIds, buildAttachedWorkspaceState, mapAttachedBookScopes, toWorkspaceEntry, type ActiveLoreEntry } from "./attached";
import { buildRetrievalPreview, type DynamicRetrievalFeedbackSnapshot } from "./retrieval";
import { finalizeRecallActivation, injectRecallEntries, markRecallNativeFallback, RecallRunStore, suppressedNativeEntryIds } from "./activation";
import { clearJevKey, hasJevKey, saveJevKey } from "./jev";
import {
  type OperationContext,
  type OperationOutcome,
  applySuggestedBooks,
  assignEntries,
  buildDiagnostics,
  buildTreeFromMetadata,
  buildTreeWithLlm,
  createCategory,
  deleteCategory,
  exportSnapshot,
  importSnapshot,
  moveCategory,
  patchEntryFlags,
  regenerateSummaries,
  updateCategory,
  updateEntryMeta,
} from "./operations";
import {
  ensureStorageFolders,
  readChatIdFromMessage,
  rememberChatUser,
  resolveUserId,
  send,
  setLastFrontendUserId,
} from "./runtime";
import {
  buildConnectionOption,
  getRuntimeBooks,
  isReadableBook,
  invalidateWorldBookListCache,
  loadCharacterConfig,
  loadGlobalSettings,
  saveBookConfig,
  saveCharacterConfig,
  saveGlobalSettings,
} from "./storage";

const CONNECTION_CACHE_TTL_MS = 5000;
const RETRIEVAL_FEED_SESSION_LIMIT = 25;
const RETRIEVAL_FEED_PUSH_DELAY_MS = 180;
const connectionCache = new Map<string, { expiresAt: number; connections: ConnectionProfileDTO[] }>();
const latestStateSequence = new Map<string, number>();
const previewCache = new Map<string, RetrievalPreview | null>();
const retrievalFeedCache = new Map<string, RetrievalFeedState>();
const scheduledStatePushes = new Map<string, ReturnType<typeof setTimeout>>();
const dynamicFeedbackByChat = new Map<string, ChatDynamicFeedbackState>();
const preparedRecallRuns = new RecallRunStore();

const DYNAMIC_FEEDBACK_RECENT_WINDOW = 3;

interface StateBuildEnvelope {
  state: FrontendState;
}

interface DynamicFeedbackRecord {
  entryId: string;
  label: string;
  aliases: string[];
  keys: string[];
}

interface ChatDynamicFeedbackState {
  pending: DynamicFeedbackRecord[];
  entries: DynamicRetrievalFeedbackSnapshot["entries"];
  recentInjectionEntryIds: string[][];
}

async function resolveActiveChat(userId: string, chatId?: string | null) {
  if (chatId) return spindle.chats.get(chatId, userId);
  return spindle.chats.getActive(userId);
}

async function getTurnAttachmentScopes(
  chat: ChatDTO,
  userId: string,
  selectedPersonaId?: string | null,
  activeCharacter?: CharacterDTO | null,
  strict = true,
) {
  const sourceCharacters = await Promise.all(
    attachedCharacterIds(chat.character_id, chat.metadata ?? {}).map((id) =>
      id === activeCharacter?.id ? Promise.resolve(activeCharacter) : spindle.characters.get(id, userId)
        .catch((error: unknown) => { if (strict) throw error; return null; })),
  );
  const globalBooksApi = spindle.world_books as typeof spindle.world_books & {
    getGlobal?: (userId?: string) => Promise<string[]>;
  };
  if (typeof globalBooksApi.getGlobal !== "function" && strict) throw new Error("Global lorebook attachments are unavailable.");
  const [globalBookIds, activePersona] = await Promise.all([
    globalBooksApi.getGlobal?.(userId).catch((error: unknown) => { if (strict) throw error; return [] as string[]; })
      ?? Promise.resolve([] as string[]),
    (selectedPersonaId ? spindle.personas.get(selectedPersonaId, userId) : spindle.personas.getActive(userId))
      .catch((error: unknown) => { if (strict) throw error; return null; }),
  ]);
  const persona = chat.metadata?.temporary === true
    ? null
    : activePersona ?? await spindle.personas.getDefault(userId)
      .catch((error: unknown) => { if (strict) throw error; return null; });
  const chatBookIds = chat.metadata?.chat_world_book_ids;
  return mapAttachedBookScopes({
    character: sourceCharacters.flatMap((source) => source?.world_book_ids ?? []),
    persona: persona?.attached_world_book_id,
    chat: Array.isArray(chatBookIds) ? chatBookIds.filter((id): id is string => typeof id === "string") : [],
    global: globalBookIds,
  });
}

async function listConnectionsCached(userId: string): Promise<ConnectionProfileDTO[]> {
  const cached = connectionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.connections;
  }

  const connections = await spindle.connections.list(userId).catch(() => [] as ConnectionProfileDTO[]);
  connectionCache.set(userId, {
    expiresAt: Date.now() + CONNECTION_CACHE_TTL_MS,
    connections,
  });
  return connections;
}

function getPreviewCacheKey(userId: string, chatId: string): string {
  return `${userId}:${chatId}`;
}

function getDynamicFeedbackState(cacheKey: string): ChatDynamicFeedbackState {
  const existing = dynamicFeedbackByChat.get(cacheKey);
  if (existing) return existing;
  const created: ChatDynamicFeedbackState = {
    pending: [],
    entries: {},
    recentInjectionEntryIds: [],
  };
  dynamicFeedbackByChat.set(cacheKey, created);
  return created;
}

function normalizeFeedbackText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2019']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function feedbackTextIncludes(normalizedText: string, phrase: string): boolean {
  const normalizedPhrase = normalizeFeedbackText(phrase);
  if (normalizedPhrase.length < 3) return false;
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function feedbackRecordReferenced(record: DynamicFeedbackRecord, normalizedAssistantText: string): boolean {
  if (feedbackTextIncludes(normalizedAssistantText, record.label)) return true;
  if (record.aliases.some((alias) => feedbackTextIncludes(normalizedAssistantText, alias))) return true;
  const keyHits = record.keys.filter((key) => feedbackTextIncludes(normalizedAssistantText, key));
  if (keyHits.some((key) => normalizeFeedbackText(key).length >= 4)) return true;
  return keyHits.length >= 2;
}

function getPriorAssistantResponse(messages: LlmMessageDTO[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && typeof message.content === "string" && message.content.trim()) {
      return message.content;
    }
  }
  return "";
}

function processPendingDynamicFeedback(cacheKey: string, messages: LlmMessageDTO[]): void {
  const state = getDynamicFeedbackState(cacheKey);
  if (!state.pending.length) return;
  const assistantText = normalizeFeedbackText(getPriorAssistantResponse(messages));
  if (!assistantText) return;
  const now = Date.now();

  for (const record of state.pending) {
    const previous = state.entries[record.entryId] ?? {
      injections: 0,
      references: 0,
      missStreak: 0,
      lastReferenced: 0,
      recentInjectionCount: 0,
    };
    const referenced = feedbackRecordReferenced(record, assistantText);
    state.entries[record.entryId] = {
      ...previous,
      injections: previous.injections + 1,
      references: previous.references + (referenced ? 1 : 0),
      missStreak: referenced ? 0 : previous.missStreak + 1,
      lastReferenced: referenced ? now : previous.lastReferenced,
    };
  }

  state.pending = [];
}

function buildDynamicFeedbackSnapshot(cacheKey: string): DynamicRetrievalFeedbackSnapshot {
  const state = getDynamicFeedbackState(cacheKey);
  const recentCounts = new Map<string, number>();
  for (const batch of state.recentInjectionEntryIds) {
    for (const entryId of batch) {
      recentCounts.set(entryId, (recentCounts.get(entryId) ?? 0) + 1);
    }
  }

  return {
    entries: Object.fromEntries(
      Object.entries(state.entries).map(([entryId, data]) => [
        entryId,
        {
          ...data,
          recentInjectionCount: recentCounts.get(entryId) ?? 0,
        },
      ]),
    ),
  };
}

function findRuntimeEntry(runtimeBooks: RuntimeBook[], entryId: string): RuntimeBook["cache"]["entries"][number] | null {
  for (const book of runtimeBooks) {
    const entry = book.cache.entries.find((item) => item.entryId === entryId);
    if (entry) return entry;
  }
  return null;
}

function recordDynamicInjection(cacheKey: string, preview: RetrievalPreview | null, runtimeBooks: RuntimeBook[]): void {
  const state = getDynamicFeedbackState(cacheKey);
  const dynamicIds = [...new Set((preview?.manifestSelectedEntries ?? []).map((entry) => entry.entryId))];
  state.pending = dynamicIds
    .map((entryId): DynamicFeedbackRecord | null => {
      const entry = findRuntimeEntry(runtimeBooks, entryId);
      if (!entry || entry.constant) return null;
      return {
        entryId,
        label: entry.label,
        aliases: [...entry.aliases],
        keys: [...entry.key, ...entry.keysecondary],
      };
    })
    .filter((item): item is DynamicFeedbackRecord => !!item);

  if (!state.pending.length) return;
  state.recentInjectionEntryIds.push(state.pending.map((item) => item.entryId));
  while (state.recentInjectionEntryIds.length > DYNAMIC_FEEDBACK_RECENT_WINDOW) {
    state.recentInjectionEntryIds.shift();
  }
}

function cloneRetrievalFeedItem(item: RetrievalFeedItem): RetrievalFeedItem {
  return {
    ...item,
    scopes: item.scopes?.map((scope) => ({ ...scope })),
    entries: item.entries?.map((entry) => ({ ...entry, reasons: [...entry.reasons] })),
    details: item.details ? [...item.details] : undefined,
  };
}

function cloneRetrievalSession(session: RetrievalSession): RetrievalSession {
  return {
    ...session,
    items: session.items.map(cloneRetrievalFeedItem),
  };
}

function cloneRetrievalFeedState(state: RetrievalFeedState | null | undefined): RetrievalFeedState {
  return {
    sessions: (state?.sessions ?? []).map(cloneRetrievalSession),
  };
}

function createSessionStartItem(event: Extract<RetrievalProgressEvent, { type: "start" }>): RetrievalFeedItem {
  return {
    id: `session:${event.timestamp}:${Math.random().toString(36).slice(2, 8)}`,
    kind: "trace",
    label: event.label,
    summary: event.summary,
    timestamp: event.timestamp,
    phase: "session",
    details: event.details ? [...event.details] : undefined,
    tone: "info",
  };
}

function sortAndTrimRetrievalSessions(sessions: RetrievalSession[]): RetrievalSession[] {
  return sessions
    .slice()
    .sort((left, right) => {
      if (left.status === "running" && right.status !== "running") return -1;
      if (right.status === "running" && left.status !== "running") return 1;
      return right.startedAt - left.startedAt;
    })
    .slice(0, RETRIEVAL_FEED_SESSION_LIMIT);
}

function getOrCreateRetrievalFeed(userId: string, chatId: string): RetrievalFeedState {
  const key = getPreviewCacheKey(userId, chatId);
  const cached = retrievalFeedCache.get(key);
  if (cached) return cached;
  const next: RetrievalFeedState = { sessions: [] };
  retrievalFeedCache.set(key, next);
  return next;
}

function beginRetrievalSession(
  userId: string,
  chatId: string,
  sessionId: string,
  event: Extract<RetrievalProgressEvent, { type: "start" }>,
): void {
  const feed = getOrCreateRetrievalFeed(userId, chatId);
  const session: RetrievalSession = {
    id: sessionId,
    chatId,
    mode: event.mode,
    startedAt: event.timestamp,
    endedAt: null,
    status: "running",
    controllerUsed: false,
    resolvedConnectionId: null,
    fallbackReason: null,
    items: [createSessionStartItem(event)],
  };
  feed.sessions = sortAndTrimRetrievalSessions([session, ...feed.sessions.filter((item) => item.id !== sessionId)]);
}

function appendRetrievalSessionItem(
  userId: string,
  chatId: string,
  sessionId: string,
  item: RetrievalFeedItem,
): void {
  const feed = getOrCreateRetrievalFeed(userId, chatId);
  const session = feed.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return;
  session.items = [...session.items, cloneRetrievalFeedItem(item)];
  feed.sessions = sortAndTrimRetrievalSessions(feed.sessions);
}

function finishRetrievalSession(
  userId: string,
  chatId: string,
  sessionId: string,
  event: Extract<RetrievalProgressEvent, { type: "finish" }>,
): void {
  const feed = getOrCreateRetrievalFeed(userId, chatId);
  const session = feed.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return;
  session.status = event.status;
  session.endedAt = event.timestamp;
  session.controllerUsed = event.controllerUsed;
  session.resolvedConnectionId = event.resolvedConnectionId;
  session.fallbackReason = event.fallbackReason;
  feed.sessions = sortAndTrimRetrievalSessions(feed.sessions);
}

function scheduleLiveStatePush(userId: string, chatId: string): void {
  const key = getPreviewCacheKey(userId, chatId);
  const existing = scheduledStatePushes.get(key);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    scheduledStatePushes.delete(key);
    void resolveActiveChat(userId)
      .then((activeChat) => {
        if (activeChat?.id !== chatId) return;
        return pushState(userId, chatId);
      })
      .catch((error) => {
        spindle.log.warn(
          `Lore Recall state push failed for chat ${chatId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }, RETRIEVAL_FEED_PUSH_DELAY_MS);
  scheduledStatePushes.set(key, handle);
}

async function buildState(userId: string, chatId?: string | null): Promise<StateBuildEnvelope> {
  const stateIssues: FrontendState["diagnosticsResults"] = [];
  const [activeChat, settings, connections] = await Promise.all([
    resolveActiveChat(userId, chatId).catch((error: unknown) => {
      stateIssues.push({
        id: "active-chat-unavailable", severity: "warn", bookId: null,
        title: "Active chat could not be loaded",
        detail: error instanceof Error ? error.message : String(error),
      });
      return null;
    }),
    loadGlobalSettings(userId).catch((error: unknown) => {
      stateIssues.push({
        id: "settings-unavailable", severity: "warn", bookId: null,
        title: "Lore Recall settings could not be loaded",
        detail: error instanceof Error ? error.message : String(error),
      });
      return { ...DEFAULT_GLOBAL_SETTINGS };
    }),
    listConnectionsCached(userId),
  ]);

  const cachedPreview = activeChat?.id ? (previewCache.get(getPreviewCacheKey(userId, activeChat.id)) ?? null) : null;
  const cachedRetrievalFeed = activeChat?.id
    ? cloneRetrievalFeedState(retrievalFeedCache.get(getPreviewCacheKey(userId, activeChat.id)))
    : { sessions: [] };

  const baseState: FrontendState = {
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
    jevKeyStored: await hasJevKey(settings.jevProvider, userId).catch(() => false),
  };

  if (!activeChat) {
    return { state: baseState };
  }

  const character = activeChat.character_id
    ? await spindle.characters.get(activeChat.character_id, userId).catch(() => null)
    : null;
  const characterConfig = character
    ? await loadCharacterConfig(character.id, userId, character).catch(() => ({ ...DEFAULT_CHARACTER_CONFIG }))
    : { ...DEFAULT_CHARACTER_CONFIG };
  const attachedBookScopes = await getTurnAttachmentScopes(activeChat, userId, null, character, false).catch((error: unknown) => {
    stateIssues.push({
      id: "attachment-sources-unavailable", severity: "warn", bookId: null,
      title: "Attached lorebooks could not be listed",
      detail: error instanceof Error ? error.message : String(error),
    });
    return {} as ReturnType<typeof mapAttachedBookScopes>;
  });
  const attachedBookIds = Object.keys(attachedBookScopes);
  const { runtimeBooks, staleIssues, loadIssues, missingBookIds } = await getRuntimeBooks(
    attachedBookIds, attachedBookIds, userId, 15_000,
  );
  const attachmentState = buildAttachedWorkspaceState(attachedBookScopes, runtimeBooks, missingBookIds);
  const { attachedBookSources } = attachmentState;

  const managedEntries = Object.fromEntries(runtimeBooks.map((book) => [
    book.summary.id, book.cache.entries.map(toWorkspaceEntry),
  ]));
  const bookConfigs = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.config]));
  const bookStatuses = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.status]));
  const treeIndexes = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree]));
  const unassignedCounts = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree.unassignedEntryIds.length]));
  const previewFallbackPath = cachedPreview?.fallbackPath ?? [];
  const previewDiagnostics =
    cachedPreview
      ? [
          ...(previewFallbackPath.length
            ? [
                {
                  id: "preview-fallback",
                  severity: "info" as const,
                  bookId: null,
                  title: "Last retrieval used fallback behavior",
                  detail: previewFallbackPath.join(" "),
                },
              ]
            : []),
          ...(cachedPreview.recentConversation && /\[narrative|important note:|black box|you represent/i.test(cachedPreview.recentConversation)
            ? [
                {
                  id: "preview-protocol-heavy-context",
                  severity: "warn" as const,
                  bookId: null,
                  title: "Recent retrieval context still contains protocol text",
                  detail:
                    "The sanitized recent conversation still appears to contain narrative protocol or policy text, which can distort node and entry selection.",
                },
              ]
            : []),
        ]
      : [];
  const diagnosticsResults = stateIssues.concat(buildDiagnostics(runtimeBooks.filter((book) => attachedBookSources[book.summary.id]), staleIssues, settings, characterConfig, connections),
    previewDiagnostics,
  );
  for (const [bookId, reason] of Object.entries(loadIssues)) {
    if (missingBookIds.includes(bookId)) {
      diagnosticsResults.push({
        id: `stale-attached-book:${bookId}`, severity: "info", bookId,
        title: "Stale lorebook attachment omitted",
        detail: "Lumiverse still has this ID in its saved attachments, but the lorebook no longer exists.",
      });
      continue;
    }
    diagnosticsResults.push({
      id: `attached-book-load:${bookId}`, severity: "warn", bookId,
      title: "Attached lorebook could not be loaded",
      detail: `${reason} Lumiverse will handle this book natively until it can be loaded.`,
    });
  }
  if (!extensionTakeoverAvailable) diagnosticsResults.unshift({
    id: "host-selection-unavailable", severity: "warn", bookId: null,
    title: missingRecallHookPermissions().length ? "Lore Recall needs extension permissions" : "Lore Recall host support is unavailable",
    detail: missingRecallHookPermissions().length
      ? "Grant these Lore Recall permissions in Extensions: " + missingRecallHookPermissions().join(", ") + ". Native lorebook activation remains active."
      : "This Lumiverse build does not expose the pre-generation and prompt hooks Lore Recall needs. Native lorebook activation remains active.",
  });

  const nextState: FrontendState = {
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
    suggestedBookIds: [],
  };

  return {
    state: nextState,
  };
}

async function pushState(userId: string, chatId?: string | null): Promise<void> {
  const sequence = (latestStateSequence.get(userId) ?? 0) + 1;
  latestStateSequence.set(userId, sequence);

  const envelope = await buildState(userId, chatId);
  if (latestStateSequence.get(userId) !== sequence) return;

  rememberChatUser(envelope.state.activeChatId, userId);
  send({ type: "state", state: envelope.state }, userId);
}

const activeTrackedOperations = new Map<string, string>();

function createOperationId(kind: OperationKind): string {
  return `${kind}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function sendOperation(userId: string, operation: OperationUpdate): void {
  send({ type: "operation", operation }, userId);
}

function getOperationTitle(kind: OperationKind): string {
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

function summarizeOutcome(kind: OperationKind, outcome: Pick<OperationOutcome<unknown>, "completed" | "total">, issues: OperationIssue[]): string {
  const issueCount = issues.length;
  switch (kind) {
    case "build_tree_with_llm":
      if (issueCount) return `Built ${outcome.completed} of ${outcome.total} book(s) with ${issueCount} issue(s).`;
      return `Built ${outcome.completed} book(s) with the LLM.`;
    case "build_tree_from_metadata":
      if (issueCount) return `Built ${outcome.completed} of ${outcome.total} metadata tree(s) with ${issueCount} issue(s).`;
      return `Built ${outcome.completed} metadata tree(s).`;
    case "regenerate_summaries":
      if (issueCount) return `Updated ${outcome.completed} of ${outcome.total} summary target(s) with ${issueCount} issue(s).`;
      return `Updated ${outcome.completed} summary target(s).`;
    case "export_snapshot":
      return "Lore Recall snapshot is ready to download.";
    case "import_snapshot":
      if (issueCount) return `Imported Lore Recall snapshot with ${issueCount} issue(s).`;
      return "Imported Lore Recall snapshot.";
  }
}

function createInitialOperation(
  id: string,
  kind: OperationKind,
  message: FrontendToBackend,
): OperationUpdate {
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
      chatId: "chatId" in message ? (message.chatId ?? null) : null,
      bookIds: "bookIds" in message && Array.isArray(message.bookIds) ? message.bookIds : undefined,
      bookId: "bookId" in message && typeof message.bookId === "string" ? message.bookId : null,
      entryIds: "entryIds" in message && Array.isArray(message.entryIds) ? message.entryIds : undefined,
      nodeIds: "nodeIds" in message && Array.isArray(message.nodeIds) ? message.nodeIds : undefined,
    },
    issues: [],
  };
}

async function runTrackedOperation<T>(
  userId: string,
  message: FrontendToBackend,
  kind: OperationKind,
  runner: (operation: OperationContext) => Promise<OperationOutcome<T>>,
  onSuccess?: (value: T) => Promise<void> | void,
): Promise<void> {
  if (activeTrackedOperations.has(userId)) {
    send(
      {
        type: "error",
        message: "Another Lore Recall operation is already running. Wait for it to finish before starting a new one.",
      },
      userId,
    );
    return;
  }

  const id = createOperationId(kind);
  const issues: OperationIssue[] = [];
  let operation = createInitialOperation(id, kind, message);
  activeTrackedOperations.set(userId, id);
  sendOperation(userId, operation);

  const context: OperationContext = {
    progress(update) {
      operation = {
        ...operation,
        status: operation.status === "started" ? "running" : operation.status,
        ...update,
        percent: typeof update.percent === "number" ? Math.max(0, Math.min(100, update.percent)) : operation.percent,
        current: typeof update.current === "number" ? update.current : operation.current,
        total: typeof update.total === "number" ? update.total : operation.total,
        phase: typeof update.phase === "undefined" ? operation.phase : (update.phase ?? null),
        bookId: typeof update.bookId === "undefined" ? operation.bookId : (update.bookId ?? null),
        bookName: typeof update.bookName === "undefined" ? operation.bookName : (update.bookName ?? null),
        chunkCurrent: typeof update.chunkCurrent === "undefined" ? operation.chunkCurrent : (update.chunkCurrent ?? null),
        chunkTotal: typeof update.chunkTotal === "undefined" ? operation.chunkTotal : (update.chunkTotal ?? null),
        message: update.message ?? operation.message,
        issues: [...issues],
      };
      sendOperation(userId, operation);
    },
    addIssue(issue) {
      issues.push(issue);
      operation = {
        ...operation,
        issues: [...issues],
      };
      sendOperation(userId, operation);
    },
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
      issues: allIssues,
    };
    sendOperation(userId, operation);
    await pushState(userId, "chatId" in message ? message.chatId : null);
  } catch (error: unknown) {
    const issue: OperationIssue = {
      severity: "error",
      message: error instanceof Error ? error.message : "Unknown Lore Recall operation error",
      phase: operation.phase ?? null,
      bookId: operation.bookId ?? null,
      bookName: operation.bookName ?? null,
    };
    issues.push(issue);
    operation = {
      ...operation,
      status: "failed",
      message: issue.message,
      retryable: true,
      finishedAt: Date.now(),
      issues: [...issues],
    };
    spindle.log.error(`Lore Recall ${kind} failed: ${issue.message}`);
    sendOperation(userId, operation);
  } finally {
    activeTrackedOperations.delete(userId);
  }
}

type WorldInfoContext = {
  chatId: string;
  userId?: string;
  entries: readonly ActiveLoreEntry[];
};

type PreGenerationContext = {
  chatId?: string;
  userId?: string;
  personaId?: string | null;
  connectionId?: string | null;
  dryRun?: boolean;
  loreRecallRunId?: string;
  [key: string]: unknown;
};

type RecallHostApi = {
  contracts?: Readonly<Record<string, number>>;
  registerContextHandler?: (
    handler: (context: unknown, signal?: AbortSignal) => Promise<unknown>,
    priority?: number,
    options?: { timeoutMs?: number },
  ) => void;
  registerWorldInfoInterceptor?: (
    handler: (context: WorldInfoContext) => Promise<{ disabled: string[] } | void>,
    priority?: number,
  ) => void;
  registerInterceptor?: (
    handler: (messages: LlmMessageDTO[], context: PreGenerationContext) =>
      Promise<LlmMessageDTO[] | ReturnType<typeof injectRecallEntries>>,
    priority?: number,
    options?: { required?: boolean },
  ) => unknown;
};

const recallHostApi = spindle as unknown as RecallHostApi;

const hostCapabilities = (spindle as unknown as {
  host?: { capabilities?: Readonly<Record<string, number>> };
}).host?.capabilities;
const requiredPromptInterceptorAvailable = (hostCapabilities?.["required-interceptors-v1"] ?? 0) >= 1;
const extensionHookSupportAvailable =
  typeof recallHostApi.registerContextHandler === "function"
  && typeof recallHostApi.registerWorldInfoInterceptor === "function"
  && typeof recallHostApi.registerInterceptor === "function"
  && (recallHostApi.contracts?.preAssemblyGenerationContext ?? 0) >= 1;
let extensionTakeoverAvailable = false;
let recallHooksRegistered = false;

function missingRecallHookPermissions(): string[] {
  return ["generation", "context_handler", "interceptor"].filter((permission) => !spindle.permissions.has(permission));
}

function recordNativeFallback(userId: string, chatId: string, reason: string, existingSessionId?: string): void {
  const sessionId = existingSessionId ?? "fallback:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
  const cached = previewCache.get(getPreviewCacheKey(userId, chatId));
  if (cached) {
    markRecallNativeFallback(cached, reason);
  }
  const existing = retrievalFeedCache.get(getPreviewCacheKey(userId, chatId))
    ?.sessions.find((session) => session.id === sessionId);
  if (!existing) beginRetrievalSession(userId, chatId, sessionId, {
    type: "start", mode: "collapsed", timestamp: Date.now(),
    label: "Native lorebook fallback", summary: "Lore Recall did not take over this turn.",
  });
  appendRetrievalSessionItem(userId, chatId, sessionId, {
    id: "native:" + Date.now(), kind: "issue", label: "Native lorebook fallback",
    summary: reason, timestamp: Date.now(), phase: "fallback", tone: "warn",
  });
  finishRetrievalSession(userId, chatId, sessionId, {
    type: "finish", timestamp: Date.now(), status: "fallback",
    controllerUsed: existing?.controllerUsed ?? false,
    resolvedConnectionId: existing?.resolvedConnectionId ?? null,
    fallbackReason: reason,
  });
  scheduleLiveStatePush(userId, chatId);
}

function registerRecallHooks(): void {
  extensionTakeoverAvailable = extensionHookSupportAvailable && !missingRecallHookPermissions().length;
  if (!extensionTakeoverAvailable || recallHooksRegistered) return;
  recallHooksRegistered = true;
  recallHostApi.registerContextHandler!(async (rawContext: unknown, signal?: AbortSignal) => {
    if (!extensionTakeoverAvailable) return rawContext;
    const context = rawContext as PreGenerationContext;
    const chatId = context.chatId;
    const userId = context.userId ?? (chatId ? resolveUserId(chatId) : null);
    if (!chatId || !userId) return rawContext;
    const runId = "recall:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
    const preparedContext = { ...context, loreRecallRunId: runId };
    preparedRecallRuns.begin(runId, userId, chatId);
    let staged = false;
    const deadlineAt = Date.now() + 115_000;
    let sessionId: string | undefined;
    try {
      signal?.throwIfAborted();
      await ensureStorageFolders(userId);
      const settings = await loadGlobalSettings(userId);
      if (!settings.enabled) return preparedContext;
      const chat = await spindle.chats.get(chatId, userId);
      if (!chat) return preparedContext;
      const scopes = await getTurnAttachmentScopes(chat, userId, context.personaId);
      const attachedIds = Object.keys(scopes);
      if (!attachedIds.length) return preparedContext;
      const { runtimeBooks } = await getRuntimeBooks(attachedIds, attachedIds, userId, 15_000);
      const readableBooks = runtimeBooks.filter((book) => book.config.enabled && isReadableBook(book.config));
      if (!readableBooks.length) return preparedContext;
      const character = chat.character_id ? await spindle.characters.get(chat.character_id, userId) : null;
      const config = character
        ? await loadCharacterConfig(character.id, userId, character)
        : { ...DEFAULT_CHARACTER_CONFIG };
      const chatMessages = await spindle.chat.getMessages(chatId);
      const messages = chatMessages.map((message) => ({ role: message.role, content: message.content }));
      const cacheKey = getPreviewCacheKey(userId, chatId);
      previewCache.set(cacheKey, null);
      if (!context.dryRun) processPendingDynamicFeedback(cacheKey, messages);
      sessionId = "retrieval:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
      const activeSessionId = sessionId;
      const handleProgress = (event: RetrievalProgressEvent) => {
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
        deadlineAt,
      });
      signal?.throwIfAborted();
      if (preview) {
        preview.attachedBookSources = Object.fromEntries(
          readableBooks.map((book) => [book.summary.id, scopes[book.summary.id]?.join(", ") ?? "attached"]));
        previewCache.set(cacheKey, preview);
      }
      if (!preview?.retrievalComplete || Date.now() >= deadlineAt) {
        recordNativeFallback(userId, chatId,
          Date.now() >= deadlineAt ? "Lore Recall exceeded its pre-generation deadline."
            : preview?.fallbackReason ?? "Lore Recall could not complete retrieval.",
          sessionId);
        return preparedContext;
      }
      const handledBookIds = readableBooks.map((book) => book.summary.id);
      const handledSet = new Set(handledBookIds);
      const selectedIds = [...new Set(preview.injectedNodes.map((node) => node.entryId))];
      const selectedRows = await Promise.all(selectedIds.map((id) => spindle.world_books.entries.get(id, userId)));
      signal?.throwIfAborted();
      if (selectedRows.some((entry) =>
        !entry || entry.disabled || !entry.content.trim() || !handledSet.has(entry.world_book_id))) {
        recordNativeFallback(userId, chatId, "A selected entry changed or became unavailable.", sessionId);
        return preparedContext;
      }
      const sourceEntries = selectedRows as WorldBookEntryDTO[];
      const sourceContents = Object.fromEntries(sourceEntries.map((entry) => [entry.id, entry.content]));
      const entries = (await Promise.all(sourceEntries.map(async (entry) => ({
        ...entry,
        content: (await spindle.macros.resolve(entry.content, {
          chatId, characterId: chat.character_id, userId, commit: false,
        })).text,
      })))).filter((entry) => entry.content.trim());
      signal?.throwIfAborted();
      if (Date.now() >= deadlineAt) {
        recordNativeFallback(userId, chatId, "Lore Recall exceeded its pre-generation deadline.", sessionId);
        return preparedContext;
      }
      preview.activationSource = "preview";
      staged = preparedRecallRuns.put({
        id: runId, userId, chatId, createdAt: Date.now(),
        handledBookIds, entries, sourceContents, preview, runtimeBooks: readableBooks,
        sessionId, status: "prepared",
      });
      if (!staged) {
        recordNativeFallback(userId, chatId, "Overlapping generations prevented a safe Recall takeover.", sessionId);
      }
      scheduleLiveStatePush(userId, chatId);
      return preparedContext;
    } catch (error: unknown) {
      if (signal?.aborted) return preparedContext;
      const reason = error instanceof Error ? error.message : String(error);
      recordNativeFallback(userId, chatId, reason, sessionId);
      spindle.log.warn("Lore Recall preparation failed; native activation continues: " + reason);
      return preparedContext;
    } finally {
      if (!staged) preparedRecallRuns.stayNative(runId);
    }
  }, 95, { timeoutMs: 120_000 });

  recallHostApi.registerWorldInfoInterceptor!(async (context: WorldInfoContext) => {
    if (!extensionTakeoverAvailable) return;
    const userId = context.userId ?? resolveUserId(context.chatId);
    if (!userId) return;
    const claim = preparedRecallRuns.claim(userId, context.chatId, context.entries);
    if (!claim.run) {
      if (claim.reason) {
        for (const run of claim.rejected) recordNativeFallback(userId, context.chatId, claim.reason, run.sessionId);
      }
      return;
    }
    const disabled = suppressedNativeEntryIds(claim.run, context.entries);
    return { disabled };
  }, 95);

  recallHostApi.registerInterceptor!(async (messages, rawContext) => {
    const context = rawContext as unknown as PreGenerationContext;
    const runId = context.loreRecallRunId;
    if (!runId) return messages;
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
        recordNativeFallback(run.userId, run.chatId,
          "World-info activation did not run, so Recall did not take over.", run.sessionId);
      }
      preparedRecallRuns.remove(runId);
      return messages;
    }
    const injected = injectRecallEntries(messages, run.entries);
    finalizeRecallActivation(run.preview, run.entries);
    previewCache.set(getPreviewCacheKey(run.userId, run.chatId), run.preview);
    if (!context.dryRun) recordDynamicInjection(
      getPreviewCacheKey(run.userId, run.chatId), run.preview, run.runtimeBooks);
    appendRetrievalSessionItem(run.userId, run.chatId, run.sessionId, {
      id: "activation:" + Date.now(), kind: "injected", label: "Recall activation",
      summary: "Inserted " + run.entries.length + " selected entries from "
        + run.handledBookIds.length + " attached books.",
      timestamp: Date.now(), phase: "inject", count: run.entries.length,
      entries: run.preview.injectedNodes, tone: "success",
      details: run.entries.some((entry) => ![0, 1, 4].includes(entry.position))
        ? ["Author-note, example, marker, and outlet positions are placed before chat history by Lore Recall."]
        : [],
    });
    preparedRecallRuns.remove(runId);
    scheduleLiveStatePush(run.userId, run.chatId);
    return injected;
  }, 95, requiredPromptInterceptorAvailable ? { required: true } : undefined);
}

registerRecallHooks();
void spindle.permissions.getGranted().then(registerRecallHooks).catch(() => {});
spindle.permissions.onChanged(() => {
  registerRecallHooks();
  const userId = resolveUserId();
  if (userId) void pushState(userId).catch(() => {});
});
if (!extensionHookSupportAvailable) {
  spindle.log.warn("Lore Recall cannot register its pre-generation and prompt hooks; native lorebook activation remains active.");
}


spindle.onFrontendMessage(async (payload, userId) => {
  setLastFrontendUserId(userId);
  const message = payload as FrontendToBackend;
  rememberChatUser(readChatIdFromMessage(message), userId);

  try {
    await ensureStorageFolders(userId);

    switch (message.type) {
      case "ready":
        await pushState(userId, message.chatId);
        break;

      case "refresh":
      case "run_diagnostics":
        // User-initiated refresh always sees fresh data — bust the world-book list cache
        // so brand-new lorebooks created in Lumiverse surface immediately.
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
        await runTrackedOperation(userId, message, "build_tree_from_metadata", (operation) =>
          buildTreeFromMetadata(message.bookIds, userId, operation),
        );
        break;

      case "build_tree_with_llm":
        await runTrackedOperation(userId, message, "build_tree_with_llm", (operation) =>
          buildTreeWithLlm(message.bookIds, userId, operation),
        );
        break;

      case "regenerate_summaries":
        await runTrackedOperation(userId, message, "regenerate_summaries", (operation) =>
          regenerateSummaries(message.bookId, message.entryIds, message.nodeIds, userId, operation),
        );
        break;

      case "export_snapshot":
        await runTrackedOperation(
          userId,
          message,
          "export_snapshot",
          (operation) => exportSnapshot(userId, operation),
          async (snapshot) => {
            send(
              {
                type: "export_snapshot_ready",
                filename: `lore-recall-${new Date(snapshot.exportedAt).toISOString().slice(0, 10)}.json`,
                snapshot,
              },
              userId,
            );
          },
        );
        break;

      case "import_snapshot":
        await runTrackedOperation(userId, message, "import_snapshot", (operation) =>
          importSnapshot(message.snapshot, userId, operation),
        );
        break;

      case "apply_suggested_books":
        await applySuggestedBooks(message.characterId, message.bookIds, message.mode, userId);
        await pushState(userId, message.chatId);
        break;
    }
  } catch (error: unknown) {
    const description = error instanceof Error ? error.message : "Unknown Lore Recall error";
    spindle.log.error(`Lore Recall ${message.type} error: ${error instanceof Error ? error.stack ?? description : description}`);
    send({ type: "error", message: description }, userId);
  }
});

spindle.log.info("Lore Recall loaded.");
