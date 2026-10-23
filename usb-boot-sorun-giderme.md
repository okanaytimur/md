# USB'den Boot Sorunu – Notlar

**Durum:** `boot.asm` nasm ile derlendi ve `boot.bin` (512 bayt, sonu `55 AA`) elde edildi. QEMU'da çalışıyor, ama gerçek bilgisayarda USB BIOS boot menüsünde görünmüyor.

Kodda hata yok. Sorun büyük olasılıkla firmware ayarlarında veya USB'ye yazma biçiminde.

---

## 1. Bilgisayar UEFI modunda açılıyor (en olası neden)

Yazdığımız şey eski tip (legacy) bir MBR boot sektörü. Yeni bilgisayarlar varsayılan olarak yalnızca UEFI ile açılır. UEFI, USB'de `EFI\BOOT\BOOTX64.EFI` dosyasını arar ve bu dosya yoksa USB'yi menüde **hiç göstermez**.

**Çözüm:** BIOS/UEFI ayarlarına gir (genelde F2 veya Del):

- [ ] **CSM / Legacy Support / Legacy Boot** ayarını **Enabled** yap
- [ ] **Secure Boot** ayarını **Disabled** yap (CSM'i açabilmek için çoğu zaman önce bunu kapatmak gerekir)
- [ ] Boot modunu "UEFI only" yerine **"Legacy + UEFI"** veya **"Legacy first"** yap
- [ ] Ayarları kaydedip çık (genelde F10)
- [ ] Boot menüsünde (F12, F11, F8 veya Esc) USB'yi ara. Başında "UEFI:" **olmayan**, "USB HDD: ..." gibi bir kayıt olmalı

> Not: Intel'in 2020 sonrası çıkan bazı platformlarında CSM tamamen kaldırıldı. Seçenek hiç yoksa legacy MBR kodu doğrudan çalıştırılamaz. O durumda ya eski bir bilgisayar kullanılmalı ya da bir UEFI uygulaması yazılmalı.

---

## 2. Rufus imajı ham (DD) olarak yazmamış olabilir

Rufus `.bin` dosyasını her zaman olduğu gibi yazmaz. Sektörün USB'ye birebir yazılması gerekiyor.

- Dosyanın adını `boot.img` yap, Rufus'ta seç. "DD modunda yaz" diye sorarsa **DD**'yi seç.
- Alternatif: **Win32 Disk Imager** veya Git Bash'te `dd`.

USB'nin ilk sektörü okunup `boot.bin` ile aynı olup olmadığı kontrol edilebilir (yönetici yetkisi gerekir).

---

## 3. Bazı BIOS'lar partition tablosu olmayan USB'yi tanımıyor

Mevcut MBR'da partition tablosu tamamen sıfır. Bazı firmware'ler, aktif (0x80) işaretli bir partition göremezlerse USB'yi "boot edilemez" sayıp listeye almaz. Ayrıca bazıları USB'yi disket gibi gösterir ve 0x03–0x5A arasındaki baytların üzerine BPB verisi yazar, bu da kodu bozar. Bazı BIOS'lar da kodu `0x0000:7C00` yerine `0x07C0:0000` adresinden başlatır.

Bu üç durumu da hesaba katan sürüm:

```nasm
[org 0x7c00]
[bits 16]
    jmp short basla
    nop
    times 87 db 0          ; BPB alanı: BIOS buraya yazarsa kod bozulmasın

basla:
    cli
    xor ax, ax
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov sp, 0x7c00
    sti
    jmp 0x0000:normal      ; CS'yi 0'a sabitle

normal:
    mov ah, 0x0e
    mov si, mesaj
yazdir_dongu:
    lodsb
    cmp al, 0
    je son
    int 0x10
    jmp yazdir_dongu
son:
    jmp $

mesaj:
    db "Merhaba, Dunya! Kendi bootloader'imiz calisiyor!", 0

    times 0x1BE-($-$$) db 0
    ; Tek bir aktif partition kaydı (bazı BIOS'lar bunu arar)
    db 0x80, 0x00, 0x02, 0x00   ; aktif, CHS başlangıç
    db 0x01, 0xFE, 0xFF, 0xFF   ; tip, CHS bitiş
    dd 1                        ; LBA başlangıç
    dd 2047                     ; sektör sayısı
    times 510-($-$$) db 0
    dw 0xaa55
```

Derleme ve yazma:

```
nasm -f bin boot.asm -o boot.img
```

Sonra imajı Rufus'la DD modunda (veya Win32 Disk Imager ile) USB'ye yaz.

---

## Önerilen sıra

1. Önce **1. madde**: CSM'i aç, Secure Boot'u kapat, yeniden dene. Vakaların çoğunda sorun bununla çözülür.
2. Hâlâ görünmüyorsa **2. madde**: USB'yi DD modunda yeniden yaz.
3. Hâlâ görünmüyorsa veya ekranda bozuk karakterler çıkıyorsa **3. madde**: düzeltilmiş kodla yeni imaj oluştur.
