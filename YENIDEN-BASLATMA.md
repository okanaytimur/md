# Sıfırdan başlatma — bilgisayar yeniden başladıktan sonra

Bu doküman **tek başına yeterlidir**. Emülatörü ve log tutucuyu kimseye
sormadan ayağa kaldırmak için gereken her şey burada.

Proje klasörü: `D:\beyan\capture`

---

## Kısa yol (acelesi olana)

PowerShell aç, sırayla:

```powershell
# 1. MuMu'yu kapat (oturum acilisinda otomatik basliyor)
Get-Process | Where-Object { $_.ProcessName -match "^MuMu|^Nemu" } | Stop-Process -Force

# 2. Ortami kur (emulatoru acar, sertifikayi yerlestirir) - 3-5 dakika
cd D:\beyan\capture
.\setup-proxy.ps1

# 3. Log tutucuyu baslat (bu pencere acik kalacak)
.\start-capture.ps1 -Headless
```

Sonra emülatör penceresinde uygulamayı kullan. XML'ler
`D:\beyan\capture\captures\` altına düşer.

Geri kalanı, her adımda ne beklemen gerektiği ve ters giderse ne yapacağın.

> **Daha da kısası var.** Sertifika, proxy ayarı ve verified boot durumu
> yeniden başlatmadan sağ çıkıyor (ölçüldü). Yani çoğu zaman 2. adımdaki
> `setup-proxy.ps1` yerine sadece emülatörü açman yeterli:
>
> ```powershell
> Start-Process "C:\Android\Sdk\emulator\emulator.exe" -ArgumentList "-avd","capture33","-writable-system","-no-snapshot-load"
> ```
>
> Ardından aşağıdaki **durum kontrolü** bloğunu çalıştır. Hepsi yeşilse
> doğrudan `start-capture.ps1`'e geç. Bir şey kırmızıysa `setup-proxy.ps1`
> çalıştır — o her şeyi düzeltir.

---

## Yeniden başlatmadan ne kurtulur, ne kurtulmaz

| Şey | Bilgisayar yeniden başlayınca |
|---|---|
| `capture33` AVD tanımı | **Kalır.** Yeniden yaratmana gerek yok. |
| Emülatör içindeki uygulama (`sampas.android.mobilbeyan`) | **Kalır.** `/data` kalıcı, tekrar kurmana gerek yok. |
| mitmproxy CA sertifikası (`~\.mitmproxy\`) | **Kalır.** Yeniden üretilmez, hash aynı: `c8750f0d` |
| `captures\` içindeki XML'ler | **Kalır.** Silinmez. |
| Çalışan emülatör | **Gider.** Yeniden açman lazım. |
| Çalışan mitmdump | **Gider.** Yeniden başlatman lazım. |
| adb sunucusu | **Gider.** İlk adb komutu kendisi başlatır. |
| Cihazdaki `global http_proxy` ayarı | **Kalır.** (ölçüldü) |
| `/system` içindeki CA sertifikası | **Kalır.** (ölçüldü — aşağıya bak) |
| Verified boot'un kapalı olması | **Kalır.** (ölçüldü) |

### `/system` sertifikası: ölçüldü, kalıcı

Sertifika `/system/etc/security/cacerts/c8750f0d.0` adresinde, **overlayfs**
ile yazıldı. Overlay'in üst katmanı `/mnt/scratch/overlay/system/upper`
altında, yani AVD'nin kalıcı diskinde — geçici bellekte değil.

Test edildi: emülatör tamamen kapatıldı (`adb emu kill`), `adb kill-server` ile
adb sunucusu da durduruldu, sonra emülatör `setup-proxy.ps1` hiç çalıştırılmadan
aynı bayraklarla açıldı. Sonuç:

```
-rw-r--r-- 1 root root 1172 /system/etc/security/cacerts/c8750f0d.0   <- duruyor
overlay on /system ... upperdir=/mnt/scratch/overlay/system/upper      <- mount duruyor
global http_proxy: 10.0.2.2:8080                                       <- ayar duruyor
verification is disabled.                                              <- kapali kalmis
```

**Pratik sonucu:** yeniden başlatmadan sonra genelde sadece emülatörü açıp
`start-capture.ps1` çalıştırman yeter. Ama `setup-proxy.ps1` yine de en güvenli
yol — her şeyi doğruluyor, bozuksa düzeltiyor, hiçbir şeyi bozmuyor. Emin
olmadığında onu çalıştır.

Çıktıda `[10]` numaralı adıma bakarsan hangi durumda olduğunu görürsün:

- `sertifika zaten dogru icerikle yerinde, push atlaniyor` → sağ çıkmış
  (beklenen durum).
- `sertifika yazildi: /system/etc/security/cacerts/c8750f0d.0` → gitmiş,
  yeniden yazıldı. Sorun yok, script bunun için var.

Her iki durumda da `[11] Dogrulama` adımı `MD5 eslesti` demeli.

**Sertifika ne zaman gider?** AVD'nin verisi silinirse: AVD Manager'da
*Wipe Data*, `emulator -wipe-data`, ya da AVD'yi silip yeniden yaratmak.
Bunlardan birini yaptıysan `setup-proxy.ps1`'i çalıştırman **şart**.

> Emülatörü her açtığında `-writable-system` bayrağını geçmeye devam et.
> `setup-proxy.ps1` bunu zaten yapıyor. Bayraksız açılışta overlay'in mount
> olup olmadığı test edilmedi — riske girme.

---

## Adım adım

### Adım 0 — MuMu Player'ı kapat

**Bu adımı atlama.** `MuMuPlayerGlobal` kayıt defterinde oturum açılışına
ekli (`HKCU\...\CurrentVersion\Run`), yani bilgisayar açıldığında kendiliğinden
başlıyor.

MuMu kendi `adb.exe`'sini taşıyor (sürüm **36.0.0**), SDK'nınki **37.0.1**.
İkisi 5037 portunu paylaşamaz — hangisi sonra başlarsa diğerinin sunucusunu
öldürür ve kurulumun ortasında cihaz bağlantın kopar.

```powershell
Get-Process | Where-Object { $_.ProcessName -match "^MuMu|^Nemu" } | Stop-Process -Force
```

Kontrol (hiçbir şey dönmemeli):

```powershell
Get-Process | Where-Object { $_.ProcessName -match "^MuMu|^Nemu" }
```

> Kalıcı çözüm isterseniz MuMu'yu başlangıçtan çıkarabilirsiniz:
> Görev Yöneticisi → Başlangıç uygulamaları → `MuMuPlayerGlobal` → Devre dışı
> bırak. Ben yapmadım, senin kararın.

### Adım 1 — Ortamı kur

```powershell
cd D:\beyan\capture
.\setup-proxy.ps1
```

**Süre:** 3–5 dakika. İçinde bir reboot var, emülatör ekranı bir kez yeniden
başlarsa normal.

Script sırayla şunları yapar ve her adımı ekrana yazar:

```
[1]  Onkosul kontrolu          adb, emulator, openssl, mitmdump yerinde mi
[2]  MuMu / adb cakisma        MuMu aciksa DURUR
[3]  mitmproxy CA              varsa uretmez
[4]  CA hash                   c8750f0d -> c8750f0d.0
[5]  Emulator                  -writable-system -no-snapshot-load ile acar
[6]  adb root
[7]  Verified boot             gerekiyorsa kapatir
[8]  Reboot                    sadece gerekiyorsa
[9]  adb remount
[10] Sertifikayi sisteme yaz   zaten varsa atlar
[11] Dogrulama                 MD5 + openssl subject
[12] Proxy ayari               global http_proxy = 10.0.2.2:8080
```

**Başarılı bitişte tam olarak bunu görmen lazım:**

```
==================== KURULUM TAMAM ====================
  AVD             : capture33 (emulator-5554)
  CA hash         : c8750f0d  ->  /system/etc/security/cacerts/c8750f0d.0
  Proxy           : 10.0.2.2:8080
  Yakalama dizini : D:\beyan\capture\captures
```

Bunu görmediysen script bir yerde `HATA:` ile durmuştur. Durduğu adımı oku,
aşağıdaki "Sorun giderme" bölümüne bak.

**Script idempotent.** İkinci kez çalıştırırsan hiçbir şeyi bozmaz: CA'yı
yeniden üretmez, emülatör açıksa ikincisini açmaz, verification zaten kapalıysa
reboot etmez, sertifika yerindeyse push etmez. Her atladığı adımı yazar. Kafan
karışırsa tekrar çalıştırmak **güvenlidir**.

### Adım 2 — Log tutucuyu başlat

Ayrı bir PowerShell penceresi aç (ya da aynısını kullan, ama bu komut pencereyi
meşgul edecek):

```powershell
cd D:\beyan\capture
.\start-capture.ps1 -Headless
```

Beklenen çıktı:

```
[5] mitmdump baslatiliyor
  addon      : dump_xml.py
  dinlenen   : 0.0.0.0:8080  (emulator icinden 10.0.2.2:8080)
  cikti      : D:\beyan\capture\captures
  durdurmak  : Ctrl+C

[..] Loading script dump_xml.py
[..] HTTP(S) proxy listening at *:8080.
```

`HTTP(S) proxy listening at *:8080.` satırını gördüysen yakalama açık.

**Bu pencereyi kapatma.** Kapatırsan yakalama durur ve uygulama internete
çıkamaz (aşağıya bak).

Seçenekler:

| Komut | Ne yapar |
|---|---|
| `.\start-capture.ps1` | Etkileşimli mitmproxy arayüzü (akışları canlı görürsün) |
| `.\start-capture.ps1 -Headless` | Sadece log satırları, arayüz yok |
| `.\start-capture.ps1 -Clean` | Başlamadan önce `captures\` içini boşaltır |

Temiz bir test senaryosu için `-Clean` işine yarar; yoksa eski XML'ler yenilerle
karışır.

### Adım 3 — Uygulamayı kullan

Emülatör penceresinde uygulamayı aç. Yoksa komutla:

```powershell
& "C:\Android\Sdk\platform-tools\adb.exe" shell am start -n sampas.android.mobilbeyan/.Login
```

Kullanıcı adı/şifreni gir, test edeceğin akışı yürüt. Her SOAP isteği anında
diske düşer.

### Adım 4 — Çıktıları oku

```powershell
# En yeniden eskiye
Get-ChildItem D:\beyan\capture\captures\*.xml | Sort-Object LastWriteTime -Descending | Select-Object -First 10 Name, Length, LastWriteTime

# Bir dosyayi ac
Get-Content D:\beyan\capture\captures\<dosya>.xml

# Hangi SOAPAction'lar cagrilmis
Select-String -Path D:\beyan\capture\captures\*.xml -Pattern "SOAPAction  :" | ForEach-Object { ($_.Line -split ": ",2)[1] } | Sort-Object | Group-Object | Sort-Object Count -Descending | Select-Object Count, Name

# Belirli bir servise giden istekler
Select-String -Path D:\beyan\capture\captures\*.xml -Pattern "TahsilatService" -List | Select-Object Filename
```

Dosya adı: `{epoch_ms}_{host}_{path}.xml`. Yanıt gövdesi de XML ise aynı isimle
`_response.xml` olarak yanında durur.

---

## Her şeyin yolunda olduğunu tek seferde doğrulama

Bu bloğu olduğu gibi yapıştır:

```powershell
$Adb = "C:\Android\Sdk\platform-tools\adb.exe"
Write-Host "--- DURUM ---" -ForegroundColor Cyan

$mumu = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match "^MuMu|^Nemu" }
if ($mumu) { Write-Host "MuMu       : ACIK - KAPAT!" -ForegroundColor Red } else { Write-Host "MuMu       : kapali" -ForegroundColor Green }

$dev = (& $Adb devices | Select-String "emulator-\d+\s+device")
if ($dev) { Write-Host "Emulator   : $($dev.Matches.Value)" -ForegroundColor Green } else { Write-Host "Emulator   : YOK - setup-proxy.ps1 calistir" -ForegroundColor Red }

$l = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($l) { Write-Host "mitmdump   : 8080 dinliyor (PID $($l.OwningProcess))" -ForegroundColor Green } else { Write-Host "mitmdump   : KAPALI - start-capture.ps1 calistir" -ForegroundColor Red }

if ($dev) {
  $proxy = (& $Adb shell settings get global http_proxy 2>&1 | Out-String).Trim()
  if ($proxy -eq "10.0.2.2:8080") { Write-Host "Proxy      : $proxy" -ForegroundColor Green } else { Write-Host "Proxy      : '$proxy' - BEKLENEN 10.0.2.2:8080" -ForegroundColor Red }
  $cert = (& $Adb shell "ls /system/etc/security/cacerts/c8750f0d.0 2>/dev/null" 2>&1 | Out-String).Trim()
  if ($cert) { Write-Host "Sistem CA  : $cert" -ForegroundColor Green } else { Write-Host "Sistem CA  : YOK - setup-proxy.ps1 calistir" -ForegroundColor Red }
  $app = (& $Adb shell "pm list packages sampas.android.mobilbeyan" 2>&1 | Out-String).Trim()
  if ($app) { Write-Host "Uygulama   : kurulu" -ForegroundColor Green } else { Write-Host "Uygulama   : KURULU DEGIL" -ForegroundColor Red }
}

$n = @(Get-ChildItem "D:\beyan\capture\captures" -Filter *.xml -ErrorAction SilentlyContinue).Count
Write-Host "captures\  : $n dosya"
```

Hepsi yeşilse hazırsın.

---

## Düzgün kapatma

Sırayla:

```powershell
# 1. Log tutucuyu durdur: calistigi pencerede Ctrl+C
#    (kac dosya yakalandigini yazar)

# 2. Proxy ayarini temizle - emulatoru proxy'siz kullanacaksan
& "C:\Android\Sdk\platform-tools\adb.exe" shell settings put global http_proxy :0

# 3. Emulatoru kapat (pencereyi X ile kapatmak da olur)
& "C:\Android\Sdk\platform-tools\adb.exe" emu kill

# 4. adb sunucusunu birak - MuMu kullanacaksan sart
& "C:\Android\Sdk\platform-tools\adb.exe" kill-server
```

2. adımı atlarsan, emülatörü bir daha açtığında proxy ayarı hâlâ
`10.0.2.2:8080`'i gösteriyor olabilir ve mitmdump kapalıyken **uygulama
internete çıkamaz**. Uygulama bozuldu sanma — sebebi budur.

---

# Sorun giderme

## "Uygulama internete çıkmıyor / bağlantı hatası veriyor"

En sık sebep: proxy ayarı duruyor ama mitmdump kapalı.

```powershell
$Adb = "C:\Android\Sdk\platform-tools\adb.exe"
& $Adb shell settings get global http_proxy      # 10.0.2.2:8080 diyorsa
Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue   # ama bos donuyorsa
```

İkisinden biri:

```powershell
cd D:\beyan\capture; .\start-capture.ps1 -Headless    # yakalamayi ac
# VEYA
& $Adb shell settings put global http_proxy :0        # proxy'yi kapat
```

## `setup-proxy.ps1` "MuMu Player'i kapat" deyip duruyor

Doğru davranış, tesadüf değil. Adım 0'a dön. Gerçekten kapatamıyorsan
`-Force` ile geçebilirsin ama kurulumun ortasında bağlantı kopma riskini almış
olursun:

```powershell
.\setup-proxy.ps1 -Force
```

## `adb remount` başarısız

Script durur ve teşhis basar. Sırayla:

1. **En sık sebep:** emülatör zaten açıktı ve `-writable-system` olmadan
   açılmıştı. Script açık emülatörü yeniden başlatmaz. Çözüm — emülatörü
   **tamamen kapat**, sonra baştan:
   ```powershell
   & "C:\Android\Sdk\platform-tools\adb.exe" emu kill
   cd D:\beyan\capture; .\setup-proxy.ps1
   ```
2. Verification gerçekten kapandı mı:
   ```powershell
   & "C:\Android\Sdk\platform-tools\adb.exe" shell avbctl get-verification
   ```
   `disabled` demeli.
3. AVD doğru imajda mı:
   ```powershell
   Get-Content "$env:USERPROFILE\.android\avd\capture33.avd\config.ini" | Select-String "tag.id|PlayStore"
   ```
   `tag.id=google_apis` ve `PlayStore.enabled=no` olmalı.

## `Port 8080 hala dolu` hatası

Önceki mitmdump düzgün kapanmamış:

```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess } | Stop-Process -Force
```

Sonra `start-capture.ps1`'i tekrar çalıştır.

## Emülatör açılmıyor / çok yavaş / bellek yetmiyor

Emülatör **4 GB RAM** tutuyor, makinede 15.7 GB var. Docker Desktop, Teams ve
tarayıcı açıkken sıkışabilir.

```powershell
& "C:\Android\Sdk\emulator\emulator.exe" -accel-check     # WHPX usable demeli
Get-CimInstance Win32_OperatingSystem | ForEach-Object { "bos: {0:N1} GB" -f ($_.FreePhysicalMemory/1MB) }
```

RAM'i düşürmek istersen (emülatör kapalıyken):

```powershell
$cfg = "$env:USERPROFILE\.android\avd\capture33.avd\config.ini"
(Get-Content $cfg) -replace '^hw\.ramSize=.*','hw.ramSize=3072' | Set-Content $cfg -Encoding ascii
```

## Servisler cevap vermiyor (`nigde.bel.tr` adreslerine ulaşılamıyor)

Makinede **GlobalProtect VPN** başlangıçta çalışıyor. Servisler VPN arkasındaysa
VPN bağlı değilken istekler timeout verir. Önce host'tan dene:

```powershell
Test-NetConnection -ComputerName authentication.nigde.bel.tr -Port 443
```

`TcpTestSucceeded : False` dönüyorsa sorun emülatörde değil, ağda. VPN'i kontrol
et.

## `Client TLS handshake failed`

1. Sertifika yerinde mi:
   ```powershell
   & "C:\Android\Sdk\platform-tools\adb.exe" shell ls -l /system/etc/security/cacerts/c8750f0d.0
   ```
   Yoksa `setup-proxy.ps1` çalıştır.
2. `captures\` altında `status: (yanit yok)` yazan dosyalara bak — hangi host'ta
   patladığını gösterir.
3. İkisi de temizse certificate pinning olabilir. Bu APK'da pinning
   **tespit edilmedi** (dex'te konfigüre edilmiş pin literali yok, network
   security config'de `<pin-set>` yok), o yüzden beklenmiyor. Yine de çıkarsa
   Frida + objection gerekir, ayrı bir iş.

## Script çalışmıyor: "bu sistemde betik çalıştırma devre dışı"

ExecutionPolicy `RemoteSigned` (kontrol edildi, sorun olmamalı). Yine de
çıkarsa, sadece o pencere için:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

İnternetten indirilmiş bir dosya gibi işaretlendiyse:

```powershell
Unblock-File D:\beyan\capture\*.ps1
```

---

## Bu ortamdaki sabitler

Bir şeyi elle kontrol etmen gerekirse:

```
SDK               C:\Android\Sdk
adb               C:\Android\Sdk\platform-tools\adb.exe          (37.0.1)
emulator          C:\Android\Sdk\emulator\emulator.exe           (37.1.11)
openssl           C:\Strawberry\c\bin\openssl.exe                (3.6.1)
AVD               capture33   API 33, google_apis, x86_64, PlayStore kapali
AVD config        C:\Users\okan\.android\avd\capture33.avd\config.ini
mitmproxy CA      C:\Users\okan\.mitmproxy\mitmproxy-ca-cert.cer
CA hash           c8750f0d    ->  /system/etc/security/cacerts/c8750f0d.0
Proxy             10.0.2.2:8080   (emulator icinden host makine)
APK               D:\beyan\MobilBeyan53.apk
Paket             sampas.android.mobilbeyan   (v53.0, targetSdk 28)
Launcher          sampas.android.mobilbeyan/.Login
Proje             D:\beyan\capture
Kurulum logu      D:\beyan\capture\run\setup.log
```

**Neden bu seçimler** (değiştirme, kırılır):

- `google_apis` — `google_apis_playstore` imajında `adb root` çalışmaz, sistem
  sertifika deposuna yazılamaz.
- API 33 — API 34+ CA deposunu `/apex/com.android.conscrypt/cacerts` altına
  taşıdı, bind-mount gerekirdi.
- **Sistem deposu, kullanıcı deposu değil** — bu uygulamanın network security
  config'inde `<certificates src="system"/>` var ama `src="user"` **yok**.
  Kullanıcı deposuna atılan sertifika hiçbir koşulda kabul edilmez.
- `-writable-system` + `-no-snapshot-load` **birlikte** — ikisi olmadan sistem
  partisyonu yazılabilir olmuyor.
- Dosya adı `c8750f0d.0` — `openssl x509 -subject_hash_old` çıktısı + `.0`.
  Android sertifikaları bu isimle arar, başka isimle görmez.

---

## Gizlilik notu

SOAP zarfları kimlik bilgisi taşıyor; yakalanan XML'lerde şifreler düz metin
görünür. `captures\` klasörünü paylaşmadan önce içine bak.
