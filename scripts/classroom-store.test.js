import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { newClassroom, addStudents, recordAction, undoAction } from "../src/classroom.js";
import { createClassroomStore } from "./classroom-store.js";
import { createHistoryStore } from "./history-store.js";

test("classroom writes atomically, survives reload and rejects stale revisions without overwriting", () => {
  const dir = mkdtempSync(join(tmpdir(), "classroom-store-"));
  try {
    const store = createClassroomStore(dir);
    assert.equal(store.load(), null);
    let data = addStudents(newClassroom(), ["张三"]);
    data = recordAction(data, "award", [data.students[0].id], 8);
    const saved = store.save(data, 0);
    assert.equal(saved.revision, 1);
    assert.deepEqual(createClassroomStore(dir).load(), saved);
    assert.throws(() => store.save(newClassroom(), 0), { status: 409 });
    assert.deepEqual(store.load(), saved);
    assert.equal(existsSync(join(dir, "data/classroom.json.tmp")), false);
    createHistoryStore(dir).clear();
    assert.deepEqual(store.load(), saved);
    assert.throws(() => store.save({ ...data, events: [{ type: "redeem" }] }, 1));
    assert.deepEqual(store.load(), saved);
    const file = join(dir, "data/classroom.json");
    writeFileSync(file, "corrupted backup");
    assert.throws(() => store.save(data, 1));
    assert.equal(readFileSync(file, "utf8"), "corrupted backup");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Python launcher accepts the same ledger and protects stale or invalid writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "classroom-python-"));
  try {
    let data = addStudents(newClassroom(), ["张三", "李四"]);
    const ids = data.students.map((student) => student.id);
    data = recordAction(data, "award", ids, 18);
    data = recordAction(data, "deduct", ids, 7);
    data = recordAction(data, "redeem", [ids[0]], 2, "贴纸", 1);
    data = recordAction(data, "clear-frown", [ids[1]], 1);
    data = undoAction(data);
    const result = spawnSync("python3", ["-c", `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("launcher", sys.argv[1])
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
data = json.load(sys.stdin)
assert server.load_classroom(sys.argv[2]) is None
saved = server.save_classroom(sys.argv[2], dict(data=data, baseRevision=0))
assert saved["revision"] == 1
assert server.load_classroom(sys.argv[2]) == saved
try:
    server.save_classroom(sys.argv[2], dict(data=data, baseRevision=0))
    raise AssertionError("stale write accepted")
except FileExistsError:
    pass
bad = json.loads(json.dumps(data))
bad["events"][2]["amount"] = 900
try:
    server.save_classroom(sys.argv[2], dict(data=bad, baseRevision=1))
    raise AssertionError("invalid balance accepted")
except ValueError:
    pass
assert server.load_classroom(sys.argv[2]) == saved
print(json.dumps(saved))
`, resolve("launchers/server.py"), dir], { input: JSON.stringify(data), encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ...data, revision: 1 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function powershellExe() {
  for (const shell of process.platform === "win32" ? ["powershell"] : ["pwsh"]) {
    const probe = spawnSync(shell, ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" });
    if (!probe.error && probe.status === 0) return shell;
  }
  return null;
}

test("PowerShell launcher preserves arrays, repeated awards and undo across file replacements", (t) => {
  const shell = powershellExe();
  if (!shell) {
    t.skip("PowerShell is not available");
    return;
  }
  const result = spawnSync(
    shell,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("launchers/launch.ps1"), "-SelfTest"],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /selftest ok/);
});
