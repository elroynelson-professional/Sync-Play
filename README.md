# SyncPlay

Watch, talk, and play together. Wherever you are.

## What this is

SyncPlay is a Next.js + Socket.IO prototype for synchronized watch-and-chat rooms. The current build supports:

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

## Test the flow

1. Open the app in one browser window.
2. Enter a name and click `Create room`.
3. Copy the room code from the URL.
4. Open a second browser window or private tab.
5. Enter the same room code and click `Join room`.
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

- The current server keeps room state in memory, so rooms reset when the process restarts.
- Voice and video chat ask each participant for device permission and use WebRTC with a public STUN server. Production deployments should add a TURN relay for users behind restrictive networks.
- Remote media input must be a direct media URL such as MP4, WebM, MP3, WAV, or OGG; a webpage URL is not itself a playable media source. Uploaded files are stored by the realtime server and are temporary in this prototype.
- For production, persist rooms and playback state in a database or shared cache later.
