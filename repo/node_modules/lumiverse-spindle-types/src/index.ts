export type {
  SpindleManifest,
  SpindlePermission,
} from "./manifest";
export {
  IDENTIFIER_PATTERN,
  validateIdentifier,
} from "./manifest";

export type { SpindlePermission as SpindlePermissionType } from "./permissions";
export { ALL_PERMISSIONS, isValidPermission } from "./permissions";

export { SpindleEvent, CoreEventType } from "./events";

export type {
  LlmMessageDTO,
  MacroDefinitionDTO,
  ToolRegistrationDTO,
  ToolSchemaDTO,
  ToolCallDTO,
  GenerationRequestDTO,
  RequestInitDTO,
  ConnectionProfileDTO,
  PermissionDeniedDetail,
  PermissionChangedDetail,
  CharacterDTO,
  CharacterCreateDTO,
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
  AssemblyBreakdownEntryDTO,
  ActivationStatsDTO,
  MemoryStatsDTO,
  DryRunTokenCountDTO,
  ChatMemoryChunkDTO,
  ChatMemoryResultDTO,
  ImageGenConnectionDTO,
  ImageGenParameterSchemaDTO,
  ImageGenProviderDTO,
  ImageGenRequestDTO,
  ImageGenResultDTO,
  ThemeOverrideDTO,
  ThemeInfoDTO,
  ColorExtractionResult,
  ColorRGB,
  ColorHSL,
  SpindleModalItemDTO,
  WorkerToHost,
  HostToWorker,
} from "./api";
export { PERMISSION_DENIED_PREFIX } from "./api";

export type { ToolRegistration, JSONSchema } from "./tools";

export type {
  SpindleDOMHelper,
  SpindleMountPoint,
  SpindleUploadFile,
  SpindleMessageTagIntercept,
  SpindleMessageTagInterceptorOptions,
  PermissionRequestOptions,
  SpindleFrontendContext,
  SpindleFrontendModule,
  SpindleDrawerTabOptions,
  SpindleDrawerTabHandle,
  SpindleFloatWidgetOptions,
  SpindleFloatWidgetHandle,
  SpindleDockEdge,
  SpindleDockPanelOptions,
  SpindleDockPanelHandle,
  SpindleAppMountOptions,
  SpindleAppMountHandle,
  SpindleInputBarActionOptions,
  SpindleInputBarActionHandle,
  SpindleContextMenuOptions,
  SpindleContextMenuItemDef,
  SpindleContextMenuResult,
  SpindleModalOptions,
  SpindleModalHandle,
  SpindleConfirmVariant,
  SpindleConfirmOptions,
  SpindleConfirmResult,
} from "./dom";

export type { ExtensionInfo } from "./extension-info";

export type { SpindleAPI } from "./spindle-api";

export type {
  CouncilMember,
  SidecarConfig,
  CouncilSidecarConfig,
  CouncilToolsSettings,
  CouncilSettings,
  CouncilToolResult,
  CouncilExecutionResult,
  CouncilToolCategory,
  CouncilToolDefinition,
} from "./council";
export {
  SIDECAR_DEFAULTS,
  COUNCIL_SIDECAR_DEFAULTS,
  COUNCIL_TOOLS_DEFAULTS,
  COUNCIL_SETTINGS_DEFAULTS,
} from "./council";
