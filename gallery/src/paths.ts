/** Resolve against the gallery document, including /gallery/ and /pr/<id>/gallery/. */
export const galleryUrl = (relativePath: string): string =>
  new URL(relativePath, document.baseURI).href;
