/* PrestaBook — constructeur de requêtes d'export compatibles avec le Gestionnaire SQL du BO
   (Paramètres avancés > Base de données > Gestionnaire SQL), PrestaShop 1.6 à 9.
   Contraintes du validateur RequestSql respectées :
   - pas de SET, REPLACE(), DISTINCT en tête de SELECT, USING, WITH, sous-requête dans FROM/JOIN ;
   - toutes les tables et colonnes des jointures existent (vérifiées par le BO) ;
   - par défaut pas de sous-requête dans le SELECT (avertissement PHP => refus en mode debug).
   Utilisable dans le navigateur (window.PBBuilder) et sous Node (tests). */
(function (root) {
  'use strict';

  const P = '{{prefix}}';
  const n2to10 = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const imgPath = id => `CONCAT_WS('/', SUBSTRING(${id}, 1, 1), ${n2to10.map(n => `CASE WHEN LENGTH(${id}) >= ${n} THEN SUBSTRING(${id}, ${n}, 1) END`).join(', ')})`;
  const imgUrl = id => `CONCAT('{{shop_url}}/img/p/', ${imgPath(id)}, '/', ${id}, '.jpg')`;

  /* Jointures : `sql` (avec {{L}} pour une jointure par langue), `after` (dépendances),
     `many` (multiplie les lignes : impose un GROUP BY), `needs` (colonnes requises). */
  const ENTITIES = {
    customer: {
      label: 'Clients',
      from: `${P}customer c`,
      key: ['c.id_customer'],
      joins: {
        gl: { sql: `LEFT JOIN ${P}gender_lang gl ON gl.id_gender = c.id_gender AND gl.id_lang = {{L0}}` },
        lg: { sql: `LEFT JOIN ${P}lang lg ON lg.id_lang = c.id_lang` },
        sh: { sql: `LEFT JOIN ${P}shop sh ON sh.id_shop = c.id_shop` },
        gdl: { sql: `LEFT JOIN ${P}group_lang gdl ON gdl.id_group = c.id_default_group AND gdl.id_lang = {{L0}}` },
        cg: { sql: `LEFT JOIN ${P}customer_group cg ON cg.id_customer = c.id_customer`, many: true },
        cgl: { sql: `LEFT JOIN ${P}group_lang cgl ON cgl.id_group = cg.id_group AND cgl.id_lang = {{L0}}`, after: ['cg'] },
        aa: { sql: `LEFT JOIN ${P}address aa ON aa.id_customer = c.id_customer AND aa.deleted = 0`, many: true },
        aacl: { sql: `LEFT JOIN ${P}country_lang aacl ON aacl.id_country = aa.id_country AND aacl.id_lang = {{L0}}`, after: ['aa'] },
        o: { sql: `LEFT JOIN ${P}orders o ON o.id_customer = c.id_customer AND o.valid = 1`, many: true },
        // 1 ligne par adresse
        a: { sql: `LEFT JOIN ${P}address a ON a.id_customer = c.id_customer AND a.deleted = 0`, rowKey: 'a.id_address' },
        acl: { sql: `LEFT JOIN ${P}country_lang acl ON acl.id_country = a.id_country AND acl.id_lang = {{L0}}`, after: ['a'] },
        ast: { sql: `LEFT JOIN ${P}state ast ON ast.id_state = a.id_state`, after: ['a'] },
      },
      groups: [
        { id: 'customer', label: 'Client', table: 'customer', alias: 'c',
          exclude: ['passwd', 'secure_key', 'reset_password_token', 'reset_password_validity'] },
        { id: 'customer_rel', label: 'Infos du client, en clair', fields: [
          { id: 'gender', label: 'Civilité', sql: 'gl.name', joins: ['gl'], needs: ['gender_lang.name'] },
          { id: 'lang_iso', label: 'Langue (code ISO)', sql: 'lg.iso_code', joins: ['lg'], needs: ['customer.id_lang'] },
          { id: 'lang_name', label: 'Langue (nom)', sql: 'lg.name', joins: ['lg'], needs: ['customer.id_lang'] },
          { id: 'shop_name', label: 'Boutique', sql: 'sh.name', joins: ['sh'] },
          { id: 'default_group', label: 'Groupe par défaut', sql: 'gdl.name', joins: ['gdl'] },
          { id: 'groups', label: 'Groupes (tous)', agg: true, joins: ['cg', 'cgl'],
            sql: `GROUP_CONCAT(DISTINCT cgl.name ORDER BY cgl.name SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(g2.name ORDER BY g2.name SEPARATOR '|') FROM ${P}customer_group cg2 INNER JOIN ${P}group_lang g2 ON g2.id_group = cg2.id_group AND g2.id_lang = {{L0}} WHERE cg2.id_customer = c.id_customer)` },
          { id: 'groups_ids', label: 'Groupes (ID)', agg: true, joins: ['cg'],
            sql: `GROUP_CONCAT(DISTINCT cg.id_group ORDER BY cg.id_group SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(cg2.id_group ORDER BY cg2.id_group SEPARATOR '|') FROM ${P}customer_group cg2 WHERE cg2.id_customer = c.id_customer)` },
        ] },
        { id: 'customer_stats', label: 'Ses commandes (validées)', fields: [
          { id: 'orders_count', label: 'Nombre de commandes', agg: true, joins: ['o'], sql: 'COUNT(DISTINCT o.id_order)',
            sub: `(SELECT COUNT(*) FROM ${P}orders o2 WHERE o2.id_customer = c.id_customer AND o2.valid = 1)` },
          { id: 'first_order', label: 'Première commande', agg: true, joins: ['o'], sql: 'MIN(o.date_add)',
            sub: `(SELECT MIN(o2.date_add) FROM ${P}orders o2 WHERE o2.id_customer = c.id_customer AND o2.valid = 1)` },
          { id: 'last_order', label: 'Dernière commande', agg: true, joins: ['o'], sql: 'MAX(o.date_add)',
            sub: `(SELECT MAX(o2.date_add) FROM ${P}orders o2 WHERE o2.id_customer = c.id_customer AND o2.valid = 1)` },
          { id: 'total_spent', label: 'Total dépensé (devise par défaut)', agg: true, subOnly: true,
            sub: `(SELECT ROUND(SUM(o2.total_paid_real / o2.conversion_rate), 2) FROM ${P}orders o2 WHERE o2.id_customer = c.id_customer AND o2.valid = 1)` },
        ] },
        { id: 'customer_addr_agg', label: 'Adresses (regroupées sur la ligne du client)', fields: [
          { id: 'addr_count', label: 'Nombre d’adresses', agg: true, joins: ['aa'], sql: 'COUNT(DISTINCT aa.id_address)',
            sub: `(SELECT COUNT(*) FROM ${P}address a2 WHERE a2.id_customer = c.id_customer AND a2.deleted = 0)` },
          { id: 'addr_phones', label: 'Téléphones', agg: true, joins: ['aa'],
            sql: `GROUP_CONCAT(DISTINCT NULLIF(CONCAT_WS(' / ', NULLIF(aa.phone, ''), NULLIF(aa.phone_mobile, '')), '') ORDER BY aa.id_address SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(DISTINCT NULLIF(CONCAT_WS(' / ', NULLIF(a2.phone, ''), NULLIF(a2.phone_mobile, '')), '') ORDER BY a2.id_address SEPARATOR '|') FROM ${P}address a2 WHERE a2.id_customer = c.id_customer AND a2.deleted = 0)` },
          { id: 'addr_cities', label: 'Villes', agg: true, joins: ['aa'],
            sql: `GROUP_CONCAT(DISTINCT CONCAT(aa.postcode, ' ', aa.city) ORDER BY aa.id_address SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(DISTINCT CONCAT(a2.postcode, ' ', a2.city) ORDER BY a2.id_address SEPARATOR '|') FROM ${P}address a2 WHERE a2.id_customer = c.id_customer AND a2.deleted = 0)` },
          { id: 'addr_countries', label: 'Pays', agg: true, joins: ['aa', 'aacl'],
            sql: `GROUP_CONCAT(DISTINCT aacl.name ORDER BY aacl.name SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(DISTINCT cl2.name ORDER BY cl2.name SEPARATOR '|') FROM ${P}address a2 INNER JOIN ${P}country_lang cl2 ON cl2.id_country = a2.id_country AND cl2.id_lang = {{L0}} WHERE a2.id_customer = c.id_customer AND a2.deleted = 0)` },
          { id: 'addr_companies', label: 'Sociétés / n° TVA', agg: true, joins: ['aa'],
            sql: `GROUP_CONCAT(DISTINCT NULLIF(CONCAT_WS(' ', NULLIF(aa.company, ''), NULLIF(aa.vat_number, '')), '') ORDER BY aa.id_address SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(DISTINCT NULLIF(CONCAT_WS(' ', NULLIF(a2.company, ''), NULLIF(a2.vat_number, '')), '') ORDER BY a2.id_address SEPARATOR '|') FROM ${P}address a2 WHERE a2.id_customer = c.id_customer AND a2.deleted = 0)` },
        ] },
        { id: 'address', label: 'Adresse (1 ligne par adresse)', table: 'address', alias: 'a', join: 'a',
          exclude: ['id_customer', 'id_manufacturer', 'id_supplier', 'id_warehouse'], extra: [
            { id: 'a_country', label: 'Adresse : pays', sql: 'acl.name', joins: ['a', 'acl'] },
            { id: 'a_state', label: 'Adresse : état / région', sql: 'ast.name', joins: ['a', 'ast'] },
          ] },
      ],
      filters: [
        { id: 'not_deleted', label: 'Exclure les clients supprimés', sql: 'c.deleted = 0', on: true },
        { id: 'shop', label: 'Uniquement la boutique id_shop', sql: 'c.id_shop = {{id_shop}}', on: true },
        { id: 'no_guest', label: 'Exclure les comptes invités', sql: 'c.is_guest = 0' },
        { id: 'active', label: 'Uniquement les comptes actifs', sql: 'c.active = 1' },
        { id: 'newsletter', label: 'Uniquement les abonnés newsletter', sql: 'c.newsletter = 1' },
        { id: 'optin', label: 'Uniquement les clients opt-in partenaires', sql: 'c.optin = 1' },
      ],
      preset: ['customer.id_customer', 'gender', 'customer.firstname', 'customer.lastname', 'customer.email', 'customer.birthday',
        'customer.newsletter', 'customer.optin', 'customer.company', 'default_group', 'lang_iso', 'customer.active', 'customer.date_add', 'orders_count', 'last_order'],
    },

    order: {
      label: 'Commandes',
      from: `${P}orders o`,
      key: ['o.id_order'],
      joins: {
        cu: { sql: `LEFT JOIN ${P}customer cu ON cu.id_customer = o.id_customer` },
        cgdl: { sql: `LEFT JOIN ${P}gender_lang cgdl ON cgdl.id_gender = cu.id_gender AND cgdl.id_lang = {{L0}}`, after: ['cu'] },
        osl: { sql: `LEFT JOIN ${P}order_state_lang osl ON osl.id_order_state = o.current_state AND osl.id_lang = {{L0}}` },
        cur: { sql: `LEFT JOIN ${P}currency cur ON cur.id_currency = o.id_currency` },
        ca: { sql: `LEFT JOIN ${P}carrier ca ON ca.id_carrier = o.id_carrier` },
        olg: { sql: `LEFT JOIN ${P}lang olg ON olg.id_lang = o.id_lang` },
        osh: { sql: `LEFT JOIN ${P}shop osh ON osh.id_shop = o.id_shop` },
        ad: { sql: `LEFT JOIN ${P}address ad ON ad.id_address = o.id_address_delivery` },
        adcl: { sql: `LEFT JOIN ${P}country_lang adcl ON adcl.id_country = ad.id_country AND adcl.id_lang = {{L0}}`, after: ['ad'] },
        adst: { sql: `LEFT JOIN ${P}state adst ON adst.id_state = ad.id_state`, after: ['ad'] },
        ai: { sql: `LEFT JOIN ${P}address ai ON ai.id_address = o.id_address_invoice` },
        aicl: { sql: `LEFT JOIN ${P}country_lang aicl ON aicl.id_country = ai.id_country AND aicl.id_lang = {{L0}}`, after: ['ai'] },
        aist: { sql: `LEFT JOIN ${P}state aist ON aist.id_state = ai.id_state`, after: ['ai'] },
        od: { sql: `LEFT JOIN ${P}order_detail od ON od.id_order = o.id_order`, many: true },
        opay: { sql: `LEFT JOIN ${P}order_payment opay ON opay.order_reference = o.reference`, many: true },
        ocr: { sql: `LEFT JOIN ${P}order_cart_rule ocr ON ocr.id_order = o.id_order`, many: true },
        oc: { sql: `LEFT JOIN ${P}order_carrier oc ON oc.id_order = o.id_order`, many: true },
        oh: { sql: `LEFT JOIN ${P}order_history oh ON oh.id_order = o.id_order`, many: true },
      },
      groups: [
        { id: 'orders', label: 'Commande', table: 'orders', alias: 'o', exclude: ['secure_key'] },
        { id: 'order_rel', label: 'Infos de la commande, en clair', fields: [
          { id: 'state', label: 'État actuel', sql: 'osl.name', joins: ['osl'] },
          { id: 'currency_iso', label: 'Devise (ISO)', sql: 'cur.iso_code', joins: ['cur'] },
          { id: 'carrier_name', label: 'Transporteur', sql: 'ca.name', joins: ['ca'] },
          { id: 'order_lang', label: 'Langue de la commande (ISO)', sql: 'olg.iso_code', joins: ['olg'] },
          { id: 'order_shop', label: 'Boutique', sql: 'osh.name', joins: ['osh'] },
          { id: 'total_ttc_eur', label: 'Total payé TTC (devise par défaut)', sql: 'ROUND(o.total_paid_tax_incl / o.conversion_rate, 2)' },
          { id: 'total_ht_eur', label: 'Total payé HT (devise par défaut)', sql: 'ROUND(o.total_paid_tax_excl / o.conversion_rate, 2)' },
        ] },
        { id: 'order_customer_rel', label: 'Client, en clair', fields: [
          { id: 'cu_name', label: 'Client : nom complet', sql: "CONCAT(cu.firstname, ' ', cu.lastname)", joins: ['cu'] },
          { id: 'cu_gender', label: 'Client : civilité', sql: 'cgdl.name', joins: ['cu', 'cgdl'] },
        ] },
        { id: 'customer', label: 'Client', table: 'customer', alias: 'cu', join: 'cu',
          hp: { label: 'Client : ', tech: 'customer_' },
          exclude: ['passwd', 'secure_key', 'reset_password_token', 'reset_password_validity'] },
        { id: 'delivery', label: 'Adresse de livraison', table: 'address', alias: 'ad', join: 'ad',
          hp: { label: 'Livraison : ', tech: 'delivery_' }, exclude: ['id_manufacturer', 'id_supplier', 'id_warehouse'], extra: [
            { id: 'ad_country', label: 'Livraison : pays', sql: 'adcl.name', joins: ['ad', 'adcl'] },
            { id: 'ad_state', label: 'Livraison : état / région', sql: 'adst.name', joins: ['ad', 'adst'] },
          ] },
        { id: 'invoice', label: 'Adresse de facturation', table: 'address', alias: 'ai', join: 'ai',
          hp: { label: 'Facturation : ', tech: 'invoice_' }, exclude: ['id_manufacturer', 'id_supplier', 'id_warehouse'], extra: [
            { id: 'ai_country', label: 'Facturation : pays', sql: 'aicl.name', joins: ['ai', 'aicl'] },
            { id: 'ai_state', label: 'Facturation : état / région', sql: 'aist.name', joins: ['ai', 'aist'] },
          ] },
        { id: 'order_lists', label: 'Listes : produits, paiements, réductions, suivi', fields: [
          { id: 'lines', label: 'Produits (qté x nom [réf])', agg: true, joins: ['od'],
            sql: `GROUP_CONCAT(DISTINCT CONCAT(od.product_quantity, ' x ', od.product_name, ' [', od.product_reference, ']') ORDER BY od.id_order_detail SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(CONCAT(od2.product_quantity, ' x ', od2.product_name, ' [', od2.product_reference, ']') ORDER BY od2.id_order_detail SEPARATOR '|') FROM ${P}order_detail od2 WHERE od2.id_order = o.id_order)` },
          { id: 'lines_names', label: 'Noms des produits', agg: true, joins: ['od'],
            sql: `GROUP_CONCAT(DISTINCT od.product_name ORDER BY od.id_order_detail SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(od2.product_name ORDER BY od2.id_order_detail SEPARATOR '|') FROM ${P}order_detail od2 WHERE od2.id_order = o.id_order)` },
          { id: 'lines_refs', label: 'Références produits', agg: true, joins: ['od'],
            sql: `GROUP_CONCAT(DISTINCT od.product_reference ORDER BY od.product_reference SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(DISTINCT od2.product_reference ORDER BY od2.product_reference SEPARATOR '|') FROM ${P}order_detail od2 WHERE od2.id_order = o.id_order)` },
          { id: 'lines_ean', label: 'EAN-13 des produits', agg: true, joins: ['od'],
            sql: `GROUP_CONCAT(DISTINCT NULLIF(od.product_ean13, '') ORDER BY od.id_order_detail SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(DISTINCT NULLIF(od2.product_ean13, '') ORDER BY od2.id_order_detail SEPARATOR '|') FROM ${P}order_detail od2 WHERE od2.id_order = o.id_order)` },
          { id: 'lines_count', label: 'Nombre de lignes', agg: true, joins: ['od'], sql: 'COUNT(DISTINCT od.id_order_detail)',
            sub: `(SELECT COUNT(*) FROM ${P}order_detail od2 WHERE od2.id_order = o.id_order)` },
          { id: 'qty_total', label: 'Quantité totale d’articles', agg: true, subOnly: true,
            sub: `(SELECT SUM(od2.product_quantity) FROM ${P}order_detail od2 WHERE od2.id_order = o.id_order)` },
          { id: 'payments', label: 'Paiements (moyen montant)', agg: true, joins: ['opay'],
            sql: `GROUP_CONCAT(DISTINCT CONCAT(opay.payment_method, ' ', opay.amount) ORDER BY opay.id_order_payment SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(CONCAT(op2.payment_method, ' ', op2.amount) ORDER BY op2.id_order_payment SEPARATOR '|') FROM ${P}order_payment op2 WHERE op2.order_reference = o.reference)` },
          { id: 'transactions', label: 'ID de transaction', agg: true, joins: ['opay'],
            sql: `GROUP_CONCAT(DISTINCT NULLIF(opay.transaction_id, '') ORDER BY opay.id_order_payment SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(NULLIF(op2.transaction_id, '') ORDER BY op2.id_order_payment SEPARATOR '|') FROM ${P}order_payment op2 WHERE op2.order_reference = o.reference)` },
          { id: 'cart_rules', label: 'Bons de réduction (nom montant TTC)', agg: true, joins: ['ocr'],
            sql: `GROUP_CONCAT(DISTINCT CONCAT(ocr.name, ' ', ocr.value) ORDER BY ocr.id_order_cart_rule SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(CONCAT(ocr2.name, ' ', ocr2.value) ORDER BY ocr2.id_order_cart_rule SEPARATOR '|') FROM ${P}order_cart_rule ocr2 WHERE ocr2.id_order = o.id_order)` },
          { id: 'tracking', label: 'N° de suivi', agg: true, joins: ['oc'],
            sql: `GROUP_CONCAT(DISTINCT NULLIF(oc.tracking_number, '') ORDER BY oc.id_order_carrier SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(NULLIF(oc2.tracking_number, '') ORDER BY oc2.id_order_carrier SEPARATOR '|') FROM ${P}order_carrier oc2 WHERE oc2.id_order = o.id_order)` },
          { id: 'last_state_date', label: 'Date du dernier changement d’état', agg: true, joins: ['oh'], sql: 'MAX(oh.date_add)',
            sub: `(SELECT MAX(oh2.date_add) FROM ${P}order_history oh2 WHERE oh2.id_order = o.id_order)` },
        ] },
      ],
      filters: [
        { id: 'shop', label: 'Uniquement la boutique id_shop', sql: 'o.id_shop = {{id_shop}}', on: true },
        { id: 'valid', label: 'Uniquement les commandes validées (valid = 1)', sql: 'o.valid = 1' },
        { id: 'from', label: 'Passées depuis le', range: 'Date de la commande', short: 'du', rangeHint: 'dates incluses', input: 'date', sql: "o.date_add >= '{{v}} 00:00:00'" },
        { id: 'to', label: 'Passées jusqu’au', range: 'Date de la commande', short: 'au', input: 'date', sql: "o.date_add <= '{{v}} 23:59:59'" },
        { id: 'state', label: 'État actuel', hint: 'id_order_state, voir Commandes > États', input: 'int', sql: 'o.current_state = {{v}}' },
      ],
      preset: ['orders.id_order', 'orders.reference', 'orders.date_add', 'state', 'cu_name', 'customer.email', 'orders.payment',
        'carrier_name', 'orders.total_paid_tax_incl', 'orders.total_shipping_tax_incl', 'currency_iso', 'delivery.city', 'ad_country', 'lines'],
    },

    product: {
      label: 'Produits',
      from: `${P}product p`,
      key: ['p.id_product'],
      joins: {
        ps: { sql: `INNER JOIN ${P}product_shop ps ON ps.id_product = p.id_product AND ps.id_shop = {{id_shop}}`, always: true },
        pl: { sql: `LEFT JOIN ${P}product_lang pl{{L}} ON pl{{L}}.id_product = p.id_product AND pl{{L}}.id_shop = {{id_shop}} AND pl{{L}}.id_lang = {{L}}`, lang: true },
        sa: { sql: `LEFT JOIN ${P}stock_available sa ON sa.id_product = p.id_product AND sa.id_product_attribute = 0 AND sa.id_shop = {{id_shop}}` },
        m: { sql: `LEFT JOIN ${P}manufacturer m ON m.id_manufacturer = p.id_manufacturer` },
        s: { sql: `LEFT JOIN ${P}supplier s ON s.id_supplier = p.id_supplier` },
        trg: { sql: `LEFT JOIN ${P}tax_rules_group trg ON trg.id_tax_rules_group = ps.id_tax_rules_group` },
        cd: { sql: `LEFT JOIN ${P}category_lang cd{{L}} ON cd{{L}}.id_category = ps.id_category_default AND cd{{L}}.id_shop = {{id_shop}} AND cd{{L}}.id_lang = {{L}}`, lang: true },
        ic: { sql: `LEFT JOIN ${P}image_shop ic ON ic.id_product = p.id_product AND ic.id_shop = {{id_shop}} AND ic.cover = 1` },
        icl: { sql: `LEFT JOIN ${P}image_lang icl{{L}} ON icl{{L}}.id_image = ic.id_image AND icl{{L}}.id_lang = {{L}}`, lang: true, after: ['ic'] },
        cp: { sql: `LEFT JOIN ${P}category_product cp ON cp.id_product = p.id_product`, many: true },
        cpl: { sql: `LEFT JOIN ${P}category_lang cpl ON cpl.id_category = cp.id_category AND cpl.id_shop = {{id_shop}} AND cpl.id_lang = {{L0}}`, after: ['cp'] },
        ims: { sql: `LEFT JOIN ${P}image_shop ims ON ims.id_product = p.id_product AND ims.id_shop = {{id_shop}}`, many: true },
        img: { sql: `LEFT JOIN ${P}image img ON img.id_image = ims.id_image`, after: ['ims'] },
        fp: { sql: `LEFT JOIN ${P}feature_product fp ON fp.id_product = p.id_product`, many: true },
        fl: { sql: `LEFT JOIN ${P}feature_lang fl ON fl.id_feature = fp.id_feature AND fl.id_lang = {{L0}}`, after: ['fp'] },
        fvl: { sql: `LEFT JOIN ${P}feature_value_lang fvl ON fvl.id_feature_value = fp.id_feature_value AND fvl.id_lang = {{L0}}`, after: ['fp'] },
        pt: { sql: `LEFT JOIN ${P}product_tag pt ON pt.id_product = p.id_product`, many: true },
        t: { sql: `LEFT JOIN ${P}tag t ON t.id_tag = pt.id_tag AND t.id_lang = {{L0}}`, after: ['pt'] },
        acc: { sql: `LEFT JOIN ${P}accessory acc ON acc.id_product_1 = p.id_product`, many: true },
        pa: { sql: `LEFT JOIN ${P}product_attribute pa ON pa.id_product = p.id_product`, many: true },
        psu: { sql: `LEFT JOIN ${P}product_supplier psu ON psu.id_product = p.id_product AND psu.id_product_attribute = 0`, many: true },
        sup: { sql: `LEFT JOIN ${P}supplier sup ON sup.id_supplier = psu.id_supplier`, after: ['psu'] },
      },
      groups: [
        { id: 'product', label: 'Produit', table: 'product', alias: 'p' },
        { id: 'product_shop', label: 'Produit : valeurs de la boutique', table: 'product_shop', alias: 'ps', join: 'ps', exclude: ['id_product', 'id_shop'] },
        { id: 'product_lang', label: 'Produit : textes (par langue)', table: 'product_lang', alias: 'pl', join: 'pl', lang: true, exclude: ['id_product', 'id_shop', 'id_lang'] },
        { id: 'stock', label: 'Stock', table: 'stock_available', alias: 'sa', join: 'sa', exclude: ['id_product', 'id_product_attribute'] },
        { id: 'product_rel', label: 'Infos du produit, en clair', fields: [
          { id: 'manufacturer', label: 'Marque', sql: 'm.name', joins: ['m'] },
          { id: 'supplier', label: 'Fournisseur par défaut', sql: 's.name', joins: ['s'] },
          { id: 'tax_rules', label: 'Règle de taxes', sql: 'trg.name', joins: ['trg'] },
          { id: 'default_category', label: 'Catégorie par défaut', sql: 'cd{{L}}.name', joins: ['cd'], lang: true },
          { id: 'product_url', label: 'Lien de la fiche produit', sql: `CONCAT('{{shop_url}}/index.php?controller=product&id_product=', p.id_product)` },
        ] },
        { id: 'product_lists', label: 'Listes : catégories, tags, caractéristiques…', fields: [
          { id: 'categories', label: 'Catégories (noms)', agg: true, joins: ['cp', 'cpl'],
            sql: `GROUP_CONCAT(DISTINCT cpl.name ORDER BY cpl.name SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(cl2.name ORDER BY cl2.name SEPARATOR '|') FROM ${P}category_product cp2 INNER JOIN ${P}category_lang cl2 ON cl2.id_category = cp2.id_category AND cl2.id_shop = {{id_shop}} AND cl2.id_lang = {{L0}} WHERE cp2.id_product = p.id_product)` },
          { id: 'categories_ids', label: 'Catégories (ID)', agg: true, joins: ['cp'],
            sql: `GROUP_CONCAT(DISTINCT cp.id_category ORDER BY cp.id_category SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(cp2.id_category ORDER BY cp2.id_category SEPARATOR '|') FROM ${P}category_product cp2 WHERE cp2.id_product = p.id_product)` },
          { id: 'features', label: 'Caractéristiques (Nom: valeur)', agg: true, joins: ['fp', 'fl', 'fvl'],
            sql: `GROUP_CONCAT(DISTINCT CONCAT(fl.name, ': ', fvl.value) ORDER BY fl.name SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(CONCAT(fl2.name, ': ', fv2.value) ORDER BY fl2.name SEPARATOR '|') FROM ${P}feature_product fp2 INNER JOIN ${P}feature_lang fl2 ON fl2.id_feature = fp2.id_feature AND fl2.id_lang = {{L0}} INNER JOIN ${P}feature_value_lang fv2 ON fv2.id_feature_value = fp2.id_feature_value AND fv2.id_lang = {{L0}} WHERE fp2.id_product = p.id_product)` },
          { id: 'tags', label: 'Tags', agg: true, joins: ['pt', 't'],
            sql: `GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(t2.name ORDER BY t2.name SEPARATOR '|') FROM ${P}product_tag pt2 INNER JOIN ${P}tag t2 ON t2.id_tag = pt2.id_tag AND t2.id_lang = {{L0}} WHERE pt2.id_product = p.id_product)` },
          { id: 'accessories', label: 'Accessoires (ID)', agg: true, joins: ['acc'],
            sql: `GROUP_CONCAT(DISTINCT acc.id_product_2 ORDER BY acc.id_product_2 SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(acc2.id_product_2 ORDER BY acc2.id_product_2 SEPARATOR '|') FROM ${P}accessory acc2 WHERE acc2.id_product_1 = p.id_product)` },
          { id: 'suppliers', label: 'Fournisseurs (tous)', agg: true, joins: ['psu', 'sup'],
            sql: `GROUP_CONCAT(DISTINCT sup.name ORDER BY sup.name SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(sup2.name ORDER BY sup2.name SEPARATOR '|') FROM ${P}product_supplier psu2 INNER JOIN ${P}supplier sup2 ON sup2.id_supplier = psu2.id_supplier WHERE psu2.id_product = p.id_product AND psu2.id_product_attribute = 0)` },
          { id: 'combinations_count', label: 'Nombre de déclinaisons', agg: true, joins: ['pa'], sql: 'COUNT(DISTINCT pa.id_product_attribute)',
            sub: `(SELECT COUNT(*) FROM ${P}product_attribute pa2 WHERE pa2.id_product = p.id_product)` },
        ] },
        { id: 'product_images', label: 'Images', fields: [
          { id: 'cover_id', label: 'Image de couverture : ID', sql: 'ic.id_image', joins: ['ic'] },
          { id: 'cover_url', label: 'Image de couverture : URL', sql: imgUrl('ic.id_image'), joins: ['ic'] },
          { id: 'cover_legend', label: 'Image de couverture : légende', sql: 'icl{{L}}.legend', joins: ['ic', 'icl'], lang: true },
          { id: 'images_ids', label: 'Images : ID (couverture d’abord)', agg: true, joins: ['ims', 'img'],
            sql: `GROUP_CONCAT(DISTINCT ims.id_image ORDER BY ims.cover DESC, img.position SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(is2.id_image ORDER BY is2.cover DESC, i2.position SEPARATOR '|') FROM ${P}image_shop is2 INNER JOIN ${P}image i2 ON i2.id_image = is2.id_image WHERE is2.id_product = p.id_product AND is2.id_shop = {{id_shop}})` },
          { id: 'images_urls', label: 'Images : URLs (couverture d’abord)', agg: true, joins: ['ims', 'img'],
            sql: `GROUP_CONCAT(DISTINCT ${imgUrl('ims.id_image')} ORDER BY ims.cover DESC, img.position SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(${imgUrl('is2.id_image')} ORDER BY is2.cover DESC, i2.position SEPARATOR '|') FROM ${P}image_shop is2 INNER JOIN ${P}image i2 ON i2.id_image = is2.id_image WHERE is2.id_product = p.id_product AND is2.id_shop = {{id_shop}})` },
        ] },
      ],
      filters: [
        { id: 'active', label: 'Uniquement les produits actifs', sql: 'ps.active = 1' },
        { id: 'not_draft', label: 'Exclure les brouillons (state = 1)', sql: 'p.state = 1', needs: ['product.state'], on: true },
        { id: 'visible', label: 'Exclure les produits « nulle part » (visibility ≠ none)', sql: "ps.visibility != 'none'" },
      ],
      preset: ['product.id_product', 'product.reference', 'product_lang.name', 'product_shop.active', 'product_shop.price', 'product.ean13',
        'stock.quantity', 'manufacturer', 'default_category', 'categories', 'cover_url'],
    },

    combination: {
      label: 'Déclinaisons',
      from: `${P}product_attribute pa`,
      key: ['pa.id_product_attribute'],
      joins: {
        pas: { sql: `INNER JOIN ${P}product_attribute_shop pas ON pas.id_product_attribute = pa.id_product_attribute AND pas.id_shop = {{id_shop}}`, always: true },
        p: { sql: `LEFT JOIN ${P}product p ON p.id_product = pa.id_product` },
        pps: { sql: `LEFT JOIN ${P}product_shop pps ON pps.id_product = pa.id_product AND pps.id_shop = {{id_shop}}` },
        pl: { sql: `LEFT JOIN ${P}product_lang pl{{L}} ON pl{{L}}.id_product = pa.id_product AND pl{{L}}.id_shop = {{id_shop}} AND pl{{L}}.id_lang = {{L}}`, lang: true },
        sa: { sql: `LEFT JOIN ${P}stock_available sa ON sa.id_product = pa.id_product AND sa.id_product_attribute = pa.id_product_attribute AND sa.id_shop = {{id_shop}}` },
        pac: { sql: `LEFT JOIN ${P}product_attribute_combination pac ON pac.id_product_attribute = pa.id_product_attribute`, many: true },
        at: { sql: `LEFT JOIN ${P}attribute at ON at.id_attribute = pac.id_attribute`, after: ['pac'] },
        ag: { sql: `LEFT JOIN ${P}attribute_group ag ON ag.id_attribute_group = at.id_attribute_group`, after: ['at'] },
        agl: { sql: `LEFT JOIN ${P}attribute_group_lang agl ON agl.id_attribute_group = at.id_attribute_group AND agl.id_lang = {{L0}}`, after: ['at'] },
        atl: { sql: `LEFT JOIN ${P}attribute_lang atl ON atl.id_attribute = at.id_attribute AND atl.id_lang = {{L0}}`, after: ['at'] },
        pai: { sql: `LEFT JOIN ${P}product_attribute_image pai ON pai.id_product_attribute = pa.id_product_attribute`, many: true },
        paim: { sql: `LEFT JOIN ${P}image paim ON paim.id_image = pai.id_image`, after: ['pai'] },
      },
      groups: [
        { id: 'product_attribute', label: 'Déclinaison', table: 'product_attribute', alias: 'pa' },
        { id: 'product_attribute_shop', label: 'Déclinaison : valeurs de la boutique', table: 'product_attribute_shop', alias: 'pas', join: 'pas', exclude: ['id_product_attribute', 'id_product', 'id_shop'] },
        { id: 'stock', label: 'Stock', table: 'stock_available', alias: 'sa', join: 'sa', exclude: ['id_product', 'id_product_attribute'] },
        { id: 'combination_product', label: 'Produit parent', fields: [
          { id: 'product_name', label: 'Produit : nom', sql: 'pl{{L}}.name', joins: ['pl'], lang: true },
          { id: 'product_reference', label: 'Produit : référence', sql: 'p.reference', joins: ['p'] },
          { id: 'product_active', label: 'Produit : actif', sql: 'pps.active', joins: ['pps'] },
          { id: 'product_price', label: 'Produit : prix HT', sql: 'pps.price', joins: ['pps'] },
          { id: 'final_price', label: 'Prix HT final (produit + impact)', sql: 'ROUND(pps.price + pas.price, 6)', joins: ['pps'] },
        ] },
        { id: 'combination_attrs', label: 'Attributs & images', fields: [
          { id: 'combination_name', label: 'Libellé (Groupe: valeur)', agg: true, joins: ['pac', 'at', 'ag', 'agl', 'atl'],
            sql: `GROUP_CONCAT(DISTINCT CONCAT(agl.name, ': ', atl.name) ORDER BY ag.position SEPARATOR ', ')`,
            sub: `(SELECT GROUP_CONCAT(CONCAT(agl2.name, ': ', al2.name) ORDER BY ag2.position SEPARATOR ', ') FROM ${P}product_attribute_combination pac2 INNER JOIN ${P}attribute a2 ON a2.id_attribute = pac2.id_attribute INNER JOIN ${P}attribute_group ag2 ON ag2.id_attribute_group = a2.id_attribute_group INNER JOIN ${P}attribute_group_lang agl2 ON agl2.id_attribute_group = a2.id_attribute_group AND agl2.id_lang = {{L0}} INNER JOIN ${P}attribute_lang al2 ON al2.id_attribute = a2.id_attribute AND al2.id_lang = {{L0}} WHERE pac2.id_product_attribute = pa.id_product_attribute)` },
          { id: 'attribute_ids', label: 'Attributs (ID)', agg: true, joins: ['pac'],
            sql: `GROUP_CONCAT(DISTINCT pac.id_attribute ORDER BY pac.id_attribute SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(pac2.id_attribute ORDER BY pac2.id_attribute SEPARATOR '|') FROM ${P}product_attribute_combination pac2 WHERE pac2.id_product_attribute = pa.id_product_attribute)` },
          { id: 'images_ids', label: 'Images : ID', agg: true, joins: ['pai', 'paim'],
            sql: `GROUP_CONCAT(DISTINCT pai.id_image ORDER BY paim.position SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(pai2.id_image ORDER BY i2.position SEPARATOR '|') FROM ${P}product_attribute_image pai2 INNER JOIN ${P}image i2 ON i2.id_image = pai2.id_image WHERE pai2.id_product_attribute = pa.id_product_attribute)` },
          { id: 'images_urls', label: 'Images : URLs', agg: true, joins: ['pai', 'paim'],
            sql: `GROUP_CONCAT(DISTINCT ${imgUrl('pai.id_image')} ORDER BY paim.position SEPARATOR '|')`,
            sub: `(SELECT GROUP_CONCAT(${imgUrl('pai2.id_image')} ORDER BY i2.position SEPARATOR '|') FROM ${P}product_attribute_image pai2 INNER JOIN ${P}image i2 ON i2.id_image = pai2.id_image WHERE pai2.id_product_attribute = pa.id_product_attribute)` },
        ] },
      ],
      filters: [
        { id: 'product_active', label: 'Uniquement les produits actifs', sql: 'pps.active = 1', joins: ['pps'] },
      ],
      preset: ['product_attribute.id_product_attribute', 'product_attribute.id_product', 'product_reference', 'product_name', 'combination_name',
        'product_attribute.reference', 'product_attribute.ean13', 'product_attribute_shop.price', 'final_price', 'stock.quantity', 'product_attribute_shop.default_on'],
    },

  };

  /* ---------- Catalogue des champs d'une entité pour une version ---------- */
  // catalog : { table: { colonne: [clés de version] } } (data/schema-catalog.json)
  function fieldsOf(entityKey, catalog, verKey) {
    const ent = ENTITIES[entityKey];
    const has = need => { const [t, c] = need.split('.'); return !!(catalog[t] && catalog[t][c] && catalog[t][c].includes(verKey)); };
    const allVers = (t, c) => (catalog[t] && catalog[t][c]) || [];
    return ent.groups.map(g => {
      let fields = [];
      if (g.table) {
        fields = Object.keys(catalog[g.table] || {}).filter(c => !(g.exclude || []).includes(c)).map(c => ({
          id: `${g.id}.${c}`, label: c, tech: (g.hp ? g.hp.tech : '') + c, hlabel: g.hp ? g.hp.label + c : null, col: c, sql: `${g.alias}${g.lang ? '{{L}}' : ''}.${c}`,
          joins: g.join ? [g.join] : [], lang: !!g.lang, raw: true,
          available: has(`${g.table}.${c}`), versions: allVers(g.table, c), needs: [`${g.table}.${c}`],
        }));
      }
      const extra = (g.fields || []).concat(g.extra || []).map(f => ({
        ...f, tech: f.id, joins: f.joins || [], lang: !!f.lang,
        available: (f.needs || []).every(has), versions: null,
      }));
      return { id: g.id, label: g.label, table: g.table || null, join: g.join || null, lang: !!g.lang, fields: fields.concat(extra) };
    });
  }

  function parseLangs(s) {
    const out = [];
    for (const part of String(s || '').split(/[,;\s]+/)) {
      const m = part.match(/^(\d+)(?::([\w-]+))?$/);
      if (m && !out.some(l => l.id === m[1])) out.push({ id: m[1], code: m[2] || m[1] });
    }
    return out.length ? out : [{ id: '1', code: '1' }];
  }

  /* ---------- Génération ----------
     opts : { version, selected: [ids], langs: '1:fr,2:en', method: 'join'|'sub', headers: 'tech'|'label',
              filters: [ids], limit: n } */
  function generate(entityKey, catalog, opts) {
    const ent = ENTITIES[entityKey];
    const langs = parseLangs(opts.langs);
    const L0 = langs[0].id;
    const sub = opts.method === 'sub';
    const groups = fieldsOf(entityKey, catalog, opts.version);
    const all = groups.flatMap(g => g.fields);
    const sel = new Set(opts.selected || []);
    // Colonnes dans l'ordre de la sélection (ordre tapé dans l'assistant, des clics ou du préréglage).
    const rank = new Map((opts.selected || []).map((id, i) => [id, i]));
    const chosen = all.filter(f => sel.has(f.id) && f.available && !(f.subOnly && !sub)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
    const skipped = all.filter(f => sel.has(f.id) && (!f.available || (f.subOnly && !sub)));

    const used = new Set(Object.keys(ent.joins).filter(j => ent.joins[j].always));
    const need = j => { if (used.has(j)) return; (ent.joins[j].after || []).forEach(need); used.add(j); };
    const cols = [];
    const names = new Map();
    const header = (f, l) => {
      let h = opts.headers === 'label' ? (f.hlabel || (f.raw ? f.col : f.label)) : f.tech;
      if (f.lang) h += langs.length > 1 || opts.headers !== 'label' ? (opts.headers === 'label' ? ` [${l.code}]` : `_${l.code}`) : '';
      const n = (names.get(h) || 0) + 1; names.set(h, n);
      return n > 1 ? `${h} (${n})` : h;
    };
    for (const f of chosen) {
      const isSub = sub && f.agg && f.sub;
      if (!isSub) f.joins.forEach(need);
      for (const l of (f.lang ? langs : [langs[0]])) {
        const expr = (isSub ? f.sub : f.sql).replace(/\{\{L\}\}/g, l.id).replace(/\{\{L0\}\}/g, L0);
        cols.push({ expr, agg: !!f.agg, header: header(f, l) });
      }
    }
    const fv = opts.filterValues || {};
    const valueOk = fl => !fl.input || (fl.input === 'date' ? /^\d{4}-\d{2}-\d{2}$/.test(fv[fl.id] || '') : /^\d+$/.test(fv[fl.id] || ''));
    const filters = ent.filters.filter(fl => (opts.filters || []).includes(fl.id) && valueOk(fl) && (fl.needs || []).every(n => {
      const [t, c] = n.split('.'); return catalog[t] && catalog[t][c] && catalog[t][c].includes(opts.version);
    })).map(fl => ({ ...fl, sql: fl.input ? fl.sql.replace('{{v}}', fv[fl.id]) : fl.sql }));
    filters.forEach(fl => (fl.joins || []).forEach(need));

    const grouped = [...used].some(j => ent.joins[j].many);
    const key = ent.key.concat([...used].map(j => ent.joins[j].rowKey).filter(Boolean));
    const select = cols.length ? cols.map(c => {
      const e = grouped && !c.agg && !key.includes(c.expr) ? `MAX(${c.expr})` : c.expr;
      return `    ${e} AS '${c.header.replace(/'/g, ' ')}'`;
    }) : [`    ${ent.key[0]} AS 'id'`];

    const joins = [];
    for (const [id, j] of Object.entries(ent.joins)) {
      if (!used.has(id)) continue;
      if (j.lang) langs.forEach(l => joins.push(j.sql.replace(/\{\{L\}\}/g, l.id).replace(/\{\{L0\}\}/g, L0)));
      else joins.push(j.sql.replace(/\{\{L0\}\}/g, L0));
    }
    let sql = `SELECT\n${select.join(',\n')}\nFROM ${ent.from}`;
    if (joins.length) sql += '\n' + joins.join('\n');
    if (filters.length) sql += `\nWHERE ${filters.map(f => f.sql).join('\n  AND ')}`;
    if (grouped) sql += `\nGROUP BY ${key.join(', ')}`;
    sql += `\nORDER BY ${key.join(', ')}`;
    const lim = parseInt(opts.limit, 10);
    if (lim > 0) sql += `\nLIMIT ${lim}`;

    const warnings = [];
    if (skipped.length) warnings.push(`${skipped.length} champ(s) coché(s) ignoré(s) : absents de cette version ou réservés aux sous-requêtes (${skipped.map(f => f.label).slice(0, 4).join(', ')}${skipped.length > 4 ? '…' : ''}).`);
    const manyCount = [...used].filter(j => ent.joins[j].many).length;
    if (!sub && manyCount >= 3) warnings.push(`${manyCount} listes jointes : sur un gros catalogue, la requête multiplie les lignes intermédiaires et peut être lente. Passe en « sous-requêtes » ou exporte les listes en plusieurs fois.`);
    if (cols.some(c => /GROUP_CONCAT/.test(c.expr))) warnings.push('Le Gestionnaire SQL interdit SET : les listes (GROUP_CONCAT) restent limitées à group_concat_max_len, soit 1024 caractères par défaut sur MySQL (1 Mo sur MariaDB 10.2+).');
    if (sub && cols.some(c => /^\(SELECT/.test(c.expr))) warnings.push('Sous-requêtes : acceptées par le Gestionnaire SQL en mode normal, mais refusées si le mode debug de PrestaShop est activé.');
    return { sql, columns: cols.length, warnings, grouped };
  }

  const api = { ENTITIES, fieldsOf, generate, parseLangs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PBBuilder = api;
})(typeof window !== 'undefined' ? window : globalThis);
