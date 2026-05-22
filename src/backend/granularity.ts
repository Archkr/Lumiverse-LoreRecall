import type { EffectiveTreeGranularity } from "../shared";
import {
  assignEntryToTarget,
  ensureCategoryPath,
  makeNodeId,
  makeTreeNode,
  uniqueStrings,
} from "../shared";
import type { BookTreeIndex, BookTreeNode } from "../types";

export interface TreeAssignment {
  entryId: string;
  path: string[];
}

export interface CoercedTreeAssignments {
  assignments: TreeAssignment[];
  ignoredEntryIds: string[];
}

export interface GranularityNormalizationResult {
  assignments: TreeAssignment[];
  violations: string[];
  adjustments: string[];
  ignoredEntryIds: string[];
}

function labelKey(value: string): string {
  return value.trim().toLowerCase();
}

function pathKey(path: string[]): string {
  return path.map(labelKey).join("\u001f");
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function normalizePath(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function coerceTreeAssignments(values: unknown, validEntryIds: Set<string>): CoercedTreeAssignments {
  const byEntryId = new Map<string, TreeAssignment>();
  const ignoredEntryIds: string[] = [];
  if (!Array.isArray(values)) return { assignments: [], ignoredEntryIds };

  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const entryId = typeof record.entryId === "string" ? record.entryId.trim() : "";
    if (!entryId || !validEntryIds.has(entryId)) {
      if (entryId) ignoredEntryIds.push(entryId);
      continue;
    }
    byEntryId.set(entryId, {
      entryId,
      path: normalizePath(record.path),
    });
  }

  return {
    assignments: [...byEntryId.values()],
    ignoredEntryIds: uniqueStrings(ignoredEntryIds),
  };
}

function getRoot(tree: BookTreeIndex): BookTreeNode {
  return tree.nodes[tree.rootId];
}

function getTopLevelNodes(tree: BookTreeIndex): BookTreeNode[] {
  const root = getRoot(tree);
  return (root?.childIds ?? []).map((nodeId) => tree.nodes[nodeId]).filter((node): node is BookTreeNode => !!node);
}

function findChildByLabel(tree: BookTreeIndex, parentId: string, label: string): string | null {
  const parent = tree.nodes[parentId];
  if (!parent) return null;
  const key = labelKey(label);
  return parent.childIds.find((childId) => labelKey(tree.nodes[childId]?.label ?? "") === key) ?? null;
}

function findNodeIdByPath(tree: BookTreeIndex, path: string[]): string | null {
  let parentId = tree.rootId;
  for (const label of path) {
    const childId = findChildByLabel(tree, parentId, label);
    if (!childId) return null;
    parentId = childId;
  }
  return parentId;
}

function getAllowedTopLevelLabels(
  tree: BookTreeIndex,
  assignments: TreeAssignment[],
  granularity: EffectiveTreeGranularity,
): string[] {
  const allowed: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const trimmed = label.trim();
    const key = labelKey(trimmed);
    if (!trimmed || seen.has(key) || allowed.length >= granularity.targetTopLevelMax) return;
    allowed.push(trimmed);
    seen.add(key);
  };

  for (const node of getTopLevelNodes(tree)) push(node.label);
  for (const assignment of assignments) {
    if (assignment.path.length) push(assignment.path[0]);
  }
  return allowed;
}

export function validateTreeAssignmentsGranularity(
  tree: BookTreeIndex,
  assignments: TreeAssignment[],
  granularity: EffectiveTreeGranularity,
): string[] {
  const violations: string[] = [];
  const existingTopKeys = new Set(getTopLevelNodes(tree).map((node) => labelKey(node.label)));
  const newTopLabels: string[] = [];
  const newTopKeys = new Set<string>();

  for (const assignment of assignments) {
    const topLabel = assignment.path[0];
    if (!topLabel) continue;
    const key = labelKey(topLabel);
    if (existingTopKeys.has(key) || newTopKeys.has(key)) continue;
    newTopKeys.add(key);
    newTopLabels.push(topLabel);
  }

  const totalTopLevel = existingTopKeys.size + newTopLabels.length;
  if (totalTopLevel > granularity.targetTopLevelMax) {
    const allowedNewCount = Math.max(0, granularity.targetTopLevelMax - existingTopKeys.size);
    violations.push(
      `Top-level category cap exceeded: ${totalTopLevel}/${granularity.targetTopLevelMax}. Excess top-level labels: ${newTopLabels.slice(allowedNewCount).join(", ") || "unknown"}.`,
    );
  }

  const leafCounts = new Map<string, { path: string[]; count: number; existingCount: number }>();
  for (const assignment of assignments) {
    if (!assignment.path.length) continue;
    const key = pathKey(assignment.path);
    const current = leafCounts.get(key) ?? { path: assignment.path, count: 0, existingCount: 0 };
    current.count += 1;
    leafCounts.set(key, current);
  }

  for (const item of leafCounts.values()) {
    const nodeId = findNodeIdByPath(tree, item.path);
    const node = nodeId ? tree.nodes[nodeId] : null;
    item.existingCount = node && node.childIds.length === 0 ? node.entryIds.length : 0;
    const total = item.existingCount + item.count;
    if (total > granularity.maxEntries) {
      violations.push(
        `Leaf category "${item.path.join(" > ")}" would contain ${total}/${granularity.maxEntries} entries.`,
      );
    }
  }

  return violations;
}

export function normalizeTreeAssignmentsForGranularity(
  tree: BookTreeIndex,
  rawAssignments: unknown,
  validEntryIds: Set<string>,
  granularity: EffectiveTreeGranularity,
): GranularityNormalizationResult {
  const coerced = coerceTreeAssignments(rawAssignments, validEntryIds);
  const violations = validateTreeAssignmentsGranularity(tree, coerced.assignments, granularity);
  const adjustments: string[] = [];
  const allowedTopLabels = getAllowedTopLevelLabels(tree, coerced.assignments, granularity);
  const allowedTopKeys = new Set(allowedTopLabels.map(labelKey));

  let assignments = coerced.assignments.map((assignment) => {
    if (!assignment.path.length || allowedTopKeys.has(labelKey(assignment.path[0]))) return assignment;
    const targetTopLabel = allowedTopLabels[stableHash(assignment.path[0]) % allowedTopLabels.length] ?? assignment.path[0];
    adjustments.push(`Moved "${assignment.path[0]}" under "${targetTopLabel}" to respect the top-level category cap.`);
    return {
      ...assignment,
      path: [targetTopLabel, ...assignment.path],
    };
  });

  const byPath = new Map<string, TreeAssignment[]>();
  for (const assignment of assignments) {
    if (!assignment.path.length) continue;
    const key = pathKey(assignment.path);
    const list = byPath.get(key) ?? [];
    list.push(assignment);
    byPath.set(key, list);
  }

  const splitEntryIds = new Map<string, string[]>();
  for (const [key, list] of byPath) {
    const path = list[0]?.path ?? [];
    const nodeId = findNodeIdByPath(tree, path);
    const node = nodeId ? tree.nodes[nodeId] : null;
    const existingCount = node && node.childIds.length === 0 ? node.entryIds.length : 0;
    if (existingCount + list.length <= granularity.maxEntries) continue;
    adjustments.push(`Split "${path.join(" > ")}" assignment output to respect ${granularity.maxEntries} entries per leaf.`);
    splitEntryIds.set(
      key,
      list.map((assignment) => assignment.entryId),
    );
  }

  if (splitEntryIds.size) {
    assignments = assignments.map((assignment) => {
      if (!assignment.path.length) return assignment;
      const splitIds = splitEntryIds.get(pathKey(assignment.path));
      if (!splitIds) return assignment;
      const index = Math.max(0, splitIds.indexOf(assignment.entryId));
      return {
        ...assignment,
        path: [...assignment.path, `Part ${Math.floor(index / granularity.maxEntries) + 1}`],
      };
    });
  }

  return {
    assignments,
    violations,
    adjustments: uniqueStrings(adjustments),
    ignoredEntryIds: coerced.ignoredEntryIds,
  };
}

export function applyTreeAssignments(
  tree: BookTreeIndex,
  assignments: TreeAssignment[],
  createdBy: BookTreeNode["createdBy"],
): void {
  for (const assignment of assignments) {
    if (assignment.path.length) {
      const categoryId = ensureCategoryPath(tree, assignment.path, createdBy);
      assignEntryToTarget(tree, assignment.entryId, { categoryId });
    } else {
      assignEntryToTarget(tree, assignment.entryId, "unassigned");
    }
  }
}

export function enforceTopLevelCategoryCap(
  tree: BookTreeIndex,
  granularity: EffectiveTreeGranularity,
): number {
  const root = getRoot(tree);
  if (!root || root.childIds.length <= granularity.targetTopLevelMax) return 0;
  const keptIds = root.childIds.slice(0, granularity.targetTopLevelMax).filter((nodeId) => !!tree.nodes[nodeId]);
  const excessIds = root.childIds.slice(granularity.targetTopLevelMax).filter((nodeId) => !!tree.nodes[nodeId]);
  if (!keptIds.length) return 0;

  root.childIds = keptIds;
  for (const [index, nodeId] of excessIds.entries()) {
    const node = tree.nodes[nodeId];
    const parentId = keptIds[index % keptIds.length];
    const parent = tree.nodes[parentId];
    if (!node || !parent) continue;
    node.parentId = parentId;
    if (!parent.childIds.includes(nodeId)) parent.childIds.push(nodeId);
  }

  return excessIds.length;
}

export function enforceTopLevelCategoryMinimum(
  tree: BookTreeIndex,
  granularity: EffectiveTreeGranularity,
): number {
  const root = getRoot(tree);
  if (!root || root.childIds.length >= granularity.targetTopLevelMin) return 0;

  let promotedCount = 0;
  const promotedByParent = new Map<string, number>();
  const candidates = root.childIds
    .map((parentId, parentIndex) => ({ parentId, parentIndex }))
    .flatMap(({ parentId, parentIndex }) => {
      const parent = tree.nodes[parentId];
      if (!parent) return [];
      return parent.childIds
        .map((childId, childIndex) => ({ childId, childIndex, parentId, parentIndex }))
        .filter(({ childId }) => !!tree.nodes[childId]);
    })
    .sort(
      (left, right) =>
        left.parentIndex - right.parentIndex ||
        left.childIndex - right.childIndex ||
        (tree.nodes[left.childId]?.label ?? "").localeCompare(tree.nodes[right.childId]?.label ?? ""),
    );

  for (const candidate of candidates) {
    if (root.childIds.length >= granularity.targetTopLevelMin) break;
    if (root.childIds.length >= granularity.targetTopLevelMax) break;

    const parent = tree.nodes[candidate.parentId];
    const child = tree.nodes[candidate.childId];
    if (!parent || !child) continue;

    parent.childIds = parent.childIds.filter((childId) => childId !== candidate.childId);
    child.parentId = tree.rootId;

    const parentRootIndex = root.childIds.indexOf(candidate.parentId);
    const parentPromotedCount = promotedByParent.get(candidate.parentId) ?? 0;
    const insertIndex = parentRootIndex >= 0 ? parentRootIndex + 1 + parentPromotedCount : root.childIds.length;
    root.childIds.splice(Math.min(insertIndex, root.childIds.length), 0, candidate.childId);
    promotedByParent.set(candidate.parentId, parentPromotedCount + 1);
    promotedCount += 1;
  }

  return promotedCount;
}

export function enforceLeafEntryLimit(
  tree: BookTreeIndex,
  granularity: EffectiveTreeGranularity,
  createdBy: BookTreeNode["createdBy"],
): number {
  const oversizedLeaves = Object.values(tree.nodes).filter(
    (node) => node.id !== tree.rootId && node.childIds.length === 0 && node.entryIds.length > granularity.maxEntries,
  );
  let splitCount = 0;

  for (const node of oversizedLeaves) {
    const entryIds = [...node.entryIds];
    node.entryIds = [];
    for (let index = 0; index < entryIds.length; index += granularity.maxEntries) {
      const label = `Part ${Math.floor(index / granularity.maxEntries) + 1}`;
      const childId = makeNodeId("cat", `${node.label}-${label}`);
      tree.nodes[childId] = makeTreeNode(childId, label, node.id, createdBy);
      tree.nodes[childId].entryIds = entryIds.slice(index, index + granularity.maxEntries);
      node.childIds.push(childId);
    }
    splitCount += 1;
  }

  return splitCount;
}
