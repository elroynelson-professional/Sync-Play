"use client";

import { useEffect, useState } from "react";

type AdOverlayProps = {
  isOpen: boolean;
  skipDelayMs?: number;
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

export function AdOverlay({
  isOpen,
  skipDelayMs = 5000,
  onSkip,
}: AdOverlayProps) {
  const videoUrl = adVideos[0];
  const [remainingMs, setRemainingMs] = useState(skipDelayMs);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const startedAt = Date.now();
    let frameId = 0;

    const updateTimer = () => {
      const elapsedMs = Date.now() - startedAt;
      setRemainingMs(Math.max(0, skipDelayMs - elapsedMs));
      setCanSkip(elapsedMs >= skipDelayMs);

      frameId = window.requestAnimationFrame(updateTimer);
    };

    frameId = window.requestAnimationFrame(updateTimer);
    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen, skipDelayMs]);

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
      <button
        type="button"
        className={`syncplay-ad-button ${canSkip ? "is-active" : ""}`}
        onClick={onSkip}
        disabled={!canSkip}
      >
        {canSkip ? "Skip ad" : `Skip ad in ${Math.max(1, Math.ceil(remainingMs / 1000))}s`}
      </button>
      <div className="syncplay-ad-progress" aria-label="Advertisement progress">
        <span style={{ animationDuration: `${durationMs}ms` }} />
      </div>
    </div>
  );
}
