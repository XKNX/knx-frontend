// Use HA's public CDN placeholder fallback without bundling brand images in the Gallery.
module.exports = function galleryBrandsUrl(source) {
  const original = "`https://brands.home-assistant.io/${options.domain}/";
  if (!source.includes(original)) {
    throw new Error("HA brands URLs changed; review the gallery-only brands adapter");
  }
  return source.replace(original, "`https://brands.home-assistant.io/_/${options.domain}/");
};
