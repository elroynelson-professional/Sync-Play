/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");

class GoogleAuthError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function createGoogleAuth({ clientId, verifyIdToken, getDatabase, comparePassword, secret = crypto.randomBytes(32) }) {
  const sign = (value) => crypto.createHmac("sha256", secret).update(value).digest("base64url");
  function challenge() {
    const nonce = crypto.randomBytes(32).toString("base64url");
    const body = `${nonce}.${Date.now() + 5 * 60 * 1000}`;
    return { nonce, cookie: `${body}.${sign(body)}` };
  }
  async function authenticate({ cookie, credential, password }) {
    const fail = () => new GoogleAuthError(401, "GOOGLE_INVALID", "Google sign-in expired or could not be verified. Please try again.");
    if (!clientId || typeof cookie !== "string" || typeof credential !== "string" || credential.length > 12000) throw fail();
    const [nonce, expires, signature, extra] = cookie.split(".");
    const expected = sign(`${nonce}.${expires}`);
    if (extra || !/^[A-Za-z0-9_-]{43}$/.test(signature || "") || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) || !Number.isFinite(Number(expires)) || Number(expires) < Date.now()) throw fail();
    let claims;
    try { const ticket = await verifyIdToken({ idToken: credential, audience: clientId }); claims = ticket.getPayload(); } catch { throw fail(); }
    if (typeof claims?.sub !== "string" || !claims.sub || claims.nonce !== nonce || claims.email_verified !== true || typeof claims.email !== "string") throw fail();
    const users = (await getDatabase()).collection("users");
    await users.createIndex({ googleSub: 1 }, { unique: true, sparse: true });
    await users.createIndex({ email: 1 }, { unique: true });
    const existingGoogle = await users.findOne({ googleSub: claims.sub });
    if (existingGoogle) return existingGoogle;
    const email = claims.email.trim().toLowerCase();
    const existingEmail = await users.findOne({ email });
    if (existingEmail) {
      // Never silently attach a new Google identity to an existing account.
      if (existingEmail.googleSub || !existingEmail.passwordHash) throw new GoogleAuthError(409, "ACCOUNT_CONFLICT", "This email belongs to another account. Use its existing sign-in method.");
      if (typeof password !== "string" || !password) throw new GoogleAuthError(409, "LINK_REQUIRED", "An account already uses this email. Enter its password once to connect Google.");
      if (password.length > 1024 || !await comparePassword(password, existingEmail.passwordHash)) throw new GoogleAuthError(401, "LINK_REQUIRED", "That password is incorrect. Try again to connect Google.");
      const result = await users.updateOne({ id: existingEmail.id, googleSub: { $exists: false } }, { $set: { googleSub: claims.sub } });
      if (!result.matchedCount) throw new GoogleAuthError(409, "ACCOUNT_CONFLICT", "The account changed. Please sign in again.");
      return { ...existingEmail, googleSub: claims.sub };
    }
    const user = { id: crypto.randomUUID(), name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 120) : email.split("@")[0], email, googleSub: claims.sub, provider: "google", createdAt: new Date().toISOString(), profileImage: null };
    try { await users.insertOne(user); }
    catch (error) {
      if (error.code !== 11000) throw error;
      const concurrentUser = await users.findOne({ googleSub: claims.sub });
      if (concurrentUser) return concurrentUser;
      throw new GoogleAuthError(409, "ACCOUNT_CONFLICT", "An account was just created with this email. Please sign in again.");
    }
    return user;
  }
  return { challenge, authenticate };
}
module.exports = { createGoogleAuth, GoogleAuthError };
