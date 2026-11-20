import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // A production build copies the sources, tests included, into
    // .next/standalone, and the npm package carries that copy: both are build
    // output, not tests to run twice.
    exclude: [...configDefaults.exclude, ".next/**", "npm-package/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**", "app/**", "components/**"],
      exclude: [
        "lib/types.ts",
        "**/*.config.*",
        "vitest.setup.ts",
        "app/layout.tsx",
        "app/page.tsx",
        "**/fixtures.ts",
      ],
    },
  },
  resolve: { alias: { "@": __dirname } },
});
