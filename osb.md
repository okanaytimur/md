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