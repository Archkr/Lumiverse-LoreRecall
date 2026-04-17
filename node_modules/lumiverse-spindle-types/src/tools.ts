/** JSON Schema type (simplified) */
export type JSONSchema = Record<string, unknown>;

/** Tool registration provided by an extension */
export interface ToolRegistration {
  /** Unique tool identifier */
  name: string;
  /** Human-readable name */
  display_name: string;
  /** Description for LLM consumption */
  description: string;
  /** JSON Schema for tool arguments */
  parameters: JSONSchema;
  /** Whether council members can invoke this tool (future) */
  council_eligible?: boolean;
  /** Auto-set by host — the owning extension identifier */
  extension_id: string;
}
