export const pendingEmailKey = "clearcheck-confirm-email";

export function emailConfirmationUrl(origin: string) {
  return new URL("/check-email?confirm=1", origin).href;
}
