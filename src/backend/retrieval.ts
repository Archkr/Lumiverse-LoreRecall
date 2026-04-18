declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

import { clampInt, getEntryCategoryPath, getNodeDepth, truncateText, uniqueStrings } from "../shared";
import type {
  BookTreeIndex,
  CharacterRetrievalConfig,
  GlobalLoreRecallSettings,
  PreviewNode,
  RetrievalPreview,
} from "../types";
import type { ChatLikeMessage, RuntimeBook, ScoredEntry } from "./contracts";
import { isReadableBook } from "./storage";

interface RetrievalPreviewOptions {
  allowController?: boolean;
}

function stripCodeFences(content: string): string {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = stripCodeFences(content);
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function getGenerationContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

function stripSearchMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string): string {
  return stripSearchMarkup(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      normalizeSearchText(value)
        .split(" ")
        .filter((token) => token.length >= 2),
    ),
  );
}

function buildQueryText(messages: ChatLikeMessage[], contextMessages: number): string {
  return messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .slice(-contextMessages)
    .map((message) => `${message.role}: ${stripSearchMarkup(message.content)}`)
    .join("\n");
}

function getEntryBody(entry: RuntimeBook["cache"]["entries"][number]): string {
  return entry.collapsedText.trim() || entry.content.trim();
}

function getEntryBreadcrumb(entry: RuntimeBook["cache"]["entries"][number], tree: BookTreeIndex): string {
  const path = getEntryCategoryPath(tree, entry.entryId)
    .map((node) => node.label)
    .filter((label) => label && label !== "Root");
  return [...path, entry.label].join(" > ");
}

function countTokenMatches(queryTokens: string[], targetTokens: string[]): number {
  if (!queryTokens.length || !targetTokens.length) return 0;
  const targetSet = new Set(targetTokens);
  let count = 0;
  for (const token of queryTokens) {
    if (targetSet.has(token)) count += 1;
  }
  return count;
}

function countPhraseBonus(queryText: string, value: string): boolean {
  if (!queryText || !value || value.length < 4) return false;
  return queryText.includes(value) || value.includes(queryText);
}

function scoreEntry(
  entry: RuntimeBook["cache"]["entries"][number],
  tree: BookTreeIndex,
  queryText: string,
  queryTokens: string[],
): ScoredEntry {
  const reasons: string[] = [];
  let score = 0;

  const breadcrumb = normalizeSearchText(getEntryBreadcrumb(entry, tree));
  const labelText = normalizeSearchText(entry.label);
  const aliasText = normalizeSearchText(entry.aliases.join(" "));
  const keyText = normalizeSearchText([...entry.key, ...entry.keysecondary].join(" "));
  const summaryText = normalizeSearchText(entry.summary);
  const tagText = normalizeSearchText(entry.tags.join(" "));
  const commentText = normalizeSearchText(entry.comment);
  const bodyText = normalizeSearchText(truncateText(getEntryBody(entry), 500));
  const groupText = normalizeSearchText(entry.groupName);

  if (countPhraseBonus(queryText, labelText)) {
    score += 12;
    reasons.push("label");
  }
  if (countPhraseBonus(queryText, aliasText)) {
    score += 8;
    reasons.push("alias");
  }
  if (countPhraseBonus(queryText, keyText)) {
    score += 7;
    reasons.push("keyword");
  }

  const labelMatches = countTokenMatches(queryTokens, tokenize(labelText));
  const aliasMatches = countTokenMatches(queryTokens, tokenize(aliasText));
  const keyMatches = countTokenMatches(queryTokens, tokenize(keyText));
  const tagMatches = countTokenMatches(queryTokens, tokenize(tagText));
  const summaryMatches = countTokenMatches(queryTokens, tokenize(summaryText));
  const bodyMatches = Math.min(6, countTokenMatches(queryTokens, tokenize(bodyText)));
  const breadcrumbMatches = countTokenMatches(queryTokens, tokenize(breadcrumb));
  const commentMatches = countTokenMatches(queryTokens, tokenize(commentText));
  const groupMatches = countTokenMatches(queryTokens, tokenize(groupText));

  if (labelMatches > 0) reasons.push("label");
  if (aliasMatches > 0) reasons.push("alias");
  if (keyMatches > 0) reasons.push("keyword");
  if (tagMatches > 0) reasons.push("tag");
  if (summaryMatches > 0) reasons.push("summary");
  if (bodyMatches > 0) reasons.push("content");
  if (breadcrumbMatches > 0) reasons.push("branch");
  if (commentMatches > 0) reasons.push("comment");
  if (groupMatches > 0) reasons.push("group");

  score += labelMatches * 4;
  score += aliasMatches * 3;
  score += keyMatches * 3;
  score += tagMatches * 2;
  score += summaryMatches * 2;
  score += bodyMatches;
  score += breadcrumbMatches * 2;
  score += commentMatches * 2;
  score += groupMatches;
  if (entry.constant) score += 0.2;
  if (entry.selective) score += 0.1;

  return { entry, score, reasons: Array.from(new Set(reasons)) };
}

function scoreEntries(queryText: string, books: RuntimeBook[]): ScoredEntry[] {
  const normalized = normalizeSearchText(queryText);
  const queryTokens = tokenize(queryText);
  if (!normalized || !queryTokens.length) return [];

  return books
    .flatMap((book) =>
      book.cache.entries
        .filter((entry) => !entry.disabled)
        .map((entry) => scoreEntry(entry, book.tree, normalized, queryTokens)),
    )
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
}

async function runControllerJson(
  prompt: string,
  settings: GlobalLoreRecallSettings,
  userId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await spindle.generate.quiet({
      type: "quiet",
      messages: [{ role: "user", content: prompt }],
      parameters: {
        temperature: settings.controllerTemperature,
        max_tokens: settings.controllerMaxTokens,
      },
      ...(settings.controllerConnectionId ? { connection_id: settings.controllerConnectionId } : {}),
      userId,
    });
    return parseJsonObject(getGenerationContent(result));
  } catch (error: unknown) {
    spindle.log.warn(`Lore Recall controller call failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function maybeChooseBooks(
  queryText: string,
  books: RuntimeBook[],
  config: CharacterRetrievalConfig,
  settings: GlobalLoreRecallSettings,
  userId: string,
  allowController: boolean,
): Promise<RuntimeBook[]> {
  if (!allowController || config.multiBookMode !== "per_book" || books.length <= 1) return books;

  const prompt = [
    "Choose the most relevant lore books for the query.",
    'Return ONLY JSON in this exact shape: {"bookIds":["book-id-1","book-id-2"]}.',
    `Choose up to ${Math.min(3, books.length)} books.`,
    "",
    `Query: ${queryText}`,
    "",
    "Books:",
    ...books.map((book) =>
      `- id=${book.summary.id}; name=${book.summary.name}; description=${truncateText(
        book.config.description || book.summary.description,
        140,
      )}; categories=${Math.max(0, Object.keys(book.tree.nodes).length - 1)}; entries=${book.cache.entries.length}`,
    ),
  ].join("\n");

  const parsed = await runControllerJson(prompt, settings, userId);
  const ids = Array.isArray(parsed?.bookIds)
    ? parsed.bookIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!ids.length) return books;
  const chosen = books.filter((book) => ids.includes(book.summary.id));
  return chosen.length ? chosen : books;
}

async function maybeRerankEntries(
  queryText: string,
  scored: ScoredEntry[],
  settings: GlobalLoreRecallSettings,
  userId: string,
  allowController: boolean,
): Promise<ScoredEntry[]> {
  if (!allowController || scored.length <= 1) return scored;
  const prompt = [
    "You rank lore nodes for retrieval relevance.",
    'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
    "Use only entryIds from the candidate list.",
    "",
    `Query: ${queryText}`,
    "",
    "Candidates:",
    ...scored.map((item) =>
      `- entryId=${item.entry.entryId}; label=${item.entry.label}; book=${item.entry.worldBookName}; summary=${truncateText(
        item.entry.summary,
        120,
      )}; preview=${truncateText(getEntryBody(item.entry), 160)}`,
    ),
  ].join("\n");

  const parsed = await runControllerJson(prompt, settings, userId);
  const ids = Array.isArray(parsed?.entryIds)
    ? parsed.entryIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!ids.length) return scored;

  const byId = new Map(scored.map((item) => [item.entry.entryId, item]));
  const ordered: ScoredEntry[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const match = byId.get(id);
    if (!match || seen.has(id)) continue;
    seen.add(id);
    ordered.push(match);
  }
  for (const item of scored) {
    if (seen.has(item.entry.entryId)) continue;
    ordered.push(item);
  }
  return ordered;
}

async function maybeSelectEntries(
  queryText: string,
  candidates: ScoredEntry[],
  config: CharacterRetrievalConfig,
  settings: GlobalLoreRecallSettings,
  userId: string,
  allowController: boolean,
): Promise<ScoredEntry[]> {
  if (!allowController || !config.selectiveRetrieval || !candidates.length) return candidates.slice(0, config.maxResults);

  const prompt = [
    "Select the exact lore entries that should be injected.",
    'Return ONLY JSON in this exact shape: {"entryIds":["entry-id-1","entry-id-2"]}.',
    `Choose up to ${config.maxResults} entryIds.`,
    "",
    `Query: ${queryText}`,
    "",
    "Entry manifest:",
    ...candidates.slice(0, Math.max(config.maxResults * 3, 12)).map((item) =>
      `- entryId=${item.entry.entryId}; label=${item.entry.label}; book=${item.entry.worldBookName}; summary=${truncateText(
        item.entry.summary,
        140,
      )}; preview=${truncateText(getEntryBody(item.entry), 180)}`,
    ),
  ].join("\n");

  const parsed = await runControllerJson(prompt, settings, userId);
  const ids = Array.isArray(parsed?.entryIds)
    ? parsed.entryIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (!ids.length) return candidates.slice(0, config.maxResults);

  const byId = new Map(candidates.map((item) => [item.entry.entryId, item]));
  const chosen: ScoredEntry[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const match = byId.get(id);
    if (!match || seen.has(id)) continue;
    seen.add(id);
    chosen.push(match);
    if (chosen.length >= config.maxResults) break;
  }
  if (!chosen.length) return candidates.slice(0, config.maxResults);
  for (const item of candidates) {
    if (chosen.length >= config.maxResults) break;
    if (seen.has(item.entry.entryId)) continue;
    chosen.push(item);
  }
  return chosen;
}

function getDescendantCategoryIds(tree: BookTreeIndex, nodeId: string, depthLimit: number): string[] {
  const result: string[] = [];
  const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId, depth: 0 }];
  const seen = new Set<string>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current.nodeId)) continue;
    seen.add(current.nodeId);
    result.push(current.nodeId);
    if (current.depth >= depthLimit) continue;
    const node = tree.nodes[current.nodeId];
    if (!node) continue;
    for (const childId of node.childIds) {
      queue.push({ nodeId: childId, depth: current.depth + 1 });
    }
  }

  return result;
}

async function selectTraversalEntries(
  queryText: string,
  books: RuntimeBook[],
  config: CharacterRetrievalConfig,
  settings: GlobalLoreRecallSettings,
  userId: string,
  allowController: boolean,
): Promise<{ selected: ScoredEntry[]; fallbackReason: string | null; steps: string[] }> {
  const deterministic = scoreEntries(queryText, books).slice(0, Math.max(config.maxResults * 4, 16));
  if (!deterministic.length) {
    return {
      selected: [],
      fallbackReason: "Traversal found no scored entries, so nothing was injected.",
      steps: ["No traversal candidates scored above zero."],
    };
  }

  if (!allowController) {
    return {
      selected: deterministic.slice(0, config.maxResults),
      fallbackReason: "Fast preview skipped traversal controller selection and used deterministic fallback results.",
      steps: ["Fast preview mode skipped controller-driven traversal."],
    };
  }

  const categoryRows: Array<{ id: string; label: string; summary: string; depth: number; entryCount: number }> = [];
  for (const book of books) {
    for (const node of Object.values(book.tree.nodes)) {
      if (node.id === book.tree.rootId) continue;
      const depth = getNodeDepth(book.tree, node.id);
      if (depth > Math.min(config.maxTraversalDepth, config.traversalStepLimit)) continue;
      categoryRows.push({
        id: `${book.summary.id}:${node.id}`,
        label: `${book.summary.name} :: ${node.label}`,
        summary: truncateText(node.summary, 140),
        depth,
        entryCount: node.entryIds.length,
      });
    }
  }

  const prompt = [
    "Choose relevant traversal branches and direct entry IDs.",
    'Return ONLY JSON in this exact shape: {"categoryIds":["book:node"],"entryIds":["entry-id"]}.',
    `You may choose up to ${config.maxTraversalDepth} categoryIds and ${config.maxResults} entryIds.`,
    "",
    `Query: ${queryText}`,
    "",
    "Categories:",
    ...categoryRows.slice(0, 80).map((row) =>
      `- categoryId=${row.id}; label=${row.label}; depth=${row.depth}; entries=${row.entryCount}; summary=${row.summary}`,
    ),
    "",
    "Fallback entries:",
    ...deterministic.slice(0, 24).map((item) =>
      `- entryId=${item.entry.entryId}; label=${item.entry.label}; book=${item.entry.worldBookName}; summary=${truncateText(
        item.entry.summary,
        120,
      )}`,
    ),
  ].join("\n");

  const parsed = await runControllerJson(prompt, settings, userId);
  const categoryIds = Array.isArray(parsed?.categoryIds)
    ? parsed.categoryIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const entryIds = Array.isArray(parsed?.entryIds)
    ? parsed.entryIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  const deterministicById = new Map(deterministic.map((item) => [item.entry.entryId, item]));
  const selectedMap = new Map<string, ScoredEntry>();
  const steps = [
    `${books.length} book(s) considered for traversal.`,
    `${categoryRows.length} category branch(es) exposed to the controller.`,
  ];

  for (const categoryId of categoryIds) {
    const [bookId, nodeId] = categoryId.split(":");
    const book = books.find((item) => item.summary.id === bookId);
    if (!book || !book.tree.nodes[nodeId]) continue;
    const nodeIds = getDescendantCategoryIds(book.tree, nodeId, Math.min(config.maxTraversalDepth, config.traversalStepLimit));
    const entryIdsFromCategories = uniqueStrings(nodeIds.flatMap((id) => book.tree.nodes[id]?.entryIds ?? []));
    for (const entryId of entryIdsFromCategories) {
      const match = deterministicById.get(entryId);
      if (match) selectedMap.set(entryId, match);
    }
  }

  for (const entryId of entryIds) {
    const match = deterministicById.get(entryId);
    if (match) selectedMap.set(entryId, match);
  }

  const selected = Array.from(selectedMap.values()).sort((left, right) => right.score - left.score);
  if (!selected.length) {
    return {
      selected: deterministic.slice(0, config.maxResults),
      fallbackReason: "Traversal controller returned no usable branches, so collapsed retrieval was used instead.",
      steps: [...steps, "Collapsed fallback used because no traversal branch resolved to entries."],
    };
  }

  const finalSelected = config.selectiveRetrieval
    ? await maybeSelectEntries(queryText, selected, config, settings, userId, allowController)
    : selected.slice(0, config.maxResults);

  return {
    selected: finalSelected,
    fallbackReason: null,
    steps: [...steps, `Traversal selected ${finalSelected.length} entry candidate(s).`],
  };
}

function buildPreviewNodes(selected: ScoredEntry[], booksById: Map<string, RuntimeBook>): PreviewNode[] {
  return selected.map((item) => {
    const book = booksById.get(item.entry.worldBookId);
    return {
      entryId: item.entry.entryId,
      label: item.entry.label,
      worldBookId: item.entry.worldBookId,
      worldBookName: item.entry.worldBookName,
      breadcrumb: book ? getEntryBreadcrumb(item.entry, book.tree) : item.entry.label,
      score: Number(item.score.toFixed(2)),
      reasons: item.reasons,
      previewText: truncateText(getEntryBody(item.entry), 240),
    };
  });
}

function buildInjectionText(
  selected: ScoredEntry[],
  booksById: Map<string, RuntimeBook>,
  tokenBudget: number,
  collapsedDepth: number,
): { text: string; included: ScoredEntry[]; estimatedTokens: number } | null {
  if (!selected.length) return null;

  const maxChars = clampInt(tokenBudget, 200, 8000) * 4;
  const parts: string[] = [
    "[Lore Recall Retrieved Context]",
    "Use this retrieved reference only if it is relevant to the current reply. Do not mention Lore Recall or describe this block explicitly.",
  ];
  const included: ScoredEntry[] = [];

  for (const item of selected) {
    const book = booksById.get(item.entry.worldBookId);
    const path = book ? getEntryCategoryPath(book.tree, item.entry.entryId).slice(-collapsedDepth) : [];
    const pathLabels = path.map((node) => node.label);
    const branchSummary = path
      .map((node) => node.summary.trim())
      .filter(Boolean)
      .join(" | ");

    const section = [
      "",
      `${included.length + 1}. ${[...pathLabels, item.entry.label].join(" > ")}`,
      `Book: ${item.entry.worldBookName}`,
      item.entry.aliases.length ? `Aliases: ${item.entry.aliases.join(", ")}` : "",
      branchSummary ? `Branch summary: ${branchSummary}` : "",
      getEntryBody(item.entry),
    ]
      .filter(Boolean)
      .join("\n");

    const nextText = [...parts, section].join("\n");
    if (nextText.length <= maxChars) {
      parts.push(section);
      included.push(item);
      continue;
    }

    if (!included.length) {
      const remaining = Math.max(180, maxChars - parts.join("\n").length - 20);
      parts.push(
        [
          "",
          `1. ${[...pathLabels, item.entry.label].join(" > ")}`,
          `Book: ${item.entry.worldBookName}`,
          truncateText(getEntryBody(item.entry), remaining),
        ].join("\n"),
      );
      included.push(item);
    }
    break;
  }

  const text = parts.join("\n").trim();
  if (!included.length || !text) return null;
  return {
    text,
    included,
    estimatedTokens: Math.ceil(text.length / 4),
  };
}

export async function buildRetrievalPreview(
  messages: ChatLikeMessage[],
  settings: GlobalLoreRecallSettings,
  config: CharacterRetrievalConfig,
  books: RuntimeBook[],
  userId: string,
  options: RetrievalPreviewOptions = {},
): Promise<RetrievalPreview | null> {
  const allowController = options.allowController !== false;
  const queryText = buildQueryText(messages, config.contextMessages);
  if (!queryText.trim()) return null;

  const readableBooks = books.filter((book) => isReadableBook(book.config));
  if (!readableBooks.length) return null;

  const chosenBooks = await maybeChooseBooks(queryText, readableBooks, config, settings, userId, allowController);
  const steps = [
    `${books.length} managed book(s) loaded.`,
    `${chosenBooks.length} readable book(s) selected for search.`,
  ];

  let selected: ScoredEntry[] = [];
  let fallbackReason: string | null = null;

  if (config.searchMode === "traversal") {
    const traversal = await selectTraversalEntries(queryText, chosenBooks, config, settings, userId, allowController);
    selected = traversal.selected;
    fallbackReason = traversal.fallbackReason;
    steps.push(...traversal.steps);
  } else {
    let collapsed = scoreEntries(queryText, chosenBooks);
    if (config.rerankEnabled && allowController) {
      collapsed = await maybeRerankEntries(queryText, collapsed, settings, userId, allowController);
      steps.push("Collapsed retrieval reranked top candidates.");
    }
    selected = config.selectiveRetrieval
      ? await maybeSelectEntries(queryText, collapsed, config, settings, userId, allowController)
      : collapsed.slice(0, config.maxResults);
    steps.push(`Collapsed retrieval selected ${selected.length} candidate(s).`);
  }

  if (!selected.length) return null;
  const booksById = new Map(chosenBooks.map((book) => [book.summary.id, book]));
  const injection = buildInjectionText(selected, booksById, config.tokenBudget, config.collapsedDepth);
  if (!injection) return null;

  return {
    mode: config.searchMode,
    queryText,
    estimatedTokens: injection.estimatedTokens,
    injectedText: injection.text,
    selectedNodes: buildPreviewNodes(injection.included, booksById),
    fallbackReason,
    selectedBookIds: chosenBooks.map((book) => book.summary.id),
    steps,
  };
}
