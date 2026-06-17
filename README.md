# EFSANE-11

EFSANE-11, 2025-2026 sezonundaki gerçek takım ve oyuncu verileriyle rüya kadro kurma, turnuva oynama ve kadroyu paylaşma deneyimi sunan bir Next.js oyunudur.

## Özellikler

- Süper Lig: 18 takım, 34 hafta ve toplam 306 maç.
- Şampiyonlar Ligi, UEFA Avrupa Ligi ve UEFA Konferans Ligi lig aşaması ile eleme turları.
- FIFA Dünya Kupası 2026: 48 milli takım, 12 grup, Son 32 ve devam eden eleme turları.
- Lig maçlarında 3/1/0 puan sistemi; eleme maçlarında uzatma ve zorunlu penaltı kazananı.
- Dakika dakika canlı skor, gol/kart/sakatlık timeline'ı ve tek tek penaltı atışları.
- Unicode ve UTF-8 uyumlu takım/oyuncu adları.
- Forma numarası, ana mevki, yan mevkiler, rating, form ve milliyet içeren oyuncu profilleri.
- Hücum, savunma, pas, hız, şut, dribbling ve kalecilik özelliklerine dayalı maç motoru.
- Sarı kart ve küçük sakatlık olayları.
- Local JSON tabanlı takım, oyuncu, turnuva, reklam ve oyun ayarları admin paneli.
- Kulüp ve milli takım oyuncularını ayrı kimlik ve kadro havuzlarında tutan veri modeli.
- Paylaşım linki, Story PNG ve kare kadro görseli dışa aktarımı.

## Veri

Uygulama çalışma zamanında backend veya Firebase kullanmaz. Sezon verisi `src/data/season-2025-26.json` dosyasında saklanır.

Ham Transfermarkt veri setini indirip sezon JSON'unu yeniden oluşturmak için:

```bash
npm run data:fetch
npm run data:generate
```

Veri üreticisi UTF-8 JSON yazar, transfer olan oyuncuları tek güncel takıma bağlar ve takım içindeki forma numaralarını benzersiz tutar.

## Geliştirme

Node.js 20.9 veya daha yeni bir sürüm gereklidir.

```bash
npm ci
npm run dev
```

Uygulama varsayılan olarak `http://localhost:3000` adresinde çalışır. Admin paneli `/admin` rotasındadır.

## Google AdSense

`.env.example` dosyasındaki değişkenleri `.env.local` veya Vercel ortam değişkenleri olarak tanımlayın:

```bash
NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-1234567890123456
NEXT_PUBLIC_ADSENSE_SLOT_PITCH_TOP=1234567890
NEXT_PUBLIC_ADSENSE_SLOT_RESULT=2345678901
NEXT_PUBLIC_ADSENSE_SLOT_LEFT_PANEL=3456789012
NEXT_PUBLIC_ADSENSE_SLOT_RIGHT_PANEL=4567890123
NEXT_PUBLIC_ADSENSE_SLOT_MOBILE_STICKY=5678901234
```

Tüm reklam yerleşimleri `AdSlot` bileşeniyle yönetilir. Değişkenler boşken gerçek reklam isteği gönderilmez ve yerleşim önizlemesi gösterilir.

## Kontroller

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
