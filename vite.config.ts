import { defineConfig } from "vitest/config";

export default defineConfig({
  build: { target: "es2020", sourcemap: false, modulePreload: { polyfill: false } },
  test: { environment: "node" },
});
