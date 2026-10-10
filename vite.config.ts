import { readFileSync } from "node:fs";
import path from "node:path";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig, loadEnv } from "vite";

const noYjs = path.resolve(import.meta.dirname, "./src/lib/no-yjs.ts");

const { version } = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "./package.json"), "utf-8")
) as { version: string };

/** New on every build, so an open hub can tell a newer one went live. */
const build = `${version}-${Date.now().toString(36)}`;

/** The logo's edge blue: the splash on Android, around the logo. */
const SPLASH = "#253f9d";

/**
 * What makes the hub installable: the manifest, named like the hub, and the
 * build's id at /version.json, which the app polls to update itself. See
 * src/lib/updates.ts.
 */
function pwa(name: string): Plugin {
  const manifest = JSON.stringify({
    background_color: SPLASH,
    description: "Everything your team works on, in one place.",
    display: "standalone",
    icons: [
      { sizes: "192x192", src: "/icons/icon-192.png", type: "image/png" },
      { sizes: "512x512", src: "/icons/icon-512.png", type: "image/png" },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/icons/maskable-512.png",
        type: "image/png",
      },
    ],
    id: "/",
    lang: "en",
    name,
    scope: "/",
    short_name: name,
    start_url: "/",
    theme_color: SPLASH,
  });
  return {
    configureServer(server) {
      server.middlewares.use("/manifest.webmanifest", (_request, response) => {
        response.setHeader("Content-Type", "application/manifest+json");
        response.end(manifest);
      });
    },
    generateBundle() {
      this.emitFile({
        fileName: "manifest.webmanifest",
        source: manifest,
        type: "asset",
      });
      this.emitFile({
        fileName: "version.json",
        source: JSON.stringify({ build }),
        type: "asset",
      });
    },
    name: "hub-pwa",
    transformIndexHtml: () => [
      {
        attrs: { content: name, name: "apple-mobile-web-app-title" },
        injectTo: "head",
        tag: "meta",
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __BUILD_ID__: JSON.stringify(build),
    },
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
      pwa(env.VITE_APP_NAME || "Hub"),
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
  };
});
