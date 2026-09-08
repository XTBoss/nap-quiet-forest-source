import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractImportedRecords,
  groupHistoryByDate,
  isHistoryRecord,
  mergeHistory,
  normalizeRecord,
} from "../src/history.js";

const DATE_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

export function createHistoryStore(rootDir) {
  const dir = join(rootDir, "data");

  function ensureDir() {
    mkdirSync(dir, { recursive: true });
  }

  function loadAll() {
    ensureDir();
    const records = [];
    for (const name of readdirSync(dir)) {
      if (!DATE_FILE.test(name)) continue;
      try {
        const payload = JSON.parse(readFileSync(join(dir, name), "utf8"));
        records.push(...extractImportedRecords(payload));
      } catch {
        /* skip unreadable files */
      }
    }
    return mergeHistory(records, []);
  }

  function writeAll(records) {
    ensureDir();
    for (const name of readdirSync(dir)) {
      if (DATE_FILE.test(name)) rmSync(join(dir, name));
    }
    for (const [date, sessions] of groupHistoryByDate(records)) {
      writeFileSync(
        join(dir, `${date}.json`),
        `${JSON.stringify({ date, sessions }, null, 2)}\n`,
        "utf8",
      );
    }
    return loadAll();
  }

  return {
    loadAll,
    append(entry) {
      if (!isHistoryRecord(entry)) return loadAll();
      return writeAll(mergeHistory([normalizeRecord(entry)], loadAll()));
    },
    replace(payload) {
      return writeAll(extractImportedRecords(payload));
    },
    mergeIncoming(payload) {
      return writeAll(mergeHistory(loadAll(), payload));
    },
    clear() {
      return writeAll([]);
    },
  };
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function attachHistoryApi(middlewares, rootDir) {
  const store = createHistoryStore(rootDir);
  middlewares.use(async (req, res, next) => {
    const url = (req.url || "").split("?")[0];
    if (url !== "/api/history") {
      next();
      return;
    }

    try {
      if (req.method === "GET") {
        sendJson(res, 200, { records: store.loadAll() });
        return;
      }
      if (req.method === "POST") {
        const entry = JSON.parse((await readBody(req)) || "{}");
        sendJson(res, 200, { records: store.append(entry) });
        return;
      }
      if (req.method === "PUT") {
        const payload = JSON.parse((await readBody(req)) || "{}");
        sendJson(res, 200, { records: store.replace(payload) });
        return;
      }
      if (req.method === "DELETE") {
        sendJson(res, 200, { records: store.clear() });
        return;
      }
      sendJson(res, 405, { error: "method not allowed" });
    } catch {
      sendJson(res, 400, { error: "bad request" });
    }
  });
}
