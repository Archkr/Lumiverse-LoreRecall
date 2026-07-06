import { describe, expect, test } from "bun:test";
import type { EffectiveTreeGranularity } from "../shared";
import { assignEntryToTarget, createEmptyTreeIndex, ensureCategoryPath } from "../shared";
import {
  applyTreeAssignments,
  enforceLeafEntryLimit,
  enforceTopLevelCategoryCap,
  normalizeTreeAssignmentsForGranularity,
} from "./granularity";
import type { BookTreeIndex } from "../types";

const GRANULARITY: EffectiveTreeGranularity = {
  level: 99,
  label: "Test",
  targetCategories: "1-2",
  targetTopLevelMin: 1,
  targetTopLevelMax: 2,
  maxEntries: 2,
  description: "Test granularity",
  isAuto: false,
};

function rootLabels(tree: BookTreeIndex): string[] {
  return tree.nodes[tree.rootId].childIds.map((nodeId) => tree.nodes[nodeId]?.label ?? "");
}

function leafEntryCounts(tree: BookTreeIndex): number[] {
  return Object.values(tree.nodes)
    .filter((node) => node.id !== tree.rootId && node.childIds.length === 0)
    .map((node) => node.entryIds.length);
}

function allLabels(tree: BookTreeIndex): string[] {
  return Object.values(tree.nodes).map((node) => node.label);
}

describe("tree granularity enforcement", () => {
  test("caps excessive top-level assignment proposals", () => {
    const tree = createEmptyTreeIndex("book");
    const validEntryIds = new Set(["a", "b", "c"]);
    const result = normalizeTreeAssignmentsForGranularity(
      tree,
      [
        { entryId: "a", path: ["Alpha"] },
        { entryId: "b", path: ["Beta"] },
        { entryId: "c", path: ["Gamma"] },
      ],
      validEntryIds,
      GRANULARITY,
    );

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.adjustments.length).toBeGreaterThan(0);

    applyTreeAssignments(tree, result.assignments, "llm");
    enforceTopLevelCategoryCap(tree, GRANULARITY);

    expect(rootLabels(tree)).toHaveLength(2);
    expect(rootLabels(tree)).toEqual(["Alpha", "Beta"]);
    expect(allLabels(tree)).toContain("Gamma");
  });

  test("reuses existing top-level categories before creating new ones", () => {
    const tree = createEmptyTreeIndex("book");
    ensureCategoryPath(tree, ["Alpha"], "manual");
    const result = normalizeTreeAssignmentsForGranularity(
      tree,
      [
        { entryId: "a", path: ["Alpha"] },
        { entryId: "b", path: ["Beta"] },
        { entryId: "c", path: ["Gamma"] },
      ],
      new Set(["a", "b", "c"]),
      GRANULARITY,
    );

    applyTreeAssignments(tree, result.assignments, "llm");
    enforceTopLevelCategoryCap(tree, GRANULARITY);

    expect(rootLabels(tree)).toEqual(["Alpha", "Beta"]);
    expect(allLabels(tree)).toContain("Gamma");
  });

  test("splits oversized assignment leaves into stable numbered subgroups", () => {
    const tree = createEmptyTreeIndex("book");
    const raw = Array.from({ length: 5 }, (_, index) => ({
      entryId: `entry-${index + 1}`,
      path: ["Alpha"],
    }));
    const result = normalizeTreeAssignmentsForGranularity(
      tree,
      raw,
      new Set(raw.map((item) => item.entryId)),
      GRANULARITY,
    );

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.adjustments.some((item) => item.includes("Split"))).toBe(true);

    applyTreeAssignments(tree, result.assignments, "llm");

    expect(leafEntryCounts(tree).every((count) => count <= GRANULARITY.maxEntries)).toBe(true);
    expect(allLabels(tree)).toEqual(expect.arrayContaining(["Part 1", "Part 2", "Part 3"]));
  });

  test("ignores unknown assignment entry ids safely", () => {
    const tree = createEmptyTreeIndex("book");
    const result = normalizeTreeAssignmentsForGranularity(
      tree,
      [
        { entryId: "known", path: ["Alpha"] },
        { entryId: "missing", path: ["Beta"] },
      ],
      new Set(["known"]),
      GRANULARITY,
    );

    expect(result.ignoredEntryIds).toEqual(["missing"]);
    expect(result.assignments.map((assignment) => assignment.entryId)).toEqual(["known"]);
  });

  test("deterministically splits oversized existing leaf nodes", () => {
    const tree = createEmptyTreeIndex("book");
    const categoryId = ensureCategoryPath(tree, ["Alpha"], "manual");
    for (const entryId of ["a", "b", "c", "d", "e"]) {
      assignEntryToTarget(tree, entryId, { categoryId });
    }

    expect(enforceLeafEntryLimit(tree, GRANULARITY, "system")).toBe(1);

    const alpha = tree.nodes[categoryId];
    expect(alpha.entryIds).toEqual([]);
    expect(alpha.childIds).toHaveLength(3);
    expect(leafEntryCounts(tree).every((count) => count <= GRANULARITY.maxEntries)).toBe(true);
  });

  test("does not promote subcategories only to satisfy top-level minimum", () => {
    const tree = createEmptyTreeIndex("book");
    ensureCategoryPath(tree, ["Characters", "Shido"], "llm");
    ensureCategoryPath(tree, ["Spirits & Angels", "Angels"], "llm");
    ensureCategoryPath(tree, ["Spirits & Angels", "Sephira Crystals"], "llm");
    ensureCategoryPath(tree, ["Factions", "Ratatoskr"], "llm");

    enforceTopLevelCategoryCap(tree, {
      ...GRANULARITY,
      targetTopLevelMin: 5,
      targetTopLevelMax: 8,
      targetCategories: "5-8",
    });

    expect(rootLabels(tree)).toEqual(["Characters", "Spirits & Angels", "Factions"]);
    expect(allLabels(tree)).toEqual(expect.arrayContaining(["Shido", "Angels", "Sephira Crystals", "Ratatoskr"]));
  });
});
