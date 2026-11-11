import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Only this checkout's unit tests. A git worktree checked out inside the
    // repo (the desktop app puts them under NewSite/) brings its own __tests__,
    // e2e/ and node_modules, and the default glob ran all of them.
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "**/node_modules/**"],
  },
});
