"use client";

import { useEffect, useState } from "react";

const storageKey = "canli11:cookie-consent:v1";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(window.localStorage.getItem(storageKey) !== "accepted");
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const acceptCookies = () => {
    window.localStorage.setItem(storageKey, "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <section
      role="dialog"
      aria-live="polite"
      aria-label="Çerez bildirimi"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-4xl border-2 border-black bg-white p-4 font-mono text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:bottom-5 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.18em]">Çerez Kullanımı</h2>
          <p className="mt-2 text-xs font-bold leading-relaxed text-black/70">
            Canlı11, site deneyimini iyileştirmek, analiz yapmak ve Google AdSense reklamlarını
            gösterebilmek için çerezler kullanır. Detaylar için Gizlilik Politikası sayfasını
            inceleyebilirsiniz.
          </p>
        </div>
        <button
          type="button"
          onClick={acceptCookies}
          className="game-button shrink-0 border-2 border-black bg-yellow-400 px-5 py-3 text-xs font-black uppercase text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        >
          Kabul Et
        </button>
      </div>
    </section>
  );
}
