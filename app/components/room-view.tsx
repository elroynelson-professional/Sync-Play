"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { socket, socketUrl } from "../lib/socket";
import { FLOATING_PANEL_EVENT, openFloatingPanel, type FloatingPanelName } from "../lib/floating-panel";
import type { ChatMessage, MediaType, PlaybackState, QueueTrack, RoomState } from "../lib/room-types";
import { DirectMediaPlayer } from "./direct-video-player";
import { YouTubePlayer, type YouTubePlayerHandle } from "./youtube-player";
import { VoiceChat } from "./voice-chat";
import { VideoChat } from "./video-chat";
import { AdOverlay } from "./ad-overlay";

type RoomViewProps = {
  roomId: string;
  initialName: string;
  initialRole: "host" | "guest";
  initialAction: "create" | "join";
};

function extractYouTubeId(input: string) {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
        return id;
      }
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const videoId = url.searchParams.get("v");
      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return videoId;
      }

      const segments = url.pathname.split("/").filter(Boolean);
      const lastSegment = segments[segments.length - 1];

      if ((segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") && lastSegment && /^[a-zA-Z0-9_-]{11}$/.test(lastSegment)) {
        return lastSegment;
      }
    }
  } catch {
    // Fall through to regex matching for raw IDs or non-URL input.
  }

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function extractDirectMediaUrl(input: string) {
  try {
    const url = new URL(input.trim());

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // The input is not a URL.
  }

  return null;
}

const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"]);

function getUrlMediaType(url: string | null | undefined): MediaType | null {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.replace(/^www\./, "");

    if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) {
      return "youtube";
    }

    const extension = parsedUrl.pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    return extension && AUDIO_EXTENSIONS.has(extension) ? "audio" : "direct";
  } catch {
    return null;
  }
}

function getEffectiveMediaType(mediaType: MediaType | null | undefined, url: string | null | undefined): MediaType {
  if (mediaType === "audio") return "audio";
  if (mediaType === "direct") return "direct";
  return getUrlMediaType(url) ?? "youtube";
}

function createDirectMediaId() {
  return `direct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDirectMediaTitle(url: string, mediaType: MediaType) {
  try {
    const pathname = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (pathname) return decodeURIComponent(pathname).replace(/[-_]+/g, " ");
  } catch {
    // Use the generic label below when the URL cannot be parsed.
  }

  return mediaType === "audio" ? "Remote audio" : "Remote video";
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${remainder}`;
}

function derivePosition(playback: PlaybackState) {
  if (!playback.playing) return playback.position;

  return playback.position + (Date.now() - playback.updatedAt) / 1000;
}

const EMPTY_PLAYBACK: PlaybackState = {
  trackId: null,
  videoId: null,
  title: null,
  url: null,
  mediaType: null,
  position: 0,
  playing: false,
  updatedAt: 0,
};

function getQueueLabel(track: QueueTrack) {
  return track.title || track.videoId;
}

function getThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function RoomView({ roomId, initialName, initialRole, initialAction }: RoomViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [name] = useState(initialName || "Guest");
  const [role] = useState(initialRole);
  const [, setStatus] = useState("Connecting to room...");
  const [trackInput, setTrackInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [localPosition, setLocalPosition] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isAdOpen, setIsAdOpen] = useState(false);
  const [pendingAdAction, setPendingAdAction] = useState<(() => void) | null>(null);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const isChatOpenRef = useRef(false);

  const isHost = role === "host";

  const playback = room?.playback ?? EMPTY_PLAYBACK;
  const queue = room?.queue ?? [];
  const history = room?.history ?? [];
  const messages = room?.messages ?? [];
  const currentTrack = playback.videoId
    ? {
        videoId: playback.videoId,
        title: playback.title ?? playback.videoId,
        url: playback.url,
        mediaType: getEffectiveMediaType(playback.mediaType, playback.url),
        addedBy: playback.playing ? "Now playing" : "Ready to play",
      }
    : null;

  const livePosition = useMemo(() => derivePosition(playback), [playback]);
  useEffect(() => {
    socket.connect();

    function handleRoomState(nextRoom: RoomState) {
      setRoom(nextRoom);
      setStatus(nextRoom.users.length > 1 ? "Room active and synced." : "Waiting for another participant...");
      setLocalPosition(derivePosition(nextRoom.playback));
    }

    function handleRoomError(message: string) {
      setStatus(message);
    }

    function handleChatMessage(nextMessage: ChatMessage) {
      if (!isChatOpenRef.current) {
        setUnreadChatCount((count) => count + 1);
      }

      setRoom((currentRoom) => {
        if (!currentRoom) return currentRoom;

        return {
          ...currentRoom,
          messages: [...(currentRoom.messages ?? []), nextMessage].slice(-100),
        };
      });
    }

    function handleConnect() {
      setIsConnected(true);
    }

    function handleDisconnect() {
      setIsConnected(false);
    }

    function handleConnectError() {
      setIsConnected(false);
      setStatus("Realtime server is offline. Start `npm run dev` or `npm run server`.");
      socket.disconnect();
    }

    socket.on("room-state", handleRoomState);
    socket.on("room-error", handleRoomError);
    socket.on("chat-message", handleChatMessage);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("room-error", handleRoomError);
      socket.off("chat-message", handleChatMessage);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const action = searchParams.get("action") ?? initialAction;

    const payload = {
      roomId,
      name,
    };

    if (action === "create") {
      socket.emit("create-room", payload);
    } else {
      socket.emit("join-room", payload);
    }
  }, [initialAction, name, roomId, searchParams]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLocalPosition(derivePosition(playback));
    }, 500);

    return () => window.clearInterval(timer);
  }, [playback]);

  useEffect(() => {
    const chatList = chatListRef.current;
    if (chatList) {
      chatList.scrollTop = chatList.scrollHeight;
    }
  }, [isChatOpen, messages.length]);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  useEffect(() => {
    function handleFloatingPanel(event: Event) {
      const panel = (event as CustomEvent<FloatingPanelName>).detail;
      if (panel !== "chat") {
        setIsChatOpen(false);
      }
    }

    window.addEventListener(FLOATING_PANEL_EVENT, handleFloatingPanel);
    return () => window.removeEventListener(FLOATING_PANEL_EVENT, handleFloatingPanel);
  }, []);

  function emitPlayback(eventName: "play" | "pause" | "seek") {
    if (eventName === "play") {
      playerRef.current?.play();
    } else if (eventName === "pause") {
      playerRef.current?.pause();
    } else {
      playerRef.current?.seek(localPosition);
    }

    socket.emit(eventName, {
      position: localPosition,
    });
  }

  function addVideoToRoom({
    videoId,
    title,
    url,
    mediaType,
  }: {
    videoId: string;
    title: string;
    url: string | null;
    mediaType: MediaType;
  }) {
    const hasActiveVideo = Boolean(playback.videoId);

    socket.emit(hasActiveVideo ? "enqueue-track" : "change-track", {
      videoId,
      title,
      url,
      mediaType,
    });

    return hasActiveVideo;
  }

  function handleLoadTrack() {
    const input = trackInput.trim();
    const youtubeId = extractYouTubeId(input);
    const directUrl = youtubeId ? null : extractDirectMediaUrl(input);

    if (!youtubeId && !directUrl) {
      setStatus("Paste a YouTube URL, direct media URL, or upload a local audio/video file.");
      return;
    }

    const videoId = youtubeId ?? createDirectMediaId();
    const mediaType: MediaType = youtubeId ? "youtube" : getUrlMediaType(directUrl) === "audio" ? "audio" : "direct";
    const title = youtubeId ? `YouTube video ${youtubeId}` : getDirectMediaTitle(directUrl ?? input, mediaType);
    const hasActiveVideo = addVideoToRoom({
      videoId,
      title,
      url: youtubeId ? input : directUrl,
      mediaType,
    });

    setTrackInput("");
    setStatus(hasActiveVideo ? `Queued ${title}. It will play after the current video ends.` : `Loaded ${title} into room ${roomId}.`);
  }

  async function handleLocalMediaUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
      setStatus("Choose an audio or video file to upload.");
      return;
    }

    setIsUploadingMedia(true);

    try {
      const response = await fetch(`${socketUrl.replace(/\/$/, "")}/uploads`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
          "X-Room-Id": roomId,
        },
        body: file,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || typeof payload.url !== "string") {
        throw new Error(typeof payload.error === "string" ? payload.error : "Upload failed.");
      }

      const mediaType: MediaType = file.type.startsWith("audio/") ? "audio" : "direct";
      const hasActiveVideo = addVideoToRoom({
        videoId: createDirectMediaId(),
        title: file.name,
        url: payload.url,
        mediaType,
      });

      setStatus(hasActiveVideo ? `Queued ${file.name}. It will play after the current video ends.` : `Loaded ${file.name} into room ${roomId}.`);
    } catch (uploadError) {
      setStatus(uploadError instanceof Error ? uploadError.message : "Could not upload that media file.");
    } finally {
      setIsUploadingMedia(false);
    }
  }

  function handleTrackEnd(trackId: string) {
    if (playback.trackId) {
      socket.emit("track-ended", { trackId, videoId: playback.videoId });
      return;
    }

    // This fallback lets a room created by an older server version keep
    // advancing until its Socket.IO process is restarted.
    if (isHost) {
      socket.emit("advance-queue");
    }
  }

  function handleSkip(seconds: number) {
    const nextPosition = Math.max(0, derivePosition(playback) + seconds);

    setLocalPosition(nextPosition);
    playerRef.current?.seek(nextPosition);
    socket.emit("seek", { position: nextPosition });
  }

  function handleNextTrack() {
    if (queue.length > 0) {
      socket.emit("advance-queue");
    }
  }

  function handlePreviousTrack() {
    if (history.length > 0) {
      socket.emit("previous-track");
    }
  }

  function handleSendChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatInput.trim();

    if (!text || !isConnected) return;

    socket.emit("send-chat-message", { text });
    setChatInput("");
  }

  function formatChatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function toggleChat() {
    const nextOpenState = !isChatOpen;

    if (nextOpenState) {
      openFloatingPanel("chat");
    }

    setIsChatOpen(nextOpenState);
    if (nextOpenState) {
      setUnreadChatCount(0);
    }
  }

  function triggerAd(action: () => void) {
    setPendingAdAction(() => action);
    setIsAdOpen(true);
  }

  function handleAdComplete() {
    const nextAction = pendingAdAction;
    setPendingAdAction(null);
    setIsAdOpen(false);
    nextAction?.();
  }

  return (
    <main className="syncplay-room px-5 py-5 text-white sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <AdOverlay
        isOpen={isAdOpen}
        onSkip={handleAdComplete}
      />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:gap-8">
        <header className="syncplay-panel syncplay-room-header rounded-[28px] px-5 py-5 pr-28 sm:px-6 sm:py-6 sm:pr-32">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="syncplay-caps text-xs text-slate-400">Room {roomId}</div>
              <h1 className="syncplay-hero-title mt-1 text-3xl text-white sm:text-4xl">
                SyncPlay shared room
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="syncplay-role-badge rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200">
                {role === "host" ? "Host" : "Guest"}
              </span>
              <button
                type="button"
                onClick={() => triggerAd(() => router.push("/"))}
                disabled={isAdOpen}
                className="syncplay-button-secondary rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Leave room
              </button>
            </div>
          </div>
        </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_340px] lg:gap-8 xl:grid-cols-[minmax(0,1.25fr)_380px]">
            <div className="space-y-6 lg:space-y-8">
              <section className="syncplay-panel syncplay-playback-panel rounded-[28px] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="syncplay-caps text-xs text-slate-400">Playback</div>
                    <h2 className="syncplay-hero-title syncplay-track-title mt-1 text-2xl text-white sm:text-3xl">{playback.title ?? "No video loaded"}</h2>
                  </div>
                  <div className="syncplay-playback-status rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                    {playback.playing ? "Playing" : "Paused"}
                  </div>
                </div>

                <div className="syncplay-video-shell mt-4 rounded-[24px] bg-zinc-950 p-3 sm:p-4">
                  {getEffectiveMediaType(playback.mediaType, playback.url) === "audio" ? (
                    <DirectMediaPlayer ref={playerRef} playback={playback} mediaKind="audio" onTrackEnd={handleTrackEnd} />
                  ) : getEffectiveMediaType(playback.mediaType, playback.url) === "direct" ? (
                    <DirectMediaPlayer ref={playerRef} playback={playback} onTrackEnd={handleTrackEnd} />
                  ) : (
                    <YouTubePlayer ref={playerRef} playback={playback} onTrackEnd={handleTrackEnd} />
                  )}

                  <div className="syncplay-transport-bar mt-3 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
                    <button
                      type="button"
                      onClick={handlePreviousTrack}
                      disabled={history.length === 0}
                      aria-label="Previous video"
                      title="Previous video"
                      className="syncplay-transport-button flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ⏮
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkip(-10)}
                      disabled={!playback.videoId}
                      aria-label="Rewind 10 seconds"
                      title="Rewind 10 seconds"
                      className="syncplay-transport-button flex h-10 min-w-12 items-center justify-center rounded-xl px-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      -10s
                    </button>
                    <button
                      type="button"
                      onClick={() => emitPlayback(playback.playing ? "pause" : "play")}
                      disabled={!playback.videoId}
                      aria-label={playback.playing ? "Pause" : "Play"}
                      title={playback.playing ? "Pause" : "Play"}
                      className="syncplay-transport-primary flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-xl text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {playback.playing ? "Ⅱ" : "▶"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkip(10)}
                      disabled={!playback.videoId}
                      aria-label="Fast forward 10 seconds"
                      title="Fast forward 10 seconds"
                      className="syncplay-transport-button flex h-10 min-w-12 items-center justify-center rounded-xl px-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      +10s
                    </button>
                    <button
                      type="button"
                      onClick={handleNextTrack}
                      disabled={queue.length === 0}
                      aria-label="Next video"
                      title="Next video"
                      className="syncplay-transport-button flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ⏭
                    </button>
                  </div>

                  <div className="syncplay-playback-stats mt-4 flex flex-wrap gap-6 text-sm text-slate-300">
                    <div>
                      <div className="syncplay-stat-label syncplay-caps text-[10px] text-slate-400">Position</div>
                      <div className="syncplay-stat-value mt-1 font-semibold text-white">{formatTime(livePosition)}</div>
                    </div>
                    <div>
                      <div className="syncplay-stat-label syncplay-caps text-[10px] text-slate-400">Participants</div>
                      <div className="syncplay-stat-value mt-1 font-semibold text-white">{room?.users.length ?? 0}</div>
                    </div>
                    <div>
                      <div className="syncplay-stat-label syncplay-caps text-[10px] text-slate-400">Connection</div>
                      <div className={`mt-1 font-semibold ${isConnected ? "text-emerald-300" : "text-zinc-300"}`}>
                        {isConnected ? "Live" : "Offline"}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="syncplay-panel syncplay-controls-panel rounded-[28px] p-5 sm:p-6">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Controls</div>
                <div className="mt-5 space-y-5">
                  <label className="block space-y-2">
                    <span className="text-sm text-slate-200">Add a media URL</span>
                    <input
                      value={trackInput}
                      onChange={(event) => setTrackInput(event.target.value)}
                      placeholder="YouTube, MP4, WebM, or MP3 URL"
                      className="syncplay-input w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/30"
                    />
                  </label>

                  <div className="grid gap-4">
                    <button
                      type="button"
                      onClick={handleLoadTrack}
                      className="syncplay-button-primary rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-black transition hover:bg-emerald-400"
                    >
                      {playback.videoId ? "Add to queue" : "Load first video"}
                    </button>
                  </div>

                  <label className="syncplay-upload-field block space-y-2">
                    <span className="text-sm text-slate-200">Upload local audio or video</span>
                    <input
                      type="file"
                      accept="video/*,audio/*"
                      onChange={handleLocalMediaUpload}
                      disabled={isUploadingMedia}
                      className="syncplay-input w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:font-semibold file:text-black disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <span className="syncplay-upload-help block text-xs leading-5 text-slate-400">
                      {isUploadingMedia ? "Uploading media..." : "Maximum upload size: 500 MB."}
                    </span>
                  </label>

                  <p className="syncplay-upload-help text-sm leading-6 text-slate-400">
                    Remote links must point directly to a playable media file. A normal webpage URL cannot be loaded as audio or video.
                  </p>

                  <p className="text-sm leading-6 text-slate-400">Use the transport controls under the player to control playback.</p>

                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="syncplay-panel syncplay-playlist-panel rounded-[28px] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Queue</div>
                  {queue.length > 0 ? (
                    <span className="rounded-full bg-white/6 px-3 py-1 text-[11px] text-slate-300">{queue.length} queued</span>
                  ) : null}
                </div>
                <div className="syncplay-playlist mt-4 divide-y divide-white/8 rounded-2xl bg-white/5">
                  {currentTrack ? (
                    <div className="syncplay-track-item flex items-center gap-4 px-4 py-4">
                      <div className="flex w-5 shrink-0 justify-center text-emerald-300">
                        <div className="h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-emerald-300" />
                      </div>
                      {currentTrack.mediaType === "youtube" ? (
                        <Image
                          src={getThumbnailUrl(currentTrack.videoId)}
                          alt={currentTrack.title}
                          width={112}
                          height={64}
                          className="h-16 w-28 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="syncplay-video-thumbnail flex h-16 w-28 shrink-0 items-center justify-center rounded-xl text-2xl" aria-hidden="true">
                          {currentTrack.mediaType === "audio" ? "♫" : "▶"}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-semibold leading-5 text-white">{currentTrack.title}</div>
                        <div className="mt-1 text-sm text-emerald-200">{currentTrack.addedBy}</div>
                      </div>
                    </div>
                  ) : null}

                  {queue.length > 0 ? (
                    <div className="px-4 pb-2 pt-4 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      Up next
                    </div>
                  ) : null}

                  {queue.map((track, index) => (
                    <div
                      className="syncplay-track-item flex items-center gap-4 px-4 py-4"
                      key={track.trackId || `${track.videoId}-${index}`}
                    >
                      <div className="flex w-5 shrink-0 justify-center text-sm text-slate-500">{index + 1}</div>
                      {getEffectiveMediaType(track.mediaType, track.url) === "youtube" ? (
                        <Image
                          src={getThumbnailUrl(track.videoId)}
                          alt={getQueueLabel(track)}
                          width={112}
                          height={64}
                          className="h-16 w-28 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="syncplay-video-thumbnail flex h-16 w-28 shrink-0 items-center justify-center rounded-xl text-2xl" aria-hidden="true">
                          {getEffectiveMediaType(track.mediaType, track.url) === "audio" ? "♫" : "▶"}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm font-semibold leading-5 text-white">{getQueueLabel(track)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                          <span>Added by {track.addedBy}</span>
                          <span className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-slate-300">
                            Queued
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {!currentTrack && queue.length === 0 ? <p className="mt-4 text-sm text-slate-400">No videos in the queue yet.</p> : null}
              </section>

              {isChatOpen ? (
                <section className="syncplay-panel syncplay-chat-panel syncplay-chat-floating rounded-[28px] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Live chat</div>
                    <span className="rounded-full bg-white/6 px-3 py-1 text-[11px] text-slate-300">
                      {messages.length} messages
                    </span>
                  </div>

                  <div ref={chatListRef} className="syncplay-chat-list mt-4 rounded-2xl bg-white/5 p-3" aria-live="polite">
                    {messages.length === 0 ? (
                      <p className="syncplay-chat-empty px-2 py-5 text-center text-sm text-slate-400">
                        Start the conversation.
                      </p>
                    ) : (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className={`syncplay-chat-message ${message.userId === socket.id ? "syncplay-chat-message-own" : ""}`}
                        >
                          <div className="syncplay-chat-meta">
                            <span>{message.name}</span>
                            <time dateTime={new Date(message.createdAt).toISOString()}>{formatChatTime(message.createdAt)}</time>
                          </div>
                          <p>{message.text}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <form className="syncplay-chat-form mt-3" onSubmit={handleSendChat}>
                    <input
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value.slice(0, 500))}
                      placeholder="Write a message..."
                      maxLength={500}
                      className="syncplay-input min-w-0 flex-1 rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-white/30"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || !isConnected}
                      className="syncplay-button-primary rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send
                    </button>
                  </form>
                </section>
              ) : null}

              <button
                type="button"
                onClick={toggleChat}
                aria-label={isChatOpen ? "Close live chat" : "Open live chat"}
                aria-expanded={isChatOpen}
                className={`syncplay-chat-launcher ${isChatOpen ? "is-active" : ""}`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3l4 4 4-4h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" />
                  <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none" />
                  <circle cx="16" cy="11" r="1" fill="currentColor" stroke="none" />
                </svg>
                {unreadChatCount > 0 ? <span className="syncplay-chat-count">{unreadChatCount > 99 ? "99+" : unreadChatCount}</span> : null}
              </button>

              <section className="syncplay-panel syncplay-invite-panel rounded-[28px] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="syncplay-caps text-xs text-slate-400">Invite</div>
                    <h2 className="syncplay-hero-title mt-1 text-2xl text-white">
                      <span>Room code </span>
                      <span className="syncplay-room-code">{roomId}</span>
                    </h2>
                  </div>
                </div>
              </section>

              <section className="syncplay-panel syncplay-members-panel rounded-[28px] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="syncplay-caps text-xs text-slate-400">Room members</div>
                    <h2 className="syncplay-hero-title mt-1 text-2xl text-white">{room?.users.length ?? 0} connected</h2>
                  </div>
                  <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-slate-300">
                    {isHost ? "Host" : "Guest"}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {(room?.users ?? [{ id: "pending", name }]).map((member) => (
                    <div key={member.id} className="flex items-center justify-between py-2">
                      <div>
                        <div className="font-semibold text-white">{member.name}</div>
                        <div className="text-sm text-slate-400">{member.id === room?.hostId ? "Host" : "Participant"}</div>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    </div>
                  ))}
                </div>
              </section>

              <section className="syncplay-panel syncplay-flow-panel rounded-[28px] p-5 sm:p-6">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Room flow</div>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <p>1. Create or join a room</p>
                  <p>2. Host loads a YouTube video</p>
                  <p>3. Playback and conversation stay together</p>
                </div>
              </section>
            </aside>
          </div>
          <VoiceChat roomId={roomId} />
          <VideoChat roomId={roomId} />
      </div>
    </main>
  );
}
