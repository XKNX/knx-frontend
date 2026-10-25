import gulp from "gulp";
import { expect, it, vi } from "vitest";
import "./rspack.js";

const rspackMock = vi.hoisted(() => vi.fn());

vi.mock("@rspack/core", () => ({ default: rspackMock }));
vi.mock("../rspack.cjs", () => ({ createKNXConfig: () => ({}) }));

it("rejects the production task when rspack reports a fatal error", async () => {
  rspackMock.mockImplementation((_config: unknown, callback: (error: Error) => void) => {
    callback(new Error("compiler crashed"));
  });

  await expect(gulp.task("rspack-prod-knx")!()).rejects.toThrow("compiler crashed");
});

it("rejects the production task when compilation has errors", async () => {
  rspackMock.mockImplementation(
    (_config: unknown, callback: (error: null, stats: unknown) => void) => {
      callback(null, {
        hasErrors: () => true,
        hasWarnings: () => false,
        toString: (format: string) =>
          format === "errors-only" ? "broken import" : "wrong diagnostics",
      });
    },
  );

  await expect(gulp.task("rspack-prod-knx")!()).rejects.toThrow("broken import");
});
