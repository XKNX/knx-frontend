import { defineConfig } from "vitest/config";
import shared from "../../vitest.config";

export default defineConfig({
  ...shared,
  test: { ...shared.test, include: ["gallery/test/*.integration.ts"] },
});
