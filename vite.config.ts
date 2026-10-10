import { readFileSync } from "node:fs";
import path from "node:path";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const noYjs = path.resolve(import.meta.dirname, "./src/lib/no-yjs.ts");

const { version } = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "./package.json"), "utf-8")
) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@convex": path.resolve(import.meta.dirname, "./convex"),
      // The drag handle's Yjs support, which the app doesn't use. See the file.
      "@tiptap/extension-collaboration": noYjs,
      "@tiptap/y-tiptap": noYjs,
    },
  },
});
