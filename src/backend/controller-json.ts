declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { GlobalLoreRecallSettings } from "../types";

const THINK_BLOCK_RE = /<think[\s\S]*?<\/think>/gi;

export interface ControllerJsonResult {
  parsed: Record<string, unknown> | null;
  rawContent: string;
  rawReasoning: string;
  parsedFrom: "content" | "reasoning" | null;
  provider: string | null;
  model: string | null;
  connectionId: string | null;
  finishReason: string | null;
  toolCallsCount: number | null;
  usage: Record<string, unknown> | null;
}

export interface ControllerJsonOptions {
  primaryKey?: string;
  schemaName?: string;
  schema?: Record<string, unknown>;
  systemPrompt?: string;
  maxTokensOverride?: number;
  disableReasoning?: boolean;
  connectionId?: string | null;
  signal?: AbortSignal;
}

export function sanitizeControllerText(value: string): string {
  return value
    .replace(THINK_BLOCK_RE, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractGenerationContent(result: unknown): string {
  return result && typeof result === "object" && typeof (result as { content?: unknown }).content === "string"
    ? (result as { content: string }).content
    : "";
}

function extractGenerationUsage(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const usage = (result as { usage?: unknown }).usage;
  return usage && typeof usage === "object" ? (usage as Record<string, unknown>) : null;
}

function extractGenerationReasoning(result: unknown): string {
  return result && typeof result === "object" && typeof (result as { reasoning?: unknown }).reasoning === "string"
    ? (result as { reasoning: string }).reasoning
    : "";
}

export function parseJsonValue(content: string): unknown {
  const cleaned = sanitizeControllerText(content);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as unknown;
      } catch {
        // Fall through and try array extraction below.
      }
    }

    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]) as unknown;
      } catch {
        return null;
      }
    }

    return null;
  }
}

export function normalizeArrayPayload(parsed: unknown, primaryKey: string): Record<string, unknown> | null {
  if (Array.isArray(parsed)) return { [primaryKey]: parsed };
  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record[primaryKey])) return record;
  if (Array.isArray(record.data)) return { [primaryKey]: record.data };
  if (Array.isArray(record.items)) return { [primaryKey]: record.items };

  const result = record.result;
  if (result && typeof result === "object" && Array.isArray((result as Record<string, unknown>)[primaryKey])) {
    return { [primaryKey]: (result as Record<string, unknown>)[primaryKey] };
  }

  return null;
}

function buildStructuredJsonParameters(
  provider: string | null,
  schemaName: string,
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedProvider = provider?.trim().toLowerCase() ?? "";

  if (normalizedProvider === "google" || normalizedProvider === "gemini") {
    return {
      responseMimeType: "application/json",
      responseSchema: schema,
    };
  }

  if (normalizedProvider === "openai" || normalizedProvider === "openrouter") {
    return {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          schema,
        },
      },
    };
  }

  return {};
}

function buildNoReasoningParameters(provider: string | null): Record<string, unknown> {
  const normalizedProvider = provider?.trim().toLowerCase() ?? "";

  if (normalizedProvider === "openrouter") {
    return { reasoning: { effort: "none" } };
  }

  if (normalizedProvider === "nanogpt") {
    return { reasoning_effort: "none" };
  }

  if (normalizedProvider === "google" || normalizedProvider === "google_vertex" || normalizedProvider === "gemini") {
    return { thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false } };
  }

  return { reasoning: { effort: "none" } };
}

export function resolveControllerConnectionId(
  settings: GlobalLoreRecallSettings,
  fallbackConnectionId?: string | null,
): string | null {
  if (settings.controllerConnectionId?.trim()) return settings.controllerConnectionId.trim();
  if (fallbackConnectionId?.trim()) return fallbackConnectionId.trim();
  return null;
}

export async function runControllerJson(
  prompt: string,
  settings: GlobalLoreRecallSettings,
  userId: string,
  options: ControllerJsonOptions = {},
): Promise<ControllerJsonResult> {
  const connectionId = resolveControllerConnectionId(settings, options.connectionId);
  const connection =
    connectionId
      ? await spindle.connections.get(connectionId, userId).catch(() => null)
      : null;
  const structuredParameters =
    options.primaryKey && options.schemaName && options.schema
      ? buildStructuredJsonParameters(connection?.provider ?? null, options.schemaName, options.schema)
      : {};
  const noReasoningParameters =
    options.disableReasoning !== false ? buildNoReasoningParameters(connection?.provider ?? null) : {};

  const result = await spindle.generate.quiet({
    type: "quiet",
    messages: [
      ...(options.systemPrompt ? [{ role: "system" as const, content: options.systemPrompt }] : []),
      { role: "user" as const, content: prompt },
    ],
    parameters: {
      temperature: settings.controllerTemperature,
      max_tokens: options.maxTokensOverride ?? settings.controllerMaxTokens,
      ...noReasoningParameters,
      ...structuredParameters,
    },
    ...(connectionId ? { connection_id: connectionId } : {}),
    userId,
    signal: options.signal,
  } as unknown as Parameters<typeof spindle.generate.quiet>[0]);
  const content = sanitizeControllerText(extractGenerationContent(result));
  const reasoning = sanitizeControllerText(extractGenerationReasoning(result));
  const parseSource = content || reasoning;
  const parsedFrom: "content" | "reasoning" | null = content ? "content" : reasoning ? "reasoning" : null;
  const base = {
    rawContent: content,
    rawReasoning: reasoning,
    parsedFrom,
    provider: connection?.provider ?? null,
    model: connection?.model ?? null,
    connectionId,
    finishReason:
      result && typeof result === "object" && typeof (result as { finish_reason?: unknown }).finish_reason === "string"
        ? ((result as { finish_reason: string }).finish_reason ?? null)
        : null,
    toolCallsCount:
      result && typeof result === "object" && Array.isArray((result as { tool_calls?: unknown }).tool_calls)
        ? ((result as { tool_calls: unknown[] }).tool_calls?.length ?? 0)
        : null,
    usage: extractGenerationUsage(result),
  };
  if (!parseSource) return { parsed: null, ...base };

  const parsed = parseJsonValue(parseSource);
  if (!options.primaryKey) {
    return {
      parsed: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null,
      ...base,
    };
  }

  const normalized = normalizeArrayPayload(parsed, options.primaryKey);
  if (normalized) return { parsed: normalized, ...base };

  return { parsed: null, ...base };
}
