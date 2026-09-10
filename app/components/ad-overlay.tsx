"use client";

import { useEffect, useState } from "react";

type AdCampaign = {
  title: string;
  description: string;
  brand: string;
  badgeText: string;
  videoUrl?: string;
};

type AdOverlayProps = {
  isOpen: boolean;
  title?: string;
  description?: string;
  brand?: string;
  badgeText?: string;
  ads?: AdCampaign[];
  skipDelayMs?: number;
  durationMs?: number;
  onSkip: () => void;
};

const defaultAds: AdCampaign[] = [
  {
    title: "Break-time promo",
    description: "Your video ad is now playing in the rotation.",
    brand: "VIDEO AD",
    badgeText: "Ad",
    videoUrl: "/ads/vid1.mp4",
  },
  {
    title: "Brand feature",
    description: "Your second ad is now playing in the rotation.",
    brand: "VIDEO AD",
    badgeText: "Ad",
    videoUrl: "/ads/vid2.mp4",
  },
  {
    title: "Commercial spot",
    description: "Your third ad is now playing in the rotation.",
    brand: "VIDEO AD",
    badgeText: "Ad",
    videoUrl: "/ads/vid3.mp4",
  },
  {
    title: "DC",
    description: "Your third ad is now playing in the rotation.",
    brand: "VIDEO AD",
    badgeText: "Ad",
    videoUrl: "/ads/dc.mp4",
  },
  {
    title: "lays",
    description: "Your third ad is now playing in the rotation.",
    brand: "VIDEO AD",
    badgeText: "Ad",
    videoUrl: "/ads/lays.mp4",
  },
  {
    title: "Product",
    description: "Your third ad is now playing in the rotation.",
    brand: "VIDEO AD",
    badgeText: "Ad",
    videoUrl: "/ads/product.mp4",
  },
  {
    title: "redbull",
    description: "Your third ad is now playing in the rotation.",
    brand: "VIDEO AD",
    badgeText: "Ad",
    videoUrl: "/ads/redbull.mp4",
  },
  {
    title: "info",
    description: "Your third ad is now playing in the rotation.",
    brand: "VIDEO AD",
    badgeText: "Ad",
    videoUrl: "/ads/info.mp4",
  },
];

export function AdOverlay({
  isOpen,
  title,
  description,
  brand,
  badgeText,
  ads = defaultAds,
  skipDelayMs = 5000,
  durationMs = 7000,
  onSkip,
}: AdOverlayProps) {
  const [remainingMs, setRemainingMs] = useState(skipDelayMs);
  const [canSkip, setCanSkip] = useState(false);
  const [activeAd, setActiveAd] = useState<AdCampaign>(defaultAds[0]);

  useEffect(() => {
    if (!isOpen) {
      setRemainingMs(skipDelayMs);
      setCanSkip(false);
      return;
    }

    const randomAd = ads[Math.floor(Math.random() * ads.length)] ?? ads[0] ?? defaultAds[0];
    setActiveAd(randomAd);

    const startedAt = Date.now();
    setRemainingMs(skipDelayMs);
    setCanSkip(false);

    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextRemaining = Math.max(0, skipDelayMs - elapsed);
      setRemainingMs(nextRemaining);
      setCanSkip(elapsed >= skipDelayMs);
    }, 100);

    return () => window.clearInterval(tick);
  }, [ads, isOpen, skipDelayMs]);

  if (!isOpen) return null;

  const progress = 100 - (remainingMs / skipDelayMs) * 100;
  const countdownSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const resolvedTitle = title ?? activeAd.title;
  const resolvedDescription = description ?? activeAd.description;
  const resolvedBrand = brand ?? activeAd.brand;
  const resolvedBadgeText = badgeText ?? activeAd.badgeText;

  return (
    <div className="syncplay-ad-overlay" role="dialog" aria-modal="true" aria-label="Advertisement">
      <div className="syncplay-ad-panel">
        <div className="syncplay-ad-badge">Advertisement</div>

        {activeAd.videoUrl ? (
          <div className="syncplay-ad-media" aria-label={resolvedTitle}>
            <video
              className="syncplay-ad-video syncplay-ad-video-background"
              src={activeAd.videoUrl}
              autoPlay
              muted
              playsInline
              loop
              aria-hidden="true"
            />
            <video
              className="syncplay-ad-video syncplay-ad-video-foreground"
              src={activeAd.videoUrl}
              autoPlay
              muted
              playsInline
              loop
            />
          </div>
        ) : (
          <div className="syncplay-ad-visual" aria-hidden="true">
            <div className="syncplay-ad-brand">{resolvedBrand}</div>
            <div className="syncplay-ad-brand-tag">{resolvedBadgeText}</div>
          </div>
        )}

        <div className="syncplay-ad-copy">
          <p className="syncplay-ad-kicker">Sponsored break</p>
          <h2>{resolvedTitle}</h2>
          <p>{resolvedDescription}</p>
        </div>

        <div className="syncplay-ad-progress" aria-label="Advertisement progress">
          <span style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>

        <button
          type="button"
          className={`syncplay-ad-button ${canSkip ? "is-active" : ""}`}
          onClick={() => {
            if (canSkip) {
              onSkip();
            }
          }}
          disabled={!canSkip}
        >
          {canSkip ? "Skip ad" : `Skip ad in ${countdownSeconds}s`}
        </button>
      </div>
    </div>
  );
}
