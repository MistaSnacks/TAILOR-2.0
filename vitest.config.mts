import { defineConfig } from "vitest/config";

// One config for both backend (convex-test) and component (RTL) tests.
// jsdom works for convex-test; switch to "edge-runtime" later for higher fidelity.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
