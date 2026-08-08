import { defineConfig } from "vitest/config";
import path from "node:path";

/** Mirror the "@/*" -> "src/*" alias from tsconfig.json. */
const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    // Two projects because the suites need different environments: pure logic
    // runs far faster in node, components need a DOM.
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "component",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
