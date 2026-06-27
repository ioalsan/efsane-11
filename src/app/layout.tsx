import type { Metadata, Viewport } from "next";
import Script from "next/script";
import CookieConsent from "@/components/CookieConsent";
import SiteFooter from "@/components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canlı11",
  description: "Canlı11 ile futbol kadronu kur, turnuva simülasyonuna katıl ve sonuçları paylaş.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const adsenseClient = "ca-pub-7391885209764245";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <CookieConsent />
        <Script
          id="google-adsense"
          async
          strategy="afterInteractive"
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
        />
      </body>
    </html>
  );
}
