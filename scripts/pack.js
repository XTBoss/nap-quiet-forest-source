import { cpSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const folder = join(root, "安静小森林");
const zipPath = join(root, "安静小森林.zip");

if (!existsSync(join(dist, "index.html"))) {
  console.error("未找到 dist/index.html，请先运行 npm run build");
  process.exit(1);
}

rmSync(folder, { recursive: true, force: true });
rmSync(zipPath, { force: true });
cpSync(dist, folder, { recursive: true });
execSync(`python3 "${join(root, "scripts/pack-zip.py")}"`, { cwd: root, stdio: "inherit" });
rmSync(folder, { recursive: true, force: true });
console.log(`已生成：${zipPath}`);
