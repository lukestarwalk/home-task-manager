import { defineConfig } from "vitest/config";

// Dedicated config so the unit tests don't load the Cloudflare/Vite app
// plugins — the rotation logic is pure and needs no runtime bindings.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
