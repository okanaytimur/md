## Claude responded: En basit yol .deb paketi: /usr/bin altına kurulduğu için sudo fresh doğrudan çalışır.

Fetched: GitHub - sinelaw/fresh: Terminal based IDE & text editor: easy, powerful and fast

Fetched: GitHub - sinelaw/fresh: Terminal based IDE & text editor: easy, powerful and fast

En basit yol `.deb` paketi: `/usr/bin` altına kurulduğu için `sudo fresh` doğrudan çalışır. Varsayılan hızlı kurulum ise `~/.local/bin`'e kurar ve sudo'nun PATH'i orayı görmez.



bash

```bash
curl -sL $(curl -s https://api.github.com/repos/sinelaw/fresh/releases/latest | grep "browser_download_url.*_$(dpkg --print-architecture)\.deb" | cut -d '"' -f 4) -o fresh-editor.deb
sudo dpkg -i fresh-editor.deb
rm fresh-editor.deb
```

Kontrol etmek için:



bash

```bash
which fresh
sudo fresh /etc/hosts
```

Bu yolla güncellemeler artık apt/dpkg üzerinden yapılır. `fresh --cmd update` ile kendi kendini güncelleyen sürüm yalnızca universal build'de var. Güncellemek istediğinde yukarıdaki iki komutu tekrar çalıştırman yeterli.

Kurulumu install script'iyle yapmak istersen aynı sonucu şu komut verir:



bash

```bash
curl -fsSL https://raw.githubusercontent.com/sinelaw/fresh/refs/heads/master/scripts/install.sh | sh -s -- --method=deb
```

`sudo fresh` ile açtığında editör root kullanıcısının ayarlarını (`/root/.config/...`) kullanır. Senin kullanıcı ayarların ve temaların bu modda gelmez.

