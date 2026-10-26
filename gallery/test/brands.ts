import type { Route } from "@playwright/test";

// Exercise CDN URLs without network access; missing brands use a valid placeholder image.
export async function mockGalleryBrand(route: Route): Promise<boolean> {
  const request = route.request();
  if (
    request.resourceType() !== "image" ||
    !/^https:\/\/brands\.home-assistant\.io\/_\/knx\/(?:dark_)?icon\.png$/.test(request.url())
  ) {
    return false;
  }
  await route.fulfill({
    contentType: "image/svg+xml",
    headers: { "access-control-allow-origin": "*" },
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#888"/><text x="32" y="37" text-anchor="middle" font-family="sans-serif" font-size="16" fill="white">KNX</text></svg>',
  });
  return true;
}
