# Git Branch Alma ve Güncelleme Rehberi (Docker Servisleri)

> Komutlarda `TOKEN` yerine kendi GitHub PAT token'ını yaz.
> Repo `sudo` ile clone edildiyse sonraki tüm git komutlarını da `sudo` ile çalıştır (sahiplik/credential karışmasın).

---

## 1. Repo ve Branch Listesi

| Repo | Branch |
|------|--------|
| `SampasHolding/Sampas.Backend.Services` | `eDevlet-Hismet-Tahsilat-Su`, `PersonelBordroService` |
| `SampasHolding/Sampas.Backend.Service.Products` | `master`, `AkosCepVatandas`, `AkosCepBaskan`, `PersonelSorguService` |
| `SampasHolding/OnlineBelediyem` | `main` |
| `OnlineBelediyemSampas/SampasOnlineBelediyemFE_` | — |

---

## 2. Kimlik Doğrulama (Önerilen)

Token'ı URL'e yazmak yerine bir kere kaydet:

```bash
sudo git config --global credential.helper store
```

İlk clone/pull'da sorulduğunda:

```
Username: <GitHub kullanıcı adın>
Password: <PAT token>   # GitHub şifresi DEĞİL
```

> Alternatif: `https://TOKEN@github.com/...` formatı da çalışır ama token `.git/config` içine düz metin olarak yazılır.

---

## 3. İlk Defa Clone Etme

```bash
mkdir -p /app/source/Sampas.Backend.Services
cd /app/source/Sampas.Backend.Services

sudo git clone --single-branch --branch eDevlet-Hismet-Tahsilat-Su \
  https://github.com/SampasHolding/Sampas.Backend.Services.git .
```

Diğer örnekler (boş klasör içinde çalıştır):

```bash
# Products - master
sudo git clone --single-branch --branch master https://github.com/SampasHolding/Sampas.Backend.Service.Products.git .

# Products - diğer branch'ler
sudo git clone --single-branch --branch AkosCepVatandas      https://github.com/SampasHolding/Sampas.Backend.Service.Products.git .
sudo git clone --single-branch --branch AkosCepBaskan        https://github.com/SampasHolding/Sampas.Backend.Service.Products.git .
sudo git clone --single-branch --branch PersonelSorguService https://github.com/SampasHolding/Sampas.Backend.Service.Products.git .

# Services - PersonelBordroService
sudo git clone --single-branch --branch PersonelBordroService https://github.com/SampasHolding/Sampas.Backend.Services.git .

# OnlineBelediyem
sudo git clone --single-branch --branch main https://github.com/SampasHolding/OnlineBelediyem.git .
```

---

## 4. Mevcut Repo'yu Güncelleme

```bash
cd /app/source/Sampas.Backend.Services
git fetch origin
git checkout eDevlet-Hismet-Tahsilat-Su
git pull origin eDevlet-Hismet-Tahsilat-Su
```

`Fast-forward` ve dosya listesi görürsen güncelleme başarılıdır. `Already up to date.` ise zaten günceldir.

### Yerel değişiklikleri koruyarak güncelleme

```bash
git stash
git pull origin eDevlet-Hismet-Tahsilat-Su
git stash pop
```

### Yerel değişiklikleri tamamen silip uzaktakiyle eşitleme

```bash
git fetch origin
git reset --hard origin/eDevlet-Hismet-Tahsilat-Su
```

> ⚠️ Yerel değişiklikler geri döndürülemez şekilde silinir.

---

## 5. Master Branch ile Çalışma (Sampas.Backend.Service.Products)

### 5.1 Commit atabilmek için bir kere

```bash
git config --global user.name  "Ad Soyad"
git config --global user.email "mail@sampas.com.tr"
```

### 5.2 Master'ı clone etme

```bash
mkdir -p /app/source/Sampas.Backend.Service.Products
cd /app/source/Sampas.Backend.Service.Products
git clone --branch master https://github.com/SampasHolding/Sampas.Backend.Service.Products.git .
```

### 5.3 `--single-branch` ile alınmış repoya master'ı ekleme

`--single-branch` clone sadece tek branch'i takip eder. Master'a geçmek için:

```bash
git remote set-branches --add origin master
git fetch origin master
git checkout master
```

### 5.4 Master'ı güncelleme

```bash
git checkout master
git pull origin master
```

### 5.5 Değişiklik yapıp master'a push etme

```bash
git checkout master
git pull origin master          # push'tan önce mutlaka güncelle
git status
git add .
git commit -m "Açıklayıcı commit mesajı"
git push origin master
```

> Push için token'ın `repo` (yazma) yetkisi olmalı. Master korumalıysa doğrudan push reddedilir; 5.6'daki gibi branch açıp PR ile birleştir.

### 5.6 Master'dan yeni branch açıp push etme

```bash
git checkout master
git pull origin master
git checkout -b YeniBranchAdi
# değişiklikler...
git add .
git commit -m "Açıklama"
git push -u origin YeniBranchAdi
```

Ardından GitHub'da `YeniBranchAdi` → `master` Pull Request aç.

### 5.7 Master'daki güncellemeleri kendi branch'ine alma

```bash
git checkout AkosCepVatandas
git fetch origin
git merge origin/master
# çakışma varsa düzelt → git add . → git commit
git push origin AkosCepVatandas
```

### 5.8 Push reddedilirse (`rejected - fetch first`)

Uzakta senin olmayan commit'ler var:

```bash
git pull origin master
# çakışma varsa düzelt, sonra:
git push origin master
```

---

## 6. Kod Güncellendikten Sonra Docker'ı Yeniden Başlatma

```bash
cd /app/source/Sampas.Backend.Services

sudo docker build -t api-randevu-mobilebeyan-be:dev .

sudo docker stop api-randevu
sudo docker rm api-randevu

sudo docker run -d --name api-randevu -p 9080:80 api-randevu-mobilebeyan-be:dev
```

Kontrol:

```bash
sudo docker ps
curl http://192.168.61.82:9080
```

---

## 7. Sorun Giderme

- **Permission denied** → Komutu `sudo` ile çalıştır.
- **`detected dubious ownership`** → `git config --global --add safe.directory /app/source/<repo>`
- **`Authentication failed`** → Token süresi dolmuş/yetkisiz olabilir. Yeni token al, `~/.git-credentials` (sudo ile ise `/root/.git-credentials`) içindeki eski satırı sil.
- **HTTPS hata veriyorsa (TLS/proxy/firewall)** → SSH kullan (aşağıda).

### SSH ile Clone

```bash
# 1. Anahtar oluştur (varsayılan yolu kabul et)
ssh-keygen -t ed25519 -C "sampas@sunucu"

# 2. Public key'i kopyala
cat ~/.ssh/id_ed25519.pub
```

Çıkan satırı **GitHub → Settings → SSH and GPG keys → New SSH key** kısmına ekle (başlık: `Sunucu - YYYY-MM-DD`).

```bash
# 3. Test et (ilk seferde "yes")
ssh -T git@github.com
# Beklenen: Hi <username>! You've successfully authenticated...

# 4. Clone
git clone --single-branch --branch eDevlet-Hismet-Tahsilat-Su \
  git@github.com:SampasHolding/Sampas.Backend.Services.git .
```
