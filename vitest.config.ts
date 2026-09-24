import { defineConfig } from "vitest/config";

// Date-only parsing depends on the local time zone. Pin one with DST so tests are
// deterministic on any machine; set before workers start so they inherit it.
process.env.TZ = "America/Los_Angeles";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/live-omnifocus.test.ts"],
    testTimeout: 10000,
  },
});
