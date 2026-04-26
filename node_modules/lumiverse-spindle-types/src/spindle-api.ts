import type { SpindleManifest } from "./manifest";
import type {
  LlmMessageDTO,
  InterceptorResultDTO,
  MacroDefinitionDTO,
  MacroResolveOptionsDTO,
  MacroResolveResultDTO,
  ToolRegistrationDTO,
  GenerationRequestDTO,
  RequestInitDTO,
  ConnectionProfileDTO,
  PermissionDeniedDetail,
  PermissionChangedDetail,
  CharacterDTO,
  CharacterCreateDTO,
  CharacterAvatarUploadDTO,
  CharacterUpdateDTO,
  ChatDTO,
  ChatUpdateDTO,
  WorldBookDTO,
  WorldBookCreateDTO,
  WorldBookUpdateDTO,
  WorldBookEntryDTO,
  WorldBookEntryCreateDTO,
  WorldBookEntryUpdateDTO,
  PersonaDTO,
  PersonaCreateDTO,
  PersonaUpdateDTO,
  ActivatedWorldInfoEntryDTO,
  DryRunRequestDTO,
  DryRunResultDTO,
  ChatMemoryResultDTO,
  ImageGenRequestDTO,
  ImageGenResultDTO,
  ImageGenConnectionDTO,
  ImageGenProviderDTO,
  ThemeOverrideDTO,
  ThemeInfoDTO,
  ThemePaletteConfigDTO,
  ThemeVariablesConfigDTO,
  ColorExtractionResult,
  SpindleModalItemDTO,
  SpindleCommandDTO,
  SpindleCommandContextDTO,
  GenerationStartedPayloadDTO,
  StreamTokenPayloadDTO,
  GenerationEndedPayloadDTO,
  GenerationStoppedPayloadDTO,
  GenerationObserver,
  MessageSwipedPayloadDTO,
  SwipeEditedPayloadDTO,
  ToolInvocationPayloadDTO,
  StreamChunkDTO,
  TokenCountOptionsDTO,
  TokenCountResultDTO,
  MacroInterceptorCtxDTO,
  MacroInterceptorResultDTO,
  MessageContentProcessorCtxDTO,
  MessageContentProcessorResultDTO,
} from "./api";

/** The global `spindle` object available in backend extension workers */
export interface SpindleAPI {
  /** Subscribe to generation-started events (requires `generation` permission). The optional `userId` identifies which user triggered the event. */
  on(event: "GENERATION_STARTED", handler: (payload: GenerationStartedPayloadDTO, userId?: string) => void): () => void;
  /** Subscribe to streamed token events (requires `generation` permission). The optional `userId` identifies which user triggered the event. */
  on(event: "STREAM_TOKEN_RECEIVED", handler: (payload: StreamTokenPayloadDTO, userId?: string) => void): () => void;
  /** Subscribe to generation-ended events (requires `generation` permission). The optional `userId` identifies which user triggered the event. */
  on(event: "GENERATION_ENDED", handler: (payload: GenerationEndedPayloadDTO, userId?: string) => void): () => void;
  /** Subscribe to generation-stopped events (requires `generation` permission). The optional `userId` identifies which user triggered the event. */
  on(event: "GENERATION_STOPPED", handler: (payload: GenerationStoppedPayloadDTO, userId?: string) => void): () => void;
  /**
   * Subscribe to swipe lifecycle events. The payload's `action` discriminator
   * tells you whether a swipe was added, updated, deleted, or navigated, and
   * `swipeId` identifies which slot the event concerns.
   */
  on(event: "MESSAGE_SWIPED", handler: (payload: MessageSwipedPayloadDTO, userId?: string) => void): () => void;
  /**
   * Subscribe to `SWIPE_EDITED` events. Emitted when {@link SpindleAPI.chat.updateMessage}
   * explicitly rewrites one or more swipe-shaped fields (`swipes`, `swipe_id`,
   * or `swipe_dates`). Plain content-only edits continue to emit `MESSAGE_EDITED`
   * only. This event is coarser than `MESSAGE_SWIPED` by design — use
   * `MESSAGE_SWIPED` when you need the `added`/`updated`/`deleted`/`navigated`
   * discriminator.
   */
  on(event: "SWIPE_EDITED", handler: (payload: SwipeEditedPayloadDTO, userId?: string) => void): () => void;
  /**
   * Receive invocations for tools registered via {@link SpindleAPI.registerTool}.
   *
   * The handler must return the tool's textual result (or a promise thereof).
   * Undefined / null returns are coerced to an empty string by the host.
   *
   * When the invocation originates from a council execution cycle, the payload
   * includes a `councilMember` snapshot describing the assigned member
   * (identity, role, chance, avatar URL, and Lumia personality fields) so the
   * extension can tailor its tool output to that member's voice.
   */
  on(
    event: "TOOL_INVOCATION",
    handler: (payload: ToolInvocationPayloadDTO) => string | Promise<string> | void | Promise<void>
  ): () => void;
  /** Subscribe to a Lumiverse event. Multi-user extensions should use the optional `userId` to keep per-user state and notifications isolated. */
  on(event: string, handler: (payload: unknown, userId?: string) => void): () => void;

  /** Register a macro. Handler contexts expose `commit === false` during dry resolves. */
  registerMacro(def: MacroDefinitionDTO): void;
  /** Unregister a macro */
  unregisterMacro(name: string): void;
  /**
   * Push the latest value for a registered macro.
   * During prompt assembly the host returns this cached value instantly
   * instead of doing a synchronous RPC roundtrip to the worker.
   * Call this whenever the underlying data changes (e.g. from a polling loop).
   */
  updateMacroValue(name: string, value: string): void;

  /**
   * Register an interceptor for pre-generation prompt modification.
   *
   * The handler receives the assembled messages and a context object, and may
   * return either a plain `LlmMessageDTO[]` (backwards-compatible) or an
   * `InterceptorResultDTO` to also inject generation parameters into the
   * outgoing LLM request. `InterceptorResultDTO.breakdown` can be used to mark
   * specific injected messages as Prompt Breakdown entries so dry-run/live UI
   * and saved breakdowns can attribute them back to the extension.
   *
   * Returning `parameters` requires the `generation_parameters` permission.
   * Without it, returned parameters are silently stripped.
   */
  registerInterceptor(
    handler: (
      messages: LlmMessageDTO[],
      context: unknown
    ) => Promise<LlmMessageDTO[] | InterceptorResultDTO>,
    priority?: number
  ): void;

  /** Register an LLM tool */
  registerTool(tool: ToolRegistrationDTO): void;
  /** Unregister an LLM tool */
  unregisterTool(name: string): void;

  /**
   * Generation helpers.
   *
   * All three entry points (`raw`, `quiet`, `batch`) accept a standard
   * `AbortSignal` via `input.signal`. Aborting the signal tears down the
   * upstream LLM HTTP request and rejects the returned promise with an
   * `AbortError` (`err.name === "AbortError"`). This is the same pattern
   * `fetch()` uses, so it composes with `AbortSignal.timeout()` and
   * `AbortSignal.any([...])`.
   *
   * @example
   * ```ts
   * const controller = new AbortController()
   * const result = spindle.generate.raw({
   *   provider: "openai",
   *   model: "gpt-4o-mini",
   *   messages,
   *   signal: controller.signal,
   * })
   * // Cancel from elsewhere — e.g. user closed the panel
   * controller.abort()
   * ```
   */
  generate: {
    raw(input: GenerationRequestDTO): Promise<unknown>;
    quiet(input: GenerationRequestDTO): Promise<unknown>;
    batch(input: GenerationRequestDTO): Promise<unknown>;
    /**
     * Streaming variant of {@link raw}. Returns an async generator that
     * yields incremental {@link StreamChunkDTO} values:
     *
     *  - `{ type: 'token', token }`     — content chunk
     *  - `{ type: 'reasoning', token }` — chain-of-thought chunk
     *  - `{ type: 'done', ... }`        — final aggregated response (emitted exactly once)
     *
     * Tool-call deltas, finish reason, and token usage live on the terminal
     * `done` chunk. If the upstream call fails or the request is aborted
     * via `input.signal`, the generator rejects with the underlying error
     * (`AbortError` for cancellations).
     *
     * @example
     * ```ts
     * const ctrl = new AbortController()
     * setTimeout(() => ctrl.abort(), 30_000)
     * try {
     *   for await (const chunk of spindle.generate.rawStream({
     *     provider: 'openai',
     *     model: 'gpt-4o-mini',
     *     messages,
     *     signal: ctrl.signal,
     *   })) {
     *     if (chunk.type === 'token') process.stdout.write(chunk.token)
     *     else if (chunk.type === 'done') usage = chunk.usage
     *   }
     * } catch (err) {
     *   if (err instanceof Error && err.name === 'AbortError') return
     *   throw err
     * }
     * ```
     */
    rawStream(input: GenerationRequestDTO): AsyncGenerator<StreamChunkDTO, void, void>;
    /**
     * Streaming variant of {@link quiet}. Same chunk schema and abort
     * semantics as {@link rawStream}.
     *
     * Note: streaming is not exposed for `batch` — compose multiple
     * `rawStream` / `quietStream` calls yourself if you need parallel
     * streamed responses.
     */
    quietStream(input: GenerationRequestDTO): AsyncGenerator<StreamChunkDTO, void, void>;
    /** Run a dry-run prompt assembly without calling the LLM. */
    dryRun(input: DryRunRequestDTO, userId?: string): Promise<DryRunResultDTO>;
    /**
     * Observe an in-flight generation on a chat.
     *
     * Returns a {@link GenerationObserver} that subscribes to the generation
     * lifecycle events for the given `chatId` and accumulates streamed
     * content/reasoning automatically. Call `.dispose()` when done.
     *
     * Requires the `generation` permission.
     *
     * @example
     * ```ts
     * const obs = spindle.generate.observe("chat-uuid");
     * obs.onStart((info) => console.log("Started:", info.model));
     * obs.onToken((t) => console.log("Token:", t.token));
     * obs.onEnd((r) => {
     *   console.log("Done:", obs.content);
     *   obs.dispose();
     * });
     * ```
     */
    observe(chatId: string): GenerationObserver;
  };

  /** Scoped storage (per-extension virtual disk) */
  storage: {
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
    readBinary(path: string): Promise<Uint8Array>;
    writeBinary(path: string, data: Uint8Array): Promise<void>;
    delete(path: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    move(from: string, to: string): Promise<void>;
    stat(path: string): Promise<{
      exists: boolean;
      isFile: boolean;
      isDirectory: boolean;
      sizeBytes: number;
      modifiedAt: string;
    }>;
    getJson<T>(path: string, options?: { fallback?: T }): Promise<T>;
    setJson(path: string, value: unknown, options?: { indent?: number }): Promise<void>;
  };

  /** Per-user scoped storage (isolated per user, even for operator-scoped extensions) */
  userStorage: {
    read(path: string, userId?: string): Promise<string>;
    write(path: string, data: string, userId?: string): Promise<void>;
    readBinary(path: string, userId?: string): Promise<Uint8Array>;
    writeBinary(path: string, data: Uint8Array, userId?: string): Promise<void>;
    delete(path: string, userId?: string): Promise<void>;
    list(prefix?: string, userId?: string): Promise<string[]>;
    exists(path: string, userId?: string): Promise<boolean>;
    mkdir(path: string, userId?: string): Promise<void>;
    move(from: string, to: string, userId?: string): Promise<void>;
    stat(path: string, userId?: string): Promise<{
      exists: boolean;
      isFile: boolean;
      isDirectory: boolean;
      sizeBytes: number;
      modifiedAt: string;
    }>;
    getJson<T>(path: string, options?: { fallback?: T; userId?: string }): Promise<T>;
    setJson(path: string, value: unknown, options?: { indent?: number; userId?: string }): Promise<void>;
  };

  /** Encrypted at-rest secret storage (per-user, AES-256-GCM) */
  enclave: {
    put(key: string, value: string, userId?: string): Promise<void>;
    get(key: string, userId?: string): Promise<string | null>;
    delete(key: string, userId?: string): Promise<boolean>;
    has(key: string, userId?: string): Promise<boolean>;
    list(userId?: string): Promise<string[]>;
  };

  /** Temporary storage (permission: ephemeral_storage) */
  ephemeral: {
    read(path: string): Promise<string>;
    write(
      path: string,
      data: string,
      options?: { ttlMs?: number; reservationId?: string }
    ): Promise<void>;
    readBinary(path: string): Promise<Uint8Array>;
    writeBinary(
      path: string,
      data: Uint8Array,
      options?: { ttlMs?: number; reservationId?: string }
    ): Promise<void>;
    delete(path: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
    stat(path: string): Promise<{
      sizeBytes: number;
      createdAt: string;
      expiresAt?: string;
    }>;
    clearExpired(): Promise<number>;
    getPoolStatus(): Promise<{
      globalMaxBytes: number;
      globalUsedBytes: number;
      globalReservedBytes: number;
      globalAvailableBytes: number;
      extensionMaxBytes: number;
      extensionUsedBytes: number;
      extensionReservedBytes: number;
      extensionAvailableBytes: number;
      fileCount: number;
      fileCountMax: number;
    }>;
    requestBlock(
      sizeBytes: number,
      options?: { ttlMs?: number; reason?: string }
    ): Promise<{
      reservationId: string;
      sizeBytes: number;
      expiresAt: string;
    }>;
    releaseBlock(reservationId: string): Promise<void>;
  };

  /** Chat mutation helpers */
  chat: {
    getMessages(chatId: string): Promise<Array<{
      id: string;
      role: "system" | "user" | "assistant";
      content: string;
      /**
       * The free-form `extra` bag minus `spindle_metadata` (which is surfaced
       * separately on `metadata`). Carries reasoning text/duration, attachments,
       * and any host-owned housekeeping fields.
       */
      extra: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      /** Index of the active swipe in `swipes`. `0` when the message has no alternates. */
      swipe_id: number;
      /**
       * All swipe variants for this message, including the currently active one.
       * `swipes[swipe_id]` always equals `content`.
       */
      swipes: string[];
      /** Per-swipe creation timestamps (unix epoch seconds), aligned with `swipes`. */
      swipe_dates: number[];
    }>>;
    appendMessage(
      chatId: string,
      message: {
        role: "system" | "user" | "assistant";
        content: string;
        metadata?: Record<string, unknown>;
      }
    ): Promise<{ id: string }>;
    /**
     * Patch an existing message. All fields are optional; `undefined` leaves
     * the field untouched. Precedence rules:
     *
     *  - If `content` is supplied, it overwrites both `messages.content` and
     *    `swipes[swipe_id]` (the active slot).
     *  - If `swipes` is supplied without `content`, the new active content is
     *    derived from `swipes[swipe_id]` (either the supplied `swipe_id` or
     *    the existing one).
     *  - If only `swipe_id` is supplied, it acts as a navigation and content
     *    is re-derived from the existing swipes array.
     *  - `reasoning.text === null` clears `extra.reasoning`; `reasoning.duration
     *    === null` clears `extra.reasoning_duration`. The two are independent.
     *
     * When any of `swipes`/`swipe_id`/`swipe_dates` are supplied, a
     * `SWIPE_EDITED` event is emitted alongside (or instead of) `MESSAGE_EDITED`.
     */
    updateMessage(
      chatId: string,
      messageId: string,
      patch: {
        content?: string;
        metadata?: Record<string, unknown>;
        swipes?: string[];
        swipe_id?: number;
        swipe_dates?: number[];
        reasoning?: {
          text?: string | null;
          duration?: number | null;
        };
      }
    ): Promise<void>;
    deleteMessage(chatId: string, messageId: string): Promise<void>;
    /**
     * Mark a single message as hidden or visible. Hidden messages are
     * excluded from chat memory embeddings (vector retrieval) but, in the
     * current build, are still included in chat history during prompt
     * assembly. See `chat-mutation.md` for the full semantics.
     *
     * Requires the `chat_mutation` permission.
     */
    setMessageHidden(chatId: string, messageId: string, hidden: boolean): Promise<void>;
    /**
     * Bulk variant of {@link setMessageHidden}. Capped at 500 message IDs
     * per call (matching the underlying service limit).
     *
     * Requires the `chat_mutation` permission.
     */
    setMessagesHidden(chatId: string, messageIds: string[], hidden: boolean): Promise<void>;
    /**
     * Read the hidden flag for a single message. Returns `false` for messages
     * that have never had the flag set. Requires the `chat_mutation` permission.
     */
    isMessageHidden(chatId: string, messageId: string): Promise<boolean>;
  };

  /** Extension-level telemetry */
  events: {
    track(
      eventName: string,
      payload?: Record<string, unknown>,
      options?: {
        level?: "debug" | "info" | "warn" | "error";
        chatId?: string;
        retentionDays?: number;
      }
    ): Promise<void>;
    query(filter?: {
      eventName?: string;
      chatId?: string;
      since?: string;
      until?: string;
      level?: "debug" | "info" | "warn" | "error";
      limit?: number;
    }): Promise<
      Array<{
        id: string;
        ts: string;
        eventName: string;
        level: "debug" | "info" | "warn" | "error";
        chatId?: string;
        payload?: Record<string, unknown>;
      }>
    >;
    replay(filter?: {
      eventName?: string;
      chatId?: string;
      since?: string;
      until?: string;
      level?: "debug" | "info" | "warn" | "error";
      limit?: number;
    }): Promise<
      Array<{
        id: string;
        ts: string;
        eventName: string;
        level: "debug" | "info" | "warn" | "error";
        chatId?: string;
        payload?: Record<string, unknown>;
      }>
    >;
    getLatestState(keys: string[]): Promise<Record<string, unknown>>;
  };

  /**
   * Connection profile access (permission: "generation").
   * Returns safe representations — API keys are never exposed.
   */
  connections: {
    /**
     * List connection profiles visible to the current user context.
     * For user-scoped extensions, userId is inferred from the extension owner.
     * For operator-scoped extensions, pass userId to scope to a specific user.
     */
    list(userId?: string): Promise<ConnectionProfileDTO[]>;
    /**
     * Get a single connection profile by ID.
     * Returns null if the connection doesn't exist or isn't accessible.
     */
    get(connectionId: string, userId?: string): Promise<ConnectionProfileDTO | null>;
  };

  /** Server-side token counting helpers (free tier). */
  tokens: {
    /** Count tokens for an arbitrary text string. `options.model` overrides `options.modelSource`. */
    countText(text: string, options?: TokenCountOptionsDTO): Promise<TokenCountResultDTO>;
    /**
     * Count tokens for an array of chat-style messages.
     *
     * This accepts any array whose items expose `{ role, content }`, so the
     * normalized output of `spindle.chat.getMessages(chatId)` can be passed
     * directly without reshaping. `options.model` overrides `options.modelSource`.
     */
    countMessages(
      messages: Array<Pick<LlmMessageDTO, "role" | "content">>,
      options?: TokenCountOptionsDTO
    ): Promise<TokenCountResultDTO>;
    /** Count tokens for a live stored chat by ID. `options.model` overrides `options.modelSource`. */
    countChat(chatId: string, options?: TokenCountOptionsDTO): Promise<TokenCountResultDTO>;
  };

  /**
   * Image generation (permission: "image_gen").
   * Generate images via the user's configured image gen connection profiles.
   * Supports listing providers, connections, models, and firing generations.
   */
  imageGen: {
    /**
     * Generate an image using a connection profile.
     * If `connection_id` is omitted, uses the user's default image gen connection.
     * Returns the image as a base64 data URL.
     */
    generate(input: ImageGenRequestDTO): Promise<ImageGenResultDTO>;
    /**
     * List available image generation providers with their capability schemas.
     * The schemas describe supported parameters, models, and features.
     */
    getProviders(userId?: string): Promise<ImageGenProviderDTO[]>;
    /**
     * List the user's image gen connection profiles.
     * API keys are never exposed — only `has_api_key` boolean.
     */
    listConnections(userId?: string): Promise<ImageGenConnectionDTO[]>;
    /**
     * Get a single image gen connection profile by ID.
     * Returns null if not found or not accessible.
     */
    getConnection(connectionId: string, userId?: string): Promise<ImageGenConnectionDTO | null>;
    /**
     * List available models for a connection profile.
     * For providers with dynamic model lists, this fetches live from the upstream API.
     */
    getModels(connectionId: string, userId?: string): Promise<Array<{ id: string; label: string }>>;
  };

  /**
   * Local (transient), global (user-scoped), and chat (persisted) variable access
   * (free tier — no permission needed).
   * Uses the same storage as built-in {{getvar}}/{{setgvar}}/{{getchatvar}} macros.
   */
  variables: {
    local: {
      get(chatId: string, key: string): Promise<string>;
      set(chatId: string, key: string, value: string): Promise<void>;
      delete(chatId: string, key: string): Promise<void>;
      list(chatId: string): Promise<Record<string, string>>;
      has(chatId: string, key: string): Promise<boolean>;
    };
    global: {
      get(key: string, userId?: string): Promise<string>;
      set(key: string, value: string, userId?: string): Promise<void>;
      delete(key: string, userId?: string): Promise<void>;
      list(userId?: string): Promise<Record<string, string>>;
      has(key: string, userId?: string): Promise<boolean>;
    };
    /** Chat-scoped persisted variables — stored in chat.metadata.chat_variables.
     *  Persists across generations within the same chat. */
    chat: {
      get(chatId: string, key: string): Promise<string>;
      set(chatId: string, key: string, value: string): Promise<void>;
      delete(chatId: string, key: string): Promise<void>;
      list(chatId: string): Promise<Record<string, string>>;
      has(chatId: string, key: string): Promise<boolean>;
    };
  };

  /**
   * Character CRUD (permission: "characters").
   * Returns safe DTO representations — raw extensions blob is not exposed.
   * For user-scoped extensions, userId is inferred from the extension owner.
   * For operator-scoped extensions, pass userId to scope to a specific user.
   */
  characters: {
    list(options?: { limit?: number; offset?: number; userId?: string }): Promise<{ data: CharacterDTO[]; total: number }>;
    get(characterId: string, userId?: string): Promise<CharacterDTO | null>;
    create(input: CharacterCreateDTO, userId?: string): Promise<CharacterDTO>;
    setAvatar(characterId: string, avatar: CharacterAvatarUploadDTO, userId?: string): Promise<CharacterDTO>;
    update(characterId: string, input: CharacterUpdateDTO, userId?: string): Promise<CharacterDTO>;
    delete(characterId: string, userId?: string): Promise<boolean>;
  };

  /**
   * Chat session CRUD (permission: "chats").
   * Separate from `chat` (message-level mutation) — this operates on chat entities.
   * For user-scoped extensions, userId is inferred from the extension owner.
   * For operator-scoped extensions, pass userId to scope to a specific user.
   */
  chats: {
    list(options?: { characterId?: string; limit?: number; offset?: number; userId?: string }): Promise<{ data: ChatDTO[]; total: number }>;
    get(chatId: string, userId?: string): Promise<ChatDTO | null>;
    /** Get the user's currently active chat (as tracked by the frontend). Returns null if none. */
    getActive(userId?: string): Promise<ChatDTO | null>;
    update(chatId: string, input: ChatUpdateDTO, userId?: string): Promise<ChatDTO>;
    delete(chatId: string, userId?: string): Promise<boolean>;
    /** Get top-K chat memory chunks for a chat via vector search. */
    getMemories(chatId: string, options?: { topK?: number; userId?: string }): Promise<ChatMemoryResultDTO>;
  };

  /**
   * World Books CRUD (permission: "world_books").
   * Full access to world books and their entries.
   * For user-scoped extensions, userId is inferred from the extension owner.
   * For operator-scoped extensions, pass userId to scope to a specific user.
   */
  world_books: {
    list(options?: { limit?: number; offset?: number; userId?: string }): Promise<{ data: WorldBookDTO[]; total: number }>;
    get(worldBookId: string, userId?: string): Promise<WorldBookDTO | null>;
    create(input: WorldBookCreateDTO, userId?: string): Promise<WorldBookDTO>;
    update(worldBookId: string, input: WorldBookUpdateDTO, userId?: string): Promise<WorldBookDTO>;
    delete(worldBookId: string, userId?: string): Promise<boolean>;
    entries: {
      list(worldBookId: string, options?: { limit?: number; offset?: number; userId?: string }): Promise<{ data: WorldBookEntryDTO[]; total: number }>;
      get(entryId: string, userId?: string): Promise<WorldBookEntryDTO | null>;
      create(worldBookId: string, input: WorldBookEntryCreateDTO, userId?: string): Promise<WorldBookEntryDTO>;
      update(entryId: string, input: WorldBookEntryUpdateDTO, userId?: string): Promise<WorldBookEntryDTO>;
      delete(entryId: string, userId?: string): Promise<boolean>;
    };
    /** Get activated world info entries (keyword + vector) for a chat. */
    getActivated(chatId: string, userId?: string): Promise<ActivatedWorldInfoEntryDTO[]>;
  };

  /**
   * Personas CRUD (permission: "personas").
   * Manage user personas (identity profiles).
   * For user-scoped extensions, userId is inferred from the extension owner.
   * For operator-scoped extensions, pass userId to scope to a specific user.
   */
  personas: {
    list(options?: { limit?: number; offset?: number; userId?: string }): Promise<{ data: PersonaDTO[]; total: number }>;
    get(personaId: string, userId?: string): Promise<PersonaDTO | null>;
    /** Get the user's default persona (is_default = true). Returns null if none set. */
    getDefault(userId?: string): Promise<PersonaDTO | null>;
    /** Get the user's currently active persona (as tracked by the frontend). Returns null if none. */
    getActive(userId?: string): Promise<PersonaDTO | null>;
    create(input: PersonaCreateDTO, userId?: string): Promise<PersonaDTO>;
    update(personaId: string, input: PersonaUpdateDTO, userId?: string): Promise<PersonaDTO>;
    delete(personaId: string, userId?: string): Promise<boolean>;
    /** Switch the active persona by setting the `activePersonaId` setting. Pass null to deactivate. */
    switchActive(personaId: string | null, userId?: string): Promise<void>;
    /** Get the world book attached to a persona. Returns null if none attached. */
    getWorldBook(personaId: string, userId?: string): Promise<WorldBookDTO | null>;
  };

  permissions: {
    getGranted(): Promise<string[]>;
    /**
     * Synchronously check whether a specific permission is currently granted.
     * Uses the local permission cache which is kept in sync with the host
     * via `permission_changed` messages — no RPC roundtrip needed.
     */
    has(permission: string): boolean;
    /**
     * Register a handler invoked whenever a gated operation is blocked
     * because the required permission has not been granted.
     * Returns an unsubscribe function.
     */
    onDenied(handler: (detail: PermissionDeniedDetail) => void): () => void;
    /**
     * Register a handler invoked whenever a permission is granted or revoked
     * at runtime (without requiring a restart). The handler receives the
     * permission name, whether it was granted, and the full list of currently
     * granted permissions.
     * Returns an unsubscribe function.
     */
    onChanged(handler: (detail: PermissionChangedDetail) => void): () => void;
  };

  /** Make a CORS-proxied HTTP request */
  cors(url: string, options?: RequestInitDTO): Promise<unknown>;

  /** Register a context handler for enriching generation context */
  registerContextHandler(
    handler: (context: unknown) => Promise<unknown>,
    priority?: number
  ): void;

  /**
   * Register a macro interceptor (permission: `macro_interceptor`).
   *
   * Runs at the top of `MacroEvaluator.evaluate()`, once per fixed-point
   * iteration, before Lumiverse parses the template. Receives the raw
   * template plus a read-only env snapshot and returns either a transformed
   * template or `void` to pass through.
   *
   * Use this when per-macro RPC cost dominates iteration-heavy templates
   * (e.g. `{{#each LARGE_LIST}}…{{my_macro}}…{{/each}}`). For single macros
   * without iteration, prefer {@link SpindleAPI.registerMacro}.
   *
   * Each invocation runs inside a 10-second wall-clock budget on the host.
   * On timeout or thrown error the chain logs the failure and forwards the
   * previous template to the next handler — macro evaluation itself never
   * aborts. A second registration from the same extension replaces the
   * previous handler.
   *
   * @param handler  Returns the transformed template, or `void` to pass through.
   * @param priority Lower values run first. Default `100`.
   *
   * @example
   * ```ts
   * spindle.registerMacroInterceptor(async (ctx) => {
   *   if (!ctx.template.includes('{{my_macro')) return
   *   return resolveInWorker(ctx.template, ctx.env)
   * }, 100)
   * ```
   */
  registerMacroInterceptor(
    handler: (
      ctx: MacroInterceptorCtxDTO
    ) => Promise<MacroInterceptorResultDTO>,
    priority?: number
  ): void;

  /**
   * Register a message content processor (permission: `chat_mutation`).
   *
   * Runs synchronously inside every user-initiated message-write REST
   * route (create, update, swipe add/update) and the auto-greeting path,
   * before the row reaches SQLite. The returned patch transforms both the
   * stored row and every `MESSAGE_SENT` / `MESSAGE_EDITED` / `MESSAGE_SWIPED`
   * subscriber on first paint.
   *
   * Not invoked for `spindle.chat.*` mutations — those paths intentionally
   * bypass the processor chain to avoid loops on an extension's own writes.
   *
   * Each invocation runs inside a 10-second wall-clock budget on the host.
   * On timeout or thrown error the chain logs the failure and forwards the
   * previous content to the next handler — the write still proceeds. A
   * second registration from the same extension replaces the previous
   * handler.
   *
   * Every millisecond of handler work is visible latency on send/edit/swipe.
   * Keep handlers tight.
   *
   * @param handler  Receives the about-to-be-committed content; returns a
   *                 patch, or `void` to pass through.
   * @param priority Lower values run first. Default `100`.
   *
   * @example
   * ```ts
   * spindle.registerMessageContentProcessor(async (ctx) => {
   *   if (!ctx.content.includes('{{my_macro}}')) return
   *   return { content: ctx.content.replaceAll('{{my_macro}}', 'resolved') }
   * }, 50)
   * ```
   */
  registerMessageContentProcessor(
    handler: (
      ctx: MessageContentProcessorCtxDTO
    ) => Promise<MessageContentProcessorResultDTO | void>,
    priority?: number
  ): void;

  /**
   * Send a message to the frontend module.
   *
   * @param payload  Arbitrary JSON-serializable data delivered to the
   *                 extension's frontend module via the `SPINDLE_FRONTEND_MSG`
   *                 WebSocket event.
   * @param userId   Optional target user. When omitted on operator-scoped
   *                 extensions the message is broadcast to **every connected
   *                 user**, which is rarely what you want — pass the userId
   *                 from the original `onFrontendMessage` handler (or any
   *                 other API call site that surfaced one) to route the reply
   *                 only to that user. User-scoped extensions always deliver
   *                 to their installer regardless of this argument.
   */
  sendToFrontend(payload: unknown, userId?: string): void;
  /** Receive messages from the frontend module (userId is the sender) */
  onFrontendMessage(handler: (payload: unknown, userId: string) => void): () => void;

  /** Logging */
  log: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };

  /**
   * Push notifications (permission: "push_notification").
   * Send OS-level push notifications to users and check push status.
   * Notifications are attributed to your extension name.
   */
  push: {
    /**
     * Send a push notification to a user's registered devices.
     * Only delivered when the app is not focused (avoids double-notification).
     * Operator-scoped extensions should pass the `userId` from the triggering
     * frontend message or event handler to avoid cross-user delivery.
     */
    send(input: {
      title: string;
      body: string;
      tag?: string;
      url?: string;
      /** Relative URL path to an icon image (e.g. `/api/v1/images/{id}?size=sm`). Must start with `/`. */
      icon?: string;
      /** When true, the notification title is used as-is without the extension name prefix. */
      rawTitle?: boolean;
      /** Relative URL path to a large image displayed in the notification body (e.g. `/api/v1/image-gen/results/{id}?size=lg`). Must start with `/`. */
      image?: string;
    }, userId?: string): Promise<{ sent: number }>;
    /**
     * Check if push notifications are available for a user.
     * Returns subscription count and whether the push system is active.
     */
    getStatus(userId?: string): Promise<{
      available: boolean;
      subscriptionCount: number;
    }>;
  };

  /**
   * Text editor (free tier — no permission needed).
   * Opens the native Lumiverse expanded text editor modal on the user's
   * frontend. Provides macro syntax highlighting, insertion panel, and
   * full-screen editing. The call blocks until the user closes the editor.
   */
  textEditor: {
    /**
     * Open the text editor and wait for the user to close it.
     *
     * @example
     * ```ts
     * const result = await spindle.textEditor.open({
     *   title: 'Edit System Prompt',
     *   value: currentText,
     * })
     * if (!result.cancelled) {
     *   currentText = result.text
     * }
     * ```
     */
    open(options?: {
      title?: string;
      value?: string;
      placeholder?: string;
      /** For operator-scoped extensions only. */
      userId?: string;
    }): Promise<{
      text: string;
      cancelled: boolean;
    }>;
  };

  /**
   * Macro resolution (free tier — no permission needed).
   * Resolve `{{macro}}` placeholders in arbitrary text using
   * the full Lumiverse macro engine (character fields, chat context,
   * variables, time/date, random, etc.).
   */
  macros: {
    /**
     * Resolve all macros in the given template string.
     * Provide `chatId` and/or `characterId` for full context resolution.
     * Without them, only context-free macros (time, random, etc.) resolve.
     * Set `commit: false` for a dry / non-committing resolve; extension macro
     * handlers will receive `ctx.commit === false`.
     *
     * @example
     * ```ts
     * const { text } = await spindle.macros.resolve(
     *   'Hello {{user}}, I am {{char}}!',
     *   { chatId: 'abc', characterId: 'xyz' },
     * )
     * ```
     */
    resolve(
      template: string,
      options?: MacroResolveOptionsDTO,
    ): Promise<MacroResolveResultDTO>;
  };

  /**
   * User presence queries (free tier — no permission needed).
   * Check whether a user currently has the Lumiverse app visible/focused
   * in at least one browser tab or PWA window.
   */
  users: {
    /**
     * Returns true if the user has the app visible in at least one session.
     * Returns false if all sessions are hidden/backgrounded or the user has no
     * active WebSocket connections.
     * For user-scoped extensions, userId is inferred from the extension owner.
     * For operator-scoped extensions, pass userId explicitly.
     */
    isVisible(userId?: string): Promise<boolean>;
  };

  /** Show toast notifications in the frontend UI (free tier — no permission needed) */
  toast: {
    success(message: string, options?: { title?: string; duration?: number; /** For operator-scoped extensions only. */ userId?: string }): void;
    warning(message: string, options?: { title?: string; duration?: number; /** For operator-scoped extensions only. */ userId?: string }): void;
    error(message: string, options?: { title?: string; duration?: number; /** For operator-scoped extensions only. */ userId?: string }): void;
    info(message: string, options?: { title?: string; duration?: number; /** For operator-scoped extensions only. */ userId?: string }): void;
  };

  /** OAuth callback handling (permission: "oauth") */
  oauth: {
    /** Register a handler invoked when this extension's OAuth callback URL is hit */
    onCallback(handler: (params: Record<string, string>) => Promise<{ html?: string } | void>): () => void;
    /** Get the relative callback URL path for this extension */
    getCallbackUrl(): string;
    /** Create a platform-managed OAuth state nonce for CSRF protection */
    createState(): Promise<string>;
  };

  /**
   * Theme manipulation (permission: "app_manipulation").
   * Apply CSS variable overrides on top of the user's current theme.
   * Overrides are scoped to the extension and automatically removed
   * when the extension is disabled or unloaded.
   *
   * @example
   * ```ts
   * // Apply a blue-tinted theme with mode-aware backgrounds
   * await spindle.theme.apply({
   *   variables: {
   *     '--lumiverse-primary': 'hsl(210, 80%, 60%)',
   *   },
   *   variablesByMode: {
   *     dark: {
   *       '--lumiverse-bg': 'hsl(210, 12%, 11%)',
   *       '--lumiverse-bg-elevated': 'hsl(210, 12%, 14%)',
   *     },
   *     light: {
   *       '--lumiverse-bg': 'hsl(210, 20%, 96%)',
   *       '--lumiverse-bg-elevated': 'hsl(210, 20%, 100%)',
   *     },
   *   },
   * })
   *
   * // Extract colors from an image, then apply as theme
   * const palette = await spindle.theme.extractColors('image-id-here')
   * console.log(palette.dominant, palette.regions, palette.dominantHsl)
   *
   * // Read current theme state
   * const info = await spindle.theme.getCurrent()
   * console.log(info.mode, info.accent)
   *
   * // Remove all overrides
   * await spindle.theme.clear()
   * ```
   */
  theme: {
    /**
     * Apply CSS variable overrides on top of the user's current theme.
     * Subsequent calls merge with (and overwrite) any previously applied
     * overrides from this extension. The frontend applies overrides
     * immediately via a WebSocket event.
     *
     * Use `variablesByMode` to specify different values for light/dark mode.
     * Mode-specific values take precedence over flat `variables` for the same key.
     */
    apply(overrides: ThemeOverrideDTO): Promise<void>;
    /**
     * Apply a palette-driven theme using Lumiverse's own presentation rules.
     *
     * Unlike `apply()`, this method does not let extensions push raw CSS
     * variables. Lumiverse derives the full light/dark variable maps from the
     * provided accent and preserves the user's glass, radius, font, and UI
     * scale settings.
     */
    applyPalette(palette: ThemePaletteConfigDTO, userId?: string): Promise<void>;
    /**
     * Remove all CSS variable overrides previously applied by this extension.
     * The UI reverts to the user's base theme.
     */
    clear(): Promise<void>;
    /**
     * Get a read-only snapshot of the user's current theme configuration.
     * Returns the base theme info (not including any extension overrides).
     */
    getCurrent(userId?: string): Promise<ThemeInfoDTO>;
    /**
     * Extract colors from an image stored in Lumiverse's image system.
     * Returns dominant, regional, and average colors with flatness scores.
     * Useful for building mode-aware theme overrides from character avatars
     * or other images.
     *
     * @param imageId - ID of an image in the images table
     */
    extractColors(imageId: string, userId?: string): Promise<ColorExtractionResult>;
    /**
     * Generate the full set of Lumiverse CSS variables from a theme config.
     *
     * Returns a `Record<string, string>` containing every CSS variable the
     * theme engine would produce — primary accent variants, backgrounds,
     * borders, text, glass tokens, shadows, radii, prose tokens, and more
     * (~80+ variables). The result can be passed directly to `apply()` for a
     * complete, coherent theme override.
     *
     * @example
     * ```ts
     * // Extract palette from an image, then generate + apply a full theme
     * const palette = await spindle.theme.extractColors(imageId)
     * const vars = await spindle.theme.generateVariables({
     *   accent: palette.dominantHsl,
     *   mode: 'dark',
     * })
     * await spindle.theme.apply({ variables: vars })
     * ```
     */
    generateVariables(config: ThemeVariablesConfigDTO): Promise<Record<string, string>>;
  };

  /**
   * Modal presentation (free tier — no permission needed).
   * Opens a system-themed modal overlay on the user's frontend.
   * The host renders the chrome (backdrop, header, close button);
   * the extension provides structured content items for the body.
   *
   * **Stack limit:** A maximum of 2 modals may be open per extension at any
   * time. Attempting to open a third rejects with an error. This prevents
   * extensions from layering unbounded UI. Typical usage: one primary modal
   * plus one nested text editor or confirmation prompt.
   *
   * @example
   * ```ts
   * const result = await spindle.modal.open({
   *   title: 'Recent Nudges',
   *   items: [
   *     { type: 'text', content: 'Hello from the character!' },
   *     { type: 'divider' },
   *     { type: 'key_value', label: 'Sent', value: '2 hours ago' },
   *   ],
   * })
   * // result.dismissedBy === 'user' | 'extension' | 'cleanup'
   * ```
   */
  modal: {
    /**
     * Open a modal and wait for it to be dismissed.
     * The host serializes the provided `items` into a themed body layout.
     * The call blocks until the modal is closed.
     */
    open(options: {
      /** Header title. */
      title: string;
      /** Structured body content items rendered by the host. */
      items: SpindleModalItemDTO[];
      /** Optional width override. Default: `420`. Clamped to viewport. */
      width?: number;
      /** Optional max-height override. Default: `520`. Clamped to viewport. */
      maxHeight?: number;
      /**
       * If true, clicking the backdrop does NOT dismiss the modal.
       * Default: `false`.
       */
      persistent?: boolean;
      /**
       * Caller-provided request ID for the modal. When supplied, the host uses
       * this value (instead of the internal correlation requestId) as the modal
       * identity key, enabling programmatic close via `spindle.modal.close()`
       * before the modal resolves.
       */
      modalRequestId?: string;
      /** For operator-scoped extensions only. */
      userId?: string;
    }): Promise<{
      openRequestId: string;
      /** How the modal was dismissed. */
      dismissedBy: "user" | "extension" | "cleanup";
    }>;
    /**
     * Programmatically close a modal that was opened with `spindle.modal.open()`.
     * `openRequestId` is the request ID returned alongside the modal handle.
     * Resolves immediately after the dismiss event is emitted.
     */
    close(openRequestId: string, userId?: string): Promise<void>;
    /**
     * Show a confirmation modal and wait for the user's response.
     * The host renders a themed dialog with a message, variant-colored
     * confirm button, and a cancel button. The call blocks until the
     * user responds.
     *
     * Counts toward the 2 stacked modals limit per extension.
     *
     * @example
     * ```ts
     * const { confirmed } = await spindle.modal.confirm({
     *   title: 'Clear History',
     *   message: 'This will delete all nudge history. This action cannot be undone.',
     *   variant: 'danger',
     *   confirmLabel: 'Delete',
     * })
     * if (confirmed) {
     *   await clearHistory()
     * }
     * ```
     */
    confirm(options: {
      /** Header title. */
      title: string;
      /** Body text explaining what the user is confirming. */
      message: string;
      /**
       * Visual variant for the confirm button.
       * `'info'` (default) | `'warning'` | `'danger'` | `'success'`
       */
      variant?: "info" | "warning" | "danger" | "success";
      /** Label for the confirm button. Default: `"Confirm"`. */
      confirmLabel?: string;
      /** Label for the cancel button. Default: `"Cancel"`. */
      cancelLabel?: string;
      /** For operator-scoped extensions only. */
      userId?: string;
    }): Promise<{
      /** `true` if the user clicked confirm, `false` if cancelled or dismissed. */
      confirmed: boolean;
    }>;
  };

  /**
   * User input prompts (free tier — no permission needed).
   * Present a text input modal to the user and await their response.
   * The call blocks until the user submits or cancels.
   *
   * @example
   * ```ts
   * const { value, cancelled } = await spindle.prompt.input({
   *   title: 'Rename Preset',
   *   placeholder: 'Enter a name...',
   *   defaultValue: currentName,
   * })
   * if (!cancelled && value) {
   *   await renamePreset(value)
   * }
   * ```
   */
  prompt: {
    /**
     * Show a text input modal and wait for the user's response.
     *
     * @returns `value` is the submitted text (trimmed), or `null` if cancelled.
     */
    input(options: {
      /** Modal header title. */
      title: string;
      /** Optional description shown below the title. */
      message?: string;
      /** Input placeholder text. */
      placeholder?: string;
      /** Pre-filled value. */
      defaultValue?: string;
      /** Submit button label. Default: `"Submit"`. */
      submitLabel?: string;
      /** Cancel button label. Default: `"Cancel"`. */
      cancelLabel?: string;
      /** Use a multi-line textarea instead of a single-line input. */
      multiline?: boolean;
      /** For operator-scoped extensions only. */
      userId?: string;
    }): Promise<{
      /** The submitted text, or `null` if the user cancelled. */
      value: string | null;
      /** `true` if the user cancelled or dismissed the prompt. */
      cancelled: boolean;
    }>;
  };

  /**
   * Command palette integration (free tier — no permission needed).
   * Register commands that appear in the Lumiverse command palette
   * (Cmd/Ctrl+K). Commands are contextual — call `register()` with
   * an updated list whenever the available commands should change
   * (e.g. based on active chat, character, or extension state).
   *
   * Each `register()` call **replaces** all previously registered
   * commands from this extension. To add commands incrementally,
   * maintain your own list and pass the full set each time.
   *
   * @example
   * ```ts
   * // Register commands
   * spindle.commands.register([
   *   {
   *     id: 'summarize-chat',
   *     label: 'Summarize Chat',
   *     description: 'Generate a summary of the current conversation',
   *     keywords: ['summary', 'recap', 'tldr'],
   *     scope: 'chat',
   *   },
   * ])
   *
   * // Handle invocations
   * spindle.commands.onInvoked((commandId, context) => {
   *   if (commandId === 'summarize-chat') {
   *     // context.chatId, context.characterId, etc.
   *   }
   * })
   *
   * // Update commands based on context
   * spindle.on('CHAT_CHANGED', () => {
   *   spindle.commands.register(getCommandsForCurrentState())
   * })
   *
   * // Remove all commands
   * spindle.commands.unregister()
   * ```
   */
  commands: {
    /**
     * Register (or replace) the extension's command palette entries.
     * Each call replaces the full set — pass the complete list of
     * commands you want visible. Max 20 commands per extension.
     */
    register(commands: SpindleCommandDTO[]): void;
    /**
     * Remove specific commands by ID, or all commands if no IDs given.
     */
    unregister(commandIds?: string[]): void;
    /**
     * Register a handler called when the user selects one of this
     * extension's commands from the palette. The handler receives
     * the command ID and a snapshot of the frontend's current state.
     * Returns an unsubscribe function.
     */
    onInvoked(
      handler: (
        commandId: string,
        context: SpindleCommandContextDTO,
      ) => void | Promise<void>,
    ): () => void;
  };

  /**
   * Lumiverse version info (free tier — no permission needed).
   * Returns the semantic version strings reported by the backend server
   * and frontend bundle. Useful for feature gating or compatibility checks.
   */
  version: {
    /** Get the backend server's semantic version (e.g. `"0.8.7"`). */
    getBackend(): Promise<string>;
    /** Get the frontend's semantic version (e.g. `"0.8.7"`). */
    getFrontend(): Promise<string>;
  };

  /** This extension's manifest */
  manifest: SpindleManifest;
}
