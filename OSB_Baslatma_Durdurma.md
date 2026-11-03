# OSB (WebLogic 10.3.6) Başlatma / Durdurma — sampasosb

- **Domain:** `/oracle/Middleware/user_projects/domains/osb_domain`
- **Admin URL:** `t3://sampasosb:7001`
- **Managed server:** `osb_server1`
- **Kullanıcı:** Tüm işlemler `oracle` kullanıcısıyla yapılır (script'ler `oracle:oinstall`, `rwxr-x---`; root ile çalışmaz).

> Not: `/oracle/Middleware_org_before_patch/` patch öncesi yedek, **kullanılmıyor**. Sunucu RHEL/CentOS (`apt` yok, `yum` var).

---

## 0. Kullanıcıya geç

```bash
su - oracle
cd /oracle/Middleware/user_projects/domains/osb_domain/bin
```

## 1. AdminServer'ı başlat

```bash
nohup ./startWebLogic.sh > /tmp/AdminServer.out 2>&1 &
tail -f /tmp/AdminServer.out
```

Şu satırı görünce hazır:

```
<Server state changed to RUNNING>
```

Konsol: `http://sampasosb:7001/console`

## 2. osb_server1'i başlat

```bash
nohup ./startManagedWebLogic.sh osb_server1 t3://sampasosb:7001 > /tmp/osb_server1.out 2>&1 &
tail -f /tmp/osb_server1.out
```

Yine `RUNNING` görülene kadar bekle.

Kalıcı log:

```
/oracle/Middleware/user_projects/domains/osb_domain/servers/osb_server1/logs/osb_server1.log
```

> `nohup ... &` olmadan ön planda başlatılırsa SSH kapanınca server da kapanır.

### Kullanıcı adı / şifre sormasın (tek seferlik)

`nohup` ile arka planda başlatırken şifre sorarsa takılır. Bunu önlemek için:

```bash
mkdir -p /oracle/Middleware/user_projects/domains/osb_domain/servers/osb_server1/security
cat > /oracle/Middleware/user_projects/domains/osb_domain/servers/osb_server1/security/boot.properties <<EOF
username=weblogic
password=<SIFRE>
EOF
```

İlk başarılı açılışta dosya otomatik şifrelenir. AdminServer için de aynısı `servers/AdminServer/security/boot.properties` altına yapılır.

## 3. (Opsiyonel) NodeManager

Sadece konsoldan start/stop yapılacaksa gerekir:

```bash
cd /oracle/Middleware/wlserver_10.3/server/bin
nohup ./startNodeManager.sh > /tmp/nodemanager.out 2>&1 &
```

## 4. Kontrol

```bash
ps -ef | grep weblogic.Name | grep -v grep
```

İki process görünmeli: `-Dweblogic.Name=AdminServer` ve `-Dweblogic.Name=osb_server1`.

## 5. Durdurma (ters sıra)

```bash
su - oracle
cd /oracle/Middleware/user_projects/domains/osb_domain/bin
./stopManagedWebLogic.sh osb_server1 t3://sampasosb:7001
./stopWebLogic.sh
```

---

## Normal sayılan uyarılar (görmezden gel)

- `Unable to load performance pack`, `native wlfileio` ve `libstackdump.so`: 32-bit native path, Java I/O'ya düşüyor, çalışıyor.
- `default-keystore.jks cannot be loaded` ve OWSM `oauth2 ... policy` / `WSM-02055`: OWSM/OAuth2 kullanılmıyorsa önemsiz.
- `No PKI / user password credential mapper`: OSB service account veya WS-Security kullanılmıyorsa önemsiz.
- `MQ Transport`, `toplink-grid`, `DMS-50911 Duplicated metric table`: OSB 11g'de standart.
- `Coherence ... loopback address`: tek node, sorun değil.
- `BEA-000449 Closing socket ... 159.59.0.6`: muhtemelen LB/monitoring TCP health check.
