// ---- Council Types ----

/** A council member backed by a Lumia item from a pack. */
export interface CouncilMember {
  id: string;
  packId: string;
  packName: string;
  itemId: string;
  itemName: string;
  /** Tool names this member is assigned. */
  tools: string[];
  /** Freeform role description (e.g. "Plot Enforcer"). */
  role: string;
  /** Probability (0–100) that this member participates each generation. */
  chance: number;
}

// ---- Sidecar LLM ----

/**
 * Shared sidecar LLM configuration — binds to an existing connection profile.
 * Used by council tools, expression detection, and other background LLM features.
 * Stored as the `sidecarSettings` user setting, independent of council.
 */
export interface SidecarConfig {
  connectionProfileId: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
}

/**
 * @deprecated Use `SidecarConfig` instead. Kept for backwards compatibility
 * with code that references the old name.
 */
export type CouncilSidecarConfig = SidecarConfig;

// ---- Council Tool Settings ----

/** Settings governing council tool execution. */
export interface CouncilToolsSettings {
  /**
   * @deprecated Tools are now active when any council member has tools assigned.
   * This field is ignored by the backend but kept for backwards compatibility
   * with saved settings that include it.
   */
  enabled?: boolean;
  /** Execution mode: "sidecar" uses a separate LLM, "inline" sends tools as function definitions to the main LLM. */
  mode: "sidecar" | "inline";
  /** Timeout per tool call in ms. */
  timeoutMs: number;
  /** Number of recent chat messages to include in sidecar context. */
  sidecarContextWindow: number;
  includeUserPersona: boolean;
  includeCharacterInfo: boolean;
  includeWorldInfo: boolean;
  /** Whether the user can trigger individual tools on demand. */
  allowUserControl: boolean;
  /** Word limit per tool response (0 = unlimited). */
  maxWordsPerTool: number;
  /** When true, council tools are NOT re-executed on regenerations and swipes.
   *  Instead, the last successful council results (cached in chat metadata) are
   *  reused. Tools still fire for fresh sends, continues, impersonations, etc. */
  retainResultsForRegens?: boolean;
  /**
   * @deprecated Sidecar config is now stored as a top-level `sidecarSettings`
   * user setting. This field is read as a fallback for backwards compatibility.
   */
  sidecar?: SidecarConfig;
}

/** Top-level council settings object persisted per user. */
export interface CouncilSettings {
  councilMode: boolean;
  members: CouncilMember[];
  toolsSettings: CouncilToolsSettings;
}

// ---- Tool Invocation Context ----

/**
 * Personality snapshot of the council member that triggered a tool invocation.
 *
 * Delivered to extension `TOOL_INVOCATION` handlers when an extension-provided
 * council tool is executed as part of a council cycle. Allows extensions to
 * personalise their tool pipeline with the assigned member's identity, role,
 * and Lumia personality fields.
 *
 * This field is optional — it is only populated when the tool is invoked via
 * the council execution path. Tools invoked outside council (e.g. future
 * inline function calling) will not see this context.
 */
export interface CouncilMemberContext {
  /** Unique council member id (council settings row id). */
  memberId: string;
  /** Source Lumia item id this member is backed by. */
  itemId: string;
  /** Pack id the Lumia item lives in. */
  packId: string;
  /** Pack name the Lumia item lives in. */
  packName: string;
  /** Display name of the Lumia item (also used as the member name). */
  name: string;
  /** Freeform role description assigned by the user (e.g. "Plot Enforcer"). */
  role: string;
  /** Probability (0–100) that this member participates each generation. */
  chance: number;
  /** Relative URL to the member's avatar (e.g. `/api/v1/images/{id}`), or null. */
  avatarUrl: string | null;
  /** Lumia item "definition" field — physical/identity description. */
  definition: string;
  /** Lumia item "personality" field. */
  personality: string;
  /** Lumia item "behavior" field — behavioural patterns. */
  behavior: string;
  /** Gender identity marker (0=unspecified, 1=feminine, 2=masculine). */
  genderIdentity: 0 | 1 | 2;
}

// ---- Execution Results ----

/** Result of a single tool invocation for a single member. */
export interface CouncilToolResult {
  memberId: string;
  memberName: string;
  toolName: string;
  toolDisplayName: string;
  success: boolean;
  content: string;
  error?: string;
  durationMs: number;
}

/** Aggregate result of a full council execution cycle. */
export interface CouncilExecutionResult {
  results: CouncilToolResult[];
  deliberationBlock: string;
  totalDurationMs: number;
}

/** Cached council results persisted in `chat.metadata.last_council_results`.
 *  Used when `retainResultsForRegens` is enabled to skip re-execution on
 *  regenerations and swipes. */
export interface CachedCouncilResult {
  results: CouncilToolResult[];
  deliberationBlock: string;
  /** Named result variables extracted from tool definitions with `resultVariable`. */
  namedResults: Record<string, string>;
  /** Unix epoch ms when this cache was written. */
  cachedAt: number;
}

// ---- Tool Definition ----

export type CouncilToolCategory =
  | "story_direction"
  | "character_accuracy"
  | "writing_quality"
  | "context"
  | "content"
  | "extension";

export type CouncilToolExecution =
  | "llm"
  | "host"
  | "extension"
  | "mcp";

/** Canonical definition of a council tool (built-in or DLC). */
export interface CouncilToolDefinition {
  name: string;
  displayName: string;
  description: string;
  category: CouncilToolCategory;
  /** Optional explicit runtime. When omitted, the host may infer one from the tool source. */
  execution?: CouncilToolExecution;
  /** The prompt sent to the sidecar LLM when invoking prompt-style LLM tools. */
  prompt?: string;
  /**
   * JSON Schema describing the prompt-style tool's expected output structure.
   *
   * Historically this field was also used as the callable argument schema for
   * extension / MCP tools. New host-callable tools should prefer `argsSchema`
   * instead so invocation arguments and returned content are not conflated.
   */
  inputSchema?: Record<string, unknown>;
  /** JSON Schema describing the callable arguments for host / extension / MCP tools. */
  argsSchema?: Record<string, unknown>;
  /** If set, the tool's result is stored under this variable name for macro access. */
  resultVariable?: string;
  /** Whether this tool's output appears in the deliberation block (default true). */
  storeInDeliberation?: boolean;
  /** Feature gate — tool is hidden when the named feature is disabled. */
  gatedBy?: string;
  /** Display name of the owning extension (set by frontend for extension-category tools). */
  extensionName?: string;
}

// ---- Defaults ----

export const SIDECAR_DEFAULTS: SidecarConfig = {
  connectionProfileId: "",
  model: "",
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
};

/** @deprecated Use `SIDECAR_DEFAULTS` instead. */
export const COUNCIL_SIDECAR_DEFAULTS: SidecarConfig = { ...SIDECAR_DEFAULTS };

export const COUNCIL_TOOLS_DEFAULTS: CouncilToolsSettings = {
  mode: "sidecar",
  timeoutMs: 30000,
  sidecarContextWindow: 25,
  includeUserPersona: true,
  includeCharacterInfo: true,
  includeWorldInfo: true,
  allowUserControl: false,
  maxWordsPerTool: 250,
  retainResultsForRegens: false,
};

export const COUNCIL_SETTINGS_DEFAULTS: CouncilSettings = {
  councilMode: false,
  members: [],
  toolsSettings: { ...COUNCIL_TOOLS_DEFAULTS },
};
