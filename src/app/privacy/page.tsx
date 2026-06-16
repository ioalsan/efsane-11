import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gizlilik Politikası | Canlı11",
  description: "Canlı11 gizlilik politikası, çerez kullanımı ve Google AdSense bilgilendirmesi.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 font-mono text-white sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl border-2 border-black bg-zinc-900 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-400">Canlı11</p>
        <h1 className="mt-3 text-3xl font-black uppercase tracking-tighter sm:text-5xl">
          Gizlilik Politikası
        </h1>
        <p className="mt-4 text-sm font-bold leading-relaxed text-white/70">
          Bu Gizlilik Politikası, canli11.com üzerinden sunulan Canlı11 futbol kadro kurma ve
          simülasyon oyunu için geçerlidir. Siteyi kullanarak bu politikada açıklanan veri ve
          çerez kullanımını kabul etmiş olursunuz.
        </p>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-black uppercase text-yellow-400">Toplanan Veriler</h2>
          <p className="text-sm leading-relaxed text-white/75">
            Canlı11, hesap oluşturma veya üyelik zorunluluğu olmadan kullanılabilir. Site; teknik
            güvenlik, performans ve kullanıcı deneyimi için tarayıcı türü, cihaz bilgisi, yaklaşık
            kullanım zamanı, sayfa görüntüleme ve benzeri anonim veya toplulaştırılmış teknik
            verileri işleyebilir.
          </p>
          <p className="text-sm leading-relaxed text-white/75">
            Kullanıcı tarafından paylaşım kodu, kadro adı veya benzeri oyun içi bilgiler
            oluşturulursa bu bilgiler yalnızca oyunun ilgili özelliğini çalıştırmak amacıyla
            kullanılabilir. Canlı11, bilerek özel nitelikli kişisel veri talep etmez.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-black uppercase text-yellow-400">
            Google AdSense ve Reklam Çerezleri
          </h2>
          <p className="text-sm leading-relaxed text-white/75">
            Canlı11, reklam göstermek için Google AdSense kullanabilir. Google ve iş ortakları,
            reklamların sunulması, reklam performansının ölçülmesi ve ilgi alanlarına göre reklam
            gösterimi için çerezler veya benzer teknolojiler kullanabilir.
          </p>
          <p className="text-sm leading-relaxed text-white/75">
            Google reklam çerezleri, kullanıcının bu siteyi ve başka siteleri ziyaretine göre
            reklamların kişiselleştirilmesine yardımcı olabilir. Reklam kişiselleştirme tercihleri
            Google reklam ayarları üzerinden yönetilebilir.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-black uppercase text-yellow-400">Analytics Çerezleri</h2>
          <p className="text-sm leading-relaxed text-white/75">
            Site, ziyaretçi trafiğini ve oyun kullanımını anlamak için analytics çerezleri
            kullanabilir. Bu çerezler hangi sayfaların ziyaret edildiği, oturum süresi, cihaz türü
            ve genel kullanım akışı gibi bilgilerin analiz edilmesine yardımcı olur.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl font-black uppercase text-yellow-400">Veri Saklama ve Haklar</h2>
          <p className="text-sm leading-relaxed text-white/75">
            Tarayıcıda saklanan oyun tercihleri ve çerez onayı gibi bilgiler localStorage veya
            çerezlerde tutulabilir. Kullanıcılar tarayıcı ayarları üzerinden çerezleri silebilir,
            engelleyebilir veya depolanan site verilerini temizleyebilir.
          </p>
          <p className="text-sm leading-relaxed text-white/75">
            Gizlilikle ilgili talepler için iletisim@canli11.com adresinden Canlı11 ile iletişime
            geçebilirsiniz.
          </p>
        </section>

        <p className="mt-10 border-t border-white/10 pt-5 text-xs font-bold text-white/45">
          Son güncelleme: 16 Haziran 2026
        </p>
      </article>
    </main>
  );
}
