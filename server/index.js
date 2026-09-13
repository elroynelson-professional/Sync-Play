/* eslint-disable @typescript-eslint/no-require-imports */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();
const { Server } = require("socket.io");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const uploadDirectory = path.join(__dirname, "uploads");
const dataDirectory = path.join(__dirname, "data");
const rooms = new Map();
const database = new sqlite3.Database(path.join(dataDirectory, "syncplay.sqlite"));
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const SESSION_COOKIE = "syncplay-session";

fs.mkdirSync(uploadDirectory, { recursive: true });
fs.mkdirSync(dataDirectory, { recursive: true });

database.serialize(() => {
  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
});

function databaseRun(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, parameters, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve(this);
    });
  });
}

function databaseGet(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, parameters, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function parseCookies(request) {
  const cookieHeader = request.headers.cookie || "";

  return cookieHeader.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator < 0) return cookies;

    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(response, token, maxAge) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

function clearSessionCookie(response) {
  setSessionCookie(response, "", 0);
}

async function getAuthenticatedUser(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;

  const session = await databaseGet(
    `SELECT users.id, users.name, users.email, users.created_at AS createdAt, sessions.expires_at AS expiresAt
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ?`,
    [hashSessionToken(token)]
  );

  if (!session || session.expiresAt < Date.now()) {
    if (session) await databaseRun("DELETE FROM sessions WHERE token_hash = ?", [hashSessionToken(token)]);
    return null;
  }

  return {
    id: session.id,
    name: session.name,
    email: session.email,
    createdAt: session.createdAt,
  };
}

async function createSession(userId, response) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  await databaseRun("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [hashSessionToken(token), userId, expiresAt]);
  setSessionCookie(response, token, 60 * 60 * 24 * 30);
}

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createPlaybackState() {
  return {
    trackId: null,
    videoId: null,
    title: null,
    url: null,
    mediaType: null,
    position: 0,
    playing: false,
    updatedAt: Date.now(),
  };
}

function createQueueTrack({ videoId, title, url, mediaType, addedBy }) {
  return {
    trackId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    videoId,
    title: title || `YouTube video ${videoId}`,
    url: url || null,
    mediaType: mediaType === "audio" ? "audio" : mediaType === "direct" ? "direct" : "youtube",
    addedBy: addedBy || "Participant",
  };
}

function playbackFromTrack(track, playing = false) {
  return {
    trackId: track.trackId,
    videoId: track.videoId,
    title: track.title,
    url: track.url,
    mediaType: track.mediaType,
    position: 0,
    playing,
    updatedAt: Date.now(),
  };
}

function trackFromPlayback(playback) {
  return {
    trackId: playback.trackId,
    videoId: playback.videoId,
    title: playback.title || playback.videoId,
    url: playback.url,
    mediaType: playback.mediaType || "youtube",
    addedBy: "Participant",
  };
}

function advanceQueue(room) {
  if (room.playback.videoId && room.playback.trackId) {
    room.history.push(trackFromPlayback(room.playback));
  }

  const nextTrack = room.queue.shift();

  if (!nextTrack) {
    room.playback = createPlaybackState();
    return;
  }

  room.playback = playbackFromTrack(nextTrack, true);
}

function rewindQueue(room) {
  const previousTrack = room.history.pop();

  if (!previousTrack) return false;

  if (room.playback.videoId && room.playback.trackId) {
    room.queue.unshift(trackFromPlayback(room.playback));
  }

  room.playback = playbackFromTrack(previousTrack, true);
  return true;
}

function hasActivePlayback(room) {
  return Boolean(room.playback.videoId);
}

function createRoom(roomId, hostId, name) {
  return {
    roomId,
    hostId,
    users: [{ id: hostId, name }],
    playback: createPlaybackState(),
    queue: [],
    history: [],
    messages: [],
    createdAt: Date.now(),
  };
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function upsertUser(room, socketId, name) {
  const index = room.users.findIndex((user) => user.id === socketId);

  if (index >= 0) {
    room.users[index] = { id: socketId, name };
    return;
  }

  room.users.push({ id: socketId, name });
}

function broadcastRoom(io, roomId) {
  const room = getRoom(roomId);
  if (room) {
    io.to(roomId).emit("room-state", room);
  }
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", frontendOrigin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-File-Name, X-Room-Id, Range");
  response.setHeader("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Content-Type");
}

function writeJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}


function getUploadContentType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  const contentTypes = {
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".m4v": "video/mp4",
    ".m4a": "audio/mp4",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpeg",
    ".oga": "audio/ogg",
    ".ogg": "audio/ogg",
    ".ogv": "video/ogg",
    ".opus": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "video/webm",
  };

  return contentTypes[extension] || "application/octet-stream";
}

function serveUpload(request, response, fileName) {
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(fileName)) {
    writeJson(response, 400, { error: "Invalid upload path." });
    return;
  }

  const filePath = path.join(uploadDirectory, fileName);

  fs.stat(filePath, (error, fileStats) => {
    if (error || !fileStats.isFile()) {
      writeJson(response, 404, { error: "Video not found." });
      return;
    }

    const range = request.headers.range;
    let start = 0;
    let end = fileStats.size - 1;
    let statusCode = 200;

    if (typeof range === "string") {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);

      if (!match) {
        response.writeHead(416, { "Content-Range": `bytes */${fileStats.size}` });
        response.end();
        return;
      }

      if (match[1]) start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
      if (!match[1] && match[2]) {
        const suffixLength = Number(match[2]);
        start = Math.max(fileStats.size - suffixLength, 0);
      }

      end = Math.min(end, fileStats.size - 1);

      if (start > end || start >= fileStats.size) {
        response.writeHead(416, { "Content-Range": `bytes */${fileStats.size}` });
        response.end();
        return;
      }

      statusCode = 206;
    }

    const headers = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
      "Content-Length": end - start + 1,
      "Content-Type": getUploadContentType(fileName),
    };

    if (statusCode === 206) {
      headers["Content-Range"] = `bytes ${start}-${end}/${fileStats.size}`;
    }

    setCorsHeaders(response);
    response.writeHead(statusCode, headers);

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    fs.createReadStream(filePath, { start, end }).pipe(response);
  });
}

function handleUpload(request, response) {
  const contentType = typeof request.headers["content-type"] === "string"
    ? request.headers["content-type"].split(";", 1)[0]
    : "";
  const contentLength = Number(request.headers["content-length"] || 0);

  if (!contentType.startsWith("video/") && !contentType.startsWith("audio/")) {
    writeJson(response, 415, { error: "Only audio and video uploads are supported." });
    request.resume();
    return;
  }

  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    writeJson(response, 413, { error: "Video uploads must be 500 MB or smaller." });
    request.resume();
    return;
  }

  const requestedName = typeof request.headers["x-file-name"] === "string"
    ? decodeURIComponent(request.headers["x-file-name"])
    : "video.mp4";
  const extension = path.extname(requestedName).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10) || ".mp4";
  const fileName = `${crypto.randomUUID()}${extension}`;
  const filePath = path.join(uploadDirectory, fileName);
  const output = fs.createWriteStream(filePath);
  let receivedBytes = 0;
  let rejected = false;

  request.on("data", (chunk) => {
    receivedBytes += chunk.length;

    if (receivedBytes > MAX_UPLOAD_BYTES && !rejected) {
      rejected = true;
      output.destroy();
      request.destroy();
      fs.rm(filePath, { force: true }, () => undefined);
    }
  });

  request.on("error", () => {
    if (!rejected) {
      rejected = true;
      output.destroy();
      fs.rm(filePath, { force: true }, () => undefined);
    }
  });

  output.on("error", () => {
    if (!rejected) {
      rejected = true;
      fs.rm(filePath, { force: true }, () => undefined);
      writeJson(response, 500, { error: "Could not save the video upload." });
    }
  });

  output.on("finish", () => {
    if (rejected) return;

    const host = request.headers.host || `localhost:${PORT}`;
    const protocol = request.headers["x-forwarded-proto"] || "http";

    writeJson(response, 201, {
      contentType,
      name: requestedName,
      url: `${protocol}://${host}/uploads/${fileName}`,
    });
  });

  request.pipe(output);
}

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST" && ["/api/auth/signup", "/api/auth/login"].includes(requestUrl.pathname)) {
    try {
      const payload = await readJsonBody(request);
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      const password = typeof payload.password === "string" ? payload.password : "";
      const name = typeof payload.name === "string" ? payload.name.trim() : "";

      if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
        writeJson(response, 400, { error: "Enter a valid email and a password with at least 6 characters." });
        return;
      }

      if (requestUrl.pathname === "/api/auth/signup") {
        if (name.length < 2) {
          writeJson(response, 400, { error: "Your name must be at least 2 characters." });
          return;
        }

        const existingUser = await databaseGet("SELECT id FROM users WHERE email = ?", [email]);
        if (existingUser) {
          writeJson(response, 409, { error: "An account with that email already exists." });
          return;
        }

        const user = {
          id: crypto.randomUUID(),
          name,
          email,
          createdAt: new Date().toISOString(),
        };
        const passwordHash = await bcrypt.hash(password, 12);
        await databaseRun(
          "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
          [user.id, user.name, user.email, passwordHash, user.createdAt]
        );
        await createSession(user.id, response);
        writeJson(response, 201, { user });
        return;
      }

      const storedUser = await databaseGet("SELECT id, name, email, password_hash, created_at AS createdAt FROM users WHERE email = ?", [email]);
      if (!storedUser || !(await bcrypt.compare(password, storedUser.password_hash))) {
        writeJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }

      await createSession(storedUser.id, response);
      writeJson(response, 200, {
        user: {
          id: storedUser.id,
          name: storedUser.name,
          email: storedUser.email,
          createdAt: storedUser.createdAt,
        },
      });
      return;
    } catch (error) {
      console.error("Authentication request failed:", error);
      writeJson(response, 500, { error: "Authentication service is unavailable." });
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/me") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." });
        return;
      }

      writeJson(response, 200, { user });
    } catch (error) {
      console.error("Session lookup failed:", error);
      writeJson(response, 500, { error: "Authentication service is unavailable." });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token) {
      await databaseRun("DELETE FROM sessions WHERE token_hash = ?", [hashSessionToken(token)]);
    }
    clearSessionCookie(response);
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/uploads") {
    handleUpload(request, response);
    return;
  }

  if ((request.method === "GET" || request.method === "HEAD") && requestUrl.pathname.startsWith("/uploads/")) {
    serveUpload(request, response, decodeURIComponent(requestUrl.pathname.slice("/uploads/".length)));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/api/rooms/")) {
    const roomPath = requestUrl.pathname.replace(/^\/api\/rooms\//, "").replace(/\/exists$/, "");
    const roomId = decodeURIComponent(roomPath || "").toUpperCase();

    if (!/^[A-Z0-9]{4,8}$/.test(roomId)) {
      writeJson(response, 400, { valid: false, message: "Invalid room code format." });
      return;
    }

    writeJson(response, 200, { valid: rooms.has(roomId), roomId });
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("SyncPlay Socket.IO server is running.");
});

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  socket.on("create-room", ({ roomId, name }) => {
    const normalizedRoomId = (roomId || createRoomCode()).toUpperCase();
    let room = getRoom(normalizedRoomId);

    if (!room) {
      room = createRoom(normalizedRoomId, socket.id, name || "Host");
      rooms.set(normalizedRoomId, room);
    } else {
      room.hostId = socket.id;
      upsertUser(room, socket.id, name || "Host");
    }

    socket.join(normalizedRoomId);
    socket.data.roomId = normalizedRoomId;
    socket.data.name = name || "Host";
    socket.data.role = "host";

    socket.emit("room-state", room);
    io.to(normalizedRoomId).emit("room-state", room);
  });

  socket.on("join-room", ({ roomId, name }) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    const room = getRoom(normalizedRoomId);

    if (!room) {
      socket.emit("room-error", `Room ${normalizedRoomId} was not found.`);
      return;
    }

    upsertUser(room, socket.id, name || "Guest");

    socket.join(normalizedRoomId);
    socket.data.roomId = normalizedRoomId;
    socket.data.name = name || "Guest";
    socket.data.role = "guest";

    socket.emit("room-state", room);
    io.to(normalizedRoomId).emit("room-state", room);
  });

  socket.on("change-track", ({ videoId, title, url, mediaType }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    if (!room) return;

    const track = createQueueTrack({
      videoId,
      title,
      url,
      mediaType,
      addedBy: socket.data.name || "Participant",
    });

    if (!hasActivePlayback(room)) {
      room.playback = playbackFromTrack(track, false);
    } else {
      room.queue.push(track);
    }

    broadcastRoom(io, roomId);
  });

  socket.on("enqueue-track", ({ videoId, title, url, mediaType }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    if (!room) return;

    const track = createQueueTrack({
      videoId,
      title,
      url,
      mediaType,
      addedBy: socket.data.name || "Participant",
    });

    if (!hasActivePlayback(room)) {
      room.playback = playbackFromTrack(track, false);
    } else {
      room.queue.push(track);
    }

    broadcastRoom(io, roomId);
  });

  socket.on("advance-queue", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    if (!room) return;

    advanceQueue(room);
    broadcastRoom(io, roomId);
  });

  socket.on("previous-track", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    if (!room || !rewindQueue(room)) return;

    broadcastRoom(io, roomId);
  });

  // Voice chat uses Socket.IO only for WebRTC signaling. Audio travels
  // directly between browsers once the offer/answer exchange is complete.
  socket.on("voice-join", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    if (!room) return;

    socket.data.voiceJoined = true;

    const peers = [...(io.sockets.adapter.rooms.get(roomId) ?? [])].filter((peerId) => {
      if (peerId === socket.id) return false;

      return io.sockets.sockets.get(peerId)?.data.voiceJoined === true;
    });

    socket.emit("voice-peers", peers);
  });

  socket.on("voice-leave", () => {
    const roomId = socket.data.roomId;

    if (!roomId || !socket.data.voiceJoined) return;

    socket.data.voiceJoined = false;
    socket.to(roomId).emit("voice-peer-left", { peerId: socket.id });
  });

  socket.on("voice-offer", ({ target, offer }) => {
    const roomId = socket.data.roomId;
    const targetSocket = typeof target === "string" ? io.sockets.sockets.get(target) : null;

    if (
      !roomId ||
      !socket.data.voiceJoined ||
      !targetSocket ||
      targetSocket.data.roomId !== roomId ||
      !targetSocket.data.voiceJoined ||
      !offer
    ) return;

    io.to(target).emit("voice-offer", {
      from: socket.id,
      offer,
    });
  });

  socket.on("voice-answer", ({ target, answer }) => {
    const roomId = socket.data.roomId;
    const targetSocket = typeof target === "string" ? io.sockets.sockets.get(target) : null;

    if (
      !roomId ||
      !socket.data.voiceJoined ||
      !targetSocket ||
      targetSocket.data.roomId !== roomId ||
      !targetSocket.data.voiceJoined ||
      !answer
    ) return;

    io.to(target).emit("voice-answer", {
      from: socket.id,
      answer,
    });
  });

  socket.on("voice-ice-candidate", ({ target, candidate }) => {
    const roomId = socket.data.roomId;
    const targetSocket = typeof target === "string" ? io.sockets.sockets.get(target) : null;

    if (
      !roomId ||
      !socket.data.voiceJoined ||
      !targetSocket ||
      targetSocket.data.roomId !== roomId ||
      !targetSocket.data.voiceJoined ||
      !candidate
    ) return;

    io.to(target).emit("voice-ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  // Video chat has its own signaling room so it can be joined independently
  // from voice chat. The media itself still travels directly between browsers.
  socket.on("video-join", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    if (!room) return;

    socket.data.videoJoined = true;

    const peers = [...(io.sockets.adapter.rooms.get(roomId) ?? [])].filter((peerId) => {
      if (peerId === socket.id) return false;

      return io.sockets.sockets.get(peerId)?.data.videoJoined === true;
    });

    socket.emit("video-peers", peers);
  });

  socket.on("video-leave", () => {
    const roomId = socket.data.roomId;

    if (!roomId || !socket.data.videoJoined) return;

    socket.data.videoJoined = false;
    socket.to(roomId).emit("video-peer-left", { peerId: socket.id });
  });

  socket.on("video-offer", ({ target, offer }) => {
    const roomId = socket.data.roomId;
    const targetSocket = typeof target === "string" ? io.sockets.sockets.get(target) : null;

    if (
      !roomId ||
      !socket.data.videoJoined ||
      !targetSocket ||
      targetSocket.data.roomId !== roomId ||
      !targetSocket.data.videoJoined ||
      !offer
    ) return;

    io.to(target).emit("video-offer", {
      from: socket.id,
      offer,
    });
  });

  socket.on("video-answer", ({ target, answer }) => {
    const roomId = socket.data.roomId;
    const targetSocket = typeof target === "string" ? io.sockets.sockets.get(target) : null;

    if (
      !roomId ||
      !socket.data.videoJoined ||
      !targetSocket ||
      targetSocket.data.roomId !== roomId ||
      !targetSocket.data.videoJoined ||
      !answer
    ) return;

    io.to(target).emit("video-answer", {
      from: socket.id,
      answer,
    });
  });

  socket.on("video-ice-candidate", ({ target, candidate }) => {
    const roomId = socket.data.roomId;
    const targetSocket = typeof target === "string" ? io.sockets.sockets.get(target) : null;

    if (
      !roomId ||
      !socket.data.videoJoined ||
      !targetSocket ||
      targetSocket.data.roomId !== roomId ||
      !targetSocket.data.videoJoined ||
      !candidate
    ) return;

    io.to(target).emit("video-ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  socket.on("send-chat-message", ({ text }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;
    const normalizedText = typeof text === "string" ? text.trim().slice(0, 500) : "";

    if (!room || !normalizedText) return;

    room.messages ??= [];

    const message = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      userId: socket.id,
      name: socket.data.name || "Participant",
      text: normalizedText,
      createdAt: Date.now(),
    };

    room.messages.push(message);
    if (room.messages.length > 100) {
      room.messages.shift();
    }

    io.to(roomId).emit("chat-message", message);
  });

  socket.on("track-ended", ({ trackId, videoId }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    // Any connected player may report the end, but only the track that is
    // currently playing may advance the queue. This makes duplicate browser
    // events harmless and keeps queue progression owned by the server.
    const isCurrentTrack = room && (
      room.playback.trackId === trackId ||
      (!room.playback.trackId && room.playback.videoId === videoId)
    );

    if (!isCurrentTrack) return;

    advanceQueue(room);
    broadcastRoom(io, roomId);
  });

  socket.on("play", ({ position = 0 }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    if (!room) return;

    room.playback = {
      ...room.playback,
      position,
      playing: true,
      updatedAt: Date.now(),
    };

    broadcastRoom(io, roomId);
  });

  socket.on("pause", ({ position = 0 }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    if (!room) return;

    room.playback = {
      ...room.playback,
      position,
      playing: false,
      updatedAt: Date.now(),
    };

    broadcastRoom(io, roomId);
  });

  socket.on("seek", ({ position = 0 }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;

    if (!room) return;

    room.playback = {
      ...room.playback,
      position,
      updatedAt: Date.now(),
    };

    broadcastRoom(io, roomId);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    if (socket.data.voiceJoined) {
      socket.to(roomId).emit("voice-peer-left", { peerId: socket.id });
      socket.data.voiceJoined = false;
    }

    if (socket.data.videoJoined) {
      socket.to(roomId).emit("video-peer-left", { peerId: socket.id });
      socket.data.videoJoined = false;
    }

    const room = getRoom(roomId);
    if (!room) return;

    room.users = room.users.filter((user) => user.id !== socket.id);

    if (room.hostId === socket.id) {
      room.hostId = room.users[0]?.id ?? null;
    }

    if (room.users.length === 0) {
      rooms.delete(roomId);
      return;
    }

    broadcastRoom(io, roomId);
  });
});

server.listen(PORT, () => {
  console.log(`SyncPlay socket server running on port ${PORT}`);
});
