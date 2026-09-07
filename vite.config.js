import { defineConfig } from "vite";
import { copyLaunchers } from "./scripts/copy-launchers.js";

export default defineConfig({
  base: "./",
  plugins: [
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
