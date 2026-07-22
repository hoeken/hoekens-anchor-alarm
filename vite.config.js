import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { transformSync } from "esbuild";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const LEAFLET_DIR = fileURLToPath(new URL("./ui/public/leaflet/", import.meta.url));

// Navico/B&G MFDs embed Chromium 69, which can't parse ES2020+ syntax
// (?., ??, ??=). Every emitted script — the app bundle and the inlined
// Leaflet vendor code — must be lowered to this target. It also caps the
// minifiers, which otherwise synthesize newer operators (e.g. rewriting
// `a = a || b` to `a ||= b`, Chrome 85+) even when the source has none.
// Note this only covers syntax: runtime APIs newer than Chrome 69 still
// need the polyfills in ui/index.html.
const BROWSER_TARGET = "chrome69";

// vite-plugin-singlefile inlines the app's own (module) JS and CSS into
// index.html, but it deliberately skips classic <script src> tags — which is
// how the vendored Leaflet core and its plugins load, since the app consumes
// the global `L` and can't ESM-import them without breaking that contract. On a
// single-threaded SignalK server (a Raspberry Pi), each of those files is a
// separate request that competes with everything else at load. This plugin
// folds them into the one HTML file too: it reads each referenced Leaflet
// script/stylesheet, minifies it, and replaces the tag with an inline block —
// preserving classic (non-module) semantics and source order so `L` is still a
// global by the time the deferred app module runs. It also rewrites the app's
// sourceMappingURL to point at the map's real location under assets/, so live
// debugging still works after inlining.
function inlineVendorAndFixSourcemap() {
  // Escape any literal </script in inlined JS so it can't terminate the host
  // <script> block early.
  const escapeScript = (code) => code.replace(/<\/script/gi, "<\\/script");

  // Keep esbuild's default legalComments handling so vendored libraries'
  // @license/@preserve banners (e.g. Leaflet's BSD-2 notice) survive
  // minification — those licenses require retaining the copyright notice.
  const minifyJs = (code) =>
    transformSync(code, { minify: true, target: BROWSER_TARGET }).code;
  const minifyCss = (code) =>
    transformSync(code, { loader: "css", minify: true, target: BROWSER_TARGET })
      .code;

  return {
    name: "inline-vendor-and-fix-sourcemap",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = bundle["index.html"];
      if (!html || typeof html.source !== "string")
        return;
      let source = html.source;

      // Inline each `<script src="leaflet/NAME.js"></script>` in place, keeping
      // the original tag order (leaflet core must run before its plugins).
      source = source.replace(
        /<script\s+src="leaflet\/([^"]+)"\s*>\s*<\/script>/g,
        (_match, name) => {
          const code = readFileSync(LEAFLET_DIR + name, "utf8");
          return `<script>${escapeScript(minifyJs(code))}</script>`;
        },
      );

      // Inline `<link rel="stylesheet" href="leaflet/leaflet.css" />` as a
      // <style> block. Leaflet's CSS references its marker/control images
      // relatively (url(images/…)); those resolved against /leaflet/ before,
      // but inlined at the document root they'd point at /images/ and 404. The
      // images/ dir is still copied to public/leaflet/, so rewrite the refs to
      // leaflet/images/ (relative, so it survives the plugin's mount path).
      source = source.replace(
        /<link\s+rel="stylesheet"\s+href="leaflet\/([^"]+)"\s*\/?>/g,
        (_match, name) => {
          const css = readFileSync(LEAFLET_DIR + name, "utf8");
          const rebased = minifyCss(css).replace(
            /url\((["']?)images\//g,
            "url($1leaflet/images/",
          );
          return `<style>${rebased}</style>`;
        },
      );

      // After inlining, the app script lives at the document root but its map
      // is still emitted under assets/. Point the comment at the real path so
      // devtools can resolve it on a live install (only fetched when opened).
      source = source.replace(
        /(\/\/#\s*sourceMappingURL=)index\.js\.map/,
        "$1assets/index.js.map",
      );

      html.source = source;
    },
  };
}

export default defineConfig({
  root: "ui",
  base: "./",
  plugins: [
    viteSingleFile({ removeViteModuleLoader: true }),
    inlineVendorAndFixSourcemap(),
  ],
  build: {
    outDir: "../public",
    emptyOutDir: true, // Cleans the libs folder before building
    target: BROWSER_TARGET,
    minify: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
  server: {
    fs: {
      // Allow serving files from the project root so the dev server can load
      // modules under ../shared/ (relative to ui/).
      allow: [".."],
    },
  },
});
