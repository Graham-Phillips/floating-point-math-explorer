import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        comparisons: resolve(__dirname, "comparisons.html"),
        fpErrors: resolve(__dirname, "fp-errors.html"),
        attempts: resolve(__dirname, "attempts.html"),
        thirdPartyLibraries: resolve(__dirname, "third-party-libraries.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
