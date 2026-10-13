import { afterEach, expect, it } from "vitest";
import { galleryUrl } from "./paths";

afterEach(() => history.replaceState(null, "", "/"));

it("keeps preview navigation and assets below the current gallery directory", () => {
  history.replaceState(null, "", "/demo/pr/42/preview.html?session=test");
  const preview = new URL(galleryUrl("preview.html#/knx/project"));
  expect(preview.pathname).toBe("/demo/pr/42/preview.html");
  expect(preview.hash).toBe("#/knx/project");
  expect(new URL(galleryUrl("thumbnails/example-light.png")).pathname).toBe(
    "/demo/pr/42/thumbnails/example-light.png",
  );
});
