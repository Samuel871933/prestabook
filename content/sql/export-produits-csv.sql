-- Export produits pour Paramètres avancés > Importer > Produits (PrestaShop 1.6 à 9)
-- Colonnes dans l'ordre exact des champs de l'import de la version cible : le mapping se fait tout seul.
--! Les blocs "-- @if ps" (version de la base source) et "-- @if cible" (version de l'import)
--! sont résolus par PrestaBook : copier la requête depuis le site, pas depuis ce fichier brut.
-- Conseil : SET SESSION group_concat_max_len = 1000000; dans la même exécution.

SELECT
    COALESCE(p.id_product, '') AS 'ID',
    COALESCE(ps.active, '') AS 'Active (0/1)',
    COALESCE(pl.name, '') AS 'Name',
    COALESCE(cats.categories, '') AS 'Categories (x,y,z...)',
    COALESCE(ps.price, '') AS 'Price tax excluded',
    COALESCE(ps.id_tax_rules_group, '') AS 'Tax rule ID',
    COALESCE(ps.wholesale_price, '') AS 'Cost price',
    COALESCE(ps.on_sale, '') AS 'On sale (0/1)',

    CASE WHEN sp.reduction_type = 'amount' THEN sp.reduction ELSE '' END AS 'Discount amount',
    CASE WHEN sp.reduction_type = 'percentage' THEN sp.reduction * 100 ELSE '' END AS 'Discount percent',
    CASE
        WHEN sp.`from` IS NULL OR sp.`from` = '0000-00-00 00:00:00' THEN ''
        ELSE DATE(sp.`from`)
    END AS 'Discount from (yyyy-mm-dd)',
    CASE
        WHEN sp.`to` IS NULL OR sp.`to` = '0000-00-00 00:00:00' THEN ''
        ELSE DATE(sp.`to`)
    END AS 'Discount to (yyyy-mm-dd)',

    COALESCE(p.reference, '') AS 'Reference #',
    COALESCE(p.supplier_reference, '') AS 'Supplier reference #',
    COALESCE(s.name, '') AS 'Supplier',
    COALESCE(m.name, '') AS 'Brand',
    COALESCE(p.ean13, '') AS 'EAN-13',
    COALESCE(p.upc, '') AS 'UPC',
-- @if cible >= 1.7.7
-- @if ps >= 1.7.7
    COALESCE(p.mpn, '') AS 'MPN',
-- @else
    '' AS 'MPN',
-- @endif
-- @endif
    COALESCE(ps.ecotax, '') AS 'Ecotax',
    COALESCE(p.width, '') AS 'Width',
    COALESCE(p.height, '') AS 'Height',
    COALESCE(p.depth, '') AS 'Depth',
    COALESCE(p.weight, '') AS 'Weight',
-- @if cible >= 1.7.3
-- @if ps >= 1.7.3
    COALESCE(pl.delivery_in_stock, '') AS 'Delivery time of in-stock products',
    COALESCE(pl.delivery_out_stock, '') AS 'Delivery time of out-of-stock products with allowed orders',
-- @else
    '' AS 'Delivery time of in-stock products',
    '' AS 'Delivery time of out-of-stock products with allowed orders',
-- @endif
-- @endif
    COALESCE(sa.quantity, 0) AS 'Quantity',
    COALESCE(ps.minimal_quantity, '') AS 'Minimal quantity',
-- @if cible >= 1.7.3
-- @if ps >= 1.7.3
    COALESCE(ps.low_stock_threshold, '') AS 'Low stock level',
    COALESCE(ps.low_stock_alert, '') AS 'Receive a low stock alert by email',
-- @else
    '' AS 'Low stock level',
    0 AS 'Receive a low stock alert by email',
-- @endif
-- @endif
-- @if cible >= 9
-- @if ps >= 1.7.5
    COALESCE(sa.location, '') AS 'Stock location',
-- @else
    COALESCE(p.location, '') AS 'Stock location',
-- @endif
-- @endif
    COALESCE(ps.visibility, '') AS 'Visibility',
    COALESCE(ps.additional_shipping_cost, '') AS 'Additional shipping cost',
    COALESCE(ps.unity, '') AS 'Unit for the price per unit',
-- @if ps >= 8
    COALESCE(ps.unit_price, '') AS 'Price per unit',
-- @else
    IF(ps.unit_price_ratio > 0, ROUND(ps.price / ps.unit_price_ratio, 6), 0) AS 'Price per unit',
-- @endif
    COALESCE(pl.description_short, '') AS 'Summary',
    COALESCE(pl.description, '') AS 'Description',
    COALESCE(tags.tags, '') AS 'Tags (x,y,z...)',
    COALESCE(pl.meta_title, '') AS 'Meta title',
-- @if cible < 9
-- @if ps < 9
    COALESCE(pl.meta_keywords, '') AS 'Meta keywords',
-- @else
    '' AS 'Meta keywords',
-- @endif
-- @endif
    COALESCE(pl.meta_description, '') AS 'Meta description',
    COALESCE(pl.link_rewrite, '') AS 'Rewritten URL',
    COALESCE(pl.available_now, '') AS 'Label when in stock',
    COALESCE(pl.available_later, '') AS 'Label when backorder allowed',
    COALESCE(ps.available_for_order, '') AS 'Available for order (0 = No, 1 = Yes)',
    CASE
        WHEN ps.available_date IS NULL OR ps.available_date = '0000-00-00' THEN ''
        ELSE ps.available_date
    END AS 'Product availability date',
    DATE(p.date_add) AS 'Product creation date',
    COALESCE(ps.show_price, '') AS 'Show price (0 = No, 1 = Yes)',
    COALESCE(imgs.image_urls, '') AS 'Image URLs (x,y,z...)',
-- @if cible >= 1.7
    COALESCE(imgs.image_alts, '') AS 'Image alt texts (x,y,z...)',
-- @endif
    0 AS 'Delete existing images (0 = No, 1 = Yes)',
    COALESCE(feat.features, '') AS 'Feature (Name:Value:Position:Customized)',
    COALESCE(ps.online_only, '') AS 'Available online only (0 = No, 1 = Yes)',
    COALESCE(ps.`condition`, '') AS 'Condition',
    COALESCE(ps.customizable, '') AS 'Customizable (0 = No, 1 = Yes)',
    COALESCE(ps.uploadable_files, '') AS 'Uploadable files (0 = No, 1 = Yes)',
    COALESCE(ps.text_fields, '') AS 'Text fields (0 = No, 1 = Yes)',
    COALESCE(sa.out_of_stock, 2) AS 'Action when out of stock',
-- @if cible >= 1.7
    COALESCE(p.is_virtual, '') AS 'Virtual product (0 = No, 1 = Yes)',
    '' AS 'File URL',
    COALESCE(pd.nb_downloadable, '') AS 'Number of allowed downloads',
    CASE
        WHEN pd.date_expiration IS NULL OR pd.date_expiration = '0000-00-00 00:00:00' THEN ''
        ELSE DATE(pd.date_expiration)
    END AS 'Expiration date (yyyy-mm-dd)',
    COALESCE(pd.nb_days_accessible, '') AS 'Number of days',
-- @endif
    {{id_shop}} AS 'ID / Name of the store',
-- @if cible < 9
    COALESCE(p.advanced_stock_management, '') AS 'Advanced Stock Management',
    COALESCE(sa.depends_on_stock, 0) AS 'Depends on stock',
-- @if cible >= 1.7
    COALESCE(wh.warehouses, '') AS 'Warehouse',
-- @else
    COALESCE(wh.warehouses, '') AS 'Warehouse'
-- @endif
-- @endif
-- @if cible >= 1.7
    COALESCE(acc.accessories, '') AS 'Accessories (x,y,z...)'
-- @endif

FROM {{prefix}}product p

INNER JOIN {{prefix}}product_shop ps
    ON ps.id_product = p.id_product
   AND ps.id_shop = {{id_shop}}

INNER JOIN {{prefix}}product_lang pl
    ON pl.id_product = p.id_product
   AND pl.id_shop = {{id_shop}}
   AND pl.id_lang = {{id_lang}}

LEFT JOIN {{prefix}}stock_available sa
    ON sa.id_product = p.id_product
   AND sa.id_product_attribute = 0
   AND sa.id_shop = {{id_shop}}

LEFT JOIN {{prefix}}supplier s
    ON s.id_supplier = p.id_supplier

LEFT JOIN {{prefix}}manufacturer m
    ON m.id_manufacturer = p.id_manufacturer

LEFT JOIN {{prefix}}product_download pd
    ON pd.id_product = p.id_product
   AND pd.active = 1

-- Catégories : la catégorie par défaut d'abord, puis par position
LEFT JOIN (
    SELECT
        cp.id_product,
        GROUP_CONCAT(
            cl.name
            ORDER BY (cp.id_category = pss.id_category_default) DESC, c.position, c.id_category
            SEPARATOR '|'
        ) AS categories
    FROM {{prefix}}category_product cp
    INNER JOIN {{prefix}}category c
        ON c.id_category = cp.id_category
    INNER JOIN {{prefix}}category_lang cl
        ON cl.id_category = cp.id_category
       AND cl.id_lang = {{id_lang}}
       AND cl.id_shop = {{id_shop}}
    INNER JOIN {{prefix}}product_shop pss
        ON pss.id_product = cp.id_product
       AND pss.id_shop = {{id_shop}}
    GROUP BY cp.id_product
) cats
    ON cats.id_product = p.id_product

LEFT JOIN (
    SELECT
        pt.id_product,
        GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '|') AS tags
    FROM {{prefix}}product_tag pt
    INNER JOIN {{prefix}}tag t
        ON t.id_tag = pt.id_tag
       AND t.id_lang = {{id_lang}}
    GROUP BY pt.id_product
) tags
    ON tags.id_product = p.id_product

-- Images : couverture d'abord, puis position. L'import les recrée dans cet ordre (1, 2, 3…),
-- c'est cet ordre que l'export des déclinaisons utilise pour "image_position".
LEFT JOIN (
    SELECT
        i.id_product,
        GROUP_CONCAT(
            CONCAT(
                '{{shop_url}}/img/p/',
                CONCAT_WS('/',
                    SUBSTRING(i.id_image, 1, 1),
                    CASE WHEN LENGTH(i.id_image) >= 2 THEN SUBSTRING(i.id_image, 2, 1) END,
                    CASE WHEN LENGTH(i.id_image) >= 3 THEN SUBSTRING(i.id_image, 3, 1) END,
                    CASE WHEN LENGTH(i.id_image) >= 4 THEN SUBSTRING(i.id_image, 4, 1) END,
                    CASE WHEN LENGTH(i.id_image) >= 5 THEN SUBSTRING(i.id_image, 5, 1) END,
                    CASE WHEN LENGTH(i.id_image) >= 6 THEN SUBSTRING(i.id_image, 6, 1) END,
                    CASE WHEN LENGTH(i.id_image) >= 7 THEN SUBSTRING(i.id_image, 7, 1) END,
                    CASE WHEN LENGTH(i.id_image) >= 8 THEN SUBSTRING(i.id_image, 8, 1) END,
                    CASE WHEN LENGTH(i.id_image) >= 9 THEN SUBSTRING(i.id_image, 9, 1) END,
                    CASE WHEN LENGTH(i.id_image) >= 10 THEN SUBSTRING(i.id_image, 10, 1) END
                ),
                '/', i.id_image, '.jpg'
            )
            ORDER BY COALESCE(ish.cover, 0) DESC, i.position, i.id_image
            SEPARATOR '|'
        ) AS image_urls,
        GROUP_CONCAT(
            REPLACE(COALESCE(il.legend, ''), '|', ' ')
            ORDER BY COALESCE(ish.cover, 0) DESC, i.position, i.id_image
            SEPARATOR '|'
        ) AS image_alts
    FROM {{prefix}}image i
    INNER JOIN {{prefix}}image_shop ish
        ON ish.id_image = i.id_image
       AND ish.id_shop = {{id_shop}}
    LEFT JOIN {{prefix}}image_lang il
        ON il.id_image = i.id_image
       AND il.id_lang = {{id_lang}}
    GROUP BY i.id_product
) imgs
    ON imgs.id_product = p.id_product

-- Caractéristiques au format Nom:Valeur:Position:Personnalisée
-- (l'import retire 1 à la position, d'où le + 1)
LEFT JOIN (
    SELECT
        fp.id_product,
        GROUP_CONCAT(
            CONCAT(fl.name, ':', fvl.value, ':', f.position + 1, ':', fv.custom)
            ORDER BY f.position, fl.name
            SEPARATOR '|'
        ) AS features
    FROM {{prefix}}feature_product fp
    INNER JOIN {{prefix}}feature f
        ON f.id_feature = fp.id_feature
    INNER JOIN {{prefix}}feature_lang fl
        ON fl.id_feature = fp.id_feature
       AND fl.id_lang = {{id_lang}}
    INNER JOIN {{prefix}}feature_value fv
        ON fv.id_feature_value = fp.id_feature_value
    INNER JOIN {{prefix}}feature_value_lang fvl
        ON fvl.id_feature_value = fp.id_feature_value
       AND fvl.id_lang = {{id_lang}}
    GROUP BY fp.id_product
) feat
    ON feat.id_product = p.id_product

-- @if cible < 9
LEFT JOIN (
    SELECT
        id_product,
        GROUP_CONCAT(DISTINCT id_warehouse ORDER BY id_warehouse SEPARATOR '|') AS warehouses
    FROM {{prefix}}warehouse_product_location
    WHERE id_product_attribute = 0
    GROUP BY id_product
) wh
    ON wh.id_product = p.id_product
-- @endif

-- @if cible >= 1.7
LEFT JOIN (
    SELECT
        id_product_1 AS id_product,
        GROUP_CONCAT(id_product_2 ORDER BY id_product_2 SEPARATOR '|') AS accessories
    FROM {{prefix}}accessory
    GROUP BY id_product_1
) acc
    ON acc.id_product = p.id_product
-- @endif

-- Réduction : uniquement ce que l'import sait recréer (tout le monde, dès 1 unité,
-- prix de base conservé, hors règles de prix catalogue, non expirée). Boutique courante en priorité.
LEFT JOIN {{prefix}}specific_price sp
    ON sp.id_specific_price = (
        SELECT sp2.id_specific_price
        FROM {{prefix}}specific_price sp2
        WHERE sp2.id_product = p.id_product
          AND sp2.id_product_attribute = 0
          AND sp2.id_customer = 0
          AND sp2.id_group = 0
          AND sp2.id_country = 0
          AND sp2.id_currency = 0
          AND sp2.id_specific_price_rule = 0
          AND sp2.from_quantity = 1
          AND sp2.price < 0
          AND sp2.reduction > 0
          AND sp2.id_shop IN (0, {{id_shop}})
          AND (sp2.`to` IS NULL OR sp2.`to` = '0000-00-00 00:00:00' OR sp2.`to` >= NOW())
        ORDER BY (sp2.id_shop = {{id_shop}}) DESC, sp2.id_specific_price DESC
        LIMIT 1
    )

ORDER BY p.id_product;
