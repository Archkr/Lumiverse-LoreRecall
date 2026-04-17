declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { BackendToFrontend, FrontendToBackend } from "../types";

export const GLOBAL_SETTINGS_PATH = "global/settings.json";
export const CHARACTER_CONFIG_DIR = "characters";
export const BOOK_CONFIG_DIR = "books";
export const TREE_DIR = "trees";
export const CACHE_DIR = "cache";
export const PAGE_LIMIT = 200;
export const CACHE_VERSION = 2 as const;

let lastFrontendUserId: string | null = null;
const chatUserIds = new Map<string, string>();

export function setLastFrontendUserId(userId: string): void {
  lastFrontendUserId = userId;
}

export function getLastFrontendUserId(): string | null {
  return lastFrontendUserId;
}

export function send(message: BackendToFrontend, userId = lastFrontendUserId ?? undefined): void {
  (spindle.sendToFrontend as unknown as (payload: unknown, targetUserId?: string) => void)(message, userId);
}

export function rememberChatUser(chatId: string | null | undefined, userId: string | null | undefined): void {
  if (!chatId || !userId) return;
  chatUserIds.set(chatId, userId);
}

export function resolveUserId(chatId?: string | null): string | null {
  if (chatId) {
    const mapped = chatUserIds.get(chatId);
    if (mapped) return mapped;
  }
  return lastFrontendUserId;
}

export function readChatIdFromMessage(message: FrontendToBackend): string | null {
  if (!("chatId" in message)) return null;
  return typeof message.chatId === "string" && message.chatId.trim() ? message.chatId : null;
}

export function getCharacterConfigPath(characterId: string): string {
  return `${CHARACTER_CONFIG_DIR}/${characterId}.json`;
}

export function getBookConfigPath(bookId: string): string {
  return `${BOOK_CONFIG_DIR}/${bookId}.json`;
}

export function getTreePath(bookId: string): string {
  return `${TREE_DIR}/${bookId}.json`;
}

export function getBookCachePath(bookId: string): string {
  return `${CACHE_DIR}/${bookId}.json`;
}

export async function ensureStorageFolders(userId: string): Promise<void> {
  await Promise.all([
    spindle.userStorage.mkdir("global", userId).catch(() => {}),
    spindle.userStorage.mkdir(CHARACTER_CONFIG_DIR, userId).catch(() => {}),
    spindle.userStorage.mkdir(BOOK_CONFIG_DIR, userId).catch(() => {}),
    spindle.userStorage.mkdir(TREE_DIR, userId).catch(() => {}),
    spindle.userStorage.mkdir(CACHE_DIR, userId).catch(() => {}),
  ]);
}
