const DEFAULT_THEME = { name: "Custom theme", accent: "#5eead4", background: "#0f172a", buttonColor: "#5eead4" };
function normalizeTheme(value = {}) {
  const theme = { name: typeof value?.name === "string" ? value.name.trim().slice(0, 80) || DEFAULT_THEME.name : DEFAULT_THEME.name };
  for (const key of ["accent", "background", "buttonColor"]) {
    theme[key] = /^#[0-9a-f]{6}$/i.test(value?.[key]) ? value[key] : DEFAULT_THEME[key];
  }
  return theme;
}
function roomSnapshot(room) {
  const playback = { ...room.playback, playing: false, updatedAt: Date.now() };
  if (room.playback.playing) playback.position += Math.max(0, (Date.now() - room.playback.updatedAt) / 1000);
  return {
    _id: room.roomId, roomId: room.roomId, ownerUserId: room.ownerUserId,
    approvedUserIds: room.approvedUserIds || [], title: room.title, theme: normalizeTheme(room.theme),
    playback, queue: room.queue.slice(0, 100), history: room.history.slice(-100), createdAt: room.createdAt,
  };
}
function restoreRoom(document) {
  const room = { ...document };
  delete room._id;
  return { ...room, hostId: null, users: [], pendingJoins: [], messages: [] };
}
function createRoomStore(getDatabase, rooms) {
  const writes = new Map();
  const reads = new Map();
  async function save(room, insert = false) {
    const snapshot = roomSnapshot(room);
    const previous = writes.get(room.roomId) || Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      const collection = (await getDatabase()).collection("rooms");
      if (insert) await collection.insertOne(snapshot);
      else await collection.replaceOne({ _id: room.roomId, ownerUserId: room.ownerUserId }, snapshot);
    });
    writes.set(room.roomId, operation);
    try { await operation; } finally { if (writes.get(room.roomId) === operation) writes.delete(room.roomId); }
  }
  async function load(id) {
    if (rooms.has(id)) return rooms.get(id);
    if (reads.has(id)) return reads.get(id);
    const operation = (async () => {
      await writes.get(id)?.catch(() => undefined);
      const document = await (await getDatabase()).collection("rooms").findOne({ _id: id });
      if (!document) return null;
      if (!rooms.has(id)) rooms.set(id, restoreRoom(document));
      return rooms.get(id);
    })();
    reads.set(id, operation);
    try { return await operation; } finally { reads.delete(id); }
  }
  return { save, load };
}
module.exports = { normalizeTheme, roomSnapshot, restoreRoom, createRoomStore };
