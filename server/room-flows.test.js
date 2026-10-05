/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const { io: connect } = require("socket.io-client");
const { normalizeTheme, roomSnapshot, restoreRoom } = require("./room-store");

const clone = (value) => structuredClone(value);
function matches(doc, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === "$or") return value.some((part) => matches(doc, part));
    if (value && typeof value === "object") {
      if ("$in" in value) return value.$in.includes(doc[key]);
      if ("$exists" in value) return (doc[key] !== undefined) === value.$exists;
    }
    return Array.isArray(doc[key]) ? doc[key].includes(value) : doc[key] === value;
  });
}
function memoryDatabase() {
  const data = new Map();
  return { data, collection(name) {
    if (!data.has(name)) data.set(name, []);
    const docs = data.get(name);
    return {
      createIndex: async () => {},
      findOne: async (query) => clone(docs.find((doc) => matches(doc, query)) || null),
      find: (query) => {
        let results = docs.filter((doc) => matches(doc, query));
        const cursor = { sort(order) { const [key, direction] = Object.entries(order)[0]; results.sort((a, b) => (a[key] - b[key]) * direction); return cursor; }, limit(count) { results = results.slice(0, count); return cursor; }, toArray: async () => clone(results) };
        return cursor;
      },
      insertOne: async (doc) => {
        if (doc._id && docs.some((item) => item._id === doc._id)) throw new Error("duplicate id");
        docs.push(clone(doc));
      },
      replaceOne: async (query, doc) => { const i = docs.findIndex((item) => matches(item, query)); if (i >= 0) docs[i] = clone(doc); },
      updateOne: async (query, update, options) => {
        let doc = docs.find((item) => matches(item, query));
        let inserted = false;
        if (!doc && options?.upsert) { doc = { ...query, ...update.$setOnInsert }; docs.push(doc); inserted = true; }
        if (!doc) return { upsertedCount: 0 };
        Object.assign(doc, clone(update.$set || {}));
        if (update.$push) for (const [key, value] of Object.entries(update.$push)) doc[key] = [...clone(value.$each), ...(doc[key] || [])].slice(0, value.$slice);
        if (update.$pull) for (const [key, value] of Object.entries(update.$pull)) doc[key] = (doc[key] || []).filter((item) => !matches(item, value));
        return { upsertedCount: inserted ? 1 : 0 };
      },
      deleteOne: async (query) => { const index = docs.findIndex((doc) => matches(doc, query)); if (index >= 0) docs.splice(index, 1); },
    };
  } };
}
async function startServer(database) {
  const localRequire = createRequire(path.join(__dirname, "index.js"));
  const context = vm.createContext({
    require(name) {
      if (name === "dotenv") return { config() {} };
      if (name === "mongodb") return { MongoClient: class { async connect() { return this; } db() { return database; } } };
      return localRequire(name);
    },
    process: { env: { PORT: "0", MONGODB_URI: "memory", FRONTEND_ORIGIN: "http://localhost:3000" } },
    __dirname, console, Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval, fetch,
    module: { exports: {} },
  });
  const source = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
  vm.runInContext(source.slice(0, source.indexOf("server.listen(PORT")) + "\nmodule.exports = { server, io, rooms };", context);
  const app = context.module.exports;
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  app.url = `http://127.0.0.1:${app.server.address().port}`;
  app.close = () => new Promise((resolve) => app.io.close(resolve));
  return app;
}
function next(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 4000);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}
async function client(app, user = "host") {
  const socket = connect(app.url, { autoConnect: false, reconnection: false, transports: ["websocket"], extraHeaders: { Cookie: `syncplay-session=${user}` } });
  const ready = next(socket, "connect"); socket.connect(); await ready; return socket;
}

test("room snapshots keep identity/theme and restore paused without stale sockets", () => {
  const snapshot = roomSnapshot({ roomId: "ABCDEF", ownerUserId: "host", approvedUserIds: ["friend"], title: "Film club", theme: { accent: "#112233", background: "url(bad)" }, playback: { position: 5, playing: true, updatedAt: Date.now() - 2000 }, queue: [], history: [], createdAt: 1 });
  assert.equal(snapshot.playback.playing, false);
  assert.ok(snapshot.playback.position >= 7);
  assert.equal(snapshot.theme.accent, "#112233");
  assert.equal(snapshot.theme.background, "#0f172a");
  assert.deepEqual(restoreRoom(snapshot).users, []);
  assert.equal(restoreRoom(snapshot).hostId, null);
  assert.equal(normalizeTheme(null).buttonColor, "#5eead4");
});

test("authenticated creation, invitations, approvals, restart/rejoin, themes and failures", async (t) => {
  const database = memoryDatabase();
  for (const id of ["host", "friend", "stranger"]) {
    await database.collection("users").insertOne({ id, name: id, friends: id === "host" ? ["friend"] : [] });
    await database.collection("sessions").insertOne({ userId: id, tokenHash: crypto.createHash("sha256").update(id).digest("hex"), expiresAt: Date.now() + 60000 });
  }
  let app = await startServer(database);
  const sockets = [];
  t.after(async () => { sockets.forEach((socket) => socket.disconnect()); await app.close(); });
  const anonymous = connect(app.url, { autoConnect: false, reconnection: false }); sockets.push(anonymous);
  const rejected = next(anonymous, "connect_error"); anonymous.connect(); assert.match((await rejected).message, /sign in/);
  const host = await client(app); sockets.push(host);
  const theme = { name: "Club", accent: "#123456", background: "#ffffff", buttonColor: "#000000" };
  const payload = { roomId: "ABCDEF", name: "Host", title: "Film club", theme, inviteeIds: ["friend", "stranger"] };
  let stateEvent = next(host, "room-state"); let inviteEvent = next(host, "room-invitations");
  host.emit("create-room", payload);
  const state = await stateEvent; assert.deepEqual(state.theme, theme); assert.equal(state.ownerUserId, undefined);
  assert.match((await inviteEvent).message, /1 invitation/);
  assert.equal(database.data.get("directMessages").length, 1);
  inviteEvent = next(host, "room-invitations"); host.emit("create-room", payload); await inviteEvent;
  assert.equal(database.data.get("directMessages").length, 1, "reconnect must not duplicate invitations");
  const stranger = await client(app, "stranger"); sockets.push(stranger);
  const forbidden = next(stranger, "room-error"); stranger.emit("create-room", { ...payload, userId: "host" });
  assert.match(await forbidden, /another host/);
  const friend = await client(app, "friend"); sockets.push(friend);
  const request = next(host, "room-join-request"); friend.emit("join-room", { roomId: "ABCDEF", name: "Friend" });
  const pending = await request; stateEvent = next(friend, "room-state"); host.emit("approve-room-join", { requestId: pending.requestId }); await stateEvent;
  stateEvent = next(host, "room-state"); host.emit("change-track", { videoId: "abcdefghijk", title: "Test video", mediaType: "youtube" }); await stateEvent;
  const editRoom = (user, body) => fetch(`${app.url}/api/rooms/ABCDEF/settings`, { method: "POST", headers: { Cookie: `syncplay-session=${user}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await editRoom("stranger", { title: "Hijacked", theme })).status, 403);
  assert.equal((await editRoom("friend", { title: "Hijacked", theme })).status, 403);
  assert.equal((await editRoom("unknown", { title: "Hijacked", theme })).status, 401);
  assert.equal((await editRoom("host", { title: "", theme })).status, 400);
  const changedTheme = { ...theme, background: "#445566" };
  stateEvent = next(friend, "room-state");
  assert.equal((await editRoom("host", { title: "Updated club", theme: changedTheme })).status, 200);
  const edited = await stateEvent;
  assert.equal(edited.title, "Updated club"); assert.deepEqual(edited.theme, changedTheme);
  const ownerDashboard = await (await fetch(`${app.url}/api/dashboard`, { headers: { Cookie: "syncplay-session=host" } })).json();
  assert.equal(ownerDashboard.rooms[0].canEdit, true);
  assert.equal(ownerDashboard.resumeRooms[0].title, "Test video");
  assert.equal(ownerDashboard.resumeRooms[0].name, "Updated club");
  const friendDashboard = await (await fetch(`${app.url}/api/dashboard`, { headers: { Cookie: "syncplay-session=friend" } })).json();
  assert.equal(friendDashboard.rooms[0].canEdit, false);
  const strangerDashboard = await (await fetch(`${app.url}/api/dashboard`, { headers: { Cookie: "syncplay-session=stranger" } })).json();
  assert.equal(strangerDashboard.resumeRooms.length, 0);
  // Account theme API: persisted saves/deletes and migration does not resurrect deleted themes.
  const themeRequest = async (body) => {
    const response = await fetch(`${app.url}/api/room-themes`, { method: body ? "POST" : "GET", headers: { Cookie: "syncplay-session=host", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(response.status, 200); return response.json();
  };
  assert.equal((await themeRequest({ action: "save", theme: { id: "one", ...theme } })).themes.length, 1);
  assert.equal((await themeRequest({ action: "remove", id: "one" })).themes.length, 0);
  assert.equal((await themeRequest({ action: "migrate", themes: [{ id: "old", ...theme }] })).themes.length, 0);
  sockets.forEach((socket) => socket.disconnect());
  await app.close();
  // Await the pending durable snapshot before simulating a process restart.
  await new Promise((resolve) => setImmediate(resolve));
  app = await startServer(database);
  assert.equal((await (await fetch(`${app.url}/api/rooms/ABCDEF/exists`)).json()).valid, true);
  const returning = await client(app, "friend"); sockets.push(returning);
  stateEvent = next(returning, "room-state"); returning.emit("join-room", { roomId: "ABCDEF" });
  const restored = await stateEvent;
  assert.equal(restored.title, "Updated club"); assert.deepEqual(restored.theme, changedTheme);
  assert.equal(restored.playback.videoId, "abcdefghijk"); assert.equal(restored.users.length, 1);
  const owner = await client(app); sockets.push(owner);
  stateEvent = next(owner, "room-state"); owner.emit("join-room", { roomId: "ABCDEF" });
  assert.equal((await stateEvent).hostId, owner.id, "owner resumes host controls using ordinary invite link");
});
