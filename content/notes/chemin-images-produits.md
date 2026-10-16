## Le principe

Depuis la 1.5, chaque image produit est rangée dans un dossier par chiffre de son `id_image`, puis nommée avec l'identifiant complet :

| id_image | Original | Miniature `home_default` |
|---|---|---|
| 7 | `img/p/7/7.jpg` | `img/p/7/7-home_default.jpg` |
| 123 | `img/p/1/2/3/123.jpg` | `img/p/1/2/3/123-home_default.jpg` |
| 4021 | `img/p/4/0/2/1/4021.jpg` | `img/p/4/0/2/1/4021-home_default.jpg` |

Côté front, avec la réécriture d'URL activée, la même image est servie en `/{id_image}-{type}/{link_rewrite}.jpg`.

> L'ancien mode « legacy » (`img/p/{id_product}-{id_image}.jpg`) existe encore sur certaines boutiques migrées depuis la 1.4.

## En SQL (toutes versions MySQL)

```sql
SELECT
    i.id_image,
    CONCAT(
        '{{shop_url}}/img/p/',
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            CAST(i.id_image AS CHAR),
        '0','0/'), '1','1/'), '2','2/'), '3','3/'), '4','4/'),
        '5','5/'), '6','6/'), '7','7/'), '8','8/'), '9','9/'),
        i.id_image, '.jpg'
    ) AS url
FROM {{prefix}}image i
WHERE i.id_product = 1;
```

## En SQL (MySQL 8 / MariaDB 10.0.5+)

Plus court avec `REGEXP_REPLACE`. Attention, les références arrière ne s'écrivent pas pareil selon le moteur :

```sql
-- MySQL 8
CONCAT('{{shop_url}}/img/p/', REGEXP_REPLACE(CAST(i.id_image AS CHAR), '(.)', '$1/'), i.id_image, '.jpg')

-- MariaDB
CONCAT('{{shop_url}}/img/p/', REGEXP_REPLACE(CAST(i.id_image AS CHAR), '(.)', '\\1/'), i.id_image, '.jpg')
```
