/** LumiBooks summaries need a handoff after its timeline injector has run. */
export const LUMIBOOKS_TIMELINE_NOTE = "Use in Recall lets Recall select this book's summaries and control their final injection. Unselected books stay with LumiBooks. Enabled constant entries still bypass model selection and JEV.";

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
