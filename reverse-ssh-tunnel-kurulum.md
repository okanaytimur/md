# Ubuntu Sunucular → Windows Sunucu Reverse SSH Tünel Kurulumu

## Genel Yapı

Her Ubuntu sunucu, `autossh` + `systemd` ile Windows sunucuya kalıcı bir reverse SSH tüneli açar. Her sunucuya Windows tarafında ayrı bir localhost portu atanır:

```
ubuntu01 → Windows 127.0.0.1:2201
ubuntu02 → Windows 127.0.0.1:2202
...
ubuntu15 → Windows 127.0.0.1:2215
```

Windows'tan `ssh -p 2201 kullanici@localhost` ile ilgili Ubuntu sunucuya bağlanılır.

| Bilgi | Değer |
|---|---|
| Windows sunucu | `prjshare.sampas.com.tr` (INT-WIN-SFTP-5) |
| Windows SSH portu | `2244` |
| Bağlanan hesap | `oaytimur` (Domain Admins üyesi) |
| Anahtar dosyası | `C:\ProgramData\ssh\administrators_authorized_keys` |
| Script konumu (FTP) | `MISDESTEK/HP/tunnel.sh` |
| Tünel portları | `2201` – `2215` |

Tünel portları Windows'ta sadece `127.0.0.1` üzerinde dinler, dışarıya açılmaz. Dışarıya açık olan tek port `2244`'tür.

---

## 1. Windows Sunucu Hazırlığı (bir kez yapılır)

Tüm adımlar RDP üzerinden, **yönetici olarak açılmış PowerShell** ile yapılır.

### 1.1 sshd_config güncellemesi

Yedek alın ve dosyayı açın:

```powershell
Copy-Item C:\ProgramData\ssh\sshd_config C:\ProgramData\ssh\sshd_config.bak
notepad C:\ProgramData\ssh\sshd_config
```

Şu iki satırı bulun:

```
#ClientAliveInterval 0
#ClientAliveCountMax 3
```

Aşağıdaki gibi değiştirin:

```
ClientAliveInterval 30
ClientAliveCountMax 3
```

> Bu satırlar `Match Group administrators` bloğundan **önce** olmalıdır. Kopan tünellerin portu Windows'ta takılı kalmasın diye gereklidir.

Config'i test edin (çıktı boşsa sorun yoktur) ve servisi yeniden başlatın:

```powershell
& (Get-Command sshd).Source -t
Restart-Service sshd
```

> Restart, bağlı SFTP kullanıcılarını birkaç saniye düşürür. Yoğun olmayan bir saatte yapın.

Mevcut config'de değişmemesi gereken önemli satırlar şunlardır:

- `Port 2244`
- `#AllowTcpForwarding yes`: yorumda kalmalı, varsayılan `yes` değeri tünel için gerekli.
- `ChrootDirectory "D:/SFTPRoot"`: sadece SFTP oturumlarını etkiler, tüneli etkilemez.
- `Match Group administrators` bloğu: admin hesapların anahtarları `administrators_authorized_keys` dosyasından okunur.

### 1.2 Anahtar dosyasının oluşturulması

```powershell
New-Item -ItemType File -Force C:\ProgramData\ssh\administrators_authorized_keys
icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
```

---

## 2. Kurulum Script'i (tunnel.sh)

FTP'de `MISDESTEK/HP/tunnel.sh` konumunda durur.

```bash
#!/bin/bash
# tunnel-setup.sh <PORT>
set -e

PORT="$1"
WIN_HOST="prjshare.sampas.com.tr"
WIN_SSH_PORT="2244"
WIN_USER="oaytimur"
KEY="/root/.ssh/tunnel_key"

[ -z "$PORT" ] && { echo "Kullanim: $0 <port>"; exit 1; }

apt-get update -qq && apt-get install -y autossh

[ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -f "$KEY" -C "$(hostname)-tunnel"

cat > /etc/systemd/system/reverse-tunnel.service <<EOF
[Unit]
Description=Reverse SSH tunnel to Windows ($PORT)
After=network-online.target
Wants=network-online.target

[Service]
Environment="AUTOSSH_GATETIME=0"
ExecStart=/usr/bin/autossh -M 0 -N \\
  -p $WIN_SSH_PORT \\
  -l $WIN_USER \\
  -o ServerAliveInterval=30 \\
  -o ServerAliveCountMax=3 \\
  -o ExitOnForwardFailure=yes \\
  -o StrictHostKeyChecking=accept-new \\
  -i $KEY \\
  -R 127.0.0.1:$PORT:localhost:22 \\
  $WIN_HOST
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable reverse-tunnel

echo
echo "=== Bu satiri Windows'ta C:\\ProgramData\\ssh\\administrators_authorized_keys dosyasina ekleyin ==="
echo "restrict,port-forwarding,permitlisten=\"127.0.0.1:$PORT\" $(cat $KEY.pub)"
echo
echo "Ekledikten sonra: systemctl start reverse-tunnel"
```

> `permitlisten` değeri `127.0.0.1:PORT` olmalıdır, `localhost:PORT` olmamalıdır. OpenSSH bu ikisini metin olarak karşılaştırır ve `-R 127.0.0.1:...` ile eşleşmezse tüneli reddeder.

---

## 3. Her Ubuntu Sunucu İçin Kurulum

### Adım 1: Script'i indirip çalıştırın

Sondaki port numarası her sunucuda farklı olmalıdır:

```bash
sudo scp -P 2244 oaytimur@prjshare.sampas.com.tr:MISDESTEK/HP/tunnel.sh /tmp/tunnel.sh &&
sudo sed -i 's/\r$//' /tmp/tunnel.sh &&
sudo bash /tmp/tunnel.sh 2202
```

Host doğrulama sorarsa `yes` yazın, ardından domain şifresini girin.

> `sed` komutu, Windows'ta düzenlenmiş dosyadaki CRLF satır sonlarını temizler. Bu adım atlanırsa bash hata verir.

### Adım 2: Çıktıdaki satırı kopyalayın

Script en sonda şuna benzer bir satır basar:

```
restrict,port-forwarding,permitlisten="127.0.0.1:2202" ssh-ed25519 AAAA... hostname-tunnel
```

### Adım 3: Satırı Windows'a ekleyin

```powershell
Add-Content -Path C:\ProgramData\ssh\administrators_authorized_keys -Encoding ascii -Value 'KOPYALANAN_SATIR'
```

> Satırı Notepad ile eklemeyin. `-Encoding ascii` BOM sorununu önler; BOM'lu dosyada anahtarlar okunmaz.

### Adım 4: Tüneli başlatın (Ubuntu)

```bash
sudo systemctl start reverse-tunnel
sudo systemctl status reverse-tunnel
```

Durum `active (running)` olmalıdır.

### Adım 5: Tüneli kontrol edin (Windows)

```powershell
netstat -ano | findstr "127.0.0.1:2202"
```

`LISTENING` görünmelidir. Başlatma sırasında anahtar henüz eklenmemiş olsa bile autossh 10 saniyede bir yeniden dener ve kendiliğinden bağlanır.

### Adım 6: Bağlantıyı test edin (Windows)

```powershell
ssh -p 2202 kullanici@localhost
```

### Adım 7: Port tablosunu güncelleyin (Bölüm 4)

---

## 4. Port Tablosu

İki sunucuya aynı port verilmemelidir; verilirse ikincisi bağlanamaz.

| Port | Sunucu / Belediye | Hostname | Ubuntu Kullanıcısı | Kurulum Tarihi |
|---|---|---|---|---|
| 2201 | | sampas | is_zekasi | 16.10.2026 |
| 2202 | | | | |
| 2203 | | | | |
| 2204 | | | | |
| 2205 | | | | |
| 2206 | | | | |
| 2207 | | | | |
| 2208 | | | | |
| 2209 | | | | |
| 2210 | | | | |
| 2211 | | | | |
| 2212 | | | | |
| 2213 | | | | |
| 2214 | | | | |
| 2215 | | | | |

---

## 5. Windows'tan Kolay Erişim (isteğe bağlı)

Windows'ta kendi kullanıcınızın `C:\Users\<kullanici>\.ssh\config` dosyasına şu girdileri ekleyin:

```
Host ubuntu01
    HostName 127.0.0.1
    Port 2201
    User is_zekasi

Host ubuntu02
    HostName 127.0.0.1
    Port 2202
    User kullanici
```

Bundan sonra `ssh ubuntu01` yazmak yeterlidir.

---

## 6. Otomatik Yeniden Bağlanma

Bağlantıyı Ubuntu tarafı sürekli ayakta tutar; manuel müdahale gerekmez.

| Durum | Sonuç |
|---|---|
| Ağ kesintisi | 30–90 sn içinde fark edilir, ağ gelince yeniden bağlanır |
| Windows sunucu reboot | Ubuntu'lar 10 sn'de bir dener, sshd açılınca bağlanır |
| Ubuntu reboot | Servis `enable` olduğu için açılışta otomatik başlar |
| Eski oturum portu tutuyor | Windows en geç ~90 sn'de düşürür, sonraki denemede bağlanır |
| Domain şifresi değişir | Etkilemez, bağlantı anahtar ile yapılır |

Aşağıdaki durumlarda bağlantı **kendiliğinden düzelmez**:

- **`oaytimur` hesabı kilitlenir veya kapatılırsa** tüm tüneller düşer.
- **Anahtar satırı `administrators_authorized_keys` dosyasından silinirse** o sunucu bağlanamaz.
- **Windows sunucunun host key'i değişirse** (yeniden kurulum gibi) ilgili Ubuntu'da şu komut çalıştırılmalıdır:
  ```bash
  sudo ssh-keygen -R "[prjshare.sampas.com.tr]:2244" && sudo systemctl restart reverse-tunnel
  ```

---

## 7. Sorun Giderme

| Belirti | Kontrol / Çözüm |
|---|---|
| `netstat`'ta port görünmüyor | Ubuntu'da `sudo journalctl -u reverse-tunnel -n 30 --no-pager` ile logları inceleyin |
| `remote port forwarding failed` | `permitlisten` değeri `127.0.0.1:PORT` olmalı, port script'e verilenle aynı olmalı. Port başka sunucuda kullanılıyor olabilir. |
| `Permission denied (publickey)` | Satır yanlış dosyaya eklenmiş, dosya BOM'lu kaydedilmiş veya dosya izinleri bozulmuş olabilir |
| `$'\r': command not found` | `sed -i 's/\r$//'` adımı atlanmış |
| `sed: couldn't open temporary file` | Komutları `/tmp` altında ve `sudo` ile çalıştırın |
| Windows sshd logları | `Get-WinEvent -LogName OpenSSH/Operational -MaxEvents 20` |

Bir `permitlisten` satırını sonradan düzeltmek için (Windows):

```powershell
(Get-Content C:\ProgramData\ssh\administrators_authorized_keys) -replace 'permitlisten="localhost:','permitlisten="127.0.0.1:' | Set-Content -Encoding ascii C:\ProgramData\ssh\administrators_authorized_keys
type C:\ProgramData\ssh\administrators_authorized_keys
```

---

## 8. Güvenlik Notları

- `oaytimur` hesabı Domain Admins ve Enterprise Admins üyesidir. Bu yüzden `administrators_authorized_keys` dosyasındaki **her satır** `restrict,port-forwarding,permitlisten=...` ile başlamalıdır. Bu sayede bir Ubuntu sunucudan anahtar çalınsa bile Windows'ta shell açılamaz, sadece o sunucuya ait porta tünel açılabilir.
- Bir sunucu devreden çıkarıldığında anahtar satırını dosyadan silin.
- Kalıcı kullanım için IT'den ayrı bir servis hesabı talep etmek, kişisel hesap bağımlılığını ortadan kaldırır.
