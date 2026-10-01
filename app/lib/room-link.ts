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
