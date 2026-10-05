/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGoogleAuth } = require("./google-auth");

function setup(initial = []) {
  const accounts = structuredClone(initial);
  let payload;
  let invalid = false;
  const users = {
    createIndex: async () => {},
    findOne: async (query) => accounts.find((account) => Object.entries(query).every(([key, value]) => account[key] === value)) || null,
    insertOne: async (user) => accounts.push(user),
    updateOne: async (query, update) => {
      const user = accounts.find((account) => account.id === query.id && !account.googleSub);
      if (!user) return { matchedCount: 0 };
      Object.assign(user, update.$set); return { matchedCount: 1 };
    },
  };
  const auth = createGoogleAuth({ clientId: "test.apps.googleusercontent.com", getDatabase: async () => ({ collection: () => users }), comparePassword: async (password) => password === "correct", verifyIdToken: async (options) => {
    assert.equal(options.audience, "test.apps.googleusercontent.com");
    assert.equal(options.idToken, "signed-token");
    if (invalid) throw new Error("Invalid signature, audience, issuer or expiry");
    return { getPayload: () => payload };
  } });
  const challenge = auth.challenge();
  payload = { sub: "google-user-1", email: "person@example.com", email_verified: true, name: "Google Person", nonce: challenge.nonce };
  return { accounts, auth, challenge, payload, invalidate: () => { invalid = true; }, login: (extra = {}) => auth.authenticate({ cookie: challenge.cookie, credential: "signed-token", ...extra }) };
}

test("Google creates an account once, then identifies it by stable subject", async () => {
  const fixture = setup();
  const first = await fixture.login();
  assert.equal(first.provider, "google"); assert.equal(first.passwordHash, undefined);
  fixture.payload.email = "changed@example.com";
  const second = await fixture.login();
  assert.equal(second.id, first.id); assert.equal(fixture.accounts.length, 1);
});

test("existing password account requires proof before linking and keeps its data", async () => {
  const fixture = setup([{ id: "existing", email: "person@example.com", name: "Original", passwordHash: "hash", friends: ["friend"], roomThemes: [] }]);
  await assert.rejects(fixture.login(), (error) => error.code === "LINK_REQUIRED");
  await assert.rejects(fixture.login({ password: "wrong" }), (error) => error.status === 401);
  assert.equal(fixture.accounts[0].googleSub, undefined);
  const linked = await fixture.login({ password: "correct" });
  assert.equal(linked.id, "existing"); assert.deepEqual(linked.friends, ["friend"]); assert.equal(fixture.accounts.length, 1);
  assert.equal((await fixture.login()).id, "existing");
});

test("invalid Google verification, unverified emails and mismatched browser challenges fail", async () => {
  let fixture = setup(); fixture.invalidate(); await assert.rejects(fixture.login(), (error) => error.status === 401);
  fixture = setup(); fixture.payload.email_verified = false; await assert.rejects(fixture.login(), (error) => error.status === 401);
  fixture = setup(); fixture.payload.nonce = "other-browser"; await assert.rejects(fixture.login(), (error) => error.status === 401);
  fixture = setup(); await assert.rejects(fixture.login({ cookie: undefined }), (error) => error.status === 401);
  await assert.rejects(fixture.login({ cookie: fixture.challenge.cookie + "tampered" }), (error) => error.status === 401);
  assert.equal(fixture.accounts.length, 0);
});

test("matching email never replaces an already linked Google identity", async () => {
  const fixture = setup([{ id: "original", email: "person@example.com", googleSub: "someone-else", passwordHash: "hash" }]);
  await assert.rejects(fixture.login({ password: "correct" }), (error) => error.code === "ACCOUNT_CONFLICT");
  assert.equal(fixture.accounts[0].googleSub, "someone-else");
});
