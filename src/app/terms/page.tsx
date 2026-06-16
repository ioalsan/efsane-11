import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kullanım Şartları | Canlı11",
  description: "Canlı11 kullanım şartları ve kullanıcı sorumlulukları.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 font-mono text-white sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl border-2 border-black bg-zinc-900 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-400">Canlı11</p>
        <h1 className="mt-3 text-3xl font-black uppercase tracking-tighter sm:text-5xl">
          Kullanım Şartları
        </h1>
        <p className="mt-4 text-sm font-bold leading-relaxed text-white/70">
          Bu Kullanım Şartları, canli11.com sitesinde sunulan Canlı11 futbol kadro kurma ve maç
          simülasyonu hizmetlerinin kullanımını düzenler. Siteyi kullanan herkes bu şartları kabul
          etmiş sayılır.
        </p>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-black uppercase text-yellow-400">Eğlence ve Simülasyon</h2>
          <p className="text-sm leading-relaxed text-white/75">
            Canlı11, eğlence ve simülasyon amacıyla geliştirilmiş bir futbol oyunudur. Oyundaki
            rating, form, maç sonucu, fikstür, turnuva akışı ve benzeri içerikler gerçek spor
            sonuçlarını garanti etmez ve resmi bir bahis, tahmin veya istatistik hizmeti değildir.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-black uppercase text-yellow-400">Kullanıcı Sorumlulukları</h2>
          <p className="text-sm leading-relaxed text-white/75">
            Kullanıcılar siteyi hukuka uygun şekilde kullanmakla yükümlüdür. Siteye zarar verme,
            otomatik yoğun istek gönderme, güvenlik önlemlerini aşmaya çalışma, yanıltıcı paylaşım
            üretme veya üçüncü kişilerin haklarını ihlal edecek davranışlarda bulunma yasaktır.
          </p>
          <p className="text-sm leading-relaxed text-white/75">
            Kullanıcı, tarayıcısında oluşturulan kadro, paylaşım kodu ve yerel oyun verilerinin
            kendi cihazında saklanabileceğini kabul eder. Paylaşılan bağlantıların kimlerle
            paylaşılacağı kullanıcının sorumluluğundadır.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-black uppercase text-yellow-400">İçerik ve Değişiklikler</h2>
          <p className="text-sm leading-relaxed text-white/75">
            Canlı11, takım, oyuncu, rating, fikstür, turnuva formatı ve oyun mekaniklerini
            güncelleme hakkını saklı tutar. Site geçici olarak bakım, teknik arıza veya içerik
            güncellemesi nedeniyle erişilemez olabilir.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-black uppercase text-yellow-400">Sorumluluk Sınırı</h2>
          <p className="text-sm leading-relaxed text-white/75">
            Canlı11, oyunun kesintisiz veya hatasız çalışacağını garanti etmez. Site kullanımından
            doğabilecek dolaylı kayıplardan, kullanıcı cihazındaki yerel veri kayıplarından veya
            üçüncü taraf reklam/analiz servislerinden kaynaklanan sorunlardan sorumlu tutulamaz.
          </p>
        </section>

        <p className="mt-10 border-t border-white/10 pt-5 text-xs font-bold text-white/45">
          Son güncelleme: 16 Haziran 2026
        </p>
      </article>
    </main>
  );
}
