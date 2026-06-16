import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "EFSANE-11",
  description: "Türk futbolunun efsanelerinden rüya 11 kur, turnuvada yarıştır ve paylaş.",
};

const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim();
const adsenseEnabled = Boolean(adsenseClient && /^ca-pub-\d+$/.test(adsenseClient));

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
      {adsenseEnabled && (
        <Script
          id="google-adsense"
          async
          strategy="afterInteractive"
          crossOrigin="anonymous"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
        />
      )}
    </html>
  );
}
