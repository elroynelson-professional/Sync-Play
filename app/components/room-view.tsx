"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getButtonTextColor } from "../lib/room-colors";
import { socket, socketUrl } from "../lib/socket";
import { FLOATING_PANEL_EVENT, openFloatingPanel, type FloatingPanelName } from "../lib/floating-panel";
import type { ChatMessage, MediaType, PlaybackState, QueueTrack, RoomState } from "../lib/room-types";
import { DirectMediaPlayer } from "./direct-video-player";
import { YouTubePlayer, type YouTubePlayerHandle } from "./youtube-player";
import { VoiceChat } from "./voice-chat";
import { VideoChat } from "./video-chat";

type RoomViewProps = {
  roomId: string;
  initialName: string;
  initialRole: "host" | "guest";
  initialAction: "create" | "join";
  initialTitle?: string;
  theme?: { name?: string; accent?: string; background?: string; buttonColor?: string };
  onLeave?: () => void;
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

export function RoomView({ roomId, initialName, initialAction, initialTitle = "Sykonyx shared room", theme, onLeave }: RoomViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stageView, setStageView] = useState<"playback" | "call">("playback");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [name] = useState(initialName || "Guest");
  const [status, setStatus] = useState("Connecting to room...");
  const [roomError, setRoomError] = useState("");
  const [inputError, setInputError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [failedUpload, setFailedUpload] = useState<File | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [playerAttempt, setPlayerAttempt] = useState(0);
  const [inviteStatus, setInviteStatus] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [manualInvite, setManualInvite] = useState("");
  const [trackInput, setTrackInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [localPosition, setLocalPosition] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isJoinPending, setIsJoinPending] = useState(false);
  const [joinRequests, setJoinRequests] = useState<{ requestId: string; name: string }[]>([]);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const isChatOpenRef = useRef(false);

  const activeTheme = room?.theme ?? theme;
  const roomAccent = activeTheme?.accent ?? "#5eead4";
  const roomBackground = activeTheme?.background ?? "#0f172a";
  const roomButtonColor = activeTheme?.buttonColor ?? activeTheme?.accent ?? "#5eead4";
  const initialTheme = useRef(theme);
  const isHost = Boolean(room && room.hostId === socket.id);
  const reportMediaError = useCallback((message: string) => setMediaError(message), []);
  async function shareInvite(native = false) {
    const url = `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
    try {
      if (native && navigator.share) { await navigator.share({ title: roomTitle, text: "Join my room on Sykonyx", url }); setShareStatus("Invite shared."); }
      else { await navigator.clipboard.writeText(url); setShareStatus("Invite link copied."); }
      setManualInvite("");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setManualInvite(url); setShareStatus("Select and copy the link below.");
    }
  }
  const roomTitle = room?.title || initialTitle || "Sykonyx shared room";

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
    const action = initialAction;
    const title = initialTitle;
    const payload = {
      roomId,
      name,
      title,
      theme: initialTheme.current,
      inviteeIds: (searchParams.get("invitees") || "").split(",").filter(Boolean),
    };

    function handleRoomState(nextRoom: RoomState) {
      setRoom(nextRoom);
      setRoomError("");
      setStatus(nextRoom.users.length > 1 ? "Room active and synced." : "Waiting for another participant...");
      setLocalPosition(derivePosition(nextRoom.playback));
    }

    function handleRoomError(message: string) {
      setRoomError(message);

      if (message.toLowerCase().includes("not found") || message.toLowerCase().includes("invalid")) {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("syncplay-room-error", "Invalid code, try again.");
        }
        router.replace("/dashboard");
      }
    }

    function handleJoinRequestPending() {
      setIsJoinPending(true);
      setStatus("Join request sent. Waiting for the host to approve it...");
    }

    function handleJoinApproved() {
      setIsJoinPending(false);
      setStatus("Room active and synced.");
    }

    function handleJoinDenied() {
      setIsJoinPending(false);
      setStatus("The host declined your request to join this room.");
      window.sessionStorage.setItem("syncplay-room-error", "The host declined your request to join this room.");
      router.replace("/dashboard");
    }

    function handleRoomJoinRequest(request: { requestId: string; name: string }) {
      setJoinRequests((current) => current.some((item) => item.requestId === request.requestId) ? current : [...current, request]);
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
      setJoinRequests([]);
      socket.emit(action === "create" ? "create-room" : "join-room", payload);
    }

    function handleDisconnect() {
      setIsConnected(false);
      setStatus("Connection lost. Trying to reconnect…");
    }

    function handleConnectError(error: Error) {
      setIsConnected(false);
      setRoomError(error.message.includes("sign in") ? "Your session expired. Sign in again to return to this room." : "Unable to connect. Check your connection and try again.");
    }

    function handleInvitations(payload: { message: string }) { setInviteStatus(payload.message); }
    socket.on("room-invitations", handleInvitations);
    socket.on("room-state", handleRoomState);
    socket.on("room-error", handleRoomError);
    socket.on("join-request-pending", handleJoinRequestPending);
    socket.on("join-approved", handleJoinApproved);
    socket.on("join-denied", handleJoinDenied);
    socket.on("room-join-request", handleRoomJoinRequest);
    socket.on("chat-message", handleChatMessage);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("room-invitations", handleInvitations);
      socket.off("room-state", handleRoomState);
      socket.off("room-error", handleRoomError);
      socket.off("join-request-pending", handleJoinRequestPending);
      socket.off("join-approved", handleJoinApproved);
      socket.off("join-denied", handleJoinDenied);
      socket.off("room-join-request", handleRoomJoinRequest);
      socket.off("chat-message", handleChatMessage);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
    };
  }, [initialAction, initialTitle, name, roomId, router, searchParams]);

  function approveJoin(requestId: string) {
    socket.emit("approve-room-join", { requestId });
    setJoinRequests((current) => current.filter((request) => request.requestId !== requestId));
  }

  function denyJoin(requestId: string) {
    socket.emit("deny-room-join", { requestId });
    setJoinRequests((current) => current.filter((request) => request.requestId !== requestId));
  }

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
    setInputError("");
    setMediaError("");
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
      setInputError("Paste a YouTube URL, direct media URL, or upload a local audio/video file.");
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

    if (file) await uploadMedia(file);
  }

  async function uploadMedia(file: File) {
    setUploadError("");
    setFailedUpload(null);
    if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
      setUploadError("Choose an audio or video file to upload.");
      return;
    }

    if (!isConnected || !room) { setUploadError("Reconnect to your room before uploading."); setFailedUpload(file); return; }
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
    } catch (failure) {
      setUploadError(failure instanceof Error ? failure.message : "Could not upload that media file.");
      setFailedUpload(file);
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

  return (
    <div
      className="syncplay-room px-5 py-5 text-white sm:px-6 sm:py-6 lg:px-8 lg:py-8"
      style={{
        "--room-background": roomBackground,
        "--room-accent": roomAccent,
        "--room-button": roomButtonColor,
        "--room-button-text": getButtonTextColor(roomButtonColor),
        background: roomBackground,
      } as CSSProperties}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:gap-8">
        <header
          className="syncplay-panel syncplay-room-header rounded-[28px] px-5 py-5 pr-28 sm:px-6 sm:py-6 sm:pr-32"
          style={{
            borderColor: `${roomAccent}55`,
            boxShadow: `inset 0 0 0 1px ${roomAccent}22`,
            background: roomBackground,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <div className="syncplay-caps text-xs text-slate-400">Room {roomId}</div>
              <h1 className="syncplay-hero-title syncplay-room-title mt-1 text-3xl sm:text-4xl" style={{ color: roomAccent }}>
                {roomTitle}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="syncplay-role-badge rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-200"
                style={{ borderColor: `${roomAccent}66`, background: `${roomAccent}1a`, color: roomAccent }}
              >
                {isHost ? "Host" : "Guest"}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (onLeave) {
                    onLeave();
                    return;
                  }
                  router.push("/dashboard");
                }}
                className="syncplay-button-secondary rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Leave room
              </button>
            </div>
          </div>
        </header>

        <div className="syncplay-panel rounded-2xl px-4 py-3 text-sm" role={roomError ? "alert" : "status"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{roomError || status}</span>
            <div className="flex gap-3">
              {roomError || !isConnected ? <button type="button" className="underline" onClick={() => { setRoomError(""); setStatus("Reconnecting…"); socket.disconnect().connect(); }}>Reconnect</button> : null}
              {roomError.includes("Sign in") ? <a className="underline" href={`/?returnTo=${encodeURIComponent(`/room/${roomId}`)}`}>Sign in again</a> : null}
            </div>
          </div>
        </div>
        {isJoinPending ? (
          <section className="syncplay-panel rounded-[28px] p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/10 text-2xl text-emerald-300">...</div>
            <h2 className="mt-5 text-2xl font-semibold text-white">Waiting for host approval</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Your request was sent. You will enter the room as soon as the host approves it.</p>
            <button
              type="button"
              onClick={() => {
                if (onLeave) {
                  onLeave();
                  return;
                }
                router.push("/dashboard");
              }}
              className="mt-6 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Leave request
            </button>
          </section>
        ) : null}

        {isHost && joinRequests.length > 0 ? (
          <section className="syncplay-panel rounded-[28px] border-emerald-400/20 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="syncplay-caps text-xs text-emerald-300">Join requests</div>
                <h2 className="mt-1 text-xl font-semibold text-white">Approve who enters this room</h2>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">{joinRequests.length} pending</span>
            </div>
            <div className="mt-4 space-y-2">
              {joinRequests.map((request) => (
                <div key={request.requestId} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-sm font-medium text-white">{request.name} wants to join</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => denyJoin(request.requestId)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10">Deny</button>
                    <button type="button" onClick={() => approveJoin(request.requestId)} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-[#03150a] transition hover:bg-emerald-400">Approve</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_340px] lg:gap-8 xl:grid-cols-[minmax(0,1.25fr)_380px]">
            <div className="min-w-0 space-y-6 lg:space-y-8">
              <section className="syncplay-panel syncplay-playback-panel rounded-[28px] p-5 sm:p-6">
                <div hidden={stageView !== "playback"}>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="syncplay-caps text-xs text-slate-400">Playback</div>
                    <h2 className="syncplay-hero-title syncplay-track-title mt-1 text-2xl text-white sm:text-3xl">{playback.title ?? "No video loaded"}</h2>
                  </div>
                  <div className="syncplay-playback-status rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200">
                    {playback.playing ? "Playing" : "Paused"}
                  </div>
                </div>

                {mediaError ? <div role="alert" className="mt-3 rounded-xl border border-rose-400/30 p-3 text-sm">
                  <p>{mediaError}</p>
                  <button type="button" className="mt-2 underline" onClick={() => { setMediaError(""); setPlayerAttempt((value) => value + 1); }}>Retry playback</button>
                  <span className="ml-3">Or load another link or file below.</span>
                </div> : null}
                {inputError ? <p role="alert" className="mt-3 text-sm">{inputError} Edit the media field below to try again.</p> : null}
                {uploadError ? <div role="alert" className="mt-3 text-sm"><p>{uploadError}</p>{failedUpload ? <button type="button" disabled={isUploadingMedia || !isConnected} className="mt-2 underline disabled:opacity-50" onClick={() => void uploadMedia(failedUpload)}>Retry upload</button> : null}</div> : null}
                <div className="syncplay-video-shell mt-4 rounded-[24px] bg-zinc-950 p-3 sm:p-4">
                  {getEffectiveMediaType(playback.mediaType, playback.url) === "audio" ? (
                    <DirectMediaPlayer key={`${playback.trackId}-${playerAttempt}`} ref={playerRef} playback={playback} onPlaybackError={reportMediaError} mediaKind="audio" onTrackEnd={handleTrackEnd} />
                  ) : getEffectiveMediaType(playback.mediaType, playback.url) === "direct" ? (
                    <DirectMediaPlayer key={`${playback.trackId}-${playerAttempt}`} ref={playerRef} playback={playback} onPlaybackError={reportMediaError} onTrackEnd={handleTrackEnd} />
                  ) : (
                    <YouTubePlayer key={`${playback.trackId}-${playerAttempt}`} ref={playerRef} playback={playback} onPlaybackError={reportMediaError} onTrackEnd={handleTrackEnd} />
                  )}

                </div>
                </div>
                <VideoChat roomId={roomId} members={room?.users ?? []} localName={name} isVisible={stageView === "call"} onOpen={() => setStageView("call")} />
                  <div className="syncplay-playback-dock mt-4">
                    <div className="syncplay-transport-bar syncplay-transport-layout">
                    <div className="syncplay-transport-actions" role="group" aria-label="Playback controls">
                    <button
                      type="button"
                      onClick={handlePreviousTrack}
                      disabled={history.length === 0 || !isConnected}
                      aria-label="Previous video"
                      title="Previous video"
                      className="syncplay-transport-button flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ⏮
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkip(-10)}
                      disabled={!playback.videoId || !isConnected}
                      aria-label="Rewind 10 seconds"
                      title="Rewind 10 seconds"
                      className="syncplay-transport-button flex h-10 min-w-12 items-center justify-center rounded-xl px-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      -10s
                    </button>
                    <button
                      type="button"
                      onClick={() => emitPlayback(playback.playing ? "pause" : "play")}
                      disabled={!playback.videoId || !isConnected}
                      aria-label={playback.playing ? "Pause" : "Play"}
                      title={playback.playing ? "Pause" : "Play"}
                      className="syncplay-transport-primary flex h-12 w-12 items-center justify-center rounded-full text-xl text-black transition disabled:cursor-not-allowed disabled:opacity-30"
                      style={{ background: roomButtonColor }}
                    >
                      {playback.playing ? "Ⅱ" : "▶"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSkip(10)}
                      disabled={!playback.videoId || !isConnected}
                      aria-label="Fast forward 10 seconds"
                      title="Fast forward 10 seconds"
                      className="syncplay-transport-button flex h-10 min-w-12 items-center justify-center rounded-xl px-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      +10s
                    </button>
                    <button
                      type="button"
                      onClick={handleNextTrack}
                      disabled={queue.length === 0 || !isConnected}
                      aria-label="Next video"
                      title="Next video"
                      className="syncplay-transport-button flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      ⏭
                    </button>
                    </div>
                <div className="syncplay-view-switch" role="group" aria-label="Main area view">
                  {(["playback", "call"] as const).map((view) => (
                    <button key={view} type="button" aria-pressed={stageView === view} onClick={() => setStageView(view)} className={`syncplay-view-option ${stageView === view ? "is-selected" : ""}`}>
                      {view === "playback" ? "Playback" : "Video call"}
                    </button>
                  ))}
                </div>
                  </div>

                  <div className="syncplay-playback-stats syncplay-dock-stats text-sm text-slate-300">
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
                      disabled={!isConnected || !room}
                      className="syncplay-button-primary rounded-2xl px-4 py-3 font-semibold text-black transition"
                      style={{ background: roomButtonColor }}
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
                      disabled={isUploadingMedia || !isConnected || !room}
                      className="syncplay-input w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-2 file:font-semibold disabled:cursor-not-allowed disabled:opacity-60"
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
                      style={{ background: roomButtonColor, color: "#071711" }}
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
                style={{ borderColor: `${roomAccent}55`, background: isChatOpen ? `${roomAccent}30` : undefined }}
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
                      <span className="syncplay-room-code" style={{ color: roomAccent }}>{roomId}</span>
                    </h2>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void shareInvite()} className="syncplay-button-primary rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: roomButtonColor, color: getButtonTextColor(roomButtonColor) }}>Copy invite link</button>
                  <button type="button" onClick={() => void shareInvite(true)} className="syncplay-button-secondary rounded-xl border px-4 py-2 text-sm">Share invite</button>
                </div>
                <p className="mt-3 text-xs opacity-75">New visitors sign in, then request entry. Approved members can return with this link.</p>
                {shareStatus ? <p role="status" className="mt-2 text-sm">{shareStatus}</p> : null}
                {inviteStatus ? <p role="status" className="mt-2 text-sm">{inviteStatus}</p> : null}
                {manualInvite ? <input aria-label="Invite link" readOnly value={manualInvite} onFocus={(event) => event.target.select()} className="syncplay-input mt-2 w-full rounded-xl p-2" /> : null}
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
      </div>
    </div>
  );
}
