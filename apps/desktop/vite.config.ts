import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port (see src-tauri/tauri.conf.json > build.devUrl).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        "**/src-tauri/**",
        // Editors that save atomically create a sibling temp dir (e.g.
        // `.App.tsx.1234.abcd.tmpdir/App.tsx.tmp`) and chokidar can hit EBUSY
        // on it, which crashes the whole dev server. Ignore those scratch paths.
        "**/*.tmpdir/**",
        "**/.*.tmp*",
        "**/*~",
      ],
    },
  },
  build: {
    // Rust build handles minification/bundling concerns for the shell.
    target: "es2022",
  },
});
