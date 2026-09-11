"use client";

import { useEffect, useState } from "react";

type AdOverlayProps = {
  isOpen: boolean;
  skipDelayMs?: number;
  onSkip: () => void;
};

const adCampaigns = [
  {
    videoUrl: "/ads/vid1.mp4",
    name: "Aether Energy",
    description: "Clean power for the next era of everyday living.",
    cta: "Learn more",
    link: "https://example.com/aether-energy",
  },
  {
    videoUrl: "/ads/vid2.mp4",
    name: "Northstar Labs",
    description: "Smarter devices built for people who move fast and think bigger.",
    cta: "Explore now",
    link: "https://example.com/northstar-labs",
  },
  {
    videoUrl: "/ads/vid3.mp4",
    name: "Summit Studio",
    description: "Creative tools and production systems for high-impact storytelling.",
    cta: "Discover more",
    link: "https://example.com/summit-studio",
  },
  {
    videoUrl: "/ads/dc.mp4",
    name: "DC Travel",
    description: "Book smarter, longer stays and more memorable journeys.",
    cta: "Book today",
    link: "https://example.com/dc-travel",
  },
  {
    videoUrl: "/ads/lays.mp4",
    name: "Lay's Bites",
    description: "Bold flavor, irresistible crunch, and just one more bite.",
    cta: "Taste now",
    link: "https://example.com/lays-bites",
  },
  {
    videoUrl: "/ads/product.mp4",
    name: "Nova Goods",
    description: "Everyday essentials designed with better materials and better intent.",
    cta: "Shop collection",
    link: "https://example.com/nova-goods",
  },
  {
    videoUrl: "/ads/redbull.mp4",
    name: "Red Bull Motion",
    description: "Fueling fast decisions, hard work, and big moments in motion.",
    cta: "Get charged",
    link: "https://example.com/redbull-motion",
  },
  {
    videoUrl: "/ads/info.mp4",
    name: "Signal One",
    description: "Actionable information systems for teams that want clarity and momentum.",
    cta: "See platform",
    link: "https://example.com/signal-one",
  },
];

export function AdOverlay({
  isOpen,
  skipDelayMs = 5000,
  onSkip,
}: AdOverlayProps) {
  const [videoIndex, setVideoIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(skipDelayMs);
  const [canSkip, setCanSkip] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const activeAd = adCampaigns[videoIndex] ?? adCampaigns[0];

  useEffect(() => {
    if (!isOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      setVideoIndex((currentIndex) => {
        if (adCampaigns.length < 2) return 0;

        const nextIndex = Math.floor(Math.random() * adCampaigns.length);
        return nextIndex === currentIndex ? (nextIndex + 1) % adCampaigns.length : nextIndex;
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

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
        src={activeAd.videoUrl}
        autoPlay
        muted
        playsInline
        loop
        onLoadedMetadata={() => setVideoProgress(0)}
        onTimeUpdate={(event) => {
          const { currentTime, duration } = event.currentTarget;
          if (Number.isFinite(duration) && duration > 0) {
            setVideoProgress((currentTime / duration) * 100);
          }
        }}
      />

      <div className="syncplay-ad-info">
        <div className="syncplay-ad-kicker">Sponsored</div>
        <h2>{activeAd.name}</h2>
        <p>{activeAd.description}</p>
        <a
          className="syncplay-ad-cta"
          href={activeAd.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          {activeAd.cta}
        </a>
      </div>

      <button
        type="button"
        className={`syncplay-ad-button ${canSkip ? "is-active" : ""}`}
        onClick={onSkip}
        disabled={!canSkip}
      >
        {canSkip ? "Skip ad" : `Skip ad in ${Math.max(1, Math.ceil(remainingMs / 1000))}s`}
      </button>
      <div
        className="syncplay-ad-progress"
        aria-label="Advertisement video progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(videoProgress)}
        role="progressbar"
      >
        <span style={{ width: `${Math.min(videoProgress, 100)}%` }} />
      </div>
    </div>
  );
}
