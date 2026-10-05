# Sykonyx

Watch, talk, and play together. Wherever you are.

## What this is

Sykonyx is a Next.js + Socket.IO prototype for synchronized watch-and-chat rooms. The current build supports:

- Creating and joining private rooms
- Shared YouTube playback state
- Direct audio/video URLs and local audio/video uploads (up to 500 MB)
- Shared room presence
- Optional peer-to-peer voice chat with mute/leave controls
- Optional peer-to-peer video chat with camera and microphone controls
- A landing page and room view

## Run locally

Open two terminals in `/Users/professional/syncplay`:

```bash
npm run server
```

```bash
npm run dev
```

Then open `http://localhost:3000`.

For local authentication, copy `.env.example` to `.env`, fill in your MongoDB Atlas and Resend values, then restart `npm run server`. The `.env` file is ignored by Git and must never be committed.

## Test the flow

1. Open the app in one browser window.
2. Sign in, open `Create room`, enter a title and display name, and choose your custom colors.
3. Click `Copy invite link` in the room.
4. Open a second browser window or private tab.
5. Open the invite link, sign in with a second account, and approve the request from the host’s window.
6. Use the room controls to load a YouTube URL, direct media URL, or local audio/video file.

## Make it live

To publish SyncPlay on the internet, deploy the two parts separately:

- Frontend: Next.js app
- Realtime server: `server/index.js`

Set this environment variable in the frontend deployment:

```bash
NEXT_PUBLIC_SOCKET_URL=https://your-socket-server.example.com
```

The Socket.IO server also needs a public URL and must allow cross-origin traffic from the frontend.

### Authentication environment variables

The server-backed authentication flow uses MongoDB Atlas and Resend. Configure these variables on the realtime server (Render):

```bash
MONGODB_URI=mongodb+srv://...
MONGODB_DB=syncplay
RESEND_API_KEY=re_...
EMAIL_FROM=onboarding@resend.dev
CONTACT_EMAIL=you@example.com
FRONTEND_ORIGIN=https://sync-play-blue.vercel.app
NODE_ENV=production
```

For initial Resend testing, `onboarding@resend.dev` can only send to the email address associated with your Resend account. Verify a domain in Resend to send OTPs to other recipients, then use an address on that verified domain for `EMAIL_FROM`.

Signup sends a six-digit email verification code through Gmail. Codes expire after ten minutes and accounts cannot be created until the code is verified.

### Simple deployment layout

- Deploy the Next.js app to Vercel or similar.
- Deploy the Socket.IO server to Render, Railway, Fly.io, or another Node host.
- Point `NEXT_PUBLIC_SOCKET_URL` at the realtime server.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run server
```

## Notes

- MongoDB stores room identities, owners, approved members, colors, queues, and playback snapshots. Rooms survive an empty session or restart; restored playback is paused. Returning approved members can rejoin without another approval. The owner regains host controls when returning.
- Voice and video chat ask each participant for device permission and use WebRTC with a public STUN server. Production deployments should add a TURN relay for users behind restrictive networks.
- Remote media input must be a direct media URL such as MP4, WebM, MP3, WAV, or OGG; a webpage URL is not itself a playable media source. Uploaded files are stored by the realtime server and are temporary in this prototype.
- Live Socket.IO presence remains in one server process. Multiple realtime replicas require a shared adapter and coordinated room state. Uploaded files still require durable disk/object storage to survive deployment.
- Custom themes are saved to the signed-in account (up to eight); legacy browser themes migrate once. Room colors are distributed by the server.
- Rooms start immediately. Scheduling/reminders are not implemented, so the scheduling field is hidden.
- Realtime connections require the session cookie. Set `FRONTEND_ORIGINS` to a comma-separated list of exact frontend origins, or `FRONTEND_ORIGIN` for one origin. Both HTTP and Socket.IO use this allowlist with credentials.

Run isolated room-flow tests with `node --test server/*.test.js`. They exercise the real HTTP/Socket.IO handlers with an in-memory MongoDB substitute; they do not touch production accounts or messages.

## Google sign-in setup

1. In [Google Auth Platform](https://console.cloud.google.com/auth/clients), select or create a project. Configure the consent screen's branding, audience, and contact email. For an External app in Testing mode, add your test accounts.
2. Create an OAuth client with application type **Web application**. Add the exact frontend URLs to **Authorized JavaScript origins**: `https://www.sykonyx.com`, `https://sykonyx.com` if used, and `http://localhost:3000` for development. Origins have no path or trailing slash. Add `http://127.0.0.1:3000` only if you use it locally.
3. Set `GOOGLE_CLIENT_ID` on the realtime backend to the generated `...apps.googleusercontent.com` client ID and restart/redeploy it. Set the same value in your ignored local `.env` for local testing. No client secret, redirect URI, or frontend build variable is required for this Google Identity Services popup flow.
4. Ensure `FRONTEND_ORIGINS` includes those frontend origins. Test the Google button from an authorized frontend origin with cookies enabled. To allow the general public, complete Google's publishing/verification requirements shown in your console.

The backend verifies Google's signature, audience, issuer, expiry, verified email, and a signed browser-bound nonce. It then issues the existing HttpOnly session cookie. Accounts are identified by Google's stable `sub`; matching password accounts must confirm their password once before linking. No Google access/refresh tokens are stored. Invite destinations are preserved after sign-in.

Run `node --test server/*.test.js` for isolated authentication and room-flow tests. Real Google account selection requires a configured client ID and authorized origin; automated tests mock the Google verifier rather than contacting Google.
