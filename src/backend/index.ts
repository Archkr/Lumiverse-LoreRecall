declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { ConnectionProfileDTO, LlmMessageDTO } from "lumiverse-spindle-types";
import type { FrontendState, FrontendToBackend } from "../types";
import { buildRetrievalPreview } from "./retrieval";
import {
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

async function resolveActiveChat(userId: string, chatId?: string | null) {
  if (chatId) return spindle.chats.get(chatId, userId);
  return spindle.chats.getActive(userId);
}

async function buildState(userId: string, chatId?: string | null): Promise<FrontendState> {
  const [allBooks, activeChat, settings, connections] = await Promise.all([
    listAllWorldBooks(userId),
    resolveActiveChat(userId, chatId),
    loadGlobalSettings(userId),
    spindle.connections.list(userId).catch(() => [] as ConnectionProfileDTO[]),
  ]);

  const sortedBooks = allBooks
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(toBookSummary);

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
    preview: null,
  };

  if (!activeChat?.character_id) return baseState;

  const character = await spindle.characters.get(activeChat.character_id, userId);
  if (!character) return baseState;

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

  const preview =
    settings.enabled && characterConfig.enabled && runtimeBooks.length
      ? await buildRetrievalPreview(
          (await spindle.chat.getMessages(activeChat.id)).map((message) => ({
            role: message.role,
            content: message.content,
          })),
          settings,
          characterConfig,
          runtimeBooks,
        )
      : null;

  return {
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
    preview,
  };
}

async function pushState(userId: string, chatId?: string | null): Promise<void> {
  const state = await buildState(userId, chatId);
  rememberChatUser(state.activeChatId, userId);
  send({ type: "state", state }, userId);
}

spindle.registerInterceptor(async (messages, context) => {
  try {
    const chatId =
      context && typeof context === "object" && typeof (context as { chatId?: unknown }).chatId === "string"
        ? ((context as { chatId?: unknown }).chatId as string)
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

    const preview = await buildRetrievalPreview(messages as Array<{ role: "system" | "user" | "assistant"; content: string }>, settings, config, runtimeBooks);
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
        await buildTreeFromMetadata(message.bookIds, userId);
        await pushState(userId, message.chatId);
        break;

      case "build_tree_with_llm":
        await buildTreeWithLlm(message.bookIds, userId);
        await pushState(userId, message.chatId);
        break;

      case "regenerate_summaries":
        await regenerateSummaries(message.bookId, message.entryIds, message.nodeIds, userId);
        await pushState(userId, message.chatId);
        break;

      case "export_snapshot": {
        const snapshot = await exportSnapshot(userId);
        send(
          {
            type: "export_snapshot_ready",
            filename: `lore-recall-${new Date(snapshot.exportedAt).toISOString().slice(0, 10)}.json`,
            snapshot,
          },
          userId,
        );
        await pushState(userId, message.chatId);
        break;
      }

      case "import_snapshot":
        await importSnapshot(message.snapshot, userId);
        await pushState(userId, message.chatId);
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
