'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getSeasonDataset,
  getSeasonServerSnapshot,
  subscribeSeasonDataset,
} from '@/lib/seasonRepository';

declare global {
  interface Window {
    adsbygoogle?: Record<string, unknown>[];
  }
}

export type AdPlacement =
  | 'pitch-top'
  | 'result'
  | 'left-panel'
  | 'right-panel'
  | 'mobile-sticky';

const placementConfig: Record<AdPlacement, {
  envSlot?: string;
  width: number;
  height: number;
  format: 'horizontal' | 'rectangle';
}> = {
  'pitch-top': {
    envSlot: process.env.NEXT_PUBLIC_ADSENSE_SLOT_PITCH_TOP,
    width: 728,
    height: 90,
    format: 'horizontal',
  },
  result: {
    envSlot: process.env.NEXT_PUBLIC_ADSENSE_SLOT_RESULT,
    width: 728,
    height: 90,
    format: 'horizontal',
  },
  'left-panel': {
    envSlot: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LEFT_PANEL,
    width: 300,
    height: 250,
    format: 'rectangle',
  },
  'right-panel': {
    envSlot: process.env.NEXT_PUBLIC_ADSENSE_SLOT_RIGHT_PANEL,
    width: 300,
    height: 250,
    format: 'rectangle',
  },
  'mobile-sticky': {
    envSlot: process.env.NEXT_PUBLIC_ADSENSE_SLOT_MOBILE_STICKY,
    width: 320,
    height: 50,
    format: 'horizontal',
  },
};

const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() || 'ca-pub-7391885209764245';

export default function AdSlot({
  placement,
  className = '',
  showPlaceholder = true,
}: {
  placement: AdPlacement;
  className?: string;
  showPlaceholder?: boolean;
}) {
  const dataset = useSyncExternalStore(
    subscribeSeasonDataset,
    getSeasonDataset,
    getSeasonServerSnapshot,
  );
  const requestedRef = useRef(false);
  const config = placementConfig[placement];
  const slot = config.envSlot?.trim();
  const enabled = Boolean(
    dataset.settings.adsEnabled &&
    adsenseClient &&
    /^ca-pub-\d+$/.test(adsenseClient) &&
    slot &&
    /^\d+$/.test(slot)
  );

  useEffect(() => {
    if (!enabled || requestedRef.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      requestedRef.current = true;
    } catch {
      // Ad blockers and browser privacy settings may reject the request.
    }
  }, [enabled]);

  if (!dataset.settings.adsEnabled || (!enabled && !showPlaceholder)) return null;

  const mobileClass = placement === 'mobile-sticky'
    ? 'fixed bottom-0 left-1/2 z-[90] -translate-x-1/2 md:hidden'
    : '';

  return (
    <section
      aria-label={`Reklam alanı ${config.width}x${config.height}`}
      className={`mx-auto overflow-hidden border-2 border-black bg-zinc-100 text-black ${mobileClass} ${className}`}
      style={{ width: `min(100%, ${config.width}px)`, minHeight: config.height }}
    >
      {enabled ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', minHeight: config.height }}
          data-ad-client={adsenseClient}
          data-ad-slot={slot}
          data-ad-format={config.format}
          data-full-width-responsive="true"
        />
      ) : (
        <div
          className="grid place-items-center border-2 border-dashed border-black/15 bg-[linear-gradient(135deg,rgba(0,0,0,0.03)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.03)_50%,rgba(0,0,0,0.03)_75%,transparent_75%,transparent)] bg-[length:20px_20px] px-3 text-center"
          style={{ minHeight: config.height }}
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/55">Reklam</p>
            <p className="mt-1 text-[9px] font-bold text-black/35">{config.width}x{config.height}</p>
          </div>
        </div>
      )}
    </section>
  );
}
