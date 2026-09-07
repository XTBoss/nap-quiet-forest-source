import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function writeUtf8Bom(dest, text) {
  writeFileSync(dest, `\uFEFF${text.replace(/^\uFEFF/, "")}`, "utf8");
}

export function copyLaunchers(distRelative = "dist") {
  const distDir = join(root, distRelative);
  const srcDir = join(root, "launchers");
  mkdirSync(distDir, { recursive: true });

  const commandPath = join(distDir, "启动.command");
  copyFileSync(join(srcDir, "start.command"), commandPath);
  chmodSync(commandPath, 0o755);

  copyFileSync(join(srcDir, "start.bat"), join(distDir, "启动.bat"));
  writeUtf8Bom(join(distDir, "launch.ps1"), readFileSync(join(srcDir, "launch.ps1"), "utf8"));
  writeUtf8Bom(
    join(distDir, "使用说明.txt"),
    readFileSync(join(srcDir, "使用说明.txt"), "utf8"),
  );
}
