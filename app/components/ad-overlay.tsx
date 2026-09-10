"use client";

import { useEffect } from "react";

type AdOverlayProps = {
  isOpen: boolean;
  durationMs?: number;
  onSkip: () => void;
};

const adVideos = [
  "/ads/vid1.mp4",
  "/ads/vid2.mp4",
  "/ads/vid3.mp4",
  "/ads/dc.mp4",
  "/ads/lays.mp4",
  "/ads/product.mp4",
  "/ads/redbull.mp4",
  "/ads/info.mp4",
];

export function AdOverlay({ isOpen, durationMs = 7000, onSkip }: AdOverlayProps) {
  const videoUrl = adVideos[0];

  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(onSkip, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, isOpen, onSkip]);

  if (!isOpen) return null;

  return (
    <div className="syncplay-ad-overlay" role="dialog" aria-modal="true" aria-label="Advertisement">
      <video
        className="syncplay-ad-video"
        src={videoUrl}
        autoPlay
        muted
        playsInline
        loop
      />
      <button type="button" className="syncplay-ad-button is-active" onClick={onSkip}>
        Skip
      </button>
      <div className="syncplay-ad-progress" aria-label="Advertisement progress">
        <span style={{ animationDuration: `${durationMs}ms` }} />
      </div>
    </div>
  );
}
