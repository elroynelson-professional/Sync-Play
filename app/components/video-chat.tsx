"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "../lib/socket";
import { FLOATING_PANEL_EVENT, openFloatingPanel, type FloatingPanelName } from "../lib/floating-panel";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type VideoChatProps = {
  roomId: string;
};

type VideoOffer = {
  from: string;
  offer: RTCSessionDescriptionInit;
};

type VideoAnswer = {
  from: string;
  answer: RTCSessionDescriptionInit;
};

type VideoIceCandidate = {
  from: string;
  candidate: RTCIceCandidateInit;
};

export function VideoChat({ roomId }: VideoChatProps) {
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [peerIds, setPeerIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const pendingCandidatesRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRefs = useRef(new Map<string, HTMLVideoElement>());

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
        socket.emit("video-ice-candidate", {
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
    socket.emit("video-offer", { target: peerId, offer });
  }, [createPeer]);

  const handleOffer = useCallback(async ({ from, offer }: VideoOffer) => {
    const peer = createPeer(from);
    await peer.setRemoteDescription(offer);
    await flushCandidates(from, peer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("video-answer", { target: from, answer });
  }, [createPeer, flushCandidates]);

  const handleAnswer = useCallback(async ({ from, answer }: VideoAnswer) => {
    const peer = peersRef.current.get(from);
    if (!peer) return;

    await peer.setRemoteDescription(answer);
    await flushCandidates(from, peer);
  }, [flushCandidates]);

  const handleIceCandidate = useCallback(async ({ from, candidate }: VideoIceCandidate) => {
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
    function handleVideoPeers(peerIdsFromServer: string[]) {
      if (!localStreamRef.current) return;

      peerIdsFromServer.forEach((peerId) => {
        void createOffer(peerId).catch(() => {
          setError("Video connection could not be established.");
        });
      });
    }

    function handleVideoPeerLeft({ peerId }: { peerId: string }) {
      removePeer(peerId);
    }

    function handleVideoOffer(payload: VideoOffer) {
      void handleOffer(payload).catch(() => {
        setError("Video connection could not be established.");
      });
    }

    function handleVideoAnswer(payload: VideoAnswer) {
      void handleAnswer(payload).catch(() => {
        setError("Video connection could not be established.");
      });
    }

    function handleVideoIceCandidate(payload: VideoIceCandidate) {
      void handleIceCandidate(payload).catch(() => {
        setError("Video connection could not be established.");
      });
    }

    socket.on("video-peers", handleVideoPeers);
    socket.on("video-peer-left", handleVideoPeerLeft);
    socket.on("video-offer", handleVideoOffer);
    socket.on("video-answer", handleVideoAnswer);
    socket.on("video-ice-candidate", handleVideoIceCandidate);

    return () => {
      socket.off("video-peers", handleVideoPeers);
      socket.off("video-peer-left", handleVideoPeerLeft);
      socket.off("video-offer", handleVideoOffer);
      socket.off("video-answer", handleVideoAnswer);
      socket.off("video-ice-candidate", handleVideoIceCandidate);
    };
  }, [createOffer, handleAnswer, handleIceCandidate, handleOffer, removePeer]);

  useEffect(() => {
    if (!isJoined) return;

    const peerConnections = peersRef.current;
    const localStream = localStreamRef.current;

    return () => {
      socket.emit("video-leave");
      peerConnections.forEach((peer) => peer.close());
      peerConnections.clear();
      localStream?.getTracks().forEach((track) => track.stop());
    };
  }, [isJoined]);

  useEffect(() => {
    function handleFloatingPanel(event: Event) {
      const panel = (event as CustomEvent<FloatingPanelName>).detail;
      if (panel !== "video") {
        setIsVideoOpen(false);
      }
    }

    window.addEventListener(FLOATING_PANEL_EVENT, handleFloatingPanel);
    return () => window.removeEventListener(FLOATING_PANEL_EVENT, handleFloatingPanel);
  }, []);

  useEffect(() => {
    const localVideo = localVideoRef.current;
    if (localVideo && localStreamRef.current) {
      localVideo.srcObject = localStreamRef.current;
      void localVideo.play().catch(() => undefined);
    }

    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      const video = remoteVideoRefs.current.get(peerId);
      if (!video) return;

      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }

      void video.play().catch(() => {
        setError("Remote video is blocked. Click the page and try joining video again.");
      });
    });

    remoteVideoRefs.current.forEach((_, peerId) => {
      if (!remoteStreams[peerId]) {
        remoteVideoRefs.current.delete(peerId);
      }
    });
  }, [isVideoOpen, remoteStreams]);

  async function joinVideo() {
    if (isJoined) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Video chat requires a secure connection or localhost.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: {
          facingMode: "user",
          height: { ideal: 720 },
          width: { ideal: 1280 },
        },
      });

      if (!socket.connected) {
        stream.getTracks().forEach((track) => track.stop());
        setError("Connect to the room before joining video chat.");
        return;
      }

      localStreamRef.current = stream;
      setError("");
      setIsJoined(true);
      socket.emit("video-join", { roomId });
    } catch {
      setError("Camera and microphone permission is required to join video chat.");
    }
  }

  function leaveVideo() {
    socket.emit("video-leave");
    peersRef.current.forEach((peer) => peer.close());
    peersRef.current.clear();
    pendingCandidatesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setPeerIds([]);
    setRemoteStreams({});
    setIsMuted(false);
    setIsCameraOff(false);
    setIsJoined(false);
  }

  function toggleMute() {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }

  function toggleCamera() {
    const nextCameraOff = !isCameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    setIsCameraOff(nextCameraOff);
  }

  function toggleVideoPanel() {
    const nextOpenState = !isVideoOpen;

    if (nextOpenState) {
      openFloatingPanel("video");
    }

    setIsVideoOpen(nextOpenState);
  }

  return (
    <>
      {isVideoOpen ? (
        <section className="syncplay-panel syncplay-video-panel syncplay-video-floating rounded-[28px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="syncplay-caps text-xs text-slate-400">Video chat</div>
              <h2 className="syncplay-hero-title mt-1 text-2xl text-white">
                {isJoined ? `${peerIds.length + 1} connected` : "See each other"}
              </h2>
            </div>
            <span className={`syncplay-video-indicator ${isJoined ? "is-active" : ""}`} aria-hidden="true" />
          </div>

          {isJoined ? (
            <div className="syncplay-video-grid mt-4">
              <div className="syncplay-video-tile syncplay-video-tile-local">
                <video
                  ref={(element) => {
                    localVideoRef.current = element;
                    if (element && localStreamRef.current) {
                      element.srcObject = localStreamRef.current;
                    }
                  }}
                  autoPlay
                  muted
                  playsInline
                />
                <span>You</span>
              </div>
              {Object.entries(remoteStreams).map(([peerId, stream]) => (
                <div className="syncplay-video-tile" key={peerId}>
                  <video
                    ref={(element) => {
                      if (element) {
                        remoteVideoRefs.current.set(peerId, element);
                        element.srcObject = stream;
                      } else {
                        remoteVideoRefs.current.delete(peerId);
                      }
                    }}
                    autoPlay
                    playsInline
                  />
                  <span>Participant</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="syncplay-video-empty mt-4">Join video to turn on your camera and microphone.</p>
          )}

          <div className="mt-4 flex gap-3">
            {!isJoined ? (
              <button type="button" onClick={joinVideo} className="syncplay-button-primary flex-1 rounded-2xl px-4 py-3 text-sm font-semibold">
                Join video
              </button>
            ) : (
              <>
                <button type="button" onClick={toggleMute} className="syncplay-button-secondary flex-1 rounded-2xl px-3 py-3 text-sm font-semibold">
                  {isMuted ? "Unmute" : "Mute"}
                </button>
                <button type="button" onClick={toggleCamera} className="syncplay-button-secondary flex-1 rounded-2xl px-3 py-3 text-sm font-semibold">
                  {isCameraOff ? "Camera on" : "Camera off"}
                </button>
                <button type="button" onClick={leaveVideo} className="syncplay-button-secondary flex-1 rounded-2xl px-3 py-3 text-sm font-semibold">
                  Leave
                </button>
              </>
            )}
          </div>

          {error ? <p className="syncplay-video-error mt-3 text-sm">{error}</p> : null}
        </section>
      ) : null}

      <button
        type="button"
        onClick={toggleVideoPanel}
        aria-label={isVideoOpen ? "Close video chat" : "Open video chat"}
        aria-expanded={isVideoOpen}
        className={`syncplay-video-launcher ${isVideoOpen ? "is-active" : ""}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="13" height="12" rx="2" />
          <path d="m16 10 5-3v10l-5-3z" />
        </svg>
        {isJoined ? <span className="syncplay-video-launcher-indicator" aria-hidden="true" /> : null}
      </button>
    </>
  );
}
