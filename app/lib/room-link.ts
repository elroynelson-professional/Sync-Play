// Earlier room links encoded text before passing it to URLSearchParams.
// Version 2 links use URLSearchParams alone, preserving literal percent signs.
export function readRoomLinkText(value: string | null, version: string | null): string | null {
  if (value === null || version === "2") return value;

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Only known app destinations may be resumed after authentication.
export function safeReturnDestination(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return "/dashboard";
  const url = new URL(value, "https://sykonyx.invalid");
  if (/^\/room\/[A-Z0-9]{4,8}$/i.test(url.pathname)) return url.pathname + url.search;
  if (url.pathname === "/dashboard/room") return "/dashboard/room?mode=create";
  return "/dashboard";
}
