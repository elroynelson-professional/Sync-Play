/* eslint-disable @typescript-eslint/no-require-imports */

const http = require("http");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");
const { Server } = require("socket.io");
const { normalizeTheme, createRoomStore } = require("./room-store");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const uploadDirectory = path.join(__dirname, "uploads");
const dataDirectory = path.join(__dirname, "data");
const rooms = new Map();
const roomStore = createRoomStore(getAuthDatabase, rooms);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const mongoClient = process.env.MONGODB_URI ? new MongoClient(process.env.MONGODB_URI) : null;
let mongoDatabasePromise = null;
const allowedFrontendOrigins = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || "http://localhost:3000,https://sync-play-blue.vercel.app")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
const SESSION_COOKIE = "syncplay-session";

fs.mkdirSync(uploadDirectory, { recursive: true });
fs.mkdirSync(dataDirectory, { recursive: true });

async function getAuthDatabase() {
  if (!mongoClient) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!mongoDatabasePromise) {
    mongoDatabasePromise = mongoClient.connect().then((client) => {
      const database = client.db(process.env.MONGODB_DB || "syncplay");
      database.collection("rooms").createIndex({ ownerUserId: 1 }).catch(() => undefined);
      database.collection("rooms").createIndex({ approvedUserIds: 1 }).catch(() => undefined);
      database.collection("users").createIndex({ email: 1 }, { unique: true }).catch(() => undefined);
      database.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }).catch(() => undefined);
      database.collection("otpRequests").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => undefined);
      return database;
    });
  }

  return mongoDatabasePromise;
}

async function sendVerificationEmail({ recipient, code }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [recipient],
      subject: "Your SyncPlay verification code",
      text: `Your SyncPlay verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your SyncPlay verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend returned ${response.status}: ${errorBody.slice(0, 300)}`);
  }
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
  const crossSiteAttributes = isProduction ? "SameSite=None; Secure" : "SameSite=Lax";
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; ${crossSiteAttributes}; Path=/; Max-Age=${maxAge}`);
}

function clearSessionCookie(response) {
  setSessionCookie(response, "", 0);
}

async function getAuthenticatedUser(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;

  const database = await getAuthDatabase();
  const tokenHash = hashSessionToken(token);
  const session = await database.collection("sessions").findOne({ tokenHash });
  const sessionUser = session ? await database.collection("users").findOne({ id: session.userId }) : null;

  if (!session || !sessionUser || session.expiresAt < Date.now()) {
    if (session) {
      await database.collection("sessions").deleteOne({ tokenHash });
    }
    return null;
  }

  return {
    id: sessionUser.id,
    name: sessionUser.name,
    email: sessionUser.email,
    createdAt: sessionUser.createdAt,
    profileImage: sessionUser.profileImage || null,
  };
}

async function createSession(userId, response) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  const database = await getAuthDatabase();
  await database.collection("sessions").deleteMany({ userId });
  await database.collection("sessions").insertOne({ tokenHash: hashSessionToken(token), userId, expiresAt });
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

function createRoom(roomId, hostId, name, title = null) {
  return {
    roomId,
    hostId,
    title: typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : null,
    users: [{ id: hostId, userId: null, name }],
    playback: createPlaybackState(),
    queue: [],
    history: [],
    messages: [],
    pendingJoins: [],
    createdAt: Date.now(),
  };
}

async function recordDashboardActivity(userId, roomId, type, metadata = {}) {
  if (!userId) return;

  const database = await getAuthDatabase();
  await database.collection("activity").insertOne({
    userId,
    roomId,
    type,
    createdAt: Date.now(),
    ...metadata,
  });
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function upsertUser(room, socketId, name, userId = null) {
  const index = room.users.findIndex((user) => user.id === socketId);

  if (index >= 0) {
    room.users[index] = { id: socketId, userId, name };
    return;
  }

  room.users.push({ id: socketId, userId, name });
}

function broadcastRoom(io, roomId) {
  const room = getRoom(roomId);
  if (room) {
    io.to(roomId).emit("room-state", publicRoomState(room));
    roomStore.save(room).catch((error) => {
      console.error("Room save failed:", error);
      io.to(roomId).emit("room-error", "Changes could not be saved. Reconnect to try again before leaving.");
    });
  }
}

function publicRoomState(room) {
  const { roomId, hostId, title, theme, users, playback, queue, history, messages, createdAt } = room;
  return { roomId, hostId, title, theme, users, playback, queue, history, messages, createdAt };
}

function setCorsHeaders(response, request) {
  const requestOrigin = request?.headers.origin;
  const responseOrigin = requestOrigin && allowedFrontendOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedFrontendOrigins[0];

  response.setHeader("Access-Control-Allow-Origin", responseOrigin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-File-Name, X-Room-Id, Range");
  response.setHeader("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Content-Type");
}

function writeJson(response, statusCode, payload, request) {
  setCorsHeaders(response, request);
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

  if (!contentType) {
    writeJson(response, 415, { error: "The uploaded file type is missing." });
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
  setCorsHeaders(response, request);

  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/contact") {
    try {
      const payload = await readJsonBody(request);
      const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 120) : "";
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase().slice(0, 200) : "";
      const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 5000) : "";

      if (!name || !/^\S+@\S+\.\S+$/.test(email) || message.length < 10) {
        writeJson(response, 400, { error: "Enter your name, a valid email, and a message of at least 10 characters." }, request);
        return;
      }

      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
        writeJson(response, 503, { error: "The contact service is not configured yet." }, request);
        return;
      }

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [process.env.CONTACT_EMAIL || "elroynelson.professional@gmail.com"],
          reply_to: email,
          subject: `Sykonyx contact message from ${name}`,
          text: `From: ${name} <${email}>\n\n${message}`,
        }),
      });

      if (!resendResponse.ok) {
        console.error("Contact email failed:", await resendResponse.text());
        writeJson(response, 503, { error: "The contact service could not send your message." }, request);
        return;
      }

      writeJson(response, 200, { message: "Thanks. Your message has been sent." }, request);
    } catch (error) {
      console.error("Contact request failed:", error);
      writeJson(response, 503, { error: "The contact service is temporarily unavailable." }, request);
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/request-otp") {
    let database;
    let email = "";
    let code = "";

    try {
      const payload = await readJsonBody(request);
      email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        writeJson(response, 400, { error: "Enter a valid email address." }, request);
        return;
      }

      database = await getAuthDatabase();
      const existingUser = await database.collection("users").findOne({ email });
      if (existingUser) {
        writeJson(response, 409, { error: "An account with that email already exists." }, request);
        return;
      }

      code = String(crypto.randomInt(100000, 1000000));
      const codeHash = await bcrypt.hash(code, 10);
      await database.collection("otpRequests").replaceOne(
        { email },
        { email, codeHash, expiresAt: Date.now() + 10 * 60 * 1000 },
        { upsert: true }
      );
    } catch (error) {
      console.error("OTP database request failed:", error);
      writeJson(response, 503, { error: "The database connection is unavailable. Check MONGODB_URI and Atlas Network Access." }, request);
      return;
    }

    try {
      await sendVerificationEmail({ recipient: email, code });
      writeJson(response, 200, { message: "Verification code sent." }, request);
    } catch (error) {
      console.error("OTP email delivery failed:", error);
      writeJson(response, 503, { error: "The email service is unavailable. Check RESEND_API_KEY and EMAIL_FROM." }, request);
    }
    return;
  }

  if (request.method === "POST" && ["/api/auth/signup", "/api/auth/login"].includes(requestUrl.pathname)) {
    try {
      const payload = await readJsonBody(request);
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      const password = typeof payload.password === "string" ? payload.password : "";
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const otp = typeof payload.otp === "string" ? payload.otp.trim() : "";

      if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
        writeJson(response, 400, { error: "Enter a valid email and a password with at least 6 characters." }, request);
        return;
      }

      if (requestUrl.pathname === "/api/auth/signup") {
        if (name.length < 2) {
          writeJson(response, 400, { error: "Your name must be at least 2 characters." }, request);
          return;
        }

        const database = await getAuthDatabase();
        const existingUser = await database.collection("users").findOne({ email });
        if (existingUser) {
          writeJson(response, 409, { error: "An account with that email already exists." }, request);
          return;
        }

        const otpRequest = await database.collection("otpRequests").findOne({ email });
        if (!otpRequest || otpRequest.expiresAt < Date.now() || !(await bcrypt.compare(otp, otpRequest.codeHash))) {
          writeJson(response, 400, { error: "Enter the valid verification code sent to your email." }, request);
          return;
        }

        const user = {
          id: crypto.randomUUID(),
          name,
          email,
          createdAt: new Date().toISOString(),
          profileImage: null,
        };
        const passwordHash = await bcrypt.hash(password, 12);
        await database.collection("users").insertOne({ ...user, passwordHash, provider: "password" });
        await database.collection("otpRequests").deleteOne({ email });
        await createSession(user.id, response);
        writeJson(response, 201, { user }, request);
        return;
      }

      const database = await getAuthDatabase();
      const storedUser = await database.collection("users").findOne({ email });
      if (!storedUser || !(await bcrypt.compare(password, storedUser.passwordHash))) {
        writeJson(response, 401, { error: "Email or password is incorrect." }, request);
        return;
      }

      await createSession(storedUser.id, response);
      writeJson(response, 200, {
        user: {
          id: storedUser.id,
          name: storedUser.name,
          email: storedUser.email,
          createdAt: storedUser.createdAt,
          profileImage: storedUser.profileImage || null,
        },
      }, request);
      return;
    } catch (error) {
      console.error("Authentication request failed:", error);
      writeJson(response, 500, { error: "Authentication service is unavailable." }, request);
      return;
    }
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/me") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      writeJson(response, 200, { user }, request);
    } catch (error) {
      console.error("Session lookup failed:", error);
      writeJson(response, 500, { error: "Authentication service is unavailable." }, request);
    }
    return;
  }

  if (requestUrl.pathname === "/api/room-themes" && ["GET", "POST"].includes(request.method)) {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) return writeJson(response, 401, { error: "Please sign in to manage themes." }, request);
      const users = (await getAuthDatabase()).collection("users");
      if (request.method === "POST") {
        const body = await readJsonBody(request);
        if (body.action === "remove" && typeof body.id === "string") {
          await users.updateOne({ id: user.id }, { $pull: { roomThemes: { id: body.id } } });
        } else if (body.action === "save" && typeof body.theme?.id === "string" && body.theme.id.length < 100) {
          const theme = { id: body.theme.id, ...normalizeTheme(body.theme) };
          await users.updateOne({ id: user.id }, { $push: { roomThemes: { $each: [theme], $position: 0, $slice: 8 } } });
        } else if (body.action === "migrate" && Array.isArray(body.themes)) {
          const themes = body.themes.slice(0, 8).map((theme) => ({ id: crypto.randomUUID(), ...normalizeTheme(theme) }));
          await users.updateOne({ id: user.id, roomThemes: { $exists: false } }, { $set: { roomThemes: themes } });
        } else return writeJson(response, 400, { error: "Invalid theme request." }, request);
      }
      const account = await users.findOne({ id: user.id }, { projection: { roomThemes: 1 } });
      writeJson(response, 200, { themes: account?.roomThemes || [], migrated: Array.isArray(account?.roomThemes) }, request);
    } catch {
      writeJson(response, 503, { error: "Themes could not be saved or loaded. Please try again." }, request);
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/dashboard") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const database = await getAuthDatabase();
      const activities = await database.collection("activity").find({ userId: user.id }).sort({ createdAt: -1 }).limit(500).toArray();
      const account = await database.collection("users").findOne({ id: user.id }, { projection: { friends: 1 } });
      const friendIds = account?.friends || [];
      const onlineFriendIds = new Set(
        [...io.sockets.sockets.values()]
          .map((socket) => socket.data.userId)
          .filter((userId) => typeof userId === "string" && friendIds.includes(userId)),
      );
      const userRoomIds = new Set(activities.map((activity) => activity.roomId));
      const savedRooms = await database.collection("rooms").find({ $or: [{ ownerUserId: user.id }, { approvedUserIds: user.id }] }).sort({ createdAt: -1 }).limit(100).toArray();
      const dashboardRooms = new Map(savedRooms.map((room) => [room.roomId, { ...room, users: [], hostId: null }]));
      rooms.forEach((room, id) => dashboardRooms.set(id, room));
      const createdRoomIds = new Set(
        activities
          .filter((activity) => activity.type === "room-created" && typeof activity.roomId === "string")
          .map((activity) => activity.roomId),
      );
      const liveRooms = [...dashboardRooms.values()]
        .filter((room) => room.ownerUserId === user.id || room.approvedUserIds?.includes(user.id) || room.users.some((member) => member.userId === user.id) || userRoomIds.has(room.roomId))
        .map((room) => ({
          name: room.title || `Room ${room.roomId}`,
          host: room.users.find((member) => member.id === room.hostId)?.name || "Host",
          viewers: `${room.users.length} online`,
          status: room.users.length > 0 ? "Live" : "Idle",
          code: room.roomId,
          canEdit: room.ownerUserId === user.id || (!room.ownerUserId && createdRoomIds.has(room.roomId)),
          theme: normalizeTheme(room.theme),
        }));
      const completedRoomSeconds = activities.reduce((total, activity) => total + (activity.type === "room-session" ? activity.durationSeconds || 0 : 0), 0);
      const activeRoomSeconds = [...io.sockets.sockets.values()].reduce((total, socket) => {
        if (socket.data.userId !== user.id || !socket.data.roomId || !socket.data.roomStartedAt) return total;
        return total + Math.max(0, Math.round((Date.now() - socket.data.roomStartedAt) / 1000));
      }, 0);
      const roomTimeSeconds = completedRoomSeconds + activeRoomSeconds;
      const dayKeys = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const activityBars = dayKeys.map((label, dayIndex) => ({
        label,
        value: activities.filter((activity) => new Date(activity.createdAt).getDay() === dayIndex).length,
      }));
      const maxActivity = Math.max(...activityBars.map((bar) => bar.value), 1);

      writeJson(response, 200, {
        metrics: {
          activeRooms: liveRooms.length,
          liveViewers: liveRooms.reduce((total, room) => total + Number.parseInt(room.viewers, 10), 0),
          friendsOnline: onlineFriendIds.size,
          watchTime: `${Math.floor(roomTimeSeconds / 3600)}h ${Math.floor((roomTimeSeconds % 3600) / 60)}m`,
        },
        rooms: liveRooms,
        activityBars: activityBars.map((bar) => ({ ...bar, value: Math.round((bar.value / maxActivity) * 100) })),
      }, request);
    } catch (error) {
      console.error("Dashboard data request failed:", error);
      writeJson(response, 503, { error: "Dashboard data is temporarily unavailable." }, request);
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/friends") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const database = await getAuthDatabase();
      const account = await database.collection("users").findOne({ id: user.id }, { projection: { friends: 1, friendRequests: 1 } });
      const friendIds = account?.friends || [];
      const requestIds = account?.friendRequests || [];
      const [friendUsers, requestUsers, sentRequestUsers] = await Promise.all([
        database.collection("users").find({ id: { $in: friendIds } }).project({ id: 1, name: 1, email: 1, profileImage: 1 }).toArray(),
        database.collection("users").find({ id: { $in: requestIds } }).project({ id: 1, name: 1, profileImage: 1 }).toArray(),
        database.collection("users").find({ friendRequests: user.id }).project({ id: 1, name: 1, profileImage: 1 }).toArray(),
      ]);

      writeJson(response, 200, {
        friends: friendUsers.map((friend) => ({
          id: friend.id,
          name: friend.name,
          status: "Away",
          mood: "Ready to watch together",
          avatar: friend.profileImage || friend.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
          accent: "from-emerald-400 to-teal-500",
          profileImage: friend.profileImage || null,
        })),
        requests: requestUsers.map((request) => ({
          id: request.id,
          name: request.name,
          note: "Sent you a friend request",
          profileImage: request.profileImage || null,
        })),
        sentRequests: sentRequestUsers.map((request) => ({
          id: request.id,
          name: request.name,
          note: "Awaiting response",
          profileImage: request.profileImage || null,
        })),
      }, request);
    } catch (error) {
      console.error("Friends data request failed:", error);
      writeJson(response, 503, { error: "Friends data is temporarily unavailable." }, request);
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/users/search") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const query = (requestUrl.searchParams.get("q") || "").trim().slice(0, 120);
      if (query.length < 2) {
        writeJson(response, 200, { users: [] }, request);
        return;
      }

      const database = await getAuthDatabase();
      const account = await database.collection("users").findOne(
        { id: user.id },
        { projection: { friends: 1, friendRequests: 1 } },
      );
      const friends = new Set(account?.friends || []);
      const incomingRequests = new Set(account?.friendRequests || []);
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const users = await database.collection("users")
        .find({
          id: { $ne: user.id },
          $or: [
            { name: { $regex: escapedQuery, $options: "i" } },
            { email: { $regex: escapedQuery, $options: "i" } },
          ],
        })
        .project({ id: 1, name: 1, email: 1, friendRequests: 1 })
        .limit(8)
        .toArray();

      writeJson(response, 200, {
        users: users.map((result) => ({
          id: result.id,
          name: result.name,
          email: result.email,
          relationship: friends.has(result.id)
            ? "friend"
            : (result.friendRequests || []).includes(user.id)
              ? "pending"
              : incomingRequests.has(result.id)
                ? "incoming"
                : "none",
        })),
      }, request);
    } catch (error) {
      console.error("User search failed:", error);
      writeJson(response, 503, { error: "User search is temporarily unavailable." }, request);
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/history") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const database = await getAuthDatabase();
      const historySince = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const activities = await database.collection("activity")
        .find({ userId: user.id, createdAt: { $gte: historySince } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();
      const formatDuration = (seconds) => {
        const safeSeconds = Math.max(0, Math.round(seconds || 0));
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      };
      const historyRows = activities.map((activity) => {
        const isRoomSession = activity.type === "room-session";
        const isWatchSession = activity.type === "watch";
        return {
          title: isWatchSession ? "Watch session" : isRoomSession ? "Room session" : activity.type === "room-created" ? "Created room" : "Joined room",
          room: activity.roomId,
          date: new Date(activity.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          duration: isWatchSession || isRoomSession ? formatDuration(activity.durationSeconds) : "-",
          type: isWatchSession ? "Watch session" : isRoomSession ? "Time in room" : "Room activity",
        };
      });

      writeJson(response, 200, { history: historyRows }, request);
    } catch (error) {
      console.error("History data request failed:", error);
      writeJson(response, 503, { error: "History data is temporarily unavailable." }, request);
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/messages") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const database = await getAuthDatabase();
      const messages = await database.collection("directMessages")
        .find({ $or: [{ senderId: user.id }, { recipientId: user.id }] })
        .sort({ createdAt: 1 })
        .limit(500)
        .toArray();
      writeJson(response, 200, { messages: messages.map(({ _id, ...message }) => ({ ...message, id: message.id || String(_id) })) }, request);
    } catch (error) {
      console.error("Messages data request failed:", error);
      writeJson(response, 503, { error: "Messages are temporarily unavailable." }, request);
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/friends/requests") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const payload = await readJsonBody(request);
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      const database = await getAuthDatabase();
      const target = await database.collection("users").findOne({ email });

      if (!target) {
        writeJson(response, 404, { error: "No SyncPlay account uses that email." }, request);
        return;
      }
      if (target.id === user.id) {
        writeJson(response, 400, { error: "You cannot add yourself." }, request);
        return;
      }

      await database.collection("users").updateOne(
        { id: target.id },
        { $addToSet: { friendRequests: user.id } }
      );
      notifyUser(target.id, "friends-changed");
      notifyUser(user.id, "friends-changed");
      writeJson(response, 200, { message: "Friend request sent." }, request);
    } catch (error) {
      console.error("Friend request failed:", error);
      writeJson(response, 503, { error: "Friend requests are temporarily unavailable." }, request);
    }
    return;
  }

  const removeFriendMatch = requestUrl.pathname.match(/^\/api\/friends\/([^/]+)\/remove$/);
  if (request.method === "POST" && removeFriendMatch) {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const friendId = decodeURIComponent(removeFriendMatch[1]);
      if (!friendId || friendId === user.id) {
        writeJson(response, 400, { error: "That friend could not be removed." }, request);
        return;
      }

      const database = await getAuthDatabase();
      await Promise.all([
        database.collection("users").updateOne({ id: user.id }, { $pull: { friends: friendId } }),
        database.collection("users").updateOne({ id: friendId }, { $pull: { friends: user.id } }),
      ]);
      notifyUser(user.id, "friends-changed");
      notifyUser(friendId, "friends-changed");
      writeJson(response, 200, { message: "Friend removed." }, request);
    } catch (error) {
      console.error("Remove friend failed:", error);
      writeJson(response, 503, { error: "Friends are temporarily unavailable." }, request);
    }
    return;
  }

  const friendActionMatch = requestUrl.pathname.match(/^\/api\/friends\/requests\/([^/]+)\/(accept|ignore)$/);
  if (request.method === "POST" && friendActionMatch) {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const requesterId = decodeURIComponent(friendActionMatch[1]);
      const action = friendActionMatch[2];
      const database = await getAuthDatabase();
      await database.collection("users").updateOne({ id: user.id }, { $pull: { friendRequests: requesterId } });

      if (action === "accept") {
        await database.collection("users").updateOne({ id: user.id }, { $addToSet: { friends: requesterId } });
        await database.collection("users").updateOne({ id: requesterId }, { $addToSet: { friends: user.id } });
      }

      notifyUser(user.id, "friends-changed");
      notifyUser(requesterId, "friends-changed");

      writeJson(response, 200, { message: action === "accept" ? "Friend request accepted." : "Friend request ignored." }, request);
    } catch (error) {
      console.error("Friend request action failed:", error);
      writeJson(response, 503, { error: "Friend request action is temporarily unavailable." }, request);
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/profile-picture") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const payload = await readJsonBody(request);
      const imageUrl = typeof payload.imageUrl === "string" ? payload.imageUrl.trim() : "";
      const isValidProfileImage = /^https?:\/\//.test(imageUrl) || imageUrl.startsWith("/uploads/");
      if (!imageUrl || !isValidProfileImage) {
        writeJson(response, 400, { error: "Choose a valid image to use as your profile picture." }, request);
        return;
      }

      const database = await getAuthDatabase();
      const updatedUser = await database.collection("users").findOneAndUpdate(
        { id: user.id },
        { $set: { profileImage: imageUrl } },
        { returnDocument: "after", projection: { id: 1, name: 1, email: 1, createdAt: 1, profileImage: 1 } },
      );

      const normalizedUser = updatedUser.value || { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, profileImage: imageUrl };
      writeJson(response, 200, {
        user: {
          id: normalizedUser.id,
          name: normalizedUser.name,
          email: normalizedUser.email,
          createdAt: normalizedUser.createdAt,
          profileImage: normalizedUser.profileImage || null,
        },
      }, request);
    } catch (error) {
      console.error("Profile picture update failed:", error);
      writeJson(response, 503, { error: "Profile picture update is temporarily unavailable." }, request);
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token) {
      const tokenHash = hashSessionToken(token);
      const database = await getAuthDatabase();
      await database.collection("sessions").deleteOne({ tokenHash });
    }
    clearSessionCookie(response);
    writeJson(response, 200, { ok: true }, request);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/password") {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) {
        writeJson(response, 401, { error: "You are not signed in." }, request);
        return;
      }

      const payload = await readJsonBody(request);
      const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
      const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
      const database = await getAuthDatabase();
      const storedUser = await database.collection("users").findOne({ id: user.id });

      if (!storedUser || !storedUser.passwordHash || !(await bcrypt.compare(currentPassword, storedUser.passwordHash))) {
        writeJson(response, 400, { error: "Your current password is incorrect." }, request);
        return;
      }
      if (newPassword.length < 8) {
        writeJson(response, 400, { error: "Your new password must be at least 8 characters." }, request);
        return;
      }
      if (currentPassword === newPassword) {
        writeJson(response, 400, { error: "Your new password must be different from the current password." }, request);
        return;
      }

      await database.collection("users").updateOne(
        { id: user.id },
        { $set: { passwordHash: await bcrypt.hash(newPassword, 12) } }
      );
      writeJson(response, 200, { message: "Password updated successfully." }, request);
    } catch (error) {
      console.error("Password update failed:", error);
      writeJson(response, 503, { error: "Password update is temporarily unavailable." }, request);
    }
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

  const roomSettingsMatch = requestUrl.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})\/settings$/i);
  if (request.method === "POST" && roomSettingsMatch) {
    try {
      const user = await getAuthenticatedUser(request);
      if (!user) return writeJson(response, 401, { error: "Please sign in to edit this room." }, request);
      const room = await roomStore.load(roomSettingsMatch[1].toUpperCase());
      if (!room) return writeJson(response, 404, { error: "This room was not found." }, request);
      const database = await getAuthDatabase();
      let canEdit = room.ownerUserId === user.id;

      // Backward compatibility: older rooms may not have persisted ownerUserId.
      if (!canEdit && !room.ownerUserId) {
        const createdActivity = await database.collection("activity").findOne({
          userId: user.id,
          roomId: room.roomId,
          type: "room-created",
        });
        if (createdActivity) {
          canEdit = true;
          room.ownerUserId = user.id;
          if (!Array.isArray(room.approvedUserIds)) room.approvedUserIds = [];
        }
      }

      if (!canEdit) return writeJson(response, 403, { error: "Only the room owner can edit this room." }, request);
      const body = await readJsonBody(request);
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (title.length < 2 || title.length > 80 || !body.theme || !["accent", "background", "buttonColor"].every((key) => /^#[0-9a-f]{6}$/i.test(body.theme[key]))) {
        return writeJson(response, 400, { error: "Enter a title between 2 and 80 characters and valid room colors." }, request);
      }
      const previous = { title: room.title, theme: room.theme };
      const theme = normalizeTheme(body.theme);
      room.title = title;
      room.theme = theme;
      try { await roomStore.save(room); }
      catch (error) {
        if (room.theme === theme) Object.assign(room, previous);
        throw error;
      }
      io.to(room.roomId).emit("room-state", publicRoomState(room));
      writeJson(response, 200, { title: room.title, theme: room.theme }, request);
    } catch (error) {
      console.error("Room settings update failed:", error);
      writeJson(response, 503, { error: "Could not save this room. Please try again." }, request);
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/api/rooms/")) {
    const roomPath = requestUrl.pathname.replace(/^\/api\/rooms\//, "").replace(/\/exists$/, "");
    const roomId = decodeURIComponent(roomPath || "").toUpperCase();

    if (!/^[A-Z0-9]{4,8}$/.test(roomId)) {
      writeJson(response, 400, { valid: false, message: "Invalid room code format." });
      return;
    }

    try {
      const room = await roomStore.load(roomId);
      writeJson(response, 200, { valid: Boolean(room), roomId }, request);
    } catch {
      writeJson(response, 503, { error: "Room lookup is unavailable. Please try again." }, request);
    }
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("SyncPlay Socket.IO server is running.");
});

const io = new Server(server, {
  cors: {
    origin: allowedFrontendOrigins,
    credentials: true,
  },
});

function notifyUser(userId, event, payload = {}) {
  [...io.sockets.sockets.values()]
    .filter((connectedSocket) => connectedSocket.data.userId === userId)
    .forEach((connectedSocket) => connectedSocket.emit(event, payload));
}

io.use(async (socket, next) => {
  try {
    const user = await getAuthenticatedUser(socket.request);
    if (!user) return next(new Error("Please sign in again to connect."));
    socket.data.userId = user.id;
    socket.data.accountName = user.name;
    next();
  } catch { next(new Error("Connection unavailable. Please try again.")); }
});

function enterRoom(socket, room, name) {
  const userId = socket.data.userId;
  name = typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : socket.data.accountName;
  upsertUser(room, socket.id, name || socket.data.accountName, userId);
  if (room.ownerUserId === userId || !room.hostId) room.hostId = socket.id;
  socket.join(room.roomId);
  socket.data.roomId = room.roomId;
  delete socket.data.pendingRoomId;
  socket.data.name = name || socket.data.accountName;
  socket.data.roomStartedAt ||= Date.now();
  socket.emit("join-approved");
  broadcastRoom(io, room.roomId);
  if (room.hostId === socket.id) {
    room.pendingJoins.forEach((request) => socket.emit("room-join-request", request));
  }
}

async function deliverInvitations(socket, room, inviteeIds) {
  if (!Array.isArray(inviteeIds) || !inviteeIds.length) return;
  try {
    const database = await getAuthDatabase();
    const sender = await database.collection("users").findOne({ id: socket.data.userId });
    const friends = new Set(sender?.friends || []);
    const validIds = [...new Set(inviteeIds.filter((id) => typeof id === "string" && friends.has(id)))].slice(0, 100);
    const recipients = await database.collection("users").find({ id: { $in: validIds } }).toArray();
    let delivered = 0;
    for (const recipient of recipients) {
      // Stable message identity prevents duplicate inbox invitations on refresh/reconnect.
      const id = `room-invite:${room.roomId}:${socket.data.userId}:${recipient.id}`;
      const message = { id, senderId: sender.id, senderName: sender.name,
        recipientId: recipient.id, recipientName: recipient.name,
        text: `${sender.name} invited you to join ${room.title || room.roomId}.`,
        roomId: room.roomId, roomTitle: room.title, createdAt: Date.now(), read: false };
      const result = await database.collection("directMessages").updateOne({ _id: id }, { $setOnInsert: message }, { upsert: true });
      if (result.upsertedCount) notifyUser(recipient.id, "direct-message", message);
      delivered++;
    }
    socket.emit("room-invitations", { message: `${delivered} invitation${delivered === 1 ? "" : "s"} delivered to inboxes.${delivered < new Set(inviteeIds).size ? " Some selected friends are no longer available." : ""}` });
  } catch (error) {
    console.error("Room invite delivery failed:", error);
    socket.emit("room-invitations", { message: "Some invitations could not be delivered. Reconnect to retry, or share the invite link." });
  }
}

io.on("connection", (socket) => {
  // Identity comes from the authenticated session, never a client-supplied user ID.
  socket.on("identify", () => {});

  socket.on("create-room", async ({ roomId, name, inviteeIds = [], title, theme }) => {
    try {
      const id = String(roomId || createRoomCode()).toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(id)) return socket.emit("room-error", "Invalid room code.");
      let room = await roomStore.load(id);
      if (!room) {
        room = createRoom(id, socket.id, name || socket.data.accountName, title);
        room.ownerUserId = socket.data.userId;
        room.approvedUserIds = [];
        room.theme = normalizeTheme(theme);
        try {
          await roomStore.save(room, true);
          rooms.set(id, room);
          recordDashboardActivity(socket.data.userId, id, "room-created").catch(console.error);
        } catch (error) {
          if (error.code !== 11000) throw error;
          room = await roomStore.load(id);
          if (!room) throw error;
        }
      }
      if (room.ownerUserId !== socket.data.userId) return socket.emit("room-error", "This room belongs to another host. Use its invite link to request entry.");
      if (!socket.connected) return;
      enterRoom(socket, room, name);
      await deliverInvitations(socket, room, inviteeIds);
    } catch (error) {
      console.error("Room creation failed:", error);
      socket.emit("room-error", "Could not save or open this room. Reconnect to try again.");
    }
  });

  socket.on("join-room", async ({ roomId, name }) => {
    try {
      const id = String(roomId || "").toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(id)) return socket.emit("room-error", "Invalid room code.");
      const room = await roomStore.load(id);
      if (!socket.connected) return;
      if (!room) return socket.emit("room-error", `Room ${id} was not found.`);
      if (room.ownerUserId === socket.data.userId || room.approvedUserIds.includes(socket.data.userId)) {
        enterRoom(socket, room, name);
        return;
      }
      const request = { requestId: socket.id, socketId: socket.id, userId: socket.data.userId,
        name: typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : socket.data.accountName, createdAt: Date.now() };
      if (!room.pendingJoins.some((item) => item.socketId === socket.id)) room.pendingJoins.push(request);
      socket.data.pendingRoomId = id;
      socket.emit("join-request-pending");
      if (room.hostId) io.to(room.hostId).emit("room-join-request", request);
    } catch {
      socket.emit("room-error", "Could not open this room. Reconnect to try again.");
    }
  });

  socket.on("approve-room-join", async ({ requestId }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || room.hostId !== socket.id) return;
    const request = room.pendingJoins.find((item) => item.requestId === requestId);
    const guest = request && io.sockets.sockets.get(request.socketId);
    if (!guest) return;
    try {
      if (!room.approvedUserIds.includes(request.userId)) room.approvedUserIds.push(request.userId);
      await roomStore.save(room);
      room.pendingJoins = room.pendingJoins.filter((item) => item.requestId !== requestId);
      if (!guest.connected) return;
      enterRoom(guest, room, request.name);
      recordDashboardActivity(request.userId, room.roomId, "room-joined").catch(console.error);
    } catch {
      room.approvedUserIds = room.approvedUserIds.filter((id) => id !== request.userId);
      socket.emit("room-error", "Approval could not be saved. Please approve the request again.");
    }
  });

  socket.on("deny-room-join", ({ requestId }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? getRoom(roomId) : null;
    if (!room || room.hostId !== socket.id || typeof requestId !== "string") return;

    const requestIndex = room.pendingJoins.findIndex((request) => request.requestId === requestId);
    if (requestIndex < 0) return;

    const [joinRequest] = room.pendingJoins.splice(requestIndex, 1);
    io.sockets.sockets.get(joinRequest.socketId)?.emit("join-denied");
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

  socket.on("direct-message", async ({ recipientId, text, attachment }) => {
    const senderId = socket.data.userId;
    const normalizedText = typeof text === "string" ? text.trim().slice(0, 1000) : "";
    const safeAttachment = attachment && typeof attachment === "object" && typeof attachment.url === "string" && typeof attachment.name === "string"
      ? {
          name: attachment.name.slice(0, 200),
          url: attachment.url,
          contentType: typeof attachment.contentType === "string" ? attachment.contentType.slice(0, 100) : "application/octet-stream",
          size: Number.isFinite(attachment.size) ? attachment.size : 0,
        }
      : null;
    if (!senderId || typeof recipientId !== "string" || (!normalizedText && !safeAttachment)) return;

    try {
      const database = await getAuthDatabase();
      const [sender, recipient] = await Promise.all([
        database.collection("users").findOne({ id: senderId }, { projection: { name: 1 } }),
        database.collection("users").findOne({ id: recipientId }, { projection: { name: 1 } }),
      ]);
      if (!sender || !recipient) return;

      const message = {
        id: crypto.randomUUID(),
        senderId,
        senderName: sender.name,
        recipientId,
        recipientName: recipient.name,
        text: normalizedText,
        attachment: safeAttachment,
        createdAt: Date.now(),
        read: false,
      };
      await database.collection("directMessages").insertOne(message);
      const targetSockets = [...io.sockets.sockets.values()].filter((connectedSocket) => connectedSocket.data.userId === recipientId);
      socket.emit("direct-message", message);
      targetSockets.forEach((targetSocket) => targetSocket.emit("direct-message", message));
    } catch (error) {
      console.error("Direct message failed:", error);
    }
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

    if (!socket.data.watchStartedAt) {
      socket.data.watchStartedAt = Date.now();
    }

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

    if (socket.data.watchStartedAt) {
      recordDashboardActivity(socket.data.userId, roomId, "watch", {
        durationSeconds: Math.max(0, Math.round((Date.now() - socket.data.watchStartedAt) / 1000)),
      }).catch((error) => console.error("Watch activity record failed:", error));
      socket.data.watchStartedAt = null;
    }

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
    const pendingRoomId = socket.data.pendingRoomId;
    if (pendingRoomId) {
      const pendingRoom = getRoom(pendingRoomId);
      if (pendingRoom) {
        pendingRoom.pendingJoins = pendingRoom.pendingJoins.filter((request) => request.socketId !== socket.id);
      }
    }
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

    if (socket.data.watchStartedAt) {
      recordDashboardActivity(socket.data.userId, roomId, "watch", {
        durationSeconds: Math.max(0, Math.round((Date.now() - socket.data.watchStartedAt) / 1000)),
      }).catch((error) => console.error("Watch activity record failed:", error));
    }

    if (socket.data.roomStartedAt && socket.data.userId) {
      recordDashboardActivity(socket.data.userId, roomId, "room-session", {
        durationSeconds: Math.max(0, Math.round((Date.now() - socket.data.roomStartedAt) / 1000)),
      }).catch((error) => console.error("Room session record failed:", error));
      socket.data.roomStartedAt = null;
    }

    room.users = room.users.filter((user) => user.id !== socket.id);

    if (room.hostId === socket.id) {
      room.hostId = room.users[0]?.id ?? null;
      if (room.hostId) room.pendingJoins.forEach((request) => io.to(room.hostId).emit("room-join-request", request));
    }

    if (room.users.length === 0) {
      room.playback = { ...room.playback, position: room.playback.position + (room.playback.playing ? (Date.now() - room.playback.updatedAt) / 1000 : 0), playing: false, updatedAt: Date.now() };
      roomStore.save(room).then(() => {
        if (!room.users.length && !room.pendingJoins.length) rooms.delete(roomId);
      }).catch((error) => console.error("Room save failed:", error));
      return;
    }

    broadcastRoom(io, roomId);
  });
});

server.listen(PORT, () => {
  console.log(`SyncPlay socket server running on port ${PORT}`);
});
