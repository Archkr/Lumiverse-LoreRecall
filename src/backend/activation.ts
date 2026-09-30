import type { LlmMessageDTO, WorldBookEntryDTO } from "lumiverse-spindle-types";
import type { RetrievalPreview } from "../types";
import type { RuntimeBook } from "./contracts";

export interface PreparedRecallRun {
  id: string;
  userId: string;
  chatId: string;
  createdAt: number;
  handledBookIds: string[];
  entries: WorldBookEntryDTO[];
  sourceContents: Record<string, string>;
  preview: RetrievalPreview;
  runtimeBooks: RuntimeBook[];
  sessionId: string;
  status: "prepared" | "claimed" | "native";
}

export type RecallClaim =
  | { run: PreparedRecallRun; rejected: []; reason: null }
  | { run: null; rejected: PreparedRecallRun[]; reason: string | null };

const RUN_TTL_MS = 5 * 60_000;

export function markRecallNativeFallback(preview: RetrievalPreview, reason: string): void {
  preview.preparedNodes ??= preview.injectedNodes;
  preview.activationSource = "native";
  preview.injectedNodes = [];
  preview.injectedText = "";
  preview.estimatedTokens = 0;
  preview.selectionSummary = "Native fallback; Recall activated no entries.";
  preview.trace.push({ step: preview.trace.length + 1, phase: "fallback", label: "Native activation", summary: reason });
  preview.steps.push(`Native activation: ${reason}`);
}

export function finalizeRecallActivation(preview: RetrievalPreview, entries: readonly { id: string; content: string }[]): void {
  preview.preparedNodes ??= preview.injectedNodes;
  const ids = new Set(entries.map((entry) => entry.id));
  preview.injectedNodes = preview.injectedNodes.filter((node) => ids.has(node.entryId));
  const constantIds = new Set(preview.reservedConstantNodes.map((node) => node.entryId));
  const constants = entries.filter((entry) => constantIds.has(entry.id)).length;
  const dynamic = entries.length - constants;
  preview.activationSource = "recall";
  preview.injectedText = entries.map((entry) => entry.content).join("\n\n");
  preview.estimatedTokens = Math.ceil(preview.injectedText.length / 4);
  preview.selectionSummary = `Activated ${dynamic} dynamic, ${constants} constant entries.`;
  preview.trace.push({ step: preview.trace.length + 1, phase: "inject", label: "Recall activation", summary: preview.selectionSummary });
  preview.steps.push(`Recall activation: ${preview.selectionSummary}`);
}

/** Only one unclaimed run may take over a chat. Overlapping runs stay native. */
export class RecallRunStore {
  private readonly runs = new Map<string, PreparedRecallRun>();
  private readonly turns = new Map<string, {
    userId: string; chatId: string; createdAt: number;
    status: "preparing" | "prepared" | "native" | "consumed" | "claimed";
  }>();

  begin(id: string, userId: string, chatId: string): void {
    this.prune();
    this.turns.set(id, { userId, chatId, createdAt: Date.now(), status: "preparing" });
  }

  stayNative(id: string): void {
    const turn = this.turns.get(id);
    if (turn && turn.status !== "consumed" && turn.status !== "claimed") turn.status = "native";
  }

  isPassThrough(id: string): boolean {
    this.prune();
    const turn = this.turns.get(id);
    return !!turn && turn.status !== "claimed";
  }

  put(run: PreparedRecallRun): boolean {
    this.prune();
    const turn = this.turns.get(run.id);
    if (turn && turn.status !== "preparing" && turn.status !== "prepared") return false;
    this.turns.set(run.id, { userId: run.userId, chatId: run.chatId, createdAt: run.createdAt, status: "prepared" });
    this.runs.set(run.id, run);
    return true;
  }

  get(id: string): PreparedRecallRun | undefined {
    this.prune();
    return this.runs.get(id);
  }

  claim(userId: string, chatId: string, availableEntries: readonly { id: string; content: string; disabled?: boolean }[]): RecallClaim {
    this.prune();
    const candidates = [...this.turns.entries()].filter(([, turn]) =>
      turn.userId === userId && turn.chatId === chatId && turn.status !== "claimed" && turn.status !== "consumed");
    if (candidates.length !== 1) {
      const rejected: PreparedRecallRun[] = [];
      for (const [id, turn] of candidates) {
        turn.status = "consumed";
        const run = this.runs.get(id);
        if (run) { run.status = "native"; rejected.push(run); }
      }
      return { run: null, rejected, reason: candidates.length > 1 ? "Overlapping generations prevented a safe Recall takeover." : null };
    }
    const [id, turn] = candidates[0];
    const run = this.runs.get(id);
    if (turn.status !== "prepared" || !run) {
      turn.status = "consumed";
      return { run: null, rejected: [], reason: null };
    }
    const available = new Map(availableEntries.map((entry) => [entry.id, entry]));
    if (Object.entries(run.sourceContents).some(([id, content]) => {
      const current = available.get(id);
      return !current || current.disabled || current.content !== content;
    })) {
      run.status = "native";
      turn.status = "consumed";
      return { run: null, rejected: [run], reason: "A selected entry changed or became disabled before activation." };
    }
    run.status = "claimed";
    turn.status = "claimed";
    return { run, rejected: [], reason: null };
  }

  remove(id: string): void {
    this.runs.delete(id);
    this.turns.delete(id);
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, turn] of this.turns) {
      if (now - turn.createdAt > RUN_TTL_MS) this.remove(id);
    }
  }
}

export function suppressedNativeEntryIds(
  run: PreparedRecallRun,
  entries: readonly { id: string; world_book_id: string }[],
): string[] {
  const handled = new Set(run.handledBookIds);
  return entries.filter((entry) => handled.has(entry.world_book_id)).map((entry) => entry.id);
}

function entryRole(role: string | null): LlmMessageDTO["role"] {
  return role === "user" || role === "assistant" ? role : "system";
}

function insertionIndex(entry: WorldBookEntryDTO, messages: readonly LlmMessageDTO[]): number {
  const history = messages.flatMap((message, index) =>
    ((message as LlmMessageDTO & { __isChatHistory?: boolean; __chatHistorySource?: boolean }).__isChatHistory
      || (message as LlmMessageDTO & { __chatHistorySource?: boolean }).__chatHistorySource) ? [index] : []);
  const firstHistory = history[0] ?? messages.length;
  if (entry.position === 0) return history.length ? firstHistory : 0;
  if (entry.position === 1) return history.length ? history[history.length - 1] + 1 : messages.length;
  // Native auto-injection puts AN/EM before and after the first chat turn.
  if ((entry.position === 3 || entry.position === 6) && history.length) return firstHistory + 1;
  if (entry.position === 4 && history.length) {
    const depth = Math.max(0, Math.floor(entry.depth || 0));
    return depth === 0 ? history[history.length - 1] + 1 : history[Math.max(0, history.length - depth)];
  }
  // AN/EM-before belongs at the first chat turn too. Exact marker and outlet
  // slots are unavailable in the assembled prompt; those fall back here.
  return firstHistory;
}

export function recallPlacementLabel(entry: Pick<WorldBookEntryDTO, "position" | "depth">): string {
  switch (entry.position) {
    case 0: return "Before chat history";
    case 1: return "After chat history";
    case 2: return "AN before (first chat turn)";
    case 3: return "AN after (first chat turn)";
    case 4: return `Chat depth ${Math.max(0, Math.floor(entry.depth || 0))}`;
    case 5: return "EM before (first chat turn)";
    case 6: return "EM after (first chat turn)";
    default: return "Before chat history (marker/outlet fallback)";
  }
}

export function injectRecallEntries(
  messages: readonly LlmMessageDTO[],
  entries: readonly WorldBookEntryDTO[],
): { messages: LlmMessageDTO[]; breakdown: { messageIndex: number; name: string }[] } {
  const inserted = [...messages];
  const planned = entries.map((entry, order) => ({ entry, order, index: insertionIndex(entry, messages) }))
    .sort((left, right) => left.index - right.index || left.order - right.order);
  const breakdown: { messageIndex: number; name: string }[] = [];
  for (let offset = 0; offset < planned.length; offset++) {
    const { entry, index } = planned[offset];
    const messageIndex = index + offset;
    inserted.splice(messageIndex, 0, { role: entryRole(entry.role), content: entry.content });
    breakdown.push({ messageIndex,
      name: `Lore Recall: ${entry.comment?.trim() || "Lore entry"} [${recallPlacementLabel(entry)}]` });
  }
  return { messages: inserted, breakdown };
}
