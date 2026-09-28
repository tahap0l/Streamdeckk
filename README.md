# 🟣 StreamDeckk

Telefonunu veya tabletini yayın için bir **Stream Deck**'e dönüştürür. TikTok Live Studio ile uyumludur. Mor-siyah temalıdır, kurulumu kolaydır.

- 📱 **iPhone / iPad / Android**: App Store gerekmez. Safari'den "Ana Ekrana Ekle" yapınca tam ekran uygulama gibi çalışır.
- 💻 **Windows PC**: Tek bir `StreamDeckk.exe`. Kurulum gerekmez, saatin yanındaki simge tepsisinde çalışır.
- 📶 **Wi-Fi ve 🔌 USB kablo**: İkisi de desteklenir. Biri koparsa uygulama diğer adrese kendiliğinden geçer.
- 🔒 **QR ile eşleştirme**: Anahtarı olmayan kimse tuşlara basamaz. Kontrol paneli yalnızca PC'den açılır.

## Neler yapabilir?

| Tuş türü | Açıklama |
|---|---|
| ⌨️ Klavye kısayolu | `Ctrl+Shift+M`, `F13`… gibi kısayollar gönderir. Sahne değiştirme, mikrofon, kamera vb. için TikTok Live Studio kısayollarını tetikler. |
| 🔊 Ses çal (soundboard) | PC'de ses çalar. Live Studio masaüstü sesini aldığı için yayına da gider. |
| ⏹️ Sesleri durdur / 🔉🔊 Ses seviyesi | Soundboard'u anında sustur ya da genel ses seviyesini ±10 değiştir. |
| ✍️ Metin yaz | Seçili pencereye hazır mesaj yazar, istersen Enter'a da basar. |
| 🔁 Aç / Kapa | Mikrofon gibi tuşlar açık/kapalı durumunu renkle gösterir. Uzun basınca durum kısayol gönderilmeden düzeltilir. |
| 📄 Sayfalar | Sınırsız sayfa. Telefonda sağa/sola kaydırarak geçilir. |

Tuşa basınca tuş parlar, iPhone hafifçe titrer (iOS 18+) ve işlemin sonucunu gösteren ✓ / ✕ işareti çıkar.

---

## Kurulum

### 1. Programı indir

GitHub'da **Actions → Windows derlemesi** altında en son başarılı çalışmayı aç. En alttaki **StreamDeckk-Windows** dosyasını indir ve zip'ten çıkar. (Sürüm etiketi `v1.0.0` gibi basıldıysa **Releases** sayfasından da indirebilirsin.)

- `StreamDeckk.exe`: normal kullanım (pencere açmaz, simge tepsisinde çalışır)
- `StreamDeckk-Konsol.exe`: sorun giderme için günlükleri gösteren sürüm

### 2. İlk açılış

1. `StreamDeckk.exe`'ye çift tıkla.
2. **"Windows kişisel bilgisayarınızı korudu"** uyarısı çıkarsa **Ek bilgi → Yine de çalıştır**'a tıkla. Program imzasız olduğu için bu uyarı normal.
3. **Güvenlik Duvarı** sorarsa **Özel ağlar** için izin ver.
4. Tarayıcıda **Kontrol Paneli** açılır, saatin yanında 🟣 simgesi belirir. Simgeye çift tıklayınca panel tekrar açılır.

### 3. iPhone'u bağla

1. Kontrol panelinde **📱 Bağlan** sekmesine geç.
2. iPhone'da **Kamera**'yı aç ve QR kodu okut, çıkan bağlantıya dokun.
3. Safari'de **Paylaş → Ana Ekrana Ekle → Ekle** yap.
4. Ana ekrandaki **StreamDeckk** simgesiyle aç. Bu kadar!

> 💡 Yayında ekran kararmasın: **Ayarlar → Ekran ve Parlaklık → Otomatik Kilit → Hiçbir Zaman**

### 4. TikTok Live Studio kısayollarını ayarla

1. Live Studio'da **Ayarlar → Kısayol tuşları** bölümünü aç.
2. Örneğin "Mikrofonu sessize al" satırındaki kutuya tıkla.
3. Telefondaki **🎙️ Mikrofon** tuşuna bas. StreamDeckk `F13` gönderir, Live Studio da bunu kaydeder.
4. Sahneler için de aynısını yap. Varsayılan tuşlar `F13`–`F18` arasında.

`F13`–`F24` tuşları gerçek klavyelerde yoktur. Bu yüzden oyunlarla veya başka programlarla **hiç çakışmaz**.

> ⚠️ Live Studio **yönetici olarak** çalışıyorsa StreamDeckk'i de sağ tık → **Yönetici olarak çalıştır** ile aç. Aksi halde Windows tuş gönderilmesini engeller.

---

## USB kablo ile bağlanma

1. PC'de **Apple Devices** (Microsoft Store) veya **iTunes** kurulu olmalı. USB sürücüsü bunlarla gelir.
2. iPhone'da **Ayarlar → Kişisel Erişim Noktası → Başkalarının Katılmasına İzin Ver**'i aç.
3. Kabloyu tak ve iPhone'da **Güven** de.
4. **Bağlan** sekmesinde **iPhone (USB)** QR kodu belirir. Onu okut.

Telefon, PC'nin hem Wi-Fi hem USB adresini hatırlar. Uygulama açıkken biri koparsa diğerine geçer.

> ⚠️ USB bağlıyken Windows interneti telefonun mobil verisinden de kullanabilir. Yayın için Wi-Fi'ı ana bağlantı, USB'yi yedek olarak düşün.

## Bağlanamıyorum

- Telefon ve PC **aynı Wi-Fi**'da mı? Misafir ağları cihazları birbirinden ayırır.
- Windows'ta Wi-Fi ağın **Genel** değil **Özel** olmalı: *Ayarlar → Ağ ve İnternet → Wi-Fi → (ağ adı) → Özel ağ*.
- PC'nin IP adresi değiştiyse QR kodu yeniden okut. (Modemden PC'ye sabit IP verirsen bu hiç olmaz.)
- Günlük dosyası: `%APPDATA%\StreamDeckk\streamdeckk.log`

## Veriler nerede?

`%APPDATA%\StreamDeckk\` klasöründe:

- `config.json`: sayfalar ve tuşlar
- `sesler\`: yüklediğin ses dosyaları

Başka bir PC'ye geçerken bu klasörü kopyalaman yeterli.

---

## Geliştirme

```bash
npm install
npm start            # Windows dışında "simülasyon modu": tuşlar sadece günlüğe yazılır
npm test
npm run build:win    # dist/StreamDeckk.exe ve dist/StreamDeckk-Konsol.exe
```

**Mimari**

```
iPhone (PWA)  ──WebSocket──►  Node.js sunucusu (StreamDeckk.exe)  ──127.0.0.1──►  PowerShell/C# yardımcısı
public/deck/                  server/index.js                                     server/helper.ps1
                              ▲                                                    • SendInput (klavye)
PC tarayıcısı ──HTTP (sadece  │                                                    • MCI (ses)
public/admin/   127.0.0.1)────┘                                                    • Simge tepsisi
```

- Yerel (native) npm modülü yoktur. Windows işlemleri, Windows'ta hazır gelen PowerShell 5.1 ile anlık derlenen küçük bir C# sınıfıyla yapılır.
- `StreamDeckk.exe`, [pkg](https://github.com/yao-pkg/pkg) ile paketlenir. Konsol penceresi açmaması için PE başlığındaki alt sistem alanı GUI olarak değiştirilir (`scripts/build-win.js`).
- Her push'ta GitHub Actions exe'yi gerçek bir Windows makinesinde derler ve duman testinden geçirir.
