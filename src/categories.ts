import { ensureCategoryPath } from "./shared";
import type { BookTreeIndex } from "./types";

export const ROOT_CATEGORIES = ["Characters", "Locations", "Items", "Factions", "Events", "Worldbuilding", "Other"] as const;
export type RootCategory = (typeof ROOT_CATEGORIES)[number];

const HINTS: Record<Exclude<RootCategory, "Other">, RegExp> = {
  Characters: /character|person|people|cast|npc|protagonist|relationship|family/i,
  Locations: /location|place|region|city|town|land|map|geograph/i,
  Items: /item|object|artifact|equipment|weapon|tool|inventory/i,
  Factions: /faction|organization|group|guild|house|clan|government/i,
  Events: /event|history|timeline|era|incident|war|battle/i,
  Worldbuilding: /world|lore|magic|system|rule|culture|religion|species|setting/i,
};

export function classifyCategory(label: string): RootCategory {
  const matches = (Object.keys(HINTS) as Array<Exclude<RootCategory, "Other">>).filter((root) => HINTS[root].test(label));
  return matches.length === 1 ? matches[0] : "Other";
}

export function ensureRootCategories(tree: BookTreeIndex): BookTreeIndex {
  const root = tree.nodes[tree.rootId];
  if (!root) return tree;
  const existing = [...root.childIds];
  const fixedIds = new Map<RootCategory, string>();
  for (const label of ROOT_CATEGORIES) fixedIds.set(label, ensureCategoryPath(tree, [label], "system"));
  for (const id of existing) {
    const node = tree.nodes[id];
    if (!node || Array.from(fixedIds.values()).includes(id)) continue;
    const target = fixedIds.get(classifyCategory(`${node.label} ${node.summary}`))!;
    root.childIds = root.childIds.filter((childId) => childId !== id);
    node.parentId = target;
    if (!tree.nodes[target].childIds.includes(id)) tree.nodes[target].childIds.push(id);
  }
  const other = tree.nodes[fixedIds.get("Other")!];
  other.entryIds = [...new Set([...other.entryIds, ...root.entryIds, ...tree.unassignedEntryIds])];
  root.entryIds = [];
  tree.unassignedEntryIds = [];
  root.childIds = ROOT_CATEGORIES.map((label) => fixedIds.get(label)!);
  return tree;
}

export function rootCategoryForEntry(tree: BookTreeIndex, entryId: string): RootCategory {
  for (const label of ROOT_CATEGORIES) {
    const rootId = tree.nodes[tree.rootId]?.childIds.find((id) => tree.nodes[id]?.label === label);
    if (!rootId) continue;
    const queue = [rootId];
    const visited = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = tree.nodes[id];
      if (!node) continue;
      if (node.entryIds.includes(entryId)) return label;
      queue.push(...node.childIds);
    }
  }
  return "Other";
}
