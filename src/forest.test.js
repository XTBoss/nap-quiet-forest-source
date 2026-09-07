import assert from "node:assert/strict";
import test from "node:test";
import {
  canCombine,
  combinableSmallTrees,
  parseCombineCount,
  pickSmallTreeToRemove,
  remainingToCombine,
  removableSmallTrees,
} from "./forest.js";

test("combine count stays at the chosen number, not the minimum of 2", () => {
  assert.equal(parseCombineCount("3"), 3);
  assert.equal(parseCombineCount(3), 3);
  assert.equal(parseCombineCount("2"), 2);
  assert.equal(parseCombineCount(""), 3);
  assert.equal(parseCombineCount("nope"), 3);
});

test("two saplings do not combine when three are required", () => {
  const trees = [
    { id: 1, kind: "small", anim: "tree--sprout" },
    { id: 2, kind: "small", anim: "tree--sprout" },
  ];
  assert.equal(combinableSmallTrees(trees).length, 2);
  assert.equal(canCombine(trees, 3), false);
  assert.equal(remainingToCombine(2, 3), 1);
});

test("three saplings can combine into one big tree", () => {
  const trees = [
    { id: 1, kind: "small" },
    { id: 2, kind: "small" },
    { id: 3, kind: "small" },
  ];
  assert.equal(canCombine(trees, 3), true);
  assert.equal(remainingToCombine(3, 3), 0);
});

test("loud rooms remove the newest sapling and never take a big tree", () => {
  const trees = [
    { id: 1, kind: "big" },
    { id: 2, kind: "small" },
    { id: 4, kind: "small" },
    { id: 3, kind: "small", anim: "tree--merge" },
  ];
  assert.equal(removableSmallTrees(trees).length, 2);
  assert.equal(pickSmallTreeToRemove(trees)?.id, 4);
  assert.equal(pickSmallTreeToRemove([{ id: 1, kind: "big" }]), null);
});
