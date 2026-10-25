import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base + hash routing: läuft unter https://<user>.github.io/<repo>/
// ohne Server-Fallback.
export default defineConfig({
  base: "./",
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), react()],
});
