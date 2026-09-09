import assert from "node:assert/strict";
import test from "node:test";
import { newClassroom, addStudents, recordAction, undoAction, balancesFor, faces, validateClassroom, lastAction } from "./classroom.js";

function classroom() { return addStudents(newClassroom(), ["张三", "李四"]); }
function balance(data, index = 0) { return balancesFor(data).get(data.students[index].id); }

test("positive and negative points accumulate independently across five-point boundaries", () => {
  let data = classroom();
  const id = data.students[0].id;
  data = recordAction(data, "award", [id], 13);
  data = recordAction(data, "deduct", [id], 7);
  assert.deepEqual(faces(balance(data)), { smiles: 2, frowns: 1, plusProgress: 3, minusProgress: 2 });
  assert.equal(balance(data, 1).positive, 0);
});

test("redemption uses smile balance, preserves remainder and snapshots sticker count", () => {
  let data = classroom();
  const id = data.students[0].id;
  data = recordAction(data, "award", [id], 23);
  data = recordAction(data, "redeem", [id], 4, "贴纸", 2);
  data.smilesPerSticker = 3;
  assert.deepEqual(faces(balance(data)), { smiles: 0, frowns: 0, plusProgress: 3, minusProgress: 0 });
  assert.equal(balance(data).positive, 23);
  assert.equal(balance(data).stickers, 2);
  assert.throws(() => recordAction(data, "redeem", [id], 1, "", 1), /不足/);
  const restored = undoAction(data);
  assert.equal(faces(balance(restored)).smiles, 4);
  assert.equal(balance(restored).stickers, 0);
  assert.equal(restored.events.length, 3);
});

test("clear faces and undo retain point history and never produce negative balances", () => {
  let data = classroom();
  const id = data.students[0].id;
  data = recordAction(data, "award", [id], 12);
  data = recordAction(data, "deduct", [id], 8);
  data = recordAction(data, "clear-smile", [id], 1);
  data = recordAction(data, "clear-frown", [id], 1, "表现进步");
  assert.deepEqual(faces(balance(data)), { smiles: 1, frowns: 0, plusProgress: 2, minusProgress: 3 });
  assert.throws(() => recordAction(data, "clear-frown", [id], 1), /不足/);
  data = undoAction(data);
  assert.equal(faces(balance(data)).frowns, 1);
  assert.equal(balance(data).negative, 8);
});

test("batch scoring is undone as one action including newly earned faces", () => {
  let data = classroom();
  const ids = data.students.map((student) => student.id);
  data = recordAction(data, "award", ids, 4);
  data = recordAction(data, "award", ids);
  assert.equal(faces(balance(data)).smiles, 1);
  data = undoAction(data);
  for (const value of balancesFor(data).values()) assert.equal(value.positive, 4);
  data = undoAction(data);
  assert.equal(lastAction(data), undefined);
  assert.throws(() => undoAction(data), /没有可撤销/);
});

test("archiving preserves history and supports undo while preventing new scores", () => {
  let data = classroom();
  const id = data.students[0].id;
  data = recordAction(data, "award", [id], 5);
  data.students[0].archived = true;
  assert.throws(() => recordAction(data, "award", [id]), /移出/);
  assert.equal(balance(undoAction(data)).positive, 0);
  data.students[0].archived = false;
  assert.equal(faces(balance(data)).smiles, 1);
});

test("backup validation rejects bad identifiers, amounts, references and undo ordering", () => {
  const source = classroom();
  const id = source.students[0].id;
  for (const amount of [0, -1, 1.5, Infinity, 1001]) assert.throws(() => recordAction(source, "award", [id], amount));
  assert.throws(() => recordAction(source, "award", [id, id]));
  assert.throws(() => recordAction(source, "award", ["missing"]));
  assert.throws(() => validateClassroom({ ...source, students: [source.students[0], source.students[0]] }));
  let data = recordAction(source, "award", [id], 5);
  data = recordAction(data, "award", [id], 5);
  const bad = undoAction(data);
  bad.events.at(-1).targetId = data.events[0].id;
  assert.throws(() => validateClassroom(bad), /顺序/);
  assert.deepEqual(validateClassroom(JSON.parse(JSON.stringify(data))), data);
  assert.throws(() => addStudents(source, [" "]));
  assert.throws(() => addStudents(source, Array(121).fill("同学")));
});

test("sixty preset avatars are assigned before the sequence repeats", () => {
  const data = addStudents(newClassroom(), Array.from({ length: 60 }, (_, index) => `同学${index + 1}`));
  assert.equal(new Set(data.students.map((student) => student.avatar)).size, 60);
  assert.equal(validateClassroom(data), data);
  const repeated = addStudents(data, ["第六十一位"]);
  assert.equal(repeated.students.at(-1).avatar, "preset:0");
});
