import type { GlobalLoreRecallSettings, SelectionBatchDiagnostic } from "../types";
import { getControllerTokenUsage, runControllerJson } from "./controller-json";

type Attempt = SelectionBatchDiagnostic["attempts"][number];
export interface ModelSelectionResult {
  parsed: Record<string, unknown> | null;
  status: SelectionBatchDiagnostic["status"];
  error: string | null;
  attempts: Attempt[];
  durationMs: number;
}

/** One deadline for routing and every batch; late provider completions cannot mutate results. */
export class ModelSelectionSession {
  readonly abort = new AbortController();
  controllerUsed = false;
  stopReason: "timed_out" | "cancelled" | null = null;
  private timer: ReturnType<typeof setTimeout>;
  private onParentAbort = () => this.stop("cancelled");

  constructor(
    private settings: GlobalLoreRecallSettings,
    private userId: string,
    private connectionId: string | null,
    private deadlineAt: number,
    private parentSignal?: AbortSignal,
  ) {
    this.timer = setTimeout(() => this.stop("timed_out"), Math.max(0, deadlineAt - Date.now()));
    parentSignal?.addEventListener("abort", this.onParentAbort, { once: true });
    if (parentSignal?.aborted) this.stop("cancelled");
  }

  private stop(reason: "timed_out" | "cancelled"): void {
    if (this.stopReason) return;
    this.stopReason = reason;
    this.abort.abort();
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.parentSignal?.removeEventListener("abort", this.onParentAbort);
  }

  async run(prompt: string, validate: (parsed: Record<string, unknown> | null) => string | null): Promise<ModelSelectionResult> {
    const startedAt = Date.now();
    const attempts: Attempt[] = [];
    let error: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.deadlineAt - Date.now() < 1000) this.stop("timed_out");
      if (this.stopReason) return {
        parsed: null, status: attempts.length ? this.stopReason : "skipped",
        error: this.stopReason === "timed_out" ? "Model selection deadline reached." : "Model selection cancelled.",
        attempts, durationMs: Date.now() - startedAt,
      };
      const attemptStartedAt = Date.now();
      let onAbort: () => void = () => {};
      let detail: Attempt = { durationMs: 0, error: null, finishReason: null, responseLength: 0, reasoningTokens: null, textTokens: null };
      try {
        const cancelled = new Promise<never>((_, reject) => {
          onAbort = () => reject(new Error(this.stopReason === "timed_out"
            ? "Model selection deadline reached." : "Model selection cancelled."));
          this.abort.signal.addEventListener("abort", onAbort, { once: true });
        });
        this.controllerUsed = true;
        const response = await Promise.race([
          runControllerJson(prompt, this.settings, this.userId, {
            connectionId: this.connectionId, temperatureOverride: 0.1, signal: this.abort.signal,
          }),
          cancelled,
        ]);
        if (Date.now() >= this.deadlineAt) this.stop("timed_out");
        if (this.stopReason) throw new Error(this.stopReason === "timed_out"
          ? "Model selection deadline reached." : "Model selection cancelled.");
        detail = { ...detail, finishReason: response.finishReason,
          responseLength: response.rawContent.length, ...getControllerTokenUsage(response.usage) };
        error = validate(response.parsed);
        if (!error) {
          attempts.push({ ...detail, durationMs: Date.now() - attemptStartedAt });
          return { parsed: response.parsed, status: "completed", error: null, attempts, durationMs: Date.now() - startedAt };
        }
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      } finally {
        this.abort.signal.removeEventListener("abort", onAbort);
      }
      attempts.push({ ...detail, error, durationMs: Date.now() - attemptStartedAt });
      if (this.stopReason) break;
      // Retry transient failures or malformed JSON once, never valid empty or large selections.
      if (!/aborted|timeout|timed out|temporar|429|502|503|504|JSON|array|unknown ID/i.test(error ?? "")) break;
    }
    return { parsed: null, status: this.stopReason ?? "failed", error, attempts, durationMs: Date.now() - startedAt };
  }
}

/** Keep the provider load bounded and preserve input/model order despite completion order. */
export async function mapSelectionBatches<T, R>(batches: T[], select: (batch: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(batches.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, async () => {
    while (next < batches.length) {
      const index = next++;
      results[index] = await select(batches[index], index);
    }
  }));
  return results;
}
