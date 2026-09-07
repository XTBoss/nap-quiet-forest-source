export const DEFAULT_COMBINE = 3;

export function parseCombineCount(raw, fallback = DEFAULT_COMBINE) {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(12, Math.max(2, n));
}

export function combinableSmallTrees(trees) {
  return trees.filter((tree) => tree.kind === "small" && tree.anim !== "tree--merge");
}

export function canCombine(trees, need) {
  return combinableSmallTrees(trees).length >= need;
}

export function remainingToCombine(smallCount, need) {
  if (need < 2) return 0;
  if (smallCount >= need) return 0;
  return need - smallCount;
}

export function removableSmallTrees(trees) {
  return trees.filter(
    (tree) => tree.kind === "small" && tree.anim !== "tree--merge" && tree.anim !== "tree--wilt",
  );
}

export function pickSmallTreeToRemove(trees) {
  const smalls = removableSmallTrees(trees);
  if (smalls.length === 0) return null;
  return smalls.reduce((newest, tree) => (tree.id > newest.id ? tree : newest));
}
