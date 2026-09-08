import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_HISTORY,
  MIN_QUIET_MS_TO_SAVE,
  appendHistory,
  extractImportedRecords,
  formatEndedAt,
  formatHistorySummary,
  formatQuietDuration,
  mergeHistory,
  parseHistory,
  sessionDateKey,
  shouldSaveSession,
} from "./history.js";

test("short accidental sessions are not saved", () => {
  assert.equal(shouldSaveSession({ quietMs: 1200, planted: 0, lost: 0 }), false);
  assert.equal(shouldSaveSession({ quietMs: MIN_QUIET_MS_TO_SAVE, planted: 0, lost: 0 }), true);
  assert.equal(shouldSaveSession({ quietMs: 0, planted: 1, lost: 0 }), true);
  assert.equal(shouldSaveSession({ quietMs: 0, planted: 0, lost: 1 }), true);
});

test("history keeps newest records first and caps length", () => {
  const newest = { endedAt: "2026-12-01T00:00:00.000Z", quietMs: 60000, planted: 1, lost: 0, big: 0 };
  const extra = Array.from({ length: MAX_HISTORY }, (_, i) => ({
    endedAt: `2026-09-02T00:00:00.${String(i).padStart(3, "0")}Z`,
    quietMs: 60000,
    planted: 1,
    lost: 0,
    big: 0,
  }));
  const next = appendHistory(extra, newest);
  assert.equal(next[0].endedAt, newest.endedAt);
  assert.equal(next.length, MAX_HISTORY);
});

test("quiet duration uses minutes for nap-length sessions", () => {
  assert.equal(formatQuietDuration(3000), "3 秒");
  assert.equal(formatQuietDuration(60000), "1 分钟");
  assert.equal(formatQuietDuration(3600000), "1 小时");
  assert.equal(formatQuietDuration(5400000), "1 小时 30 分钟");
});

test("ended time hides the year when it is this year", () => {
  const now = new Date(2026, 8, 8, 10, 0);
  assert.equal(formatEndedAt(new Date(2026, 8, 8, 10, 36).toISOString(), now), "9月8日 10:36");
  assert.equal(formatEndedAt(new Date(2025, 11, 1, 12, 5).toISOString(), now), "2025年12月1日 12:05");
});

test("summary line lists quiet time, planted, lost, and big trees", () => {
  assert.equal(
    formatHistorySummary({ quietMs: 1200000, planted: 2, lost: 1, big: 1 }),
    "安静 20 分钟 · 种了 2 棵小树 · 少了 1 棵 · 大树 1 棵",
  );
});

test("import accepts daily files, full exports, and skips duplicates", () => {
  const session = { endedAt: "2026-09-08T02:00:00.000Z", quietMs: 8000, planted: 1, lost: 0, big: 0 };
  assert.equal(extractImportedRecords({ sessions: [session] }).length, 1);
  assert.equal(extractImportedRecords({ records: [session] }).length, 1);
  assert.equal(mergeHistory([session], [session]).length, 1);
  assert.equal(mergeHistory([session], [{ ...session, planted: 2 }]).length, 2);
});

test("session date uses the local calendar day", () => {
  const local = new Date(2026, 8, 8, 10, 36);
  assert.equal(sessionDateKey(local.toISOString()), "2026-09-08");
});

test("broken storage becomes an empty list", () => {
  assert.deepEqual(parseHistory("{not json"), []);
  assert.deepEqual(parseHistory('{"no":"array"}'), []);
  assert.equal(
    parseHistory(
      JSON.stringify([{ endedAt: "2026-09-08T00:00:00.000Z", quietMs: 8000, planted: 0, lost: 0, big: 0 }]),
    ).length,
    1,
  );
});
