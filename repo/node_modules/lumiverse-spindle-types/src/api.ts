import type { SpindleManifest } from "./manifest";

// ─── DTO types for messages ──────────────────────────────────────────────

export interface LlmMessageDTO {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export interface MacroDefinitionDTO {
  name: string;
  category: string;
  description: string;
  returnType?: "string" | "integer" | "number" | "boolean";
  args?: { name: string; description?: string; required?: boolean }[];
  handler: string; // serialized function body (executed in worker context)
}

export interface ToolRegistrationDTO {
  name: string;
  display_name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  council_eligible?: boolean;
}

/** Tool/function schema passed to LLM for inline function calling. */
export interface ToolSchemaDTO {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/** A single function call made by the LLM. */
export interface ToolCallDTO {
  /** Tool name (as given in the schema). */
  name: string;
  /** Parsed JSON arguments as returned by the LLM. */
  args: Record<string, unknown>;
  /** Provider call ID (e.g. Anthropic `id`, OpenAI `id`). Synthetic UUID for providers that don't supply one (e.g. Google). */
  call_id: string;
}

export interface GenerationRequestDTO {
  type: "raw" | "quiet" | "batch";
  messages?: LlmMessageDTO[];
  parameters?: Record<string, unknown>;
  connection_id?: string;
  /** Optional tool/function definitions for inline function calling (raw/quiet only). */
  tools?: ToolSchemaDTO[];
  /**
   * For operator-scoped extensions: the user ID whose connection profiles
   * and generation context should be used. For user-scoped extensions this
   * is inferred from the extension owner and can be omitted.
   */
  userId?: string;
}

export interface RequestInitDTO {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Safe representation of a user's connection profile exposed to extensions.
 * Never contains the actual API key — only `has_api_key` boolean.
 */
export interface ConnectionProfileDTO {
  id: string;
  name: string;
  provider: string;
  api_url: string;
  model: string;
  preset_id: string | null;
  is_default: boolean;
  has_api_key: boolean;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

// ─── Image Generation DTOs ──────────────────────────────────────────────

/**
 * Safe representation of an image generation connection profile.
 * Never contains the actual API key — only `has_api_key` boolean.
 */
export interface ImageGenConnectionDTO {
  id: string;
  name: string;
  provider: string;
  api_url: string;
  model: string;
  is_default: boolean;
  has_api_key: boolean;
  default_parameters: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

/** Parameter schema for a single image gen provider parameter. */
export interface ImageGenParameterSchemaDTO {
  type: "number" | "integer" | "boolean" | "string" | "select" | "image_array";
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  description: string;
  required?: boolean;
  options?: Array<{ id: string; label: string }>;
  group?: string;
}

/** Capabilities exposed by an image generation provider. */
export interface ImageGenProviderDTO {
  id: string;
  name: string;
  capabilities: {
    parameters: Record<string, ImageGenParameterSchemaDTO>;
    apiKeyRequired: boolean;
    modelListStyle: "static" | "dynamic" | "google";
    staticModels?: Array<{ id: string; label: string }>;
    defaultUrl: string;
  };
}

/** Input for `spindle.imageGen.generate()` */
export interface ImageGenRequestDTO {
  /** Connection profile ID to use. If omitted, uses the user's default image gen connection. */
  connection_id?: string;
  /** Text prompt for image generation. */
  prompt: string;
  /** Negative prompt (provider-dependent). */
  negativePrompt?: string;
  /** Model override. If omitted, uses the connection profile's model. */
  model?: string;
  /** Provider-specific parameters. Merged with the connection's default_parameters. */
  parameters?: Record<string, unknown>;
  /** For operator-scoped extensions. */
  userId?: string;
}

/** Result from `spindle.imageGen.generate()` */
export interface ImageGenResultDTO {
  imageDataUrl: string;
  model: string;
  provider: string;
  /** Persisted image ID in the images table (for gallery, backgrounds, etc.) */
  imageId?: string;
  /** Public URL for the image — works without authentication. Suitable for push notification `image` field. */
  imageUrl?: string;
}

// ─── Character DTOs ─────────────────────────────────────────────────────

/**
 * Safe representation of a character exposed to extensions.
 * Omits raw extensions blob — only exposes user-facing fields.
 */
export interface CharacterDTO {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  tags: string[];
  alternate_greetings: string[];
  creator: string;
  image_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface CharacterCreateDTO {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  tags?: string[];
  alternate_greetings?: string[];
  creator?: string;
}

export interface CharacterUpdateDTO {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  tags?: string[];
  alternate_greetings?: string[];
  creator?: string;
}

// ─── Chat DTOs ──────────────────────────────────────────────────────────

/**
 * Safe representation of a chat session exposed to extensions.
 */
export interface ChatDTO {
  id: string;
  character_id: string;
  name: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ChatUpdateDTO {
  name?: string;
  metadata?: Record<string, unknown>;
}

// ─── World Book DTOs ─────────────────────────────────────────────────────

/**
 * Safe representation of a world book exposed to extensions.
 */
export interface WorldBookDTO {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface WorldBookCreateDTO {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface WorldBookUpdateDTO {
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Full representation of a world book entry exposed to extensions.
 */
export interface WorldBookEntryDTO {
  id: string;
  world_book_id: string;
  uid: string;
  key: string[];
  keysecondary: string[];
  content: string;
  comment: string;
  position: number;
  depth: number;
  role: string | null;
  order_value: number;
  selective: boolean;
  constant: boolean;
  disabled: boolean;
  group_name: string;
  group_override: boolean;
  group_weight: number;
  probability: number;
  scan_depth: number | null;
  case_sensitive: boolean;
  match_whole_words: boolean;
  automation_id: string | null;
  use_regex: boolean;
  prevent_recursion: boolean;
  exclude_recursion: boolean;
  delay_until_recursion: boolean;
  priority: number;
  sticky: number;
  cooldown: number;
  delay: number;
  selective_logic: number;
  use_probability: boolean;
  vectorized: boolean;
  extensions: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface WorldBookEntryCreateDTO {
  key?: string[];
  keysecondary?: string[];
  content?: string;
  comment?: string;
  position?: number;
  depth?: number;
  role?: string;
  order_value?: number;
  selective?: boolean;
  constant?: boolean;
  disabled?: boolean;
  group_name?: string;
  group_override?: boolean;
  group_weight?: number;
  probability?: number;
  scan_depth?: number;
  case_sensitive?: boolean;
  match_whole_words?: boolean;
  automation_id?: string;
  use_regex?: boolean;
  prevent_recursion?: boolean;
  exclude_recursion?: boolean;
  delay_until_recursion?: boolean;
  priority?: number;
  sticky?: number;
  cooldown?: number;
  delay?: number;
  selective_logic?: number;
  use_probability?: boolean;
  vectorized?: boolean;
  extensions?: Record<string, unknown>;
}

export type WorldBookEntryUpdateDTO = WorldBookEntryCreateDTO;

// ─── Persona DTOs ──────────────────────────────────────────────────────

/**
 * Safe representation of a persona exposed to extensions.
 * Omits avatar_path (internal filesystem path) — use image_id for avatar access.
 */
export interface PersonaDTO {
  id: string;
  name: string;
  title: string;
  description: string;
  image_id: string | null;
  attached_world_book_id: string | null;
  folder: string;
  is_default: boolean;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface PersonaCreateDTO {
  name: string;
  title?: string;
  description?: string;
  folder?: string;
  is_default?: boolean;
  attached_world_book_id?: string;
  metadata?: Record<string, unknown>;
}

export interface PersonaUpdateDTO {
  name?: string;
  title?: string;
  description?: string;
  folder?: string;
  is_default?: boolean;
  attached_world_book_id?: string;
  metadata?: Record<string, unknown>;
}

// ─── Activated World Info DTOs ─────────────────────────────────────────

/**
 * Lightweight summary of an activated world info entry.
 * Safe subset — no raw entry content or internal fields exposed.
 */
export interface ActivatedWorldInfoEntryDTO {
  id: string;
  comment: string;
  keys: string[];
  source: "keyword" | "vector";
  score?: number;
}

// ─── Dry Run DTOs ──────────────────────────────────────────────────────

export interface DryRunRequestDTO {
  chatId: string;
  connectionId?: string;
  personaId?: string;
  presetId?: string;
  generationType?: string;
  parameters?: Record<string, unknown>;
}

export interface AssemblyBreakdownEntryDTO {
  type: string;
  name: string;
  role?: string;
  content?: string;
  blockId?: string;
  marker?: string;
  messageCount?: number;
  firstMessageIndex?: number;
  preCountedTokens?: number;
  excludeFromTotal?: boolean;
}

export interface ActivationStatsDTO {
  totalCandidates: number;
  activatedBeforeBudget: number;
  activatedAfterBudget: number;
  evictedByBudget: number;
  evictedByMinPriority: number;
  estimatedTokens: number;
  recursionPassesUsed: number;
}

export interface MemoryStatsDTO {
  enabled: boolean;
  chunksRetrieved: number;
  chunksAvailable: number;
  chunksPending: number;
  injectionMethod: "macro" | "fallback" | "disabled";
  retrievedChunks: Array<{
    score: number;
    tokenEstimate: number;
    messageRange: [number, number];
    preview: string;
  }>;
  queryPreview: string;
  settingsSource: "global" | "per_chat";
}

export interface DryRunTokenCountDTO {
  total_tokens: number;
  breakdown: Array<{ name: string; type: string; tokens: number; role?: string }>;
  tokenizer_id: string | null;
  tokenizer_name: string | null;
}

export interface DryRunResultDTO {
  messages: LlmMessageDTO[];
  breakdown: AssemblyBreakdownEntryDTO[];
  parameters: Record<string, unknown>;
  model: string;
  provider: string;
  tokenCount?: DryRunTokenCountDTO;
  worldInfoStats?: ActivationStatsDTO;
  memoryStats?: MemoryStatsDTO;
}

// ─── Chat Memory DTOs ──────────────────────────────────────────────────

export interface ChatMemoryChunkDTO {
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface ChatMemoryResultDTO {
  chunks: ChatMemoryChunkDTO[];
  formatted: string;
  count: number;
  enabled: boolean;
  queryPreview: string;
  settingsSource: "global" | "per_chat";
  chunksAvailable: number;
  chunksPending: number;
}

/**
 * Structured error code included in permission-denied error messages.
 * Extensions can check `error.startsWith("PERMISSION_DENIED:")` to
 * programmatically distinguish permission errors from runtime failures.
 */
export const PERMISSION_DENIED_PREFIX = "PERMISSION_DENIED:" as const;

/**
 * Detail object delivered via the `permission_denied` host→worker message
 * when a fire-and-forget registration is blocked by a missing grant.
 */
export interface PermissionDeniedDetail {
  /** The permission that was required but not granted */
  permission: string;
  /** Human-readable description of the operation that was blocked */
  operation: string;
}

/**
 * Detail object delivered via the `permission_changed` host→worker message
 * when a permission is granted or revoked at runtime (without restart).
 */
export interface PermissionChangedDetail {
  /** The permission that changed */
  permission: string;
  /** Whether the permission was granted (true) or revoked (false) */
  granted: boolean;
  /** The full list of currently granted permissions after the change */
  allGranted: string[];
}

// ─── Theme DTOs ──────────────────────────────────────────────────────────

/**
 * Theme override payload sent by extensions to customize the UI appearance.
 * Overrides are applied on top of the user's current theme and automatically
 * removed when the extension is disabled or unloaded.
 */
export interface ThemeOverrideDTO {
  /**
   * Direct CSS variable overrides applied regardless of light/dark mode.
   * Keys are CSS custom property names (e.g. `--lumiverse-primary`).
   * Values must be valid CSS values.
   *
   * Common variable groups:
   * - **Primary accent**: `--lumiverse-primary`, `--lumiverse-primary-hover`, `-text`, `-muted`, `-light`, `-010`…`-050`, `-contrast`
   * - **Backgrounds**: `--lumiverse-bg`, `-elevated`, `-hover`, `-dark`, `-darker`, `-deep`, `-040`…`-070`
   * - **Text**: `--lumiverse-text`, `-muted`, `-dim`, `-hint`
   * - **Borders**: `--lumiverse-border`, `-hover`, `-light`, `-neutral`, `-neutral-hover`
   * - **Status**: `--lumiverse-danger`, `--lumiverse-success`, `--lumiverse-warning` (+ `-015`, `-020`, `-050` variants)
   * - **Glass**: `--lcs-glass-bg`, `-bg-hover`, `-border`, `-border-hover`, `-blur`, `-soft-blur`, `-strong-blur`
   * - **Prose**: `--lumiverse-prose-italic`, `-bold`, `-dialogue`, `-blockquote`, `-link`
   * - **Shadows**: `--lumiverse-shadow`, `-sm`, `-md`, `-lg`, `-xl`
   * - **Radii**: `--lumiverse-radius`, `-sm`, `-md`, `-lg`, `-xl`, `--lcs-radius`, `-sm`, `-xs`
   * - **Fills**: `--lumiverse-fill`, `-subtle`, `-hover`, `-medium`, `-strong`, `-heavy`, `-deepest`
   * - **Cards**: `--lumiverse-card-bg`, `--lumiverse-card-image-bg`
   * - **Icons**: `--lumiverse-icon`, `-muted`, `-dim`
   * - **Modals**: `--lumiverse-modal-backdrop`, `--lumiverse-gradient-modal`, `--lumiverse-swatch-border`
   * - **Typography**: `--lumiverse-font-family`, `--lumiverse-font-mono`, `--lumiverse-font-scale`
   * - **Transitions**: `--lumiverse-transition`, `--lumiverse-transition-fast`, `--lcs-transition`, `--lcs-transition-fast`
   */
  variables?: Record<string, string>;

  /**
   * Mode-specific CSS variable overrides. When the user switches between
   * light and dark mode, the frontend selects the matching set.
   * Mode-specific values override flat `variables` for the same key.
   */
  variablesByMode?: {
    dark?: Record<string, string>;
    light?: Record<string, string>;
  };
}

/**
 * RGB color value (0–255 per channel).
 */
export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

/**
 * HSL color value (h: 0–360, s: 0–100, l: 0–100).
 */
export interface ColorHSL {
  h: number;
  s: number;
  l: number;
}

/**
 * Result of extracting colors from an image.
 * Each region's dominant color is returned along with metadata.
 */
export interface ColorExtractionResult {
  /** Overall dominant color of the full image */
  dominant: ColorRGB;
  /** Dominant color per sampled region */
  regions: {
    top: ColorRGB;
    center: ColorRGB;
    bottom: ColorRGB;
    left: ColorRGB;
    right: ColorRGB;
  };
  /** Per-region flatness score (0–1). High values = monotone/solid region. */
  flatness: {
    top: number;
    center: number;
    bottom: number;
    left: number;
    right: number;
    full: number;
  };
  /** Simple average color across all sampled pixels */
  average: ColorRGB;
  /** Whether the dominant color is perceived as light (luminance > 152) */
  isLight: boolean;
  /** HSL representation of the dominant color */
  dominantHsl: ColorHSL;
}

/**
 * Read-only snapshot of the user's current theme configuration.
 */
export interface ThemeInfoDTO {
  /** Theme preset ID (e.g. `"lumiverse-purple"`, `"character-aware"`) */
  id: string;
  /** Display name of the theme */
  name: string;
  /** Resolved mode — always `"light"` or `"dark"`, never `"system"` */
  mode: "light" | "dark";
  /** Primary accent color in HSL (hue 0-360, saturation 0-100, lightness 0-100) */
  accent: { h: number; s: number; l: number };
  /** Whether glassmorphic backdrop-filter effects are enabled */
  enableGlass: boolean;
  /** Border radius multiplier (1.0 = default) */
  radiusScale: number;
  /** Font size multiplier (1.0 = default) */
  fontScale: number;
  /** Whether the theme dynamically adapts to the active character's avatar */
  characterAware: boolean;
}

// ─── Modal content items (used by backend-initiated modals) ─────────────

/**
 * Structured content items for backend-initiated modals (`spindle.modal.open`).
 * The host renders these into the modal body using system theming.
 * For full DOM control, use the frontend `ctx.ui.showModal()` API instead.
 */
export type SpindleModalItemDTO =
  /** A block of text content. Supports multiline via newlines. */
  | { type: "text"; content: string; muted?: boolean }
  /** A horizontal divider line. */
  | { type: "divider" }
  /** A label–value pair displayed in a horizontal row. */
  | { type: "key_value"; label: string; value: string }
  /** A section heading within the modal body. */
  | { type: "heading"; content: string }
  /** A themed card/container that groups child items. */
  | { type: "card"; items: SpindleModalItemDTO[] };

// ─── Worker → Host messages ──────────────────────────────────────────────

export type WorkerToHost =
  | { type: "subscribe_event"; event: string }
  | { type: "unsubscribe_event"; event: string }
  | { type: "register_macro"; definition: MacroDefinitionDTO }
  | { type: "unregister_macro"; name: string }
  | { type: "update_macro_value"; name: string; value: string }
  | { type: "register_interceptor"; priority?: number }
  | { type: "intercept_result"; requestId: string; messages: LlmMessageDTO[] }
  | { type: "register_tool"; tool: ToolRegistrationDTO }
  | { type: "unregister_tool"; name: string }
  | { type: "request_generation"; requestId: string; input: GenerationRequestDTO }
  | { type: "storage_read"; requestId: string; path: string }
  | { type: "storage_write"; requestId: string; path: string; data: string }
  | { type: "storage_read_binary"; requestId: string; path: string }
  | {
      type: "storage_write_binary";
      requestId: string;
      path: string;
      data: Uint8Array;
    }
  | { type: "storage_delete"; requestId: string; path: string }
  | { type: "storage_list"; requestId: string; prefix?: string }
  | { type: "storage_exists"; requestId: string; path: string }
  | { type: "storage_mkdir"; requestId: string; path: string }
  | { type: "storage_move"; requestId: string; from: string; to: string }
  | { type: "storage_stat"; requestId: string; path: string }
  | { type: "ephemeral_read"; requestId: string; path: string }
  | {
      type: "ephemeral_write";
      requestId: string;
      path: string;
      data: string;
      ttlMs?: number;
      reservationId?: string;
    }
  | { type: "ephemeral_read_binary"; requestId: string; path: string }
  | {
      type: "ephemeral_write_binary";
      requestId: string;
      path: string;
      data: Uint8Array;
      ttlMs?: number;
      reservationId?: string;
    }
  | { type: "ephemeral_delete"; requestId: string; path: string }
  | { type: "ephemeral_list"; requestId: string; prefix?: string }
  | { type: "ephemeral_stat"; requestId: string; path: string }
  | { type: "ephemeral_clear_expired"; requestId: string }
  | { type: "ephemeral_pool_status"; requestId: string }
  | {
      type: "ephemeral_request_block";
      requestId: string;
      sizeBytes: number;
      ttlMs?: number;
      reason?: string;
    }
  | {
      type: "ephemeral_release_block";
      requestId: string;
      reservationId: string;
    }
  | { type: "permissions_get_granted"; requestId: string }
  | { type: "connections_list"; requestId: string; userId?: string }
  | { type: "connections_get"; requestId: string; connectionId: string; userId?: string }
  | { type: "chat_get_messages"; requestId: string; chatId: string }
  | {
      type: "chat_append_message";
      requestId: string;
      chatId: string;
      message: {
        role: "system" | "user" | "assistant";
        content: string;
        metadata?: Record<string, unknown>;
      };
    }
  | {
      type: "chat_update_message";
      requestId: string;
      chatId: string;
      messageId: string;
      patch: {
        content?: string;
        metadata?: Record<string, unknown>;
      };
    }
  | {
      type: "chat_delete_message";
      requestId: string;
      chatId: string;
      messageId: string;
    }
  | {
      type: "events_track";
      requestId: string;
      eventName: string;
      payload?: Record<string, unknown>;
      options?: {
        level?: "debug" | "info" | "warn" | "error";
        chatId?: string;
        retentionDays?: number;
      };
    }
  | {
      type: "events_query";
      requestId: string;
      filter?: {
        eventName?: string;
        chatId?: string;
        since?: string;
        until?: string;
        level?: "debug" | "info" | "warn" | "error";
        limit?: number;
      };
    }
  | {
      type: "events_replay";
      requestId: string;
      filter?: {
        eventName?: string;
        chatId?: string;
        since?: string;
        until?: string;
        level?: "debug" | "info" | "warn" | "error";
        limit?: number;
      };
    }
  | {
      type: "events_get_latest_state";
      requestId: string;
      keys: string[];
    }
  | { type: "cors_request"; requestId: string; url: string; options: RequestInitDTO }
  | { type: "register_context_handler"; priority?: number }
  | {
      type: "context_handler_result";
      requestId: string;
      context: unknown;
    }
  | {
      type: "macro_result";
      requestId: string;
      result?: string;
      error?: string;
    }
  | { type: "frontend_message"; payload: unknown }
  | { type: "user_storage_read"; requestId: string; path: string; userId?: string }
  | { type: "user_storage_write"; requestId: string; path: string; data: string; userId?: string }
  | { type: "user_storage_delete"; requestId: string; path: string; userId?: string }
  | { type: "user_storage_list"; requestId: string; prefix?: string; userId?: string }
  | { type: "user_storage_exists"; requestId: string; path: string; userId?: string }
  | { type: "user_storage_mkdir"; requestId: string; path: string; userId?: string }
  | { type: "enclave_put"; requestId: string; key: string; value: string; userId?: string }
  | { type: "enclave_get"; requestId: string; key: string; userId?: string }
  | { type: "enclave_delete"; requestId: string; key: string; userId?: string }
  | { type: "enclave_has"; requestId: string; key: string; userId?: string }
  | { type: "enclave_list"; requestId: string; userId?: string }
  | {
      type: "oauth_callback_result";
      requestId: string;
      html?: string;
      error?: string;
    }
  | { type: "tool_invocation_result"; requestId: string; result?: string; error?: string }
  | { type: "create_oauth_state"; requestId: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  // ─── Variables (free tier) ──────────────────────────────────────────
  | { type: "vars_get_local"; requestId: string; chatId: string; key: string }
  | { type: "vars_set_local"; requestId: string; chatId: string; key: string; value: string }
  | { type: "vars_delete_local"; requestId: string; chatId: string; key: string }
  | { type: "vars_list_local"; requestId: string; chatId: string }
  | { type: "vars_has_local"; requestId: string; chatId: string; key: string }
  | { type: "vars_get_global"; requestId: string; key: string; userId?: string }
  | { type: "vars_set_global"; requestId: string; key: string; value: string; userId?: string }
  | { type: "vars_delete_global"; requestId: string; key: string; userId?: string }
  | { type: "vars_list_global"; requestId: string; userId?: string }
  | { type: "vars_has_global"; requestId: string; key: string; userId?: string }
  // ─── Characters (gated: "characters") ──────────────────────────────
  | { type: "characters_list"; requestId: string; limit?: number; offset?: number; userId?: string }
  | { type: "characters_get"; requestId: string; characterId: string; userId?: string }
  | { type: "characters_create"; requestId: string; input: CharacterCreateDTO; userId?: string }
  | { type: "characters_update"; requestId: string; characterId: string; input: CharacterUpdateDTO; userId?: string }
  | { type: "characters_delete"; requestId: string; characterId: string; userId?: string }
  // ─── Chats (gated: "chats") ────────────────────────────────────────
  | { type: "chats_list"; requestId: string; characterId?: string; limit?: number; offset?: number; userId?: string }
  | { type: "chats_get"; requestId: string; chatId: string; userId?: string }
  | { type: "chats_get_active"; requestId: string; userId?: string }
  | { type: "chats_update"; requestId: string; chatId: string; input: ChatUpdateDTO; userId?: string }
  | { type: "chats_delete"; requestId: string; chatId: string; userId?: string }
  // ─── World Books (gated: "world_books") ──────────────────────────────
  | { type: "world_books_list"; requestId: string; limit?: number; offset?: number; userId?: string }
  | { type: "world_books_get"; requestId: string; worldBookId: string; userId?: string }
  | { type: "world_books_create"; requestId: string; input: WorldBookCreateDTO; userId?: string }
  | { type: "world_books_update"; requestId: string; worldBookId: string; input: WorldBookUpdateDTO; userId?: string }
  | { type: "world_books_delete"; requestId: string; worldBookId: string; userId?: string }
  // ─── World Book Entries (gated: "world_books") ───────────────────────
  | { type: "world_book_entries_list"; requestId: string; worldBookId: string; limit?: number; offset?: number; userId?: string }
  | { type: "world_book_entries_get"; requestId: string; entryId: string; userId?: string }
  | { type: "world_book_entries_create"; requestId: string; worldBookId: string; input: WorldBookEntryCreateDTO; userId?: string }
  | { type: "world_book_entries_update"; requestId: string; entryId: string; input: WorldBookEntryUpdateDTO; userId?: string }
  | { type: "world_book_entries_delete"; requestId: string; entryId: string; userId?: string }
  // ─── Personas (gated: "personas") ────────────────────────────────────
  | { type: "personas_list"; requestId: string; limit?: number; offset?: number; userId?: string }
  | { type: "personas_get"; requestId: string; personaId: string; userId?: string }
  | { type: "personas_get_default"; requestId: string; userId?: string }
  | { type: "personas_get_active"; requestId: string; userId?: string }
  | { type: "personas_create"; requestId: string; input: PersonaCreateDTO; userId?: string }
  | { type: "personas_update"; requestId: string; personaId: string; input: PersonaUpdateDTO; userId?: string }
  | { type: "personas_delete"; requestId: string; personaId: string; userId?: string }
  | { type: "personas_switch"; requestId: string; personaId: string | null; userId?: string }
  | { type: "personas_get_world_book"; requestId: string; personaId: string; userId?: string }
  // ─── Activated World Info (gated: "world_books") ───────────────────
  | { type: "world_books_get_activated"; requestId: string; chatId: string; userId?: string }
  // ─── Dry Run (gated: "generation") ────────────────────────────────
  | { type: "generate_dry_run"; requestId: string; input: DryRunRequestDTO; userId?: string }
  // ─── Chat Memories (gated: "chats") ───────────────────────────────
  | { type: "chats_get_memories"; requestId: string; chatId: string; topK?: number; userId?: string }
  // ─── Toast (free tier) ───────────────────────────────────────────────
  | { type: "toast_show"; toastType: "success" | "warning" | "error" | "info"; message: string; title?: string; duration?: number }
  // ─── Push Notifications (gated: "push_notification") ────────────────
  | { type: "push_send"; requestId: string; title: string; body: string; tag?: string; url?: string; userId?: string; icon?: string; rawTitle?: boolean; image?: string }
  | { type: "push_get_status"; requestId: string; userId?: string }
  // ─── User Visibility (free tier) ───────────────────────────────────
  | { type: "user_is_visible"; requestId: string; userId?: string }
  // ─── Text Editor (free tier) ───────────────────────────────────────
  | { type: "text_editor_open"; requestId: string; title?: string; value?: string; placeholder?: string; userId?: string }
  // ─── Modal (free tier) ────────────────────────────────────────────
  | { type: "modal_open"; requestId: string; title: string; items: SpindleModalItemDTO[]; width?: number; maxHeight?: number; persistent?: boolean; userId?: string }
  | { type: "confirm_open"; requestId: string; title: string; message: string; variant?: "info" | "warning" | "danger" | "success"; confirmLabel?: string; cancelLabel?: string; userId?: string }
  // ─── Macro Resolution (free tier) ──────────────────────────────────
  | { type: "macros_resolve"; requestId: string; template: string; chatId?: string; characterId?: string; userId?: string }
  // ─── Image Generation (gated: "image_gen") ──────────────────────────
  | { type: "image_gen_generate"; requestId: string; input: ImageGenRequestDTO }
  | { type: "image_gen_providers"; requestId: string; userId?: string }
  | { type: "image_gen_connections_list"; requestId: string; userId?: string }
  | { type: "image_gen_connections_get"; requestId: string; connectionId: string; userId?: string }
  | { type: "image_gen_models"; requestId: string; connectionId: string; userId?: string }
  // ─── Theme (gated: "app_manipulation") ──────────────────────────────────
  | { type: "theme_apply"; requestId: string; overrides: ThemeOverrideDTO; userId?: string }
  | { type: "theme_clear"; requestId: string; userId?: string }
  | { type: "theme_get_current"; requestId: string; userId?: string }
  // ─── Color Extraction (gated: "app_manipulation") ─────────────────────
  | { type: "color_extract"; requestId: string; imageId: string; userId?: string };

// ─── Host → Worker messages ──────────────────────────────────────────────

export type HostToWorker =
  | { type: "init"; manifest: SpindleManifest; storagePath: string }
  | { type: "event"; event: string; payload: unknown }
  | {
      type: "intercept_request";
      requestId: string;
      messages: LlmMessageDTO[];
      context: unknown;
    }
  | {
      type: "context_handler_request";
      requestId: string;
      context: unknown;
    }
  | {
      type: "response";
      requestId: string;
      result?: unknown;
      error?: string;
    }
  | {
      type: "permission_denied";
      permission: string;
      operation: string;
    }
  | {
      type: "permission_changed";
      permission: string;
      granted: boolean;
      allGranted: string[];
    }
  | {
      type: "tool_invocation";
      requestId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | { type: "shutdown" }
  | { type: "frontend_message"; payload: unknown; userId: string }
  | {
      type: "oauth_callback";
      requestId: string;
      params: Record<string, string>;
    };
