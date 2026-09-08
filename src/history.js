export const HISTORY_KEY = "quiet-forest-history";
export const LEGACY_HISTORY_KEY = "nap-quiet-forest-history";
export const MAX_HISTORY = 365;
export const MIN_QUIET_MS_TO_SAVE = 5000;

export function shouldSaveSession({ quietMs = 0, planted = 0, lost = 0 } = {}) {
  return planted > 0 || lost > 0 || quietMs >= MIN_QUIET_MS_TO_SAVE;
}

export function isHistoryRecord(item) {
  return Boolean(
    item &&
      typeof item.endedAt === "string" &&
      Number.isFinite(Number(item.quietMs)) &&
      Number.isFinite(Number(item.planted)) &&
      Number.isFinite(Number(item.lost)) &&
      Number.isFinite(Number(item.big)),
  );
}

export function normalizeRecord(item) {
  return {
    endedAt: String(item.endedAt),
    quietMs: Math.round(Number(item.quietMs)),
    planted: Math.round(Number(item.planted)),
    lost: Math.round(Number(item.lost)),
    big: Math.round(Number(item.big)),
    demo: Boolean(item.demo),
  };
}

export function parseHistory(raw) {
  try {
    const data = JSON.parse(raw || "[]");
    return extractImportedRecords(data);
  } catch {
    return [];
  }
}

export function extractImportedRecords(payload) {
  if (payload == null) return [];
  if (isHistoryRecord(payload)) return [normalizeRecord(payload)];
  if (Array.isArray(payload)) return payload.filter(isHistoryRecord).map(normalizeRecord);
  if (typeof payload !== "object") return [];
  if (Array.isArray(payload.records)) return payload.records.filter(isHistoryRecord).map(normalizeRecord);
  if (Array.isArray(payload.sessions)) return payload.sessions.filter(isHistoryRecord).map(normalizeRecord);
  return [];
}

export function recordKey(item) {
  const record = normalizeRecord(item);
  return [record.endedAt, record.quietMs, record.planted, record.lost, record.big, record.demo ? "1" : "0"].join("|");
}

export function sessionDateKey(endedAt) {
  const date = new Date(endedAt);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mergeHistory(existing, incoming = []) {
  const map = new Map();
  for (const record of [...extractImportedRecords(existing), ...extractImportedRecords(incoming)]) {
    const key = recordKey(record);
    if (!map.has(key)) map.set(key, record);
  }
  return [...map.values()]
    .sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt)))
    .slice(0, MAX_HISTORY);
}

export function appendHistory(records, entry) {
  return mergeHistory([entry], records);
}

export function groupHistoryByDate(records) {
  const grouped = new Map();
  for (const record of extractImportedRecords(records)) {
    const key = sessionDateKey(record.endedAt);
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(record);
    grouped.set(key, list);
  }
  return grouped;
}

export function formatQuietDuration(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin >= 60) {
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }
  if (totalMin >= 1) return `${totalMin} 分钟`;
  return `${totalSec} 秒`;
}

export function formatEndedAt(iso, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const sameYear = date.getFullYear() === now.getFullYear();
  const year = sameYear ? "" : `${date.getFullYear()}年`;
  return `${year}${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
}

export function formatHistorySummary({ quietMs, planted, lost, big }) {
  return `安静 ${formatQuietDuration(quietMs)} · 种了 ${planted} 棵小树 · 少了 ${lost} 棵 · 大树 ${big} 棵`;
}
