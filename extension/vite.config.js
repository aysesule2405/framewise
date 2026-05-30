import { defineConfig } from "vite";

export default defineConfig({
    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
            input: "src/content.js",
            output: {
                entryFileNames: "content.js",
                format: "iife"
            }
        },
        commonjsOptions: {
            transformMixedEsModules: true
        }
    }
});