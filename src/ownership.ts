/** LumiBooks owns timeline replacement; its Codex entries use ordinary lore activation. */
export const LUMIBOOKS_TIMELINE_NOTE = "LumiBooks inserts these summaries in place of older chat messages. Recall leaves that replacement to LumiBooks; its Codex book can be selected for Recall.";

export function isLumiBooksSummaryEntry(entry: { extensions?: unknown }): boolean {
  const extensions = entry.extensions;
  // Match LumiBooks' world-info handler, which claims any truthy `lumibooks` tag.
  return !!extensions && typeof extensions === "object"
    && !!(extensions as Record<string, unknown>).lumibooks;
}

export function isLumiBooksSummaryBook(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const chatId = (metadata as Record<string, unknown>).lumibooks_chat_id;
  return typeof chatId === "string" && !!chatId.trim();
}
