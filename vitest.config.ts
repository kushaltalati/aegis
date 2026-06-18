import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Pure-logic unit tests run in a Node environment (no DOM, no Prisma). The "@"
// alias mirrors tsconfig so tests import via "@/lib/..." just like app code.
export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
