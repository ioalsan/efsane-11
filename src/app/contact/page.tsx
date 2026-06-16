import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "İletişim | Canlı11",
  description: "Canlı11 iletişim bilgileri.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 font-mono text-white sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl border-2 border-black bg-zinc-900 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-400">Canlı11</p>
        <h1 className="mt-3 text-3xl font-black uppercase tracking-tighter sm:text-5xl">
          İletişim
        </h1>
        <p className="mt-4 text-sm font-bold leading-relaxed text-white/70">
          Canlı11 hakkında soru, geri bildirim, reklam, gizlilik veya teknik destek talepleri için
          aşağıdaki e-posta adresinden iletişime geçebilirsiniz.
        </p>

        <dl className="mt-8 grid gap-4">
          <div className="border-2 border-black bg-zinc-950 p-5">
            <dt className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Site adı</dt>
            <dd className="mt-2 text-2xl font-black text-yellow-400">Canlı11</dd>
          </div>
          <div className="border-2 border-black bg-zinc-950 p-5">
            <dt className="text-xs font-black uppercase tracking-[0.2em] text-white/45">E-posta</dt>
            <dd className="mt-2 break-all text-2xl font-black text-yellow-400">
              <Link href="mailto:iletisim@canli11.com" className="hover:text-yellow-300">
                iletisim@canli11.com
              </Link>
            </dd>
          </div>
        </dl>

        <p className="mt-8 text-xs font-bold leading-relaxed text-white/45">
          Talepler mümkün olan en kısa sürede incelenir. Kişisel veri veya reklam tercihleriyle
          ilgili başvurularda lütfen talebinizi açık şekilde belirtin.
        </p>
      </article>
    </main>
  );
}
