import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sessionDateKey } from "../src/history.js";
import { createHistoryStore } from "./history-store.js";

test("history store writes one json file per local day", () => {
  const dir = mkdtempSync(join(tmpdir(), "quiet-forest-"));
  try {
    const store = createHistoryStore(dir);
    const endedAt = new Date(2026, 8, 8, 10, 36).toISOString();
    const records = store.append({
      endedAt,
      quietMs: 60000,
      planted: 2,
      lost: 0,
      big: 1,
      demo: false,
    });
    assert.equal(records.length, 1);
    const date = sessionDateKey(endedAt);
    const saved = JSON.parse(readFileSync(join(dir, "data", `${date}.json`), "utf8"));
    assert.equal(saved.date, date);
    assert.equal(saved.sessions[0].planted, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
