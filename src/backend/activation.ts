import type { LlmMessageDTO, WorldBookEntryDTO } from "lumiverse-spindle-types";
import type { RetrievalPreview } from "../types";
import type { RuntimeBook } from "./contracts";
import { isLumiBooksSummaryEntry } from "../ownership";

export interface PreparedRecallRun {
  id: string;
  userId: string;
  chatId: string;
  createdAt: number;
  handledBookIds: string[];
  entries: WorldBookEntryDTO[];
  sourceContents: Record<string, string>;
  lumiBooksEntries?: WorldBookEntryDTO[];
  sourceMessageIndexes?: Record<string, number>;
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

  findPrepared(userId: string, chatId: string): PreparedRecallRun | undefined {
    this.prune();
    const runs = [...this.runs.values()].filter((run) => run.userId === userId && run.chatId === chatId && run.status === "prepared");
    return runs.length === 1 ? runs[0] : undefined;
  }

  claim(userId: string, chatId: string, availableEntries: readonly {
    id: string; content: string; disabled?: boolean; world_book_id?: string; extensions?: unknown;
  }[]): RecallClaim {
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
    const summaryIds = new Set(run.lumiBooksEntries?.map((entry) => entry.id));
    const summariesChanged = run.lumiBooksEntries?.some((entry) => {
      const current = available.get(entry.id);
      return !current || current.content !== entry.content || !!current.disabled !== !!entry.disabled
        || JSON.stringify((current.extensions as Record<string, unknown> | undefined)?.lumibooks)
          !== JSON.stringify(entry.extensions?.lumibooks);
    }) || availableEntries.some((entry) => entry.world_book_id && run.handledBookIds.includes(entry.world_book_id)
      && isLumiBooksSummaryEntry(entry) && !summaryIds.has(entry.id));
    if (summariesChanged) {
      run.status = "native";
      turn.status = "consumed";
      return { run: null, rejected: [run], reason: "A LumiBooks summary changed before Recall could take over." };
    }
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
  entries: readonly { id: string; world_book_id: string; extensions?: unknown }[],
): string[] {
  const handled = new Set(run.handledBookIds);
  return entries.filter((entry) => handled.has(entry.world_book_id)).map((entry) => entry.id);
}

/** Distinguish LumiBooks' temporary WI suppression from a saved disabled flag.
 * Other entries keep the interceptor chain's decisions, including Codex gates. */
export function restoreLumiBooksStoredFlags<T extends { id: string; disabled?: boolean }>(
  run: PreparedRecallRun, incoming: readonly T[], persisted: readonly WorldBookEntryDTO[],
): T[] {
  const expected = run.lumiBooksEntries ?? [];
  const fresh = persisted.filter((entry) => isLumiBooksSummaryEntry(entry) && run.handledBookIds.includes(entry.world_book_id));
  const byId = new Map(fresh.map((entry) => [entry.id, entry]));
  if (fresh.length !== expected.length || expected.some((entry) => {
    const current = byId.get(entry.id);
    return !current || current.content !== entry.content || current.disabled !== entry.disabled || current.constant !== entry.constant
      || JSON.stringify(current.extensions?.lumibooks) !== JSON.stringify(entry.extensions?.lumibooks);
  })) throw new Error("A LumiBooks summary changed before Recall could take over.");
  return incoming.map((entry) => byId.has(entry.id) ? { ...entry, disabled: byId.get(entry.id)!.disabled } : entry);
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

export function recallPlacementLabel(entry: Pick<WorldBookEntryDTO, "position" | "depth"> & { extensions?: unknown }, chatId?: string): string {
  const meta = (entry.extensions as { lumibooks?: { chatId?: unknown } } | undefined)?.lumibooks;
  if (chatId && meta?.chatId === chatId) return "LumiBooks timeline";
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
  timelineIndexes: ReadonlyMap<string, number> = new Map(),
  timelineOrder: ReadonlyMap<string, number> = new Map(),
): { messages: LlmMessageDTO[]; breakdown: { messageIndex: number; name: string }[] } {
  const inserted = [...messages];
  const planned = entries.map((entry, order) => ({ entry, order,
    index: timelineIndexes.get(entry.id) ?? insertionIndex(entry, messages) }))
    .sort((left, right) => left.index - right.index
      || (timelineOrder.has(left.entry.id) && timelineOrder.has(right.entry.id)
        ? timelineOrder.get(left.entry.id)! - timelineOrder.get(right.entry.id)! : 0)
      || left.order - right.order);
  const breakdown: { messageIndex: number; name: string }[] = [];
  for (let offset = 0; offset < planned.length; offset++) {
    const { entry, index } = planned[offset];
    const messageIndex = index + offset;
    inserted.splice(messageIndex, 0, { role: timelineIndexes.has(entry.id) ? "assistant" : entryRole(entry.role), content: entry.content });
    breakdown.push({ messageIndex,
      name: `Lore Recall: ${entry.comment?.trim() || "Lore entry"} [${timelineIndexes.has(entry.id) ? "LumiBooks timeline" : recallPlacementLabel(entry)}]` });
  }
  return { messages: inserted, breakdown };
}

function summaryMetadata(entry: WorldBookEntryDTO): Record<string, unknown> | null {
  const meta = entry.extensions?.lumibooks;
  return meta && typeof meta === "object" ? meta as Record<string, unknown> : null;
}

function isHistory(message: LlmMessageDTO): boolean {
  const flags = message as unknown as Record<string, unknown>;
  return flags.__isChatHistory === true || flags.__chatHistorySource === true || typeof flags.sourceMessageId === "string";
}

/** LumiBooks emits raw assistant summaries at priority 90. Filter only known
 * summary bodies from opted-in books, protecting real history and native WI. */
export function injectPreparedRecall(
  messages: readonly LlmMessageDTO[], run: PreparedRecallRun,
): ReturnType<typeof injectRecallEntries> & { removedLumiBooksCount: number } {
  const summaries = (run.lumiBooksEntries ?? []).filter((entry) => run.handledBookIds.includes(entry.world_book_id)
    && summaryMetadata(entry)?.chatId === run.chatId);
  const byId = new Map(summaries.map((entry) => [entry.id, entry]));
  const byContent = new Map<string, WorldBookEntryDTO[]>();
  for (const entry of summaries) {
    if (!entry.content) continue;
    byContent.set(entry.content, [...(byContent.get(entry.content) ?? []), entry]);
  }
  const sourceIds = (id: string, visited = new Set<string>()): string[] => {
    if (visited.has(id)) return [];
    visited.add(id);
    const entry = byId.get(id);
    const meta = entry && summaryMetadata(entry);
    if (!meta) return [];
    const ids = Array.isArray(meta.msgIds) ? meta.msgIds.filter((id): id is string => typeof id === "string") : [];
    if (Array.isArray(meta.sourceChapterEntryIds)) {
      for (const id of meta.sourceChapterEntryIds) if (typeof id === "string") ids.push(...sourceIds(id, visited));
    }
    return ids;
  };
  const covered = new Set(run.entries.flatMap((entry) => sourceIds(entry.id)));

  const filtered: LlmMessageDTO[] = [];
  const timelineIndexes = new Map<string, number>();
  const timelineOrder = new Map<string, number>();
  let removedLumiBooksCount = 0;
  for (const message of messages) {
    const flags = message as unknown as Record<string, unknown>;
    const matching = !isHistory(message) && !flags.__isWorldInfoEntry && !flags.__worldInfoSource
      && message.role === "assistant" ? byContent.get(message.content) : undefined;
    if (matching) {
      for (const entry of matching) if (!timelineIndexes.has(entry.id)) timelineIndexes.set(entry.id, filtered.length);
      removedLumiBooksCount++;
      continue;
    }
    const metadata = flags.sourceMessageMetadata as Record<string, unknown> | undefined;
    if (isHistory(message) && typeof flags.sourceMessageId === "string"
      && covered.has(flags.sourceMessageId) && metadata?.lmb_excluded !== true) continue;
    filtered.push(message);
  }
  for (const entry of run.entries) {
    if (!byId.has(entry.id)) continue;
    const meta = summaryMetadata(entry)!;
    const indexes = sourceIds(entry.id).flatMap((id) => {
      const index = run.sourceMessageIndexes?.[id];
      return typeof index === "number" ? [index] : [];
    });
    const last = indexes.length ? indexes.reduce((last, index) => Math.max(last, index), -1)
      : typeof meta.lastMsgIdx === "number" ? meta.lastMsgIdx : -1;
    timelineOrder.set(entry.id, last);
    if (timelineIndexes.has(entry.id)) continue;
    const following = filtered.findIndex((message) => {
      const flags = message as unknown as Record<string, unknown>;
      const index = typeof flags.sourceMessageId === "string" ? run.sourceMessageIndexes?.[flags.sourceMessageId] : undefined;
      const sourceIndex = typeof flags.sourceIndexInChat === "number" ? flags.sourceIndexInChat : index;
      return isHistory(message) && typeof sourceIndex === "number" && sourceIndex > last;
    });
    const historyIndexes = filtered.flatMap((message, index) => isHistory(message) ? [index] : []);
    timelineIndexes.set(entry.id, following >= 0 ? following
      : historyIndexes.length ? historyIndexes[historyIndexes.length - 1] + 1 : filtered.length);
  }
  return { ...injectRecallEntries(filtered, run.entries, timelineIndexes, timelineOrder), removedLumiBooksCount };
}
