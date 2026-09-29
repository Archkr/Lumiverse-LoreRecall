declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import type { GlobalLoreRecallSettings } from "../types";
import type { IndexedEntry } from "./contracts";

const PROVIDERS = {
  typesafe: { url: "https://api.typesafe.ai/v1/systemone", model: "jev-latest" },
  openrouter: { url: "https://openrouter.ai/api/alpha/decisions", model: "typesafe/jev-1.13" },
} as const;

function secretSlot(provider: GlobalLoreRecallSettings["jevProvider"]): string {
  return `lore-recall-jev.${provider}`;
}

function enclave(): any {
  return (spindle as any).enclave;
}

export async function hasJevKey(provider: GlobalLoreRecallSettings["jevProvider"], userId: string): Promise<boolean> {
  return !!(await readJevKey(provider, userId));
}

export async function readJevKey(provider: GlobalLoreRecallSettings["jevProvider"], userId: string): Promise<string | null> {
  try {
    const key = await enclave()?.get(secretSlot(provider), userId);
    return typeof key === "string" && key.trim() ? key.trim() : null;
  } catch { return null; }
}

export async function saveJevKey(provider: GlobalLoreRecallSettings["jevProvider"], key: string, userId: string): Promise<void> {
  if (!key.trim()) throw new Error("Enter a JEV API key.");
  if (typeof enclave()?.put !== "function") throw new Error("Encrypted secret storage is unavailable.");
  await enclave().put(secretSlot(provider), key.trim(), userId);
}

export async function clearJevKey(provider: GlobalLoreRecallSettings["jevProvider"], userId: string): Promise<void> {
  if (typeof enclave()?.delete !== "function") throw new Error("Encrypted secret storage is unavailable.");
  await enclave().delete(secretSlot(provider), userId);
}

export interface JevVerdict { entryId: string; approved: boolean; confidence: number | null; answered: boolean }
export interface JevFilterResult { verdicts: JevVerdict[]; error: string | null }

/** One question per candidate. Missing or malformed answers fail open. */
export async function filterWithJev(
  entries: IndexedEntry[], conversation: string, settings: GlobalLoreRecallSettings, userId: string,
): Promise<JevFilterResult> {
  if (!entries.length) return { verdicts: [], error: null };
  const key = await readJevKey(settings.jevProvider, userId);
  const cors = typeof spindle === "undefined" ? null : (spindle as any).cors;
  const fallback = (error: string): JevFilterResult => ({
    verdicts: entries.map((entry) => ({ entryId: entry.entryId, approved: true, confidence: null, answered: false })), error,
  });
  if (!key) return fallback("JEV key is not configured; model picks passed through.");
  if (typeof cors !== "function") return fallback("JEV network permission is unavailable; model picks passed through.");

  const verdicts: JevVerdict[] = [];
  const provider = PROVIDERS[settings.jevProvider];
  const deadline = Date.now() + 20_000;
  for (let offset = 0; offset < entries.length; offset += 32) {
    if (deadline - Date.now() < 1000) {
      return { verdicts: [...verdicts, ...entries.slice(offset).map((entry) => ({
        entryId: entry.entryId, approved: true, confidence: null, answered: false,
      }))], error: "JEV ran out of time; remaining model picks passed through." };
    }
    const batch = entries.slice(offset, offset + 32);
    const questions = Object.fromEntries(batch.map((entry, index) => [
      `entry_${index}`,
      {
        type: "noul",
        instructions: `Should the lore entry identified by entry_${index} be available for the very next reply? Answer yes only when it materially helps the current scene.`,
        criteria: { true: "Useful for the next reply", false: "Irrelevant or only background context" },
      },
    ]));
    const state = {
      conversation: conversation.slice(-12000),
      entries: batch.map((entry, index) => ({
        id: `entry_${index}`, label: entry.label, book: entry.worldBookName,
        aliases: entry.aliases, keys: entry.key, summary: entry.summary.slice(0, 400),
        preview: entry.previewText.slice(0, 350),
      })),
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const response = await Promise.race([
        cors.call(spindle, provider.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ model: settings.jevModel || provider.model, state, questions }),
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("JEV timed out.")),
          Math.min(settings.jevTimeoutMs, deadline - Date.now())); }),
      ]);
      if (timer) clearTimeout(timer);
      const envelope = typeof response === "string" ? { status: 200, body: response } : response as any;
      if (envelope?.status && (envelope.status < 200 || envelope.status >= 300)) throw new Error(`JEV HTTP ${envelope.status}.`);
      const payload = JSON.parse(envelope?.body ?? envelope?.text ?? "{}");
      if (!payload.answers || typeof payload.answers !== "object") throw new Error("JEV returned no answers.");
      for (let index = 0; index < batch.length; index++) {
        const answer = payload.answers[`entry_${index}`];
        const value = answer?.type === "noul" ? Number(answer.noul) : NaN;
        const answered = Number.isFinite(value) && value >= 0 && value <= 1;
        verdicts.push({ entryId: batch[index].entryId, approved: !answered || value >= settings.jevThreshold,
          confidence: answered ? value : null, answered });
      }
    } catch (error) {
      if (timer) clearTimeout(timer);
      for (const entry of batch) verdicts.push({ entryId: entry.entryId, approved: true, confidence: null, answered: false });
      return { verdicts: [...verdicts, ...entries.slice(offset + batch.length).map((entry) => ({
        entryId: entry.entryId, approved: true, confidence: null, answered: false,
      }))], error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { verdicts, error: null };
}
