# Windows PowerShell 'll' Komutu Tanımlama Rehberi

Windows'ta Linux'taki `ll` (detaylı listeleme) komutunu kalıcı hale getirmek için aşağıdaki adımları sırasıyla uygulayın.

## 1. Profil Dosyasını Oluşturun
PowerShell'i **Yönetici Olarak** açın ve profil dosyasını otomatik oluşturmak için şu komutu çalıştırın:
```powershell
New-Item -Type File -Path $PROFILE -Force
```

## 2. Profili Not Defteri ile Açın
Oluşturulan dosyayı düzenlemek için aşağıdaki komutu yazın:
```powershell
notepad $PROFILE
```

## 3. Kodları Yapıştırın ve Kaydedin
Açılan boş Not Defteri dosyasına aşağıdaki kodları yapıştırın, ardından **Ctrl + S** ile kaydedip kapatın:
```powershell
function Get-DirectoryLongList {
    Get-ChildItem | Format-Table Mode, LastWriteTime, Length, Name
}
New-Alias -Name ll -Value Get-DirectoryLongList -Force
```

## 4. Çalıştırma İznini Verin
PowerShell'in bu profili her açılışta yükleyebilmesi için şu güvenlik iznini tanımlayın (Gelen soruya **Y** deyin):
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Artık PowerShell'i kapatıp açtığınızda **`ll`** komutunu doğrudan kullanabilirsiniz!
