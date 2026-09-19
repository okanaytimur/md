# WEB_KULLANICILAR → OB_KULLANICILAR Aktarım Scripti

`WEB_KULLANICILAR` tablosundaki onaylı kullanıcıları `ORT_SICIL` ile eşleştirerek `OB_KULLANICILAR` ve `OB_KULLANICILAR_ADRES` tablolarına aktarır.

**Sürüm:** Idempotent — birden fazla kez çalıştırılabilir, sadece `OB_KULLANICILAR`'da olmayan kayıtları ekler.

---

## İçindekiler

1. [Ön Hazırlık](#1-ön-hazırlık)
2. [Ön Kontrol Sorguları](#2-ön-kontrol-sorguları)
3. [Aktarım Scripti](#3-aktarım-scripti)
4. [Aktarım Sonrası Kontroller](#4-aktarım-sonrası-kontroller)
5. [Geri Alma](#5-geri-alma)
6. [Teknik Notlar](#6-teknik-notlar)

---

## 1. Ön Hazırlık

### 1.1 Hata log tablosu

Script hata kayıtlarını bu tabloya yazar. Yoksa oluştur:

```sql
CREATE TABLE OB_KULLANICI_HATA
(
  KULLANICI_KOD  VARCHAR2(100 BYTE),
  SICIL_KODU     NUMBER,
  HATA_ACIKLAMA  VARCHAR2(500 BYTE),
  KAYIT_TARIHI   DATE DEFAULT SYSDATE
);
```

Tablo zaten varsa `ORA-00955` alırsın, sorun değil — CREATE'i atla. Önceki çalışmanın logunu temizlemek için:

```sql
DELETE FROM OB_KULLANICI_HATA;
COMMIT;
```

### 1.2 Yedek (üretim ortamında zorunlu)

```sql
CREATE TABLE OB_KULLANICILAR_YEDEK_20260817       AS SELECT * FROM OB_KULLANICILAR;
CREATE TABLE OB_KULLANICILAR_ADRES_YEDEK_20260817 AS SELECT * FROM OB_KULLANICILAR_ADRES;
```

---

## 2. Ön Kontrol Sorguları

### 2.1 Kaç kayıt aktarılacak?

```sql
WITH BAZ AS (
    SELECT A.KULLANICI_KODU, A.SICIL_KODU,
           CASE WHEN B.SAHIS_TURU IN ('G','1') THEN 'G'
                WHEN B.SAHIS_TURU IN ('T','2') THEN 'T' END AS ST,
           TRIM(B.VATANDASLIK_NO) TC, TRIM(B.VERGI_NO) VKN
      FROM WEB_KULLANICILAR A
      LEFT JOIN ORT_SICIL B ON B.SICIL_KODU = A.SICIL_KODU
     WHERE NVL(A.ONAYLIMI_EH,'H') = 'E'
), H AS (
    SELECT BAZ.*,
           CASE WHEN ST='G'     AND TRIM(KULLANICI_KODU)=TC  THEN TC
                WHEN ST='T'     AND VKN IS NOT NULL AND TRIM(KULLANICI_KODU)=VKN THEN VKN
                WHEN ST IS NULL AND TC  IS NOT NULL AND TRIM(KULLANICI_KODU)=TC  THEN TC
                WHEN ST IS NULL AND VKN IS NOT NULL AND TRIM(KULLANICI_KODU)=VKN THEN VKN
           END AS HESAP_KODU
      FROM BAZ
)
SELECT COUNT(*) TOPLAM_EKSIK, COUNT(DISTINCT HESAP_KODU) TEKIL_EKSIK
  FROM H
 WHERE HESAP_KODU IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM OB_KULLANICILAR K WHERE K.KULLANICI_KODU = H.HESAP_KODU);
```

### 2.2 Reddedilecek kayıtların dağılımı

```sql
SELECT DURUM, COUNT(*) ADET FROM (
  SELECT CASE
           WHEN B.SICIL_KODU IS NULL                            THEN 'SICIL YOK'
           WHEN TRIM(A.KULLANICI_KODU) = TRIM(B.VATANDASLIK_NO) THEN 'OK - TC'
           WHEN TRIM(A.KULLANICI_KODU) = TRIM(B.VERGI_NO)       THEN 'OK - VKN'
           ELSE 'TUTARSIZ'
         END AS DURUM
    FROM WEB_KULLANICILAR A
    LEFT JOIN ORT_SICIL B ON B.SICIL_KODU = A.SICIL_KODU
   WHERE NVL(A.ONAYLIMI_EH,'H') = 'E'
) GROUP BY DURUM ORDER BY 2 DESC;
```

---

## 3. Aktarım Scripti

```sql
SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
    -- Adres bilgisi hic yoksa placeholder adres satiri atilsin mi? 'E' = at, 'H' = atma
    C_Bos_Adres_Ekle CONSTANT CHAR(1) := 'E';

    /*** Sadece OB_KULLANICILAR'da OLMAYAN kullanicilar ***/
    CURSOR Data_Cur IS
        WITH BAZ AS (
            SELECT  A.*,
                    -- SAHIS_TURU normalizasyonu: 1/G = Gercek, 2/T = Tuzel
                    CASE
                        WHEN B.SAHIS_TURU IN ('G','1') THEN 'G'
                        WHEN B.SAHIS_TURU IN ('T','2') THEN 'T'
                    END                       AS Sicil_Sahis_Turu,
                    TRIM(B.VATANDASLIK_NO)    AS Sicil_Vatandaslik_No,
                    TRIM(B.VERGI_NO)          AS Sicil_Vergi_No,
                    B.ADI                     AS Sicil_Adi,
                    B.SOYADI                  AS Sicil_Soyadi,
                    B.BABA_ADI                AS Sicil_Baba_Adi,
                    B.ANNE_ADI                AS Sicil_Anne_Adi,
                    B.DOGUM_TARIHI            AS Sicil_Dogum_Tarihi,
                    B.CINSIYETI               AS Sicil_Cinsiyet,
                    B.UYRUGU                  AS Sicil_Uyrugu,
                    B.GSM_KODU                AS Sicil_Gsm_Kodu,
                    B.CEP_TELEFON             AS Sicil_Cep_Telefon
            FROM    WEB_KULLANICILAR A
            LEFT OUTER JOIN ORT_SICIL B
                   ON B.SICIL_KODU = A.SICIL_KODU
            WHERE   NVL(A.ONAYLIMI_EH,'H') = 'E'
        ),
        HESAP AS (
            -- Kullanici kodu ve vergi no SQL tarafinda hesaplanir
            SELECT  T.*,
                    CASE
                      WHEN T.Sicil_Sahis_Turu = 'G'
                           AND TRIM(T.KULLANICI_KODU) = T.Sicil_Vatandaslik_No
                           THEN T.Sicil_Vatandaslik_No
                      WHEN T.Sicil_Sahis_Turu = 'T'
                           AND T.Sicil_Vergi_No IS NOT NULL
                           AND TRIM(T.KULLANICI_KODU) = T.Sicil_Vergi_No
                           THEN T.Sicil_Vergi_No
                      WHEN T.Sicil_Sahis_Turu IS NULL
                           AND T.Sicil_Vatandaslik_No IS NOT NULL
                           AND TRIM(T.KULLANICI_KODU) = T.Sicil_Vatandaslik_No
                           THEN T.Sicil_Vatandaslik_No
                      WHEN T.Sicil_Sahis_Turu IS NULL
                           AND T.Sicil_Vergi_No IS NOT NULL
                           AND TRIM(T.KULLANICI_KODU) = T.Sicil_Vergi_No
                           THEN T.Sicil_Vergi_No
                    END AS Hesap_Kodu,
                    CASE
                      WHEN T.Sicil_Sahis_Turu = 'T'
                           AND T.Sicil_Vergi_No IS NOT NULL
                           AND TRIM(T.KULLANICI_KODU) = T.Sicil_Vergi_No
                           THEN T.Sicil_Vergi_No
                      WHEN T.Sicil_Sahis_Turu IS NULL
                           AND T.Sicil_Vergi_No IS NOT NULL
                           AND TRIM(T.KULLANICI_KODU) = T.Sicil_Vergi_No
                           THEN T.Sicil_Vergi_No
                    END AS Hesap_Vergi_No
            FROM    BAZ T
        ),
        EKSIK AS (
            SELECT  H.*,
                    -- Mukerrer kodda kazanan: e-postasi olan > gsm'i olan > en yeni
                    ROW_NUMBER() OVER (PARTITION BY H.Hesap_Kodu
                                       ORDER BY CASE WHEN H.E_MAIL IS NOT NULL THEN 0 ELSE 1 END,
                                                CASE WHEN H.GSM_NO  IS NOT NULL THEN 0 ELSE 1 END,
                                                H.KAYIT_TARIHI DESC) AS RN
            FROM    HESAP H
            WHERE   H.Hesap_Kodu IS NOT NULL          -- TUTARSIZ kayitlar elenir
              AND   NOT EXISTS (SELECT 1
                                  FROM OB_KULLANICILAR K
                                 WHERE K.KULLANICI_KODU = H.Hesap_Kodu)
        )
        SELECT * FROM EKSIK WHERE RN = 1;

    Row_Kayit           OB_KULLANICILAR%ROWTYPE;
    Row_Kayit_Adr       OB_KULLANICILAR_ADRES%ROWTYPE;

    X_Var_Mi            NUMBER(10) := 0;
    X_Uniq_Kod          NUMBER     := 0;
    X_Hata_Mesaj        VARCHAR2(500);   -- SQLERRM SQL icinde kullanilamaz

    X_Basarili          NUMBER := 0;
    X_Atlanan           NUMBER := 0;
    X_Hatali            NUMBER := 0;

    X_Mahalle           OB_KULLANICILAR_ADRES.RF_ORT_MAHALLE_KOYLER%TYPE;
    X_Cadde_Sokak       OB_KULLANICILAR_ADRES.RF_ORT_CADDDE_SOKAK%TYPE;
    X_Mahalle_Adi       VARCHAR2(200);
    X_Cadde_Sokak_Adi   VARCHAR2(200);
    X_Kapi_No           VARCHAR2(100);
    X_Alt_Kapi_No       VARCHAR2(100);
    X_Daire_No          VARCHAR2(100);
    X_Alt_Daire_No      VARCHAR2(100);
    X_Site_Apartman_Adi VARCHAR2(200);
    X_Blok_No           VARCHAR2(100);
    X_Adres_Var         BOOLEAN;

    -- Telefon: sadece rakam, bastaki 90/0 atilir, 10 hane degilse NULL
    FUNCTION Tel_Duzelt(P_Kod VARCHAR2, P_No VARCHAR2) RETURN VARCHAR2 IS
        V VARCHAR2(100);
    BEGIN
        V := REGEXP_REPLACE(TRIM(P_Kod)||TRIM(P_No), '[^0-9]', '');
        IF V IS NULL THEN RETURN NULL; END IF;
        IF LENGTH(V) = 12 AND SUBSTR(V,1,2) = '90' THEN V := SUBSTR(V,3); END IF;
        IF SUBSTR(V,1,1) = '0' THEN V := SUBSTR(V,2); END IF;
        IF LENGTH(V) <> 10 THEN RETURN NULL; END IF;
        RETURN V;
    END Tel_Duzelt;

    -- Kapi/Daire birlestirme: '12' + 'A' => '12/A'
    -- DIKKAT: lokal fonksiyon, SQL cumlesi icinde CAGRILAMAZ (PLS-00231)
    FUNCTION No_Birlestir(P_Ana VARCHAR2, P_Alt VARCHAR2) RETURN VARCHAR2 IS
        V_Ana VARCHAR2(100) := TRIM(P_Ana);
        V_Alt VARCHAR2(100) := TRIM(P_Alt);
    BEGIN
        IF    V_Ana IS NULL AND V_Alt IS NULL THEN RETURN NULL;
        ELSIF V_Alt IS NULL                   THEN RETURN V_Ana;
        ELSIF V_Ana IS NULL                   THEN RETURN V_Alt;
        ELSE  RETURN V_Ana||'/'||V_Alt;
        END IF;
    END No_Birlestir;

BEGIN
    FOR S IN Data_Cur LOOP

        BEGIN
            SAVEPOINT SP_KAYIT;

            -- Emniyet: cursor acildiktan sonra eklenmis olabilir
            SELECT COUNT(*)
              INTO X_Var_Mi
              FROM OB_KULLANICILAR OK
             WHERE OK.KULLANICI_KODU = S.Hesap_Kodu;

            IF NVL(X_Var_Mi,0) > 0 THEN
                INSERT INTO OB_KULLANICI_HATA (KULLANICI_KOD, SICIL_KODU, HATA_ACIKLAMA)
                VALUES (S.Kullanici_Kodu, S.Sicil_Kodu, 'ATLANDI: KULLANICI VAR');
                COMMIT;
                X_Atlanan := X_Atlanan + 1;
            ELSE

                -- SQ_ID'yi SEQ_OB_KULLANICILAR trigger'i set edecek
                Row_Kayit                         := NULL;
                Row_Kayit.KULLANICI_KODU          := S.Hesap_Kodu;
                Row_Kayit.ROL                     := 'UYE';
                Row_Kayit.RF_ORT_SICIL_BILGILERI  := S.Sicil_Kodu;
                Row_Kayit.E_POSTA                 := SUBSTR(TRIM(S.E_Mail),1,200);
                Row_Kayit.DOGUM_TARIHI            := NVL(S.DOGUM_TARIHI, S.Sicil_Dogum_Tarihi);
                Row_Kayit.ADI                     := SUBSTR(NVL(S.Adi,      S.Sicil_Adi),1,100);
                Row_Kayit.SOYADI                  := SUBSTR(NVL(S.Soyadi,   S.Sicil_Soyadi),1,100);
                Row_Kayit.BABA_ADI                := SUBSTR(NVL(S.BABA_ADI, S.Sicil_Baba_Adi),1,100);
                Row_Kayit.ANNE_ADI                := SUBSTR(NVL(S.ANNE_ADI, S.Sicil_Anne_Adi),1,100);
                -- Web'de telefon yoksa sicilden al
                Row_Kayit.CEP_TELEFON             := NVL(
                                                        Tel_Duzelt(S.GSM_KODU,       S.GSM_NO),
                                                        Tel_Duzelt(S.Sicil_Gsm_Kodu, S.Sicil_Cep_Telefon)
                                                     );
                Row_Kayit.SMS_BILGILENDIRME       := 'E';
                Row_Kayit.KAYIT_TARIHI            := SYSDATE;
                Row_Kayit.KAYDEDEN                := 'SQL_ADMIN';
                Row_Kayit.MODUL_ADI               := 'OB';
                Row_Kayit.VATANDASLIK_NO          := SUBSTR(S.Sicil_Vatandaslik_No,1,11);
                Row_Kayit.CINSIYET                := SUBSTR(NVL(S.CINSIYET, S.Sicil_Cinsiyet),1,1);
                Row_Kayit.UYRUGU                  := SUBSTR(S.Sicil_Uyrugu,1,15);
                Row_Kayit.AKTIF_MI                := 'E';
                Row_Kayit.VERGI_NO                := S.Hesap_Vergi_No;
                -- SIFRE / SIFRE_HASH / SIFRE_SALT bilerek NULL: kullanici sifre sifirlayacak

                INSERT INTO OB_KULLANICILAR VALUES Row_Kayit
                   RETURNING SQ_ID INTO X_Uniq_Kod;

                /*** Adres ***/
                X_Mahalle           := NULL;
                X_Cadde_Sokak       := NULL;
                X_Mahalle_Adi       := NULL;
                X_Cadde_Sokak_Adi   := NULL;
                X_Kapi_No           := NULL;
                X_Alt_Kapi_No       := NULL;
                X_Daire_No          := NULL;
                X_Alt_Daire_No      := NULL;
                X_Site_Apartman_Adi := NULL;
                X_Blok_No           := NULL;

                IF S.Adres_Mahalle_Kodu IS NULL THEN
                    /*** Web adresi bos: ORT_SICIL_ADRES'ten en guncel aktif adres ***/
                    BEGIN
                        SELECT  Mahalle_Kodu, Cadde_Sokak_Kodu, MAHALLE_ADI, Cadde_Sokak_Adi,
                                KAPI_NO, ALT_KAPI_NO, DAIRE_NO, ALT_DAIRE_NO,
                                SITE_APARTMAN_ADI, BLOK_NO
                          INTO  X_Mahalle, X_Cadde_Sokak, X_Mahalle_Adi, X_Cadde_Sokak_Adi,
                                X_Kapi_No, X_Alt_Kapi_No, X_Daire_No, X_Alt_Daire_No,
                                X_Site_Apartman_Adi, X_Blok_No
                          FROM (
                                SELECT  Adr.Mahalle_Kodu,
                                        Adr.Cadde_Sokak_Kodu,
                                        Adr.MAHALLE_ADI,
                                        CASE
                                          WHEN Adr.Cadde_Adi IS NOT NULL AND Adr.Sokak_Adi IS NOT NULL
                                               THEN Adr.Cadde_Adi||' '||Adr.Sokak_Adi
                                          WHEN Adr.Cadde_Adi IS NOT NULL THEN Adr.Cadde_Adi
                                          WHEN Adr.Sokak_Adi IS NOT NULL THEN Adr.Sokak_Adi
                                        END AS Cadde_Sokak_Adi,
                                        Adr.KAPI_NO,
                                        Adr.ALT_KAPI_NO,
                                        Adr.DAIRE_NO,
                                        Adr.ALT_DAIRE_NO,
                                        Adr.SITE_APARTMAN_ADI,
                                        Adr.BLOK_NO
                                  FROM  ORT_SICIL_ADRES Adr
                                 WHERE  Adr.Sicil_Kodu     = S.Sicil_Kodu
                                   AND  Adr.Adres_Aktif_Mi = 'E'
                                 ORDER BY Adr.Kayit_Tarihi DESC
                               )
                         WHERE ROWNUM = 1;

                        -- Birlestirme SQL DISINDA yapilir (PLS-00231)
                        X_Kapi_No  := No_Birlestir(X_Kapi_No,  X_Alt_Kapi_No);
                        X_Daire_No := No_Birlestir(X_Daire_No, X_Alt_Daire_No);

                        -- FK dogrulamasi: parent'ta yoksa NULL birak
                        SELECT COUNT(*) INTO X_Var_Mi
                          FROM ORT_MAHALLE_KOYLER WHERE Mahalle_Kodu = X_Mahalle;
                        IF NVL(X_Var_Mi,0) = 0 THEN X_Mahalle := NULL; END IF;

                        SELECT COUNT(*) INTO X_Var_Mi
                          FROM ORT_CADDE_SOKAK WHERE Cadde_Sokak_Kodu = X_Cadde_Sokak;
                        IF NVL(X_Var_Mi,0) = 0 THEN X_Cadde_Sokak := NULL; END IF;

                    EXCEPTION
                        WHEN NO_DATA_FOUND THEN NULL;   -- adres yok, alanlar NULL kalsin
                    END;
                ELSE
                    /*** Web adresi dolu ***/
                    SELECT COUNT(*) INTO X_Var_Mi
                      FROM ORT_MAHALLE_KOYLER WHERE Mahalle_Kodu = S.Adres_Mahalle_Kodu;
                    IF NVL(X_Var_Mi,0) > 0 THEN X_Mahalle := S.Adres_Mahalle_Kodu; END IF;

                    SELECT COUNT(*) INTO X_Var_Mi
                      FROM ORT_CADDE_SOKAK WHERE Cadde_Sokak_Kodu = S.Adres_Cadde_Sokak_Kodu;
                    IF NVL(X_Var_Mi,0) > 0 THEN X_Cadde_Sokak := S.Adres_Cadde_Sokak_Kodu; END IF;

                    X_Kapi_No  := No_Birlestir(S.Adres_Kapi, S.Adres_Alt_Kapi);
                    X_Daire_No := TRIM(S.Adres_Daire);
                END IF;

                X_Adres_Var := (X_Mahalle           IS NOT NULL
                             OR X_Mahalle_Adi       IS NOT NULL
                             OR X_Kapi_No           IS NOT NULL
                             OR X_Daire_No          IS NOT NULL
                             OR X_Site_Apartman_Adi IS NOT NULL);

                IF X_Adres_Var OR C_Bos_Adres_Ekle = 'E' THEN
                    Row_Kayit_Adr                       := NULL;
                    Row_Kayit_Adr.RF_OB_KULLANICILAR    := X_Uniq_Kod;
                    Row_Kayit_Adr.RF_ORT_MAHALLE_KOYLER := X_Mahalle;
                    Row_Kayit_Adr.RF_ORT_CADDDE_SOKAK   := X_Cadde_Sokak;
                    -- NOT NULL kolonlar: NVL zorunlu
                    Row_Kayit_Adr.MAHALLE_ADI           := SUBSTR(NVL(X_Mahalle_Adi,'CORUM'),1,40);
                    Row_Kayit_Adr.CADDE_ADI             := SUBSTR(NVL(X_Cadde_Sokak_Adi,'CORUM'),1,40);
                    -- KAPI_NO VARCHAR2(20) NOT NULL: metin olarak, '12/A' korunur
                    Row_Kayit_Adr.KAPI_NO               := SUBSTR(NVL(X_Kapi_No,'0'),1,20);
                    Row_Kayit_Adr.DAIRE_NO              := SUBSTR(X_Daire_No,1,20);
                    Row_Kayit_Adr.SITE_APARTMAN_ADI     := SUBSTR(X_Site_Apartman_Adi,1,100);
                    Row_Kayit_Adr.BLOK_NO               := SUBSTR(X_Blok_No,1,40);
                    Row_Kayit_Adr.AKTIF_MI              := 'E';
                    Row_Kayit_Adr.KAYIT_TARIHI          := SYSDATE;
                    Row_Kayit_Adr.KAYDEDEN              := 'SQL_ADMIN';

                    INSERT INTO OB_KULLANICILAR_ADRES VALUES Row_Kayit_Adr;
                END IF;

                COMMIT;
                X_Basarili := X_Basarili + 1;
            END IF;

        EXCEPTION
            WHEN OTHERS THEN
                -- SQLERRM SQL cumlesinde dogrudan kullanilamaz (ORA-00984)
                X_Hata_Mesaj := SUBSTR(SQLERRM,1,500);
                ROLLBACK TO SP_KAYIT;
                INSERT INTO OB_KULLANICI_HATA (KULLANICI_KOD, SICIL_KODU, HATA_ACIKLAMA)
                VALUES (S.Kullanici_Kodu, S.Sicil_Kodu, X_Hata_Mesaj);
                COMMIT;
                X_Hatali := X_Hatali + 1;
        END;

    END LOOP;

    DBMS_OUTPUT.PUT_LINE('Basarili : '||X_Basarili);
    DBMS_OUTPUT.PUT_LINE('Atlanan  : '||X_Atlanan);
    DBMS_OUTPUT.PUT_LINE('Hatali   : '||X_Hatali);
END;
/
```

---

## 4. Aktarım Sonrası Kontroller

### 4.1 Hata özeti

```sql
SELECT HATA_ACIKLAMA, COUNT(*) FROM OB_KULLANICI_HATA
 GROUP BY HATA_ACIKLAMA ORDER BY 2 DESC;

-- Gercek ORA hatalarinin detayi (bu kayitlar aktarilmadi)
SELECT KULLANICI_KOD, SICIL_KODU, HATA_ACIKLAMA
  FROM OB_KULLANICI_HATA
 WHERE HATA_ACIKLAMA LIKE 'ORA-%';
```

### 4.2 Bütünlük kontrolleri

```sql
-- Mukerrer kullanici (bos donmeli)
SELECT KULLANICI_KODU, COUNT(*) FROM OB_KULLANICILAR
 GROUP BY KULLANICI_KODU HAVING COUNT(*) > 1;

-- Adres satiri olmayan kullanici (0 olmali)
SELECT COUNT(*) FROM OB_KULLANICILAR K
 WHERE K.KAYDEDEN = 'SQL_ADMIN'
   AND NOT EXISTS (SELECT 1 FROM OB_KULLANICILAR_ADRES A
                    WHERE A.RF_OB_KULLANICILAR = K.SQ_ID);

-- Sahipsiz adres (0 olmali)
SELECT COUNT(*) FROM OB_KULLANICILAR_ADRES A
 WHERE NOT EXISTS (SELECT 1 FROM OB_KULLANICILAR K WHERE K.SQ_ID = A.RF_OB_KULLANICILAR);
```

### 4.3 Veri kalitesi

```sql
SELECT COUNT(*) TOPLAM,
       COUNT(CEP_TELEFON) TELEFONLU,
       COUNT(E_POSTA)     MAILLI,
       SUM(CASE WHEN VERGI_NO IS NOT NULL THEN 1 ELSE 0 END) TUZEL
  FROM OB_KULLANICILAR WHERE KAYDEDEN = 'SQL_ADMIN';

-- Placeholder adresle giden kayit sayisi
SELECT COUNT(*) FROM OB_KULLANICILAR_ADRES
 WHERE KAYDEDEN='SQL_ADMIN' AND MAHALLE_ADI='CORUM' AND KAPI_NO='0';
```

---

## 5. Geri Alma

Script her satırdan sonra `COMMIT` attığı için toplu `ROLLBACK` mümkün değil. Geri almak için tarih filtresi kullan.

> **Uyarı:** `KAYDEDEN='SQL_ADMIN'` tek başına yeterli değil — aktarımdan önce de bu değerle kayıt var. `ROL` ve `KAYIT_TARIHI` filtrelerini mutlaka ekle.

```sql
-- Once kac satir silinecek gor
SELECT COUNT(*) FROM OB_KULLANICILAR
 WHERE KAYDEDEN='SQL_ADMIN' AND ROL='UYE' AND MODUL_ADI='OB'
   AND KAYIT_TARIHI >= TRUNC(SYSDATE);

-- 1) CHILD once
DELETE FROM OB_KULLANICILAR_ADRES A
 WHERE EXISTS (SELECT 1 FROM OB_KULLANICILAR K
                WHERE K.SQ_ID = A.RF_OB_KULLANICILAR
                  AND K.KAYDEDEN='SQL_ADMIN' AND K.ROL='UYE' AND K.MODUL_ADI='OB'
                  AND K.KAYIT_TARIHI >= TRUNC(SYSDATE));

-- 2) PARENT sonra
DELETE FROM OB_KULLANICILAR
 WHERE KAYDEDEN='SQL_ADMIN' AND ROL='UYE' AND MODUL_ADI='OB'
   AND KAYIT_TARIHI >= TRUNC(SYSDATE);

COMMIT;
```

---

## 6. Teknik Notlar

### 6.1 Eşleştirme mantığı

| Şahıs Türü | Koşul | Kullanıcı Kodu |
|---|---|---|
| `G` veya `1` | `KULLANICI_KODU = VATANDASLIK_NO` | TC Kimlik No |
| `T` veya `2` | `KULLANICI_KODU = VERGI_NO` | Vergi No |
| `NULL` | TC veya VKN ile eşleşiyorsa | Eşleşen değer |
| Diğer | — | Reddedilir, hata tablosuna yazılır |

`ORT_SAHIS_TURU` tablosunda hem `G`/`T` hem `1`/`2` kodları bulunduğu için normalizasyon yapılır.

### 6.2 Yazılan tablolar

| Tablo | Rol |
|---|---|
| `OB_KULLANICILAR` | Ana kullanıcı kaydı (parent) |
| `OB_KULLANICILAR_ADRES` | Adres kaydı (child, FK → `SQ_ID`) |
| `OB_KULLANICI_HATA` | Sadece log |

### 6.3 Kritik davranışlar

- **`SQ_ID` manuel atanmaz.** `SEQ_OB_KULLANICILAR` ve `SEQ_OB_KULLANICILAR_ADRES` trigger'ları set eder; `RETURNING` ile gerçek değer geri alınır.
- **`KULLANICI_KODU` VARCHAR2 olarak taşınır.** `NUMBER`'a çevrilirse baştaki sıfırlar kaybolur ve `ORA-01722` riski doğar.
- **Şifreler taşınmaz.** `SIFRE`, `SIFRE_HASH` (BLOB), `SIFRE_SALT` (BLOB) NULL bırakılır — legacy format uyumsuz. Tüm kullanıcılar ilk girişte şifre sıfırlayacak.
- **Telefon 10 haneye normalize edilir.** Baştaki `90`/`0` atılır, 10 hane değilse NULL yazılır (kolon `VARCHAR2(10)`).
- **`KAPI_NO` metin olarak taşınır.** Kolon `VARCHAR2(20) NOT NULL`; `12/A` gibi değerler korunur, boşsa `'0'` yazılır.
- **`MAHALLE_ADI` / `CADDE_ADI` NOT NULL.** Veri yoksa `'CORUM'` placeholder yazılır — farklı belediyede bu sabiti değiştir.
- **Mükerrer `KULLANICI_KODU`.** DB'de unique constraint yok. `ROW_NUMBER()` ile kazanan belirlenir: e-postası olan > GSM'i olan > en yeni kayıt.
- **Satır bazlı hata yönetimi.** `SAVEPOINT` + `WHEN OTHERS` sayesinde tek hatalı kayıt tüm aktarımı durdurmaz.

### 6.4 Bilinen kısıtlar

- `ORT_SICIL_ADRES` sıralaması `KAYIT_TARIHI` kolonuna dayanır. Farklı bir şemada bu kolon yoksa `ORA-00904` alınır; gerçek tarih/sıra kolonuyla değiştirilmeli.
- `SQLERRM` doğrudan `INSERT ... VALUES` içinde kullanılamaz (`ORA-00984`) — önce değişkene alınır.
- PL/SQL bloğunda tanımlı lokal fonksiyonlar SQL cümlesinde çağrılamaz (`PLS-00231`) — `No_Birlestir` birleştirmesi SQL dışında yapılır.
- `TUTARSIZ` kayıtlar (kullanıcı kodu ne TC ne VKN ile eşleşen) bu sürümde cursor seviyesinde elenir ve loglanmaz. Tespit için Bölüm 2.2 sorgusunu kullan.
