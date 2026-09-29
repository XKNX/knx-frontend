/**
 * Message of an error thrown by the KNX WebSocket API or file upload.
 *
 * Handles strings, `Error` instances and Home Assistant API errors
 * (`{ code, message }`). Returns `undefined` when no message is available,
 * so callers can fall back to a translated generic text.
 */
export const errorMessage = (error: unknown): string | undefined => {
  if (typeof error === "string") {
    return error || undefined;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error;
    return typeof message === "string" && message ? message : undefined;
  }
  return undefined;
};
