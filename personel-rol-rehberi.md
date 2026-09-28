# OB_KULLANICILAR – Personel Rol Otomasyonu Rehberi

Amaç: `OB_KULLANICILAR` tablosuna eklenen kullanıcının TC'si memur veya işçi sicilinde varsa `ROL = 'PERSONEL'` yapılması. Mevcut kullanıcılar için de tek seferlik güncelleme.

Uygulama sırası: **1 → 2 → 3 → 4**

---

## Mevcut koddaki sorunlar

| # | Sorun | Etki |
|---|-------|------|
| 1 | Compound trigger AFTER STATEMENT'ta aynı tabloya `UPDATE` atıyor | Gereksiz ikinci DML, tablodaki diğer UPDATE trigger'larını (ör. telefon senkron trigger'ı) tetikleyebilir |
| 2 | `UPDATE ... WHERE VATANDASLIK_NO = ...` | Sadece yeni satırı değil, aynı TC'ye sahip **eski** satırları da günceller |
| 3 | `SELECT COUNT(*)` | Tüm eşleşmeleri sayar; sadece varlık kontrolü lazım (`EXISTS` / `ROWNUM = 1`) |
| 4 | View'da `NULL` TC filtresi yok | Gereksiz satırlar, boş TC eşleşme riski |

Çözüm: Compound trigger'a gerek yok. **BEFORE INSERT FOR EACH ROW** içinde `:NEW.ROL` doğrudan set edilir. View `OB_KULLANICILAR`'ı okumadığı için mutating table hatası olmaz.

---

## 1. View

```sql
CREATE OR REPLACE FORCE VIEW VW_TC_SICIL_LISTESI
(TC_KIMLIK_NO, SICIL_NO, PERSONEL_TURU)
BEQUEATH DEFINER
AS
-- MEMUR
SELECT
    nuf.qt_tc_kimlik_no   AS tc_kimlik_no,
    ob.qt_kurum_sicil_no  AS sicil_no,
    'MEMUR'               AS personel_turu
FROM ort_nufus_bilgi nuf
JOIN per_sicil_bilgi sic
    ON sic.rf_ort_nufus_bilgi = nuf.sq_id
JOIN mem_ozluk_bilgi ob
    ON ob.rf_per_sicil_bilgi = sic.sq_id
WHERE nuf.qt_tc_kimlik_no IS NOT NULL

UNION ALL

-- ISCI
SELECT
    nuf.qt_tc_kimlik_no   AS tc_kimlik_no,
    ob.qt_kurum_sicil_no  AS sicil_no,
    'ISCI'                AS personel_turu
FROM ort_nufus_bilgi nuf
JOIN per_sicil_bilgi sic
    ON sic.rf_ort_nufus_bilgi = nuf.sq_id
JOIN ism_ozluk_bilgi ob
    ON ob.rf_per_sicil_bilgi = sic.sq_id
WHERE nuf.qt_tc_kimlik_no IS NOT NULL;
```

> Not: Bir kişi hem memur hem işçi kaydına sahipse view'da iki satır çıkar. Rol kontrolü `EXISTS` ile yapıldığı için sorun değil.

---

## 2. Trigger

Eski compound trigger'ı bununla değiştir (`CREATE OR REPLACE` üzerine yazar):

```sql
CREATE OR REPLACE TRIGGER TRG_KULLANICI_ROL_GUNCELLE
BEFORE INSERT ON OB_KULLANICILAR
FOR EACH ROW
WHEN (NEW.VATANDASLIK_NO IS NOT NULL)
DECLARE
    V_VAR NUMBER;
BEGIN
    SELECT COUNT(*)
      INTO V_VAR
      FROM VW_TC_SICIL_LISTESI
     WHERE TC_KIMLIK_NO = :NEW.VATANDASLIK_NO
       AND ROWNUM = 1;

    IF V_VAR > 0 THEN
        :NEW.ROL := 'PERSONEL';
    END IF;
END TRG_KULLANICI_ROL_GUNCELLE;
/
SHOW ERRORS;
```

> `ROWNUM = 1` ile ilk eşleşmede durur, `COUNT` 0 veya 1 döner.

---

## 3. Tek seferlik mevcut kayıt güncellemesi

### 3.1 Ön kontrol – kaç kayıt etkilenecek

```sql
SELECT COUNT(*)
  FROM OB_KULLANICILAR k
 WHERE NVL(k.ROL, '#') <> 'PERSONEL'
   AND EXISTS (SELECT 1
                 FROM VW_TC_SICIL_LISTESI v
                WHERE v.TC_KIMLIK_NO = k.VATANDASLIK_NO);
```

### 3.2 Yedek

```sql
CREATE TABLE OB_KULLANICILAR_ROL_YEDEK AS
SELECT k.ROWID AS RID, k.VATANDASLIK_NO, k.ROL, SYSDATE AS YEDEK_TARIHI
  FROM OB_KULLANICILAR k
 WHERE NVL(k.ROL, '#') <> 'PERSONEL'
   AND EXISTS (SELECT 1
                 FROM VW_TC_SICIL_LISTESI v
                WHERE v.TC_KIMLIK_NO = k.VATANDASLIK_NO);
```

### 3.3 Güncelleme

```sql
UPDATE OB_KULLANICILAR k
   SET k.ROL = 'PERSONEL'
 WHERE NVL(k.ROL, '#') <> 'PERSONEL'
   AND EXISTS (SELECT 1
                 FROM VW_TC_SICIL_LISTESI v
                WHERE v.TC_KIMLIK_NO = k.VATANDASLIK_NO);

-- Etkilenen satır sayısı 3.1'deki sayı ile aynıysa:
COMMIT;
-- Değilse:
-- ROLLBACK;
```

### 3.4 Geri alma (gerekirse)

```sql
UPDATE OB_KULLANICILAR k
   SET k.ROL = (SELECT y.ROL FROM OB_KULLANICILAR_ROL_YEDEK y WHERE y.RID = k.ROWID)
 WHERE k.ROWID IN (SELECT RID FROM OB_KULLANICILAR_ROL_YEDEK);
COMMIT;
```

Her şey yolundaysa yedek tabloyu sonra kaldır:

```sql
DROP TABLE OB_KULLANICILAR_ROL_YEDEK PURGE;
```

---

## 4. Test

```sql
-- Sicilde olan bir TC ile
INSERT INTO OB_KULLANICILAR (VATANDASLIK_NO /*, diğer zorunlu kolonlar */)
VALUES ('<SICILDE_OLAN_TC>' /*, ... */);

SELECT VATANDASLIK_NO, ROL FROM OB_KULLANICILAR
 WHERE VATANDASLIK_NO = '<SICILDE_OLAN_TC>';
-- Beklenen: ROL = 'PERSONEL'

ROLLBACK;
```

Trigger durumu:

```sql
SELECT TRIGGER_NAME, TRIGGER_TYPE, STATUS
  FROM USER_TRIGGERS
 WHERE TRIGGER_NAME = 'TRG_KULLANICI_ROL_GUNCELLE';
-- Beklenen: BEFORE EACH ROW / ENABLED
```

---

## Dikkat edilecekler

- **Tip uyumu:** `VATANDASLIK_NO` ile `QT_TC_KIMLIK_NO` farklı tiplerde ise (NUMBER / VARCHAR2) implicit conversion index'i devre dışı bırakır. Tipleri kontrol et:
  ```sql
  SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
    FROM USER_TAB_COLUMNS
   WHERE (TABLE_NAME = 'OB_KULLANICILAR' AND COLUMN_NAME = 'VATANDASLIK_NO')
      OR (TABLE_NAME = 'ORT_NUFUS_BILGI' AND COLUMN_NAME = 'QT_TC_KIMLIK_NO');
  ```
- **Index:** `ORT_NUFUS_BILGI.QT_TC_KIMLIK_NO` üzerinde index yoksa trigger her insert'te full scan yapar.
- **Diğer trigger'lar:** 3.3'teki UPDATE, `OB_KULLANICILAR` üzerindeki genel `BEFORE/AFTER UPDATE` trigger'larını tetikler. `UPDATE OF <kolon>` şeklinde tanımlı olanlar (ör. telefon senkronu) `ROL` güncellemesinden etkilenmez.
- **Rol ezme:** Trigger ve script, kullanıcının mevcut rolünü (ör. `ADMIN`) ezer. Korunması gereken roller varsa koşula ekle: `AND NVL(k.ROL, '#') NOT IN ('PERSONEL', 'ADMIN')` / trigger'da `IF V_VAR > 0 AND NVL(:NEW.ROL, '#') <> 'ADMIN'`.
