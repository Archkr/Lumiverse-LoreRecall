/**
 * Gated permissions that extensions must declare in spindle.json.
 *
 * Free tier (no declaration needed): events, storage, macros, dom, variables
 *
 * Gated tier (must declare):
 * - "generation"           — fire generations on behalf of user
 * - "interceptor"          — pre-generation prompt modification
 * - "tools"                — register LLM tools
 * - "cors_proxy"           — use CORS proxy
 * - "context_handler"      — register global context middleware
 * - "generation_parameters" — inject parameters into in-flight generations via interceptors
 * - "characters"           — CRUD on character cards
 * - "chats"                — CRUD on chat sessions
 * - "personas"             — CRUD on personas
 * - "macro_interceptor"    — transform raw templates before macro parsing/dispatch
 */
export type SpindlePermission =
  | "generation"
  | "interceptor"
  | "tools"
  | "cors_proxy"
  | "context_handler"
  | "ephemeral_storage"
  | "chat_mutation"
  | "event_tracking"
  | "ui_panels"
  | "app_manipulation"
  | "oauth"
  | "characters"
  | "chats"
  | "world_books"
  | "personas"
  | "push_notification"
  | "image_gen"
  | "generation_parameters"
  | "macro_interceptor";

export const ALL_PERMISSIONS: readonly SpindlePermission[] = [
  "generation",
  "interceptor",
  "tools",
  "cors_proxy",
  "context_handler",
  "ephemeral_storage",
  "chat_mutation",
  "event_tracking",
  "ui_panels",
  "app_manipulation",
  "oauth",
  "characters",
  "chats",
  "world_books",
  "personas",
  "push_notification",
  "image_gen",
  "generation_parameters",
  "macro_interceptor",
] as const;

export function isValidPermission(p: string): p is SpindlePermission {
  return (ALL_PERMISSIONS as readonly string[]).includes(p);
}
