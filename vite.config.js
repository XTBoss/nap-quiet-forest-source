import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { copyLaunchers } from "./scripts/copy-launchers.js";
import { attachHistoryApi } from "./scripts/history-store.js";
import { attachClassroomApi } from "./scripts/classroom-store.js";

const root = dirname(fileURLToPath(import.meta.url));

function historyApi() {
  return {
    name: "history-api",
    configureServer(server) {
      attachHistoryApi(server.middlewares, root);
      attachClassroomApi(server.middlewares, root);
    },
    configurePreviewServer(server) {
      attachHistoryApi(server.middlewares, root);
      attachClassroomApi(server.middlewares, root);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [
    historyApi(),
    {
      name: "copy-launchers",
      closeBundle() {
        copyLaunchers("dist");
      },
    },
  ],
  server: {
    host: true,
    port: 43147,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 43147,
    strictPort: true,
  },
});
