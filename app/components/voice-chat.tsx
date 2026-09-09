"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";
import { FLOATING_PANEL_EVENT, openFloatingPanel, type FloatingPanelName } from "../lib/floating-panel";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type VoiceChatProps = {
  roomId: string;
};

export function VoiceChat({ roomId }: VoiceChatProps) {
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [peerIds, setPeerIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const remoteAudioRefs = useRef(new Map<string, HTMLAudioElement>());

  const removePeer = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    setPeerIds((current) => current.filter((id) => id !== peerId));
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[peerId];
      return next;
    });
  }, []);

  const flushCandidates = useCallback(async (peerId: string, peer: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(peerId) ?? [];

    for (const candidate of pending) {
      await peer.addIceCandidate(candidate);
    }

    pendingCandidatesRef.current.delete(peerId);
  }, []);

  const createPeer = useCallback((peerId: string) => {
    const existingPeer = peersRef.current.get(peerId);
    if (existingPeer) return existingPeer;

    const peer = new RTCPeerConnection(ICE_SERVERS);
    const localStream = localStreamRef.current;

    localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("voice-ice-candidate", {
          target: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    peer.ontrack = (event) => {
      const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStreams((current) => ({ ...current, [peerId]: remoteStream }));
      setPeerIds((current) => (current.includes(peerId) ? current : [...current, peerId]));
    };

    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        removePeer(peerId);
      }
    };

    peersRef.current.set(peerId, peer);
    setPeerIds((current) => (current.includes(peerId) ? current : [...current, peerId]));
    return peer;
  }, [removePeer]);

  const createOffer = useCallback(async (peerId: string) => {
    const peer = createPeer(peerId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("voice-offer", { target: peerId, offer });
  }, [createPeer]);

  const handleOffer = useCallback(async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
    const peer = createPeer(from);
    await peer.setRemoteDescription(offer);
    await flushCandidates(from, peer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("voice-answer", { target: from, answer });
  }, [createPeer, flushCandidates]);

  const handleAnswer = useCallback(async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
    const peer = peersRef.current.get(from);
    if (!peer) return;

    await peer.setRemoteDescription(answer);
    await flushCandidates(from, peer);
  }, [flushCandidates]);

  const handleIceCandidate = useCallback(async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
    const peer = peersRef.current.get(from);

    if (!peer || !peer.remoteDescription) {
      const pending = pendingCandidatesRef.current.get(from) ?? [];
      pending.push(candidate);
      pendingCandidatesRef.current.set(from, pending);
      return;
    }

    await peer.addIceCandidate(candidate);
  }, []);

  useEffect(() => {
    function handleVoicePeers(peerIdsFromServer: string[]) {
      if (!localStreamRef.current) return;

      peerIdsFromServer.forEach((peerId) => {
        void createOffer(peerId).catch(() => {
          setError("Voice connection could not be established.");
        });
      });
    }

    function handleVoicePeerLeft({ peerId }: { peerId: string }) {
      removePeer(peerId);
    }

    function handleVoiceOffer(payload: { from: string; offer: RTCSessionDescriptionInit }) {
      void handleOffer(payload).catch(() => {
        setError("Voice connection could not be established.");
      });
    }

    function handleVoiceAnswer(payload: { from: string; answer: RTCSessionDescriptionInit }) {
      void handleAnswer(payload).catch(() => {
        setError("Voice connection could not be established.");
      });
    }

    function handleVoiceIceCandidate(payload: { from: string; candidate: RTCIceCandidateInit }) {
      void handleIceCandidate(payload).catch(() => {
        setError("Voice connection could not be established.");
      });
    }

    socket.on("voice-peers", handleVoicePeers);
    socket.on("voice-peer-left", handleVoicePeerLeft);
    socket.on("voice-offer", handleVoiceOffer);
    socket.on("voice-answer", handleVoiceAnswer);
    socket.on("voice-ice-candidate", handleVoiceIceCandidate);

    return () => {
      socket.off("voice-peers", handleVoicePeers);
      socket.off("voice-peer-left", handleVoicePeerLeft);
      socket.off("voice-offer", handleVoiceOffer);
      socket.off("voice-answer", handleVoiceAnswer);
      socket.off("voice-ice-candidate", handleVoiceIceCandidate);
    };
  }, [createOffer, handleAnswer, handleIceCandidate, handleOffer, removePeer]);

  useEffect(() => {
    if (!isJoined) return;

    const peerConnections = peersRef.current;
    const localStream = localStreamRef.current;

    return () => {
      socket.emit("voice-leave");
      peerConnections.forEach((peer) => peer.close());
      peerConnections.clear();
      localStream?.getTracks().forEach((track) => track.stop());
    };
  }, [isJoined]);

  useEffect(() => {
    function handleFloatingPanel(event: Event) {
      const panel = (event as CustomEvent<FloatingPanelName>).detail;
      if (panel !== "voice") {
        setIsVoiceOpen(false);
      }
    }

    window.addEventListener(FLOATING_PANEL_EVENT, handleFloatingPanel);
    return () => window.removeEventListener(FLOATING_PANEL_EVENT, handleFloatingPanel);
  }, []);

  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      const audio = remoteAudioRefs.current.get(peerId);
      if (!audio) return;

      if (audio.srcObject !== stream) {
        audio.srcObject = stream;
      }

      void audio.play().catch(() => {
        setError("Remote audio is blocked. Click the page and try joining voice again.");
      });
    });

    remoteAudioRefs.current.forEach((_, peerId) => {
      if (!remoteStreams[peerId]) {
        remoteAudioRefs.current.delete(peerId);
      }
    });
  }, [remoteStreams]);

  async function joinVoice() {
    if (isJoined) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Voice chat requires a secure connection or localhost.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      if (!socket.connected) {
        stream.getTracks().forEach((track) => track.stop());
        setError("Connect to the room before joining voice chat.");
        return;
      }

      localStreamRef.current = stream;
      setError("");
      setIsJoined(true);
      socket.emit("voice-join", { roomId });
    } catch {
      setError("Microphone permission is required to join voice chat.");
    }
  }

  function leaveVoice() {
    socket.emit("voice-leave");
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setPeerIds([]);
    setRemoteStreams({});
    setIsMuted(false);
    setIsJoined(false);
  }

  function toggleMute() {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }

  function toggleVoicePanel() {
    const nextOpenState = !isVoiceOpen;

    if (nextOpenState) {
      openFloatingPanel("voice");
    }

    setIsVoiceOpen(nextOpenState);
  }

  return (
    <>
      {isVoiceOpen ? (
        <section className="syncplay-panel syncplay-voice-panel syncplay-voice-floating rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="syncplay-caps text-xs text-slate-400">Voice chat</div>
              <h2 className="syncplay-hero-title mt-1 text-2xl text-white">
                {isJoined ? `${peerIds.length + 1} connected` : "Talk together"}
              </h2>
            </div>
            <span className={`syncplay-voice-indicator ${isJoined ? "is-active" : ""}`} aria-hidden="true" />
          </div>

          <div className="mt-4 flex gap-3">
            {!isJoined ? (
              <button type="button" onClick={joinVoice} className="syncplay-button-primary flex-1 rounded-2xl px-4 py-3 text-sm font-semibold">
                Join voice
              </button>
            ) : (
              <>
                <button type="button" onClick={toggleMute} className="syncplay-button-secondary flex-1 rounded-2xl px-4 py-3 text-sm font-semibold">
                  {isMuted ? "Unmute" : "Mute"}
                </button>
                <button type="button" onClick={leaveVoice} className="syncplay-button-secondary flex-1 rounded-2xl px-4 py-3 text-sm font-semibold">
                  Leave voice
                </button>
              </>
            )}
          </div>

          {error ? <p className="syncplay-voice-error mt-3 text-sm">{error}</p> : null}
        </section>
      ) : null}

      <div className="syncplay-voice-audio-container" aria-live="polite">
        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <audio
            key={peerId}
            className="syncplay-voice-audio"
            autoPlay
            playsInline
            ref={(element) => {
              if (element) {
                remoteAudioRefs.current.set(peerId, element);
                element.srcObject = stream;
              } else {
                remoteAudioRefs.current.delete(peerId);
              }
            }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={toggleVoicePanel}
        aria-label={isVoiceOpen ? "Close voice chat" : "Open voice chat"}
        aria-expanded={isVoiceOpen}
        className={`syncplay-voice-launcher ${isVoiceOpen ? "is-active" : ""}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="3" width="8" height="12" rx="4" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
        </svg>
        {isJoined ? <span className="syncplay-voice-launcher-indicator" aria-hidden="true" /> : null}
      </button>
    </>
  );
}
