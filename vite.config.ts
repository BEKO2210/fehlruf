import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

// Stempelt in dist/sw.js den Platzhalter __BUILD__ (Commit oder Zeit), damit
// jeder Deploy einen neuen Worker ergibt und die Leiste „Neue Version“ kommt.
function stampSw(): Plugin {
  let outDir = "dist";
  return {
    name: "fehlruf-stamp-sw",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const file = join(outDir, "sw.js");
      const build = process.env.GITHUB_SHA?.slice(0, 8) ?? Date.now().toString(36);
      writeFileSync(file, readFileSync(file, "utf8").replace("__BUILD__", build));
    },
  };
}

// Relative base + hash routing: läuft unter https://<user>.github.io/<repo>/
// ohne Server-Fallback.
export default defineConfig({
  base: "./",
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), react(), stampSw()],
});
