"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import type { PlaybackState } from "../lib/room-types";
import type { YouTubePlayerHandle } from "./youtube-player";

type DirectMediaPlayerProps = {
  playback: PlaybackState;
  onTrackEnd?: (trackId: string) => void;
  mediaKind?: "video" | "audio";
};

function getExpectedPosition(playback: PlaybackState) {
  if (!playback.playing) return playback.position;

  return playback.position + (Date.now() - playback.updatedAt) / 1000;
}

export const DirectMediaPlayer = forwardRef<YouTubePlayerHandle, DirectMediaPlayerProps>(
  function DirectMediaPlayer({ playback, onTrackEnd, mediaKind = "video" }, ref) {
    const [mediaError, setMediaError] = useState(false);
    const mediaRef = useRef<HTMLMediaElement | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);
    const activeTrackIdRef = useRef<string | null>(null);
    const loadedTrackIdRef = useRef<string | null>(null);

    const activeTrackId = playback.trackId ?? playback.videoId;
    activeTrackIdRef.current = activeTrackId;

    useImperativeHandle(
      ref,
      () => ({
        play: () => {
          void mediaRef.current?.play();
        },
        pause: () => mediaRef.current?.pause(),
        seek: (seconds: number) => {
          if (mediaRef.current) {
            mediaRef.current.currentTime = Math.max(0, seconds);
          }
        },
      }),
      [],
    );

    useEffect(() => {
      const media = mediaRef.current;
      if (!media || !playback.videoId || !playback.url) {
        return;
      }

      const trackChanged = loadedTrackIdRef.current !== activeTrackId;
      const sourceChanged = media.src !== playback.url;

      if (trackChanged || sourceChanged) {
        loadedTrackIdRef.current = activeTrackId;
        setMediaError(false);
        media.src = playback.url;
        media.load();
      }

      const expectedPosition = getExpectedPosition(playback);
      if (Math.abs(media.currentTime - expectedPosition) > 0.75) {
        media.currentTime = Math.max(0, expectedPosition);
      }

      if (playback.playing) {
        void media.play().catch(() => undefined);
      } else {
        media.pause();
      }
    }, [activeTrackId, playback]);

    useEffect(() => {
      if (!playback.playing) return;

      const timer = window.setInterval(() => {
        const media = mediaRef.current;
        if (!media) return;

        const expectedPosition = getExpectedPosition(playback);
        if (Math.abs(media.currentTime - expectedPosition) > 0.75) {
          media.currentTime = Math.max(0, expectedPosition);
        }
      }, 2000);

      return () => window.clearInterval(timer);
    }, [playback]);

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
        {mediaKind === "audio" ? (
          <div className="syncplay-audio-player-art absolute inset-0 flex flex-col items-center justify-center gap-3 text-center" aria-hidden="true">
            <div className="text-5xl text-emerald-300">♫</div>
            <div className="text-sm uppercase tracking-[0.24em] text-slate-300">Audio track</div>
          </div>
        ) : null}
        {mediaKind === "audio" ? (
          <audio
            ref={mediaRef as RefObject<HTMLAudioElement>}
            className="sr-only"
            preload="metadata"
            controls={false}
            onError={() => setMediaError(true)}
            onEnded={() => {
              const trackId = loadedTrackIdRef.current ?? activeTrackIdRef.current;
              if (trackId) onTrackEnd?.(trackId);
            }}
          />
        ) : (
          <video
            ref={mediaRef as RefObject<HTMLVideoElement>}
            className="absolute inset-0 h-full w-full object-contain"
            playsInline
            preload="metadata"
            controls={false}
            controlsList="nodownload noplaybackrate"
            onError={() => setMediaError(true)}
            onEnded={() => {
              const trackId = loadedTrackIdRef.current ?? activeTrackIdRef.current;
              if (trackId) onTrackEnd?.(trackId);
            }}
          />
        )}
        {mediaError ? (
          <div className="syncplay-direct-video-error absolute inset-0 flex items-center justify-center p-6 text-center text-sm">
            This link is not a direct playable media file. Use a supported MP4, WebM, OGG, MP3, WAV, or upload a local file.
          </div>
        ) : null}
        {mediaKind === "video" ? (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute right-3 top-3 z-10 rounded-lg bg-black/70 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/90"
            aria-label="View video fullscreen"
          >
            Fullscreen
          </button>
        ) : null}
      </div>
    );
  },
);

export const DirectVideoPlayer = DirectMediaPlayer;
