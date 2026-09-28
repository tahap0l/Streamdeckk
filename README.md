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

### 1. Programı indir ve kur

GitHub'da deponun **Releases** sayfasını aç ve **`StreamDeckk-Kurulum.exe`** dosyasını indirip çalıştır. Kurulum sihirbazı şunları yapar:

- programı kurar, masaüstü ve Başlat menüsü kısayolu oluşturur
- telefonun bağlanabilmesi için **Güvenlik Duvarı iznini kendisi ekler**
- istersen Windows açılınca otomatik başlatır

Kaldırmak için: **Ayarlar → Uygulamalar → StreamDeckk → Kaldır**.

> Kurulum istemiyorsan aynı sayfadaki tek dosyalık `StreamDeckk.exe` de kurulumsuz çalışır.

### 2. İlk açılış

1. `StreamDeckk.exe`'ye çift tıkla.
2. **"Windows kişisel bilgisayarınızı korudu"** uyarısı çıkarsa **Ek bilgi → Yine de çalıştır**'a tıkla. Program imzasız olduğu için bu uyarı normal.
3. **Güvenlik Duvarı** sorarsa **Özel ağlar** için izin ver.
4. Tarayıcıda **Kontrol Paneli** açılır, saatin yanında 🟣 simgesi belirir. Simge görünmüyorsa saatin yanındaki **^** okuna bak. Çift tıklayınca panel tekrar açılır; sağ tıklayınca **Çıkış** menüsü gelir.

Bir sorun olursa program sessizce kapanmaz, ekranda hatayı söyleyen bir mesaj çıkar.

> 🧪 Bilgisayarında her şeyin çalıştığını görmek için: Başlat menüsüne `cmd` yaz, exe'nin klasörüne gidip `StreamDeckk.exe --selftest` çalıştır. Kısa bir pencere açılıp klavye ve ses testini yapar, sonucu gösterir.

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

`%APPDATA%\StreamDeckk\` klasöründe (tepsi menüsü → **Veri Klasörünü Aç**):

- `config.json`: sayfalar ve tuşlar
- `sesler\`: yüklediğin ses dosyaları
- `streamdeckk.log`: günlük (sorun bildirirken bunu gönder)

Başka bir PC'ye geçerken bu klasörü kopyalaman yeterli.

## Komut satırı seçenekleri

| Seçenek | Ne yapar |
|---|---|
| `--hidden` | Paneli açmadan, sadece simge tepsisinde başlar |
| `--console` | Günlükleri bir konsol penceresinde de gösterir |
| `--selftest` | Klavye, ses ve simge tepsisini dener, sonucu gösterir |

---

## Geliştirme

Uygulama C# / .NET 8 ile yazılmıştır. Telefon arayüzü ve kontrol paneli (`public/`) exe'nin içine gömülür.

```
src/StreamDeckk.Core     Sunucu (HTTP + WebSocket), ayarlar, kısayollar — platformdan bağımsız
src/StreamDeckk          Windows programı: SendInput (klavye), NAudio (ses), Win32 simge tepsisi
src/StreamDeckk.DevHost  Windows olmadan geliştirmek için simülasyon sunucusu
public/deck              iPhone/tablet arayüzü (PWA)
public/admin             Kontrol paneli (yalnızca 127.0.0.1)
test/e2e                 Çalışan bir StreamDeckk'e karşı uçtan uca testler (API, WebSocket, Playwright)
```

```bash
# Windows exe'si (Windows'ta veya Linux'ta çapraz derleme)
dotnet publish src/StreamDeckk -c Release -o dist

# Windows olmadan: simülasyon sunucusu + testler
dotnet run --project src/StreamDeckk.DevHost
npm install && npm run e2e
```

Her push'ta GitHub Actions exe'yi **gerçek bir Windows makinesinde** derler ve şunları dener:

- öz-testi çalıştırır (kendi penceresine SendInput ile Türkçe metin yazdırıp okur)
- programı başlatır ve ikinci kopyanın açılmadığını doğrular
- tüm uçtan uca testleri gerçek exe'ye karşı çalıştırır
- yeniden başlatınca ayarların korunduğunu kontrol eder
