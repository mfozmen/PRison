import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    coverage: { provider: "v8", reporter: ["text", "lcov"], include: ["lib/**", "app/**"] },
  },
  resolve: { alias: { "@": __dirname } },
});
