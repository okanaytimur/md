# prjshare Üzerinden SSH Erişimi: Yeni Kullanıcı Ekleme Rehberi

Bu rehber, bir çalışma arkadaşının kendi bilgisayarından `ssh beysehir` gibi komutlarla
belediye sunucularına **prjshare** üzerinden bağlanabilmesi için yapılması gerekenleri anlatır.

Örneklerde kullanıcı adı yerine `KULLANICI` yazılmıştır (ör. `lseker`). Bilgisayar adı ve
anahtar satırı kişiye göre değişir.

---

## Genel yapı

```
Kullanıcının PC'si  ──SSH──►  prjshare (prjshare.sampas.com.tr:2244)  ──►  127.0.0.1:22xx  ──►  Belediye sunucusu
                              Windows Server (INT-WIN-SFTP-5)              (ters tünel)
                              OpenSSH, domain hesabı ile giriş
```

Kullanıcının iki girişi geçmesi gerekir:

1. **prjshare girişi:** Kullanıcının kendi domain hesabı (`SAMPAS\KULLANICI`) ve kendi SSH anahtarı ile.
2. **Belediye sunucusu girişi:** O sunucudaki ortak kullanıcı (ör. `beysehir`) ve onun parolası ile.

> Başkasının (ör. kendi) anahtarınızı paylaşmayın. Her kullanıcı kendi anahtarını oluşturur.
> Böylece yapılan işlemler doğru kişiye yazılır ve erişim kişi bazında kapatılabilir.

---

## Adım 1: Kullanıcının bilgisayarında anahtar oluşturma

Kullanıcı kendi bilgisayarında **cmd** açar. Komutları **teker teker** yazıp her birinden sonra Enter'a basar.
İki komutu aynı satıra yazmayın, yoksa `mkdir` her kelimeyi klasör sanır.

```
mkdir "%USERPROFILE%\.ssh"
```

("zaten var" derse sorun değil.)

```
ssh-keygen -t ed25519 -f "%USERPROFILE%\.ssh\prjshare_ed25519"
```

- Passphrase sorulursa boş bırakıp iki kez Enter'a basılabilir.
- "Your public key has been saved" mesajı görülmelidir.

> **Dikkat:** cmd'de `~/.ssh/...` **çalışmaz** ("No such file or directory" hatası verir).
> cmd'de her zaman `%USERPROFILE%` kullanın.

Açık anahtarı gösterin:

```
type "%USERPROFILE%\.ssh\prjshare_ed25519.pub"
```

Çıkan tek satırı (`ssh-ed25519 AAAA... sampas\KULLANICI@PC-ADI`) kopyalayıp yöneticiye gönderin.

- `prjshare_ed25519.pub`: **açık anahtar**, gönderilebilir.
- `prjshare_ed25519`: **gizli anahtar**, kimseye gönderilmez.

---

## Adım 2: prjshare sunucusunda anahtarı tanımlama

prjshare bir **Windows Server**'dır. Domain kullanıcılarının profili `C:\Users\` altında
zaten bulunur, bu yüzden ayrıca hesap açmaya gerek yoktur.

> Kullanıcının profil klasörü (`C:\Users\KULLANICI`) yoksa, kullanıcının sunucuya en az bir kez
> (RDP vb. ile) giriş yapması gerekir. Böylece Windows profili oluşturur.

### 2a. Yöntem A (önerilen): Kullanıcının kendi oturumuyla

Sunucuya **KULLANICI olarak** bağlanın (RDP veya parolalı SSH). PowerShell açın:

```powershell
New-Item -ItemType Directory -Force $HOME\.ssh
```

```powershell
Add-Content -Encoding ascii -Path $HOME\.ssh\authorized_keys -Value 'ssh-ed25519 AAAA...BURAYA_ANAHTAR... sampas\KULLANICI@PC-ADI'
```

```powershell
Get-Content $HOME\.ssh\authorized_keys
```

Son komut anahtar satırını göstermelidir. Dosyayı kullanıcının kendisi oluşturduğu için izinler
otomatik olarak doğru olur.

### 2b. Yöntem B: Yönetici hesabıyla, başka kullanıcı adına

Kendi hesabınızla (ör. `oaytimur`) yapıyorsanız `$HOME` yerine tam yol kullanın ve **izinleri düzeltin**.
Aksi halde OpenSSH dosyayı güvensiz bulur ve anahtarı kabul etmez.

```powershell
New-Item -ItemType Directory -Force C:\Users\KULLANICI\.ssh
```

```powershell
Add-Content -Encoding ascii -Path C:\Users\KULLANICI\.ssh\authorized_keys -Value 'ssh-ed25519 AAAA... sampas\KULLANICI@PC-ADI'
```

```powershell
icacls C:\Users\KULLANICI\.ssh\authorized_keys /inheritance:r /grant "SAMPAS\KULLANICI:F" /grant "SYSTEM:F" /grant "Administrators:F"
```

```powershell
icacls C:\Users\KULLANICI\.ssh\authorized_keys /setowner "SAMPAS\KULLANICI"
```

### 2c. Özel durum: Kullanıcı sunucuda yönetici ise

`C:\ProgramData\ssh\sshd_config` dosyasında şu kural var:

```
Match Group administrators
       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys
```

Yani kullanıcı **Administrators** grubundaysa, kendi klasöründeki `authorized_keys` dosyası
**dikkate alınmaz**. Kontrol etmek için:

```powershell
net localgroup administrators
```

Kullanıcı (veya üyesi olduğu bir grup, ör. `SAMPAS\Domain Admins`) listede çıkarsa anahtarı
yönetici yetkisiyle şu dosyaya ekleyin:

```powershell
Add-Content -Encoding ascii -Path C:\ProgramData\ssh\administrators_authorized_keys -Value 'ssh-ed25519 AAAA... sampas\KULLANICI@PC-ADI'
```

Bu dosyanın izinleri yalnızca `SYSTEM` ve `Administrators` olmalıdır:

```powershell
icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "SYSTEM:F" /grant "Administrators:F"
```

---

## Adım 3: Kullanıcının bilgisayarında config dosyası

`C:\Users\KULLANICI\.ssh\config` dosyasını Not Defteri ile oluşturun.

> Kaydederken **Dosya türü: Tüm Dosyalar** seçin ve adı `config` olarak yazın.
> Sonunda `.txt` **olmamalıdır**.
> (Config dosyasının **içinde** `~` kullanmak sorunsuzdur; sorun yalnızca cmd komutlarındadır.)

Temel içerik:

```
Host prjshare
    HostName prjshare.sampas.com.tr
    Port 2244
    User KULLANICI
    IdentityFile ~/.ssh/prjshare_ed25519
    IdentitiesOnly yes
```

Ardından kullanıcının erişmesi gereken sunucular eklenir. Örnek (Beyşehir):

```
Host beysehir
    HostName 127.0.0.1
    Port 2216
    User beysehir
    ProxyJump prjshare

Host beysehir-db
    HostName 127.0.0.1
    Port 2216
    User beysehir
    ProxyJump prjshare
    LocalForward 15216 192.168.1.12:1521
```

Kalıp her sunucu için aynıdır. `HostName 127.0.0.1` ve `ProxyJump prjshare` sabit kalır,
sadece **Port**, **User** ve gerekirse **LocalForward** değişir.

### Sunucu port / kullanıcı tablosu

| Host         | Port | Sunucu kullanıcısı | DB tüneli (LocalForward)       |
|--------------|------|--------------------|--------------------------------|
| adiyaman     | 2201 | is_zekasi          | 15201 → 192.168.61.200:1521    |
| adiyamane    | 2202 | edevlet            |                                |
| baglar       | 2203 | ebelediye          | 15203 → 192.168.1.100:1521     |
| cizre        | 2204 | sampas             |                                |
| cukurova     | 2205 | tahsilat-admin     | 15205 → 192.168.1.10:1521      |
| ergani       | 2206 | ergani             |                                |
| kiziltepe    | 2207 | webportal          |                                |
| midyat       | 2208 | etahsilat          |                                |
| nigde        | 2209 | edevlet            | 15209 → 192.168.1.10:1521      |
| urfa         | 2210 | sanliurfa          |                                |
| batman       | 2211 | manager            | 15211 → 192.168.1.10:1521      |
| tusba        | 2212 | sampas             | 15212 → 192.168.1.170:1521     |
| malatya      | 2213 | mbbuser            | 15213 → 10.10.10.13:1521       |
| yuregir      | 2214 | sampas             | 15214 → 192.168.1.241:1521     |
| kadirli      | 2215 | kadirli            | 15215 → 192.168.0.10:1521      |
| beysehir     | 2216 | beysehir           | 15216 → 192.168.1.12:1521      |
| karapinar    | 2217 | ebelediye          | 15217 → 192.168.1.250:1521     |
| sapanca      | 2218 | tahsilat           | 15218 → 192.168.54.100:1521    |

(Kaynak: `oaytimur` kullanıcısının `~/.ssh/config` dosyası, 2026-11-06.)

---

## Adım 4: Test

Kullanıcının bilgisayarında, cmd'de:

```
ssh prjshare
```

- İlk bağlantıda "Are you sure you want to continue connecting" sorulur, `yes` yazın.
- **Parola sormadan** bağlanmalıdır. Bağlanırsa Adım 1-3 doğru yapılmış demektir.

```
ssh beysehir
```

- Belediye sunucusu parola isteyebilir. Bu, o sunucudaki kullanıcının (ör. `beysehir`) parolasıdır.

DB tüneli için `ssh beysehir-db` ile bağlanın. Pencere açık kaldığı sürece
`localhost:15216` üzerinden Oracle'a erişilir.

---

## Sorun giderme

| Belirti | Olası sebep / çözüm |
|---|---|
| `ssh-keygen`: `Saving key "~/.ssh/..." failed: No such file or directory` | cmd'de `~` kullanılmış. `%USERPROFILE%` kullanın. |
| `ssh-keygen`: `... already exists. Overwrite (y/n)?` (ilk kez oluştururken) | Komutlar aynı satıra yazılıp `mkdir` yanlış klasörler açmış olabilir. `C:\Users\KULLANICI\` ve `.ssh` altında `-t`, `-f`, `ed25519`, `.sshssh-keygen`, `prjshare_ed25519` adlı **klasörleri** `rmdir` ile silip tekrar deneyin. |
| `ssh prjshare` parola soruyor / `Permission denied (publickey)` | Anahtar yanlış dosyada olabilir (kullanıcı yönetici mi? bkz. 2c), dosya izinleri yanlış olabilir (bkz. 2b) ya da config'de `IdentityFile` yanlış olabilir. |
| Config hiç okunmuyor (`Could not resolve hostname prjshare`) | Dosya adı `config.txt` olarak kaydedilmiş. `dir %USERPROFILE%\.ssh` ile kontrol edip yeniden adlandırın. |
| `ssh prjshare` çalışıyor ama `ssh beysehir` bağlanmıyor | Belediye tarafındaki ters tünel kapalı olabilir (port 22xx dinlemiyor). Kendi hesabınızla da deneyin; o da bağlanmıyorsa sorun kullanıcıda değildir. |

Sunucu tarafında sebebi görmek için (prjshare'de, bağlantı denemesinden hemen sonra):

```powershell
Get-WinEvent -LogName OpenSSH/Operational -MaxEvents 20 | Format-List TimeCreated, Message
```

Kullanıcı tarafında ayrıntılı çıktı için:

```
ssh -v prjshare
```

---

## Erişimi kaldırma

prjshare'de kullanıcının `authorized_keys` dosyasından ilgili satırı silmek yeterlidir:

```
C:\Users\KULLANICI\.ssh\authorized_keys
```

(Yönetici kullanıcılar için: `C:\ProgramData\ssh\administrators_authorized_keys`)
