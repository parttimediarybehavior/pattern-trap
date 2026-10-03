/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  build: { target: "es2020", sourcemap: false },
  test: { environment: "node" },
});
