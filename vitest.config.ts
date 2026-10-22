import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests (pure logic) and database tests (schema.sql inside an in-memory Postgres).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 60_000 },
});
