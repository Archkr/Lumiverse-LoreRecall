declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { ConnectionProfileDTO, LlmMessageDTO } from "lumiverse-spindle-types";
import type {
  FrontendState,
  FrontendToBackend,
  OperationIssue,
  OperationKind,
  OperationUpdate,
  RetrievalPreview,
} from "../types";
import { buildRetrievalPreview } from "./retrieval";
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
  computeSuggestedBookIds,
  getRuntimeBooks,
  listAllWorldBooks,
  loadCharacterConfig,
  loadGlobalSettings,
  saveBookConfig,
  saveCharacterConfig,
  saveGlobalSettings,
  toBookSummary,
} from "./storage";

const CONNECTION_CACHE_TTL_MS = 5000;
const connectionCache = new Map<string, { expiresAt: number; connections: ConnectionProfileDTO[] }>();
const latestStateSequence = new Map<string, number>();
const previewCache = new Map<string, RetrievalPreview | null>();

interface StateBuildEnvelope {
  state: FrontendState;
}

async function resolveActiveChat(userId: string, chatId?: string | null) {
  if (chatId) return spindle.chats.get(chatId, userId);
  return spindle.chats.getActive(userId);
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

function summarizeTrace(preview: RetrievalPreview): string {
  if (!preview.trace.length) return "no traversal trace";
  return preview.trace
    .map((step) => `${step.step}:${step.phase}:${step.label}`)
    .slice(0, 6)
    .join(" | ");
}

async function buildState(userId: string, chatId?: string | null): Promise<StateBuildEnvelope> {
  const [allBooks, activeChat, settings, connections] = await Promise.all([
    listAllWorldBooks(userId),
    resolveActiveChat(userId, chatId),
    loadGlobalSettings(userId),
    listConnectionsCached(userId),
  ]);

  const sortedBooks = allBooks
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(toBookSummary);

  const cachedPreview = activeChat?.id ? (previewCache.get(getPreviewCacheKey(userId, activeChat.id)) ?? null) : null;

  const baseState: FrontendState = {
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
    preview: cachedPreview,
  };

  if (!activeChat?.character_id) {
    return { state: baseState };
  }

  const character = await spindle.characters.get(activeChat.character_id, userId);
  if (!character) {
    return { state: baseState };
  }

  const characterConfig = await loadCharacterConfig(character.id, userId);
  const validBookIds = new Set(allBooks.map((book) => book.id));
  const selectedBookIds = characterConfig.managedBookIds.filter((bookId) => validBookIds.has(bookId));
  const attachedWorldBookIds =
    character && Array.isArray((character as unknown as { world_book_ids?: unknown }).world_book_ids)
      ? ((character as unknown as { world_book_ids?: unknown }).world_book_ids as unknown[]).filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
      : [];
  const { runtimeBooks, staleIssues } = await getRuntimeBooks(selectedBookIds, attachedWorldBookIds, userId);

  const managedEntries = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.cache.entries]));
  const bookConfigs = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.config]));
  const bookStatuses = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.status]));
  const treeIndexes = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree]));
  const unassignedCounts = Object.fromEntries(runtimeBooks.map((book) => [book.summary.id, book.tree.unassignedEntryIds.length]));
  const diagnosticsResults = buildDiagnostics(runtimeBooks, staleIssues);
  const suggestedBookIds = computeSuggestedBookIds(sortedBooks, selectedBookIds, settings);

  const nextState: FrontendState = {
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

spindle.registerInterceptor(async (messages, context) => {
  try {
    const chatId =
      context && typeof context === "object" && typeof (context as { chatId?: unknown }).chatId === "string"
        ? ((context as { chatId?: unknown }).chatId as string)
        : null;
    const connectionId =
      context && typeof context === "object" && typeof (context as { connectionId?: unknown }).connectionId === "string"
        ? ((context as { connectionId?: unknown }).connectionId as string)
        : null;
    if (!chatId) return messages;

    const userId = resolveUserId(chatId);
    if (!userId) {
      spindle.log.warn(`Lore Recall skipped retrieval for chat ${chatId} because no user context was available yet.`);
      return messages;
    }

    await ensureStorageFolders(userId);
    const settings = await loadGlobalSettings(userId);
    if (!settings.enabled) return messages;

    const chat = await spindle.chats.get(chatId, userId);
    if (!chat?.character_id) return messages;

    const character = await spindle.characters.get(chat.character_id, userId);
    const config = await loadCharacterConfig(chat.character_id, userId);
    if (!config.enabled || !config.managedBookIds.length) return messages;

    const attachedWorldBookIds =
      character && Array.isArray((character as unknown as { world_book_ids?: unknown }).world_book_ids)
        ? ((character as unknown as { world_book_ids?: unknown }).world_book_ids as unknown[]).filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0,
          )
        : [];
    const { runtimeBooks } = await getRuntimeBooks(config.managedBookIds, attachedWorldBookIds, userId);
    if (!runtimeBooks.length) return messages;

    const preview = await buildRetrievalPreview(
      messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
      settings,
      config,
      runtimeBooks,
      userId,
      {
        connectionId,
        isActual: true,
        capturedAt: Date.now(),
      },
    );
    previewCache.set(getPreviewCacheKey(userId, chatId), preview);
    if (preview) {
      if (preview.mode === "traversal" && preview.fallbackReason) {
        spindle.log.info(
          `Lore Recall traversal fell back for chat ${chatId}: ${preview.fallbackReason} [trace=${summarizeTrace(preview)}]`,
        );
      } else if (preview.mode === "traversal" && preview.controllerUsed) {
        spindle.log.info(
          `Lore Recall traversal used controller for chat ${chatId}: selected=${preview.selectedNodes.length}, connection=${preview.resolvedConnectionId ?? "default"}, trace=${summarizeTrace(preview)}`,
        );
      } else if (preview.mode === "collapsed" && preview.fallbackReason) {
        spindle.log.info(
          `Lore Recall collapsed retrieval used fallback behavior for chat ${chatId}: ${preview.fallbackReason}`,
        );
      }
    }
    if (!preview?.injectedText.trim()) return messages;

    return [{ role: "system", content: preview.injectedText }, ...messages] satisfies LlmMessageDTO[];
  } catch (error: unknown) {
    spindle.log.warn(`Lore Recall interceptor failed: ${error instanceof Error ? error.message : String(error)}`);
    return messages;
  }
}, 95);

spindle.onFrontendMessage(async (payload, userId) => {
  setLastFrontendUserId(userId);
  const message = payload as FrontendToBackend;
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
    spindle.log.error(`Lore Recall error: ${description}`);
    send({ type: "error", message: description }, userId);
  }
});

spindle.log.info("Lore Recall loaded.");
