export function normalizeRoomCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
}

export function isRoomCodeValid(value: string) {
  const normalized = normalizeRoomCode(value);
  return /^[A-Z0-9]{4,8}$/.test(normalized);
}
