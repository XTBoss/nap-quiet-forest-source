import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateClassroom } from "../src/classroom.js";

export function createClassroomStore(rootDir) {
  const dir = join(rootDir, "data");
  const file = join(dir, "classroom.json");
  function load() {
    return existsSync(file) ? validateClassroom(JSON.parse(readFileSync(file, "utf8"))) : null;
  }
  return {
    load,
    save(data, baseRevision) {
      validateClassroom(data);
      const current = load();
      if ((current?.revision ?? 0) !== baseRevision) {
        const error = new Error("班级数据已在其他窗口更新，请重新载入");
        error.status = 409;
        throw error;
      }
      const next = validateClassroom({ ...data, revision: baseRevision + 1 });
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${file}.tmp`, `${JSON.stringify(next)}\n`, "utf8");
      renameSync(`${file}.tmp`, file);
      return next;
    },
  };
}

export function attachClassroomApi(middlewares, rootDir) {
  const store = createClassroomStore(rootDir);
  middlewares.use(async (req, res, next) => {
    if ((req.url || "").split("?")[0] !== "/api/classroom") return next();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.method === "GET") return res.end(JSON.stringify({ data: store.load() }));
      if (req.method !== "PUT") {
        res.statusCode = 405;
        return res.end(JSON.stringify({ error: "method not allowed" }));
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 12_000_000) throw new Error("备份文件过大");
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const data = store.save(payload.data, payload.baseRevision);
      res.end(JSON.stringify({ data }));
    } catch (error) {
      res.statusCode = error.status || (req.method === "GET" ? 500 : 400);
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}
