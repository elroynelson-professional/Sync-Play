"use client";

import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { PlaybackState } from "../lib/room-types";

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: YouTubePlayerOptions) => YouTubePlayerInstance;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YouTubePlayerInstance = {
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

type YouTubePlayerOptions = {
  videoId: string | null;
  width: string;
  height: string;
  playerVars: {
    autoplay: 0 | 1;
    controls: 0 | 1;
    disablekb: 0 | 1;
    fs: 0 | 1;
    origin: string;
    rel: 0 | 1;
    modestbranding: 0 | 1;
    playsinline: 0 | 1;
  };
  events: {
    onReady: () => void;
    onStateChange: (event: { data: number }) => void;
  };
};

type YouTubePlayerProps = {
  playback: PlaybackState;
  onTrackEnd?: (trackId: string) => void;
};

export type YouTubePlayerHandle = {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
};

function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.resolve(null);

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  return new Promise<NonNullable<Window["YT"]>>((resolve) => {
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');

    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT) {
        resolve(window.YT);
      }
    };

    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function getExpectedPosition(playback: PlaybackState) {
  if (!playback.playing) return playback.position;

  return playback.position + (Date.now() - playback.updatedAt) / 1000;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ playback, onTrackEnd }, ref) {
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);
  const activeVideoIdRef = useRef<string | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const reactId = useId();
  const containerId = `syncplay-player-${reactId.replace(/:/g, "")}`;
  const hasVideo = Boolean(playback.videoId);
  const activeTrackId = playback.trackId ?? playback.videoId;
  activeTrackIdRef.current = activeTrackId;
  activeVideoIdRef.current = playback.videoId;
  const isReady = hasVideo && isPlayerReady;
  const handleTrackEnd = useEffectEvent((trackId: string | null) => {
    if (trackId) {
      onTrackEnd?.(trackId);
    }
  });

  useImperativeHandle(
    ref,
    () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seek: (seconds: number) => playerRef.current?.seekTo(seconds, true),
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    if (!hasVideo) {
      playerRef.current?.destroy();
      playerRef.current = null;
      loadedTrackIdRef.current = null;
      setIsPlayerReady(false);
      return () => {
        cancelled = true;
      };
    }

    if (playerRef.current) return () => {
      cancelled = true;
    };

    loadYouTubeApi().then((YT) => {
      if (!YT || cancelled || playerRef.current) return;

      playerRef.current = new YT.Player(containerId, {
        videoId: activeVideoIdRef.current,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          origin: window.location.origin,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            setIsPlayerReady(true);
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === YT.PlayerState.ENDED) {
              handleTrackEnd(loadedTrackIdRef.current ?? activeTrackIdRef.current);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      loadedTrackIdRef.current = null;
      setIsPlayerReady(false);
    };
  }, [containerId, hasVideo]);

  useEffect(() => {
    if (!isReady || !playback.playing) return;

    const endedState = window.YT?.PlayerState.ENDED;
    if (endedState === undefined) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (
        !player ||
        typeof player.getPlayerState !== "function" ||
        player.getPlayerState() !== endedState
      ) {
        return;
      }

      handleTrackEnd(loadedTrackIdRef.current ?? activeTrackIdRef.current);
    }, 500);

    return () => window.clearInterval(timer);
  }, [isReady, playback.playing]);

  useEffect(() => {
    const player = playerRef.current;
    if (
      !isReady ||
      !player ||
      !playback.videoId ||
      typeof player.loadVideoById !== "function" ||
      typeof player.cueVideoById !== "function" ||
      typeof player.seekTo !== "function"
    ) {
      return;
    }

    loadedTrackIdRef.current = activeTrackId;

    if (playback.playing) {
      player.loadVideoById(playback.videoId, getExpectedPosition(playback));
      if (typeof player.playVideo === "function") {
        player.playVideo();
      }
      return;
    }

    player.cueVideoById(playback.videoId, playback.position);
    player.seekTo(playback.position, true);
    if (typeof player.pauseVideo === "function") {
      player.pauseVideo();
    }
  }, [activeTrackId, isReady, playback]);

  useEffect(() => {
    if (!isReady || !playback.videoId || !playback.playing) return;

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (
        !player ||
        typeof player.getCurrentTime !== "function" ||
        typeof player.seekTo !== "function"
      ) {
        return;
      }

      const expected = getExpectedPosition(playback);
      const current = player.getCurrentTime();
      const drift = Math.abs(current - expected);

      if (drift > 0.75) {
        player.seekTo(expected, true);
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [isReady, playback]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === frameRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void frameRef.current?.requestFullscreen();
  }

    return (
      <div
        ref={frameRef}
        className="syncplay-player-frame relative isolate aspect-[16/8] min-h-[168px] overflow-hidden rounded-[20px] border border-white/10 bg-black sm:min-h-[200px] lg:min-h-[220px]"
      >
        <div id={containerId} className="absolute inset-0 h-full w-full" />
        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute right-3 top-3 z-10 rounded-lg bg-black/70 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/90"
          aria-label={isFullscreen ? "Minimize video" : "View video fullscreen"}
        >
          {isFullscreen ? "Minimize" : "Fullscreen"}
        </button>
      </div>
    );
  },
);
