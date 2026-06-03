import { defineConfig } from "vitest/config";

// One config for both backend (convex-test) and component (RTL) tests.
// jsdom works for convex-test; switch to "edge-runtime" later for higher fidelity.
export default defineConfig({
  // Use React's automatic JSX runtime so component tests don't need `import React`.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
