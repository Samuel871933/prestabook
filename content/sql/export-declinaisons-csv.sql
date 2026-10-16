-- Export déclinaisons pour Paramètres avancés > Importer > Combinaisons (PrestaShop 1.6 à 9)
-- Colonnes dans l'ordre exact des champs de l'import de la version cible : le mapping se fait tout seul.
--! Les blocs "-- @if ps" (version de la base source) et "-- @if cible" (version de l'import)
--! sont résolus par PrestaBook : copier la requête depuis le site, pas depuis ce fichier brut.
-- À importer APRÈS les produits (export-produits-csv), qui recrée les images.
-- Conseil : SET SESSION group_concat_max_len = 1000000; dans la même exécution.

SELECT
    COALESCE(pa.id_product, '') AS 'Product ID',
    COALESCE(p.reference, '') AS 'Product Reference',
    COALESCE(attrs.attribute_names, '') AS 'Attribute (Name:Type:Position)',
    COALESCE(attrs.attribute_values, '') AS 'Value (Value:Position)',
    COALESCE(pa.supplier_reference, '') AS 'Supplier reference',
    COALESCE(pa.reference, '') AS 'Reference',
    COALESCE(pa.ean13, '') AS 'EAN-13',
    COALESCE(pa.upc, '') AS 'UPC',
-- @if cible >= 1.7.7
-- @if ps >= 1.7.7
    COALESCE(pa.mpn, '') AS 'MPN',
-- @else
    '' AS 'MPN',
-- @endif
-- @endif
    COALESCE(pas.wholesale_price, '') AS 'Cost price',
    COALESCE(pas.price, '') AS 'Impact on price',
    COALESCE(pas.ecotax, '') AS 'Ecotax',
    COALESCE(sa.quantity, 0) AS 'Quantity',
    COALESCE(pas.minimal_quantity, '') AS 'Minimal quantity',
-- @if cible >= 1.7.3
-- @if ps >= 1.7.3
    COALESCE(pas.low_stock_threshold, '') AS 'Low stock level',
    COALESCE(pas.low_stock_alert, '') AS 'Receive a low stock alert by email',
-- @else
    '' AS 'Low stock level',
    0 AS 'Receive a low stock alert by email',
-- @endif
-- @endif
-- @if cible >= 9
-- @if ps >= 1.7.5
    COALESCE(sa.location, '') AS 'Stock location',
-- @else
    COALESCE(pa.location, '') AS 'Stock location',
-- @endif
-- @endif
    COALESCE(pas.weight, '') AS 'Impact on weight',
    COALESCE(pas.default_on, 0) AS 'Default (0 = No, 1 = Yes)',
    CASE
        WHEN pas.available_date IS NULL OR pas.available_date = '0000-00-00' THEN ''
        ELSE pas.available_date
    END AS 'Combination availability date',
    -- Positions des images dans le produit RÉIMPORTÉ (rang couverture puis position, comme l'export produits)
    COALESCE(imgs.image_positions, '') AS 'Choose among product images by position (1,2,3...)',
    -- Laissé vide exprès : une URL ici retéléchargerait l'image en double dans le produit
    '' AS 'Image URLs (x,y,z...)',
-- @if cible >= 1.7
    '' AS 'Image alt texts (x,y,z...)',
-- @else
    0 AS 'Delete existing images (0 = No, 1 = Yes)',
-- @endif
-- @if cible < 9
    {{id_shop}} AS 'ID / Name of the store',
    COALESCE(p.advanced_stock_management, '') AS 'Advanced Stock Management',
    COALESCE(sa.depends_on_stock, 0) AS 'Depends on stock',
    COALESCE(wh.warehouses, '') AS 'Warehouse'
-- @else
    {{id_shop}} AS 'ID / Name of the store'
-- @endif

FROM {{prefix}}product_attribute pa

INNER JOIN {{prefix}}product_attribute_shop pas
    ON pas.id_product_attribute = pa.id_product_attribute
   AND pas.id_shop = {{id_shop}}

INNER JOIN {{prefix}}product p
    ON p.id_product = pa.id_product

LEFT JOIN {{prefix}}stock_available sa
    ON sa.id_product = pa.id_product
   AND sa.id_product_attribute = pa.id_product_attribute
   AND sa.id_shop = {{id_shop}}

-- Attributs : groupes et valeurs dans le même ordre (position du groupe, puis de la valeur)
LEFT JOIN (
    SELECT
        pac.id_product_attribute,
        GROUP_CONCAT(
            CONCAT(agl.name, ':', ag.group_type, ':', ag.position)
            ORDER BY ag.position, ag.id_attribute_group
            SEPARATOR '|'
        ) AS attribute_names,
        GROUP_CONCAT(
            CONCAT(al.name, ':', a.position)
            ORDER BY ag.position, ag.id_attribute_group
            SEPARATOR '|'
        ) AS attribute_values
    FROM {{prefix}}product_attribute_combination pac
    INNER JOIN {{prefix}}attribute a
        ON a.id_attribute = pac.id_attribute
    INNER JOIN {{prefix}}attribute_group ag
        ON ag.id_attribute_group = a.id_attribute_group
    INNER JOIN {{prefix}}attribute_group_lang agl
        ON agl.id_attribute_group = ag.id_attribute_group
       AND agl.id_lang = {{id_lang}}
    INNER JOIN {{prefix}}attribute_lang al
        ON al.id_attribute = a.id_attribute
       AND al.id_lang = {{id_lang}}
    GROUP BY pac.id_product_attribute
) attrs
    ON attrs.id_product_attribute = pa.id_product_attribute

-- Images de la déclinaison : rang de chaque image dans le produit (1 = couverture),
-- identique à l'ordre des URLs de l'export produits, donc aux positions après import.
LEFT JOIN (
    SELECT
        pai.id_product_attribute,
        GROUP_CONCAT(r.new_position ORDER BY r.new_position SEPARATOR '|') AS image_positions
    FROM {{prefix}}product_attribute_image pai
    INNER JOIN (
        SELECT
            i.id_image,
            1 + (
                SELECT COUNT(*)
                FROM {{prefix}}image i2
                INNER JOIN {{prefix}}image_shop ish2
                    ON ish2.id_image = i2.id_image
                   AND ish2.id_shop = {{id_shop}}
                WHERE i2.id_product = i.id_product
                  AND (
                        COALESCE(ish2.cover, 0) > COALESCE(ish.cover, 0)
                     OR (COALESCE(ish2.cover, 0) = COALESCE(ish.cover, 0)
                         AND (i2.position < i.position
                              OR (i2.position = i.position AND i2.id_image < i.id_image)))
                  )
            ) AS new_position
        FROM {{prefix}}image i
        INNER JOIN {{prefix}}image_shop ish
            ON ish.id_image = i.id_image
           AND ish.id_shop = {{id_shop}}
    ) r
        ON r.id_image = pai.id_image
    GROUP BY pai.id_product_attribute
) imgs
    ON imgs.id_product_attribute = pa.id_product_attribute

-- @if cible < 9
LEFT JOIN (
    SELECT
        id_product_attribute,
        GROUP_CONCAT(DISTINCT id_warehouse ORDER BY id_warehouse SEPARATOR '|') AS warehouses
    FROM {{prefix}}warehouse_product_location
    WHERE id_product_attribute > 0
    GROUP BY id_product_attribute
) wh
    ON wh.id_product_attribute = pa.id_product_attribute
-- @endif

ORDER BY
    pa.id_product,
    pa.id_product_attribute;
