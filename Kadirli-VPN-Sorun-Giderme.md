# Kadirli FortiClient IPSec VPN – Sorun Giderme

**Tarih:** 14.10.2026
**Belirti:** FortiClient'ta Kadirli bağlantısı "bağlanıyor" durumunda kalıyor, ~5 dk sonra `connection failed (reason: None)` hatasıyla düşüyor.
**Kök neden:** FortiClient profilindeki **Pre-shared Key (PSK)** ile Kadirli FortiGate'teki `local-vpn` tünelinin PSK'sı uyuşmuyordu.
**Çözüm:** FortiGate'te `local-vpn` tünelinin PSK'sı yeniden belirlendi, aynı anahtar FortiClient profiline girildi.

---

## Bağlantı bilgileri

| Ayar | Değer |
|---|---|
| FortiClient profil adı | Kadirli |
| Tip | IPSec VPN |
| Uzak ağ geçidi | `195.175.84.218` |
| IKE | v1, **Aggressive mode**, UDP 500 |
| Kimlik doğrulama | Pre-shared Key + XAuth (kullanıcı adı/şifre) |
| Phase 1 | AES256 / SHA256 / DH Group 5 (MODP1536) |
| FortiGate tünel adı | **`local-vpn`** |

---

## Hızlı kontrol (önce bunu dene)

1. FortiClient'ta Kadirli profilini düzenle → **Pre-shared Key**'i dikkatle yeniden gir → kaydet → bağlan.
2. Olmazsa FortiGate'te debug yap (aşağıda) ve logu yorumla.

---

## 1. Bilgisayar tarafı kontroller (PowerShell)

```powershell
# FortiClient servis/süreçleri
Get-Service FA_Scheduler
Get-Process | Where-Object Name -match 'forti'

# Ağ geçidi ayakta mı? (ping kapalı olabilir, TCP 443 ile bak)
Test-NetConnection 195.175.84.218 -Port 443

# Public IP'm (FortiGate logunda filtrelemek için)
Invoke-RestMethod https://api.ipify.org

# FortiClient VPN logları
Get-Content 'C:\Program Files\Fortinet\FortiClient\logs\trace\FortiVPN_1_error.log' -Tail 20
```

## 2. Paket yakalama (Yönetici PowerShell)

```powershell
pktmon filter remove
pktmon filter add KadirliGW -i 195.175.84.218
pktmon start --capture --pkt-size 0 --file-name C:\temp\kadirli.etl
# >>> Şimdi FortiClient'tan bağlanmayı dene, 30-60 sn bekle <<<
pktmon stop
pktmon etl2pcap C:\temp\kadirli.etl --out C:\temp\kadirli.pcapng   # Wireshark ile açılır
pktmon etl2txt  C:\temp\kadirli.etl --out C:\temp\kadirli.txt --brief
pktmon filter remove
```

**Yorumlama:**

| Görülen | Anlamı |
|---|---|
| Sadece giden 508 bayt paketler, cevap yok | UDP 500 yolda engelleniyor / FortiGate'te eşleşen tünel yok |
| Giden 508 → gelen 536 → giden **92 bayt** (döngü, ~3 sn'de bir) | **PSK uyuşmazlığı** (bu olayda görülen) |
| 4500 portuna trafik başlıyor | Phase 1 geçti; sorun XAuth / Phase 2 aşamasında |

## 3. FortiGate tarafı debug (CLI Console)

```
diagnose debug reset
diagnose vpn ike log filter rem-addr4 <BENIM_PUBLIC_IP>
diagnose debug application ike -1
diagnose debug console timestamp enable
diagnose debug enable
```

FortiClient'tan bağlanmayı dene, 10-15 sn sonra:

```
diagnose debug disable
diagnose debug reset
```

**PSK uyuşmazlığının logdaki imzası:**

```
SA proposal chosen, matched gateway local-vpn      <- teklif uyumlu
sent IKE msg (agg_r1send) ... len=536               <- FortiGate cevap verdi
comes ... len=92 ... exchange=Informational         <- istemci şifreli hata mesajı yolluyor,
                                                       FortiGate çözemiyor (içeriği loglanmıyor)
... retransmission, re-send last message            <- döngü tekrar ediyor
```

## 4. PSK'yı yenileme

**FortiGate GUI:** VPN → IPsec Tunnels → `local-vpn` → Authentication → **Pre-shared Key** → OK

**FortiGate CLI:**

```
config vpn ipsec phase1-interface
    edit local-vpn
        set psksecret <YENI_ANAHTAR>
    next
end
```

**FortiClient:** Kadirli profilini düzenle → Pre-shared Key → aynı anahtar → kaydet → bağlan.

> ⚠️ `local-vpn` tünelini kullanan diğer kişilerin de FortiClient'larında anahtarı güncellemesi gerekir, yoksa onların bağlantısı kopar.
> Anahtarda Türkçe karakter ve boşluk kullanma. Anahtarı bu dosyaya yazma, şifre yöneticisinde sakla.
