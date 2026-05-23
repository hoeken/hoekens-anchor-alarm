import { defineConfig } from "vite";

export default defineConfig({
  root: "ui",
  base: "./",
  build: {
    outDir: "../public",
    emptyOutDir: true, // Cleans the libs folder before building
    minify: false,
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
