import Link from "next/link";

const footerLinks = [
  { href: "/privacy", label: "Gizlilik Politikası" },
  { href: "/terms", label: "Kullanım Şartları" },
  { href: "/contact", label: "İletişim" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t-2 border-black bg-zinc-950 px-5 py-6 font-mono text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 text-center text-xs font-black uppercase tracking-[0.16em] sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5" aria-label="Alt menü">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-white/70 transition-colors hover:text-yellow-400"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-white/45">© 2026 Canlı11</p>
      </div>
    </footer>
  );
}
