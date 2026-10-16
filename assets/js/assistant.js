/* PrestaBook — assistant de la barre de recherche (sans IA).
   Comprend une phrase courte et prépare la fiche correspondante :
     « commandes ref, client, transporteur, total ttc depuis 01/01/2025 validées limite 500 »
     « produits essentiel + poids, meta titre en ps 1.7 langues 1:fr,2:en »
     « export produits csv 1.6 vers 8 préfixe abc_ »
   Renvoie un plan (rien n'est appliqué ici) : app.js l'affiche puis l'applique sur Entrée.
   Utilisable dans le navigateur (window.PBAssistant) et sous Node (tests). */
(function (root) {
  'use strict';

  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'");
  const sing = w => (w.length > 3 && /[sx]$/.test(w) && !/(ss|us)$/.test(w) ? w.slice(0, -1) : w);

  /* ---------- Vocabulaire ---------- */
  const STOP = new Set(('de du des la le les l d un une par en au aux pour avec a et ou sur dans son sa ses leur leurs '
    + 'export exporter exporte requete requetes liste lister extraire extraction sql csv fichier tableau donne moi je veux voudrais '
    + 'colonne colonnes champ champs info infos uniquement seulement que qui avoir afficher affiche sortir sors fais faire genere generer '
    + 'prepare preparer plus + ainsi aussi ensuite puis svp stp merci').split(' '));

  const ENTITY_WORDS = {
    customer: ['client', 'customer', 'acheteur', 'inscrit', 'compte'],
    order: ['commande', 'cde', 'cmd', 'order', 'vente'],
    product: ['produit', 'product', 'article', 'catalogue'],
    combination: ['declinaison', 'decli', 'combinaison', 'combination', 'variante'],
  };

  // Synonymes français -> mots présents dans les noms de colonnes / libellés.
  const SYN = {
    ref: ['reference'], reference: ['reference'], sku: ['reference'],
    prix: ['price', 'prix'], tarif: ['price'], cout: ['wholesale_price', 'cost'], achat: ['wholesale_price', 'wholesale'],
    ht: ['tax_excl', 'excl', 'ht'], ttc: ['tax_incl', 'incl', 'ttc'], taxe: ['tax'], tva: ['vat_number', 'tax', 'tva'],
    nom: ['name', 'lastname', 'nom'], prenom: ['firstname'], mail: ['email'], courriel: ['email'], 'e-mail': ['email'],
    tel: ['phone', 'telephone'], telephone: ['phone', 'telephone'], portable: ['phone_mobile', 'mobile'], mobile: ['phone_mobile', 'mobile'],
    ville: ['city', 'ville'], postal: ['postcode'], cp: ['postcode'], adresse: ['address1', 'adresse', 'address'], complement: ['address2'],
    pays: ['country', 'pays'], region: ['state', 'region'], societe: ['company', 'societe'], entreprise: ['company'],
    date: ['date_add', 'date'], creation: ['date_add', 'add'], cree: ['date_add'], inscription: ['date_add'],
    modification: ['date_upd', 'upd'], modif: ['date_upd'], maj: ['date_upd'],
    naissance: ['birthday'], anniversaire: ['birthday'], civilite: ['gender', 'civilite'], genre: ['gender'],
    groupe: ['group', 'groupe'], langue: ['lang', 'langue'], boutique: ['shop', 'boutique'],
    quantite: ['quantity', 'quantite'], qte: ['quantity', 'qte'], stock: ['quantity', 'stock'],
    poids: ['weight'], largeur: ['width'], hauteur: ['height'], profondeur: ['depth'], ean: ['ean13'], ean13: ['ean13'],
    marque: ['manufacturer', 'marque'], fabricant: ['manufacturer'], fournisseur: ['supplier', 'fournisseur'],
    categorie: ['category', 'categorie'], image: ['image', 'cover', 'couverture'], photo: ['image', 'cover'], visuel: ['image', 'cover'],
    couverture: ['cover', 'couverture'], description: ['description'], resume: ['description_short', 'short'], courte: ['description_short', 'short'],
    meta: ['meta'], titre: ['title', 'titre'], slug: ['link_rewrite'], url: ['url', 'link_rewrite', 'urls'], lien: ['lien', 'url', 'link_rewrite'],
    actif: ['active', 'actif'], etat: ['state', 'current_state', 'etat'], statut: ['state', 'current_state', 'etat'],
    paiement: ['payment', 'paiement'], reglement: ['payment'], transporteur: ['carrier', 'transporteur'], livreur: ['carrier'],
    suivi: ['tracking', 'suivi', 'shipping_number'], tracking: ['tracking', 'suivi'], devise: ['currency', 'devise'], monnaie: ['currency'],
    total: ['total'], port: ['shipping'], expedition: ['shipping'], reduction: ['discounts', 'reduction'], remise: ['discounts', 'reduction'],
    bon: ['bons', 'cart_rule'], promo: ['on_sale', 'discounts'], coupon: ['bons', 'cart_rule'], solde: ['on_sale'],
    facture: ['invoice'], numero: ['number', 'n'], livraison: ['delivery', 'livraison'], facturation: ['invoice', 'facturation'],
    client: ['customer', 'client'], commande: ['order', 'commande', 'commandes'], produit: ['product', 'produit', 'produits'],
    declinaison: ['attribute', 'declinaison', 'declinaisons'], attribut: ['attribute', 'attributs'], caracteristique: ['feature', 'caracteristiques'],
    tag: ['tags', 'tag'], motcle: ['tags'], accessoire: ['accessories', 'accessoires'], cadeau: ['gift'], panier: ['cart'],
    commentaire: ['note', 'message'], identifiant: ['id'], nombre: ['nombre', 'count'], nb: ['nombre'], dispo: ['available'],
    disponible: ['available'], ecotaxe: ['ecotax'], transaction: ['transaction', 'transactions'], libelle: ['libelle'],
  };

  // Expressions figées -> nom de colonne (appliquées avant le découpage en mots).
  const PHRASES = [
    [/\bdates? de naissance\b/g, 'birthday'], [/\bcodes? postal\b|\bcodes? postaux\b/g, 'postcode'],
    [/\bfrais de (?:port|livraison|transport)\b/g, 'shipping'], [/\b(?:n°|no|num|numeros?) de suivi\b|\bsuivi colis\b/g, 'tracking'],
    [/\bbons? de reduction\b|\bcodes? promo\b|\bregles? panier\b/g, 'cart_rules'], [/\bprix d'?achat\b/g, 'wholesale_price'],
    [/\burls? simplifiees?\b|\burl rewrite\b|\blien simplifie\b/g, 'link_rewrite'], [/\bdescriptions? courtes?\b|\bresumes?\b/g, 'description_short'],
    [/\bmeta ?titres?\b|\btitres? meta\b|\btitres? seo\b/g, 'meta_title'], [/\bmeta ?descriptions?\b|\bdescriptions? seo\b/g, 'meta_description'],
    [/\bmeta ?(?:mots?-?cles|keywords?)\b/g, 'meta_keywords'], [/\b(?:n°|no|num|numeros?) de facture\b/g, 'invoice_number'],
    [/\bdates? de (?:la )?facture\b|\bdates? de facturation\b/g, 'invoice_date'], [/\bdates? de livraison\b/g, 'delivery_date'],
    [/\b(?:n°|no|num|numeros?) de bon de livraison\b/g, 'delivery_number'], [/\bnom complet\b/g, 'nom complet'],
    [/\bdates? (?:de )?(?:creation|ajout|inscription)\b/g, 'date_add'], [/\bdates? (?:de )?(?:modification|mise a jour|maj)\b/g, 'date_upd'],
    [/\bmots?-?cles\b/g, 'tags'], [/\btaux de (?:conversion|change)\b/g, 'conversion_rate'], [/\bnumeros? de tva\b|\btva intra(?:communautaire)?\b/g, 'vat_number'],
    [/\bcomplements? d'?adresse\b/g, 'address2'], [/\btelephones? portables?\b|\bportables?\b/g, 'phone_mobile'],
    [/\bmessages? cadeau\b/g, 'gift_message'], [/\bstock minimum\b|\bquantite minimale\b/g, 'minimal_quantity'],
    [/\bid (?:de (?:la |l')?)?(client|commande|produit|declinaison|adresse|transporteur|devise|panier|langue|boutique)\b/g, (m, x) => ({
      client: 'id_customer', commande: 'id_order', produit: 'id_product', declinaison: 'id_product_attribute', adresse: 'id_address',
      transporteur: 'id_carrier', devise: 'id_currency', panier: 'id_cart', langue: 'id_lang', boutique: 'id_shop' }[x])],
  ];
  const ENTITY_PHRASES = {
    product: [[/\bprix ttc\b/g, 'price tax_rules', 'PrestaShop ne stocke que le prix HT : j\'ai pris le prix HT et la règle de taxes.']],
    combination: [[/\bprix ttc\b/g, 'final_price', 'Pas de prix TTC stocké : j\'ai pris le prix HT final (produit + impact).']],
  };

  // Concept seul -> champ attendu, par entité (« client » dans une commande = son nom complet).
  const DEFAULTS = {
    customer: { id: 'customer.id_customer', nom: 'customer.lastname', prenom: 'customer.firstname', email: 'customer.email', mail: 'customer.email',
      date: 'customer.date_add', groupe: 'default_group', langue: 'lang_iso', pays: 'addr_countries', ville: 'addr_cities',
      telephone: 'addr_phones', tel: 'addr_phones', societe: 'customer.company', civilite: 'gender', boutique: 'shop_name',
      adresse: 'address.address1', postcode: 'address.postcode', phone_mobile: 'address.phone_mobile', vat_number: 'address.vat_number',
      address2: 'address.address2',
      actif: 'customer.active', commande: 'orders_count' },
    order: { id: 'orders.id_order', ref: 'orders.reference', reference: 'orders.reference', client: 'cu_name', nom: 'cu_name',
      email: 'customer.email', mail: 'customer.email', pays: 'ad_country', ville: 'delivery.city', adresse: 'delivery.address1',
      telephone: 'delivery.phone', tel: 'delivery.phone', produit: 'lines', total: 'orders.total_paid_tax_incl', etat: 'state', statut: 'state',
      date: 'orders.date_add', paiement: 'orders.payment', transporteur: 'carrier_name', devise: 'currency_iso', suivi: 'tracking',
      boutique: 'order_shop', langue: 'order_lang', facture: 'orders.invoice_number', port: 'orders.total_shipping_tax_incl',
      shipping: 'orders.total_shipping_tax_incl', postcode: 'delivery.postcode', phone_mobile: 'delivery.phone_mobile',
      address2: 'delivery.address2', vat_number: 'delivery.vat_number', cart_rules: 'cart_rules', tracking: 'tracking',
      birthday: 'customer.birthday', reduction: 'orders.total_discounts_tax_incl', remise: 'orders.total_discounts_tax_incl' },
    product: { id: 'product.id_product', nom: 'product_lang.name', ref: 'product.reference', reference: 'product.reference',
      prix: 'product_shop.price', image: 'cover_url', photo: 'cover_url', categorie: 'default_category', stock: 'stock.quantity',
      quantite: 'stock.quantity', actif: 'product_shop.active', description: 'product_lang.description', resume: 'product_lang.description_short',
      marque: 'manufacturer', fournisseur: 'supplier', url: 'product_url', lien: 'product_url', date: 'product.date_add', ean: 'product.ean13',
      poids: 'product.weight', tag: 'tags', caracteristique: 'features', declinaison: 'combinations_count', taxe: 'tax_rules' },
    combination: { id: 'product_attribute.id_product_attribute', nom: 'product_name', produit: 'product_reference',
      ref: 'product_attribute.reference', reference: 'product_attribute.reference', prix: 'product_attribute_shop.price',
      stock: 'stock.quantity', quantite: 'stock.quantity', image: 'images_urls', photo: 'images_urls', attribut: 'combination_name',
      libelle: 'combination_name', declinaison: 'combination_name', ean: 'product_attribute.ean13', poids: 'product_attribute.weight',
      actif: 'product_active' },
  };
  // Pluriels qui veulent une liste plutôt que le champ simple.
  const PLURAL_DEFAULTS = {
    product: { categorie: 'categories', image: 'images_urls', photo: 'images_urls', fournisseur: 'suppliers' },
    customer: { groupe: 'groups' },
    order: { paiement: 'payments', produit: 'lines' },
  };

  /* Filtres oui/non : expressions -> [id, actif]. Testées avant les champs, retirées du texte une fois reconnues. */
  const FILTER_PHRASES = {
    customer: [
      [/\b(?:avec|y compris|meme) (?:les )?(?:clients? )?supprimes?\b/, 'not_deleted', false],
      [/\b(?:non|pas|hors|sans|sauf) (?:les )?(?:clients? )?supprimes?\b/, 'not_deleted', true],
      [/\b(?:avec|y compris|meme) (?:les )?(?:comptes? )?invites?\b/, 'no_guest', false],
      [/\b(?:non|pas|hors|sans|sauf|exclure) (?:les )?(?:comptes? )?invites?\b|\bcomptes? reels?\b/, 'no_guest', true],
      [/\b(?:abonnes?|inscrits?) (?:a )?(?:la )?newsletter\b|\bnewsletter (?:uniquement|seulement|oui)\b/, 'newsletter', true],
      [/\b(?:abonnes?|inscrits?|acceptant) (?:aux )?(?:offres )?partenaires\b|\bopt-?in (?:uniquement|seulement|oui)\b|\bopt-?in partenaires\b/, 'optin', true],
      [/\b(?:comptes? )?actifs\b|\bactives\b/, 'active', true],
    ],
    order: [
      [/\b(?:non validees|meme non validees|toutes (?:les )?commandes|valides? ou non)\b/, 'valid', false],
      [/\b(?:validees?|valides|payees|valid ?= ?1)\b/, 'valid', true],
    ],
    product: [
      [/\b(?:avec|y compris) (?:les )?brouillons?\b/, 'not_draft', false],
      [/\b(?:sans|hors|pas|exclure|sauf) (?:les )?brouillons?\b/, 'not_draft', true],
      [/\b(?:visibles|hors nulle part|pas nulle part|sans (?:les )?(?:produits )?nulle part)\b/, 'visible', true],
      [/\b(?:actifs|actives|en ligne|publies)\b/, 'active', true],
    ],
    combination: [
      [/\b(?:produits? )?(?:actifs|actives|en ligne|publies)\b/, 'product_active', true],
    ],
  };
  const ALL_SHOPS = /\b(?:toutes (?:les )?boutiques|tous (?:les )?magasins|multi-?boutiques?)\b/;

  /* ---------- Dates ---------- */
  const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const MON = `(?:${MONTHS.join('|')}|janv|fevr?|avr|juil|sept?|oct|nov|dec)`;
  const DATE = `(\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}(?:er)? ${MON}\\.? \\d{4}|${MON}\\.? \\d{4}|(?:19|20)\\d{2})`;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthIdx = m => MONTHS.findIndex(x => x.startsWith(m.replace('.', '').slice(0, 3)));
  // Une date lue -> [premier jour, dernier jour] (« mars 2025 » = tout le mois, « 2025 » = toute l'année).
  function dateSpan(s) {
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { const d = `${m[1]}-${pad(m[2])}-${pad(m[3])}`; return [d, d]; }
    if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/))) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3];
      const d = `${y}-${pad(m[2])}-${pad(m[1])}`; return [d, d];
    }
    if ((m = s.match(/^(\d{1,2})(?:er)? ([a-z]+)\.? (\d{4})$/))) { const d = `${m[3]}-${pad(monthIdx(m[2]) + 1)}-${pad(m[1])}`; return [d, d]; }
    if ((m = s.match(/^([a-z]+)\.? (\d{4})$/))) {
      const mi = monthIdx(m[1]), y = +m[2];
      return [`${y}-${pad(mi + 1)}-01`, iso(new Date(y, mi + 1, 0))];
    }
    if ((m = s.match(/^(\d{4})$/))) return [`${m[1]}-01-01`, `${m[1]}-12-31`];
    return null;
  }
  const validDate = d => { const [y, m, j] = d.split('-').map(Number); const x = new Date(y, m - 1, j); return x.getMonth() === m - 1 && x.getDate() === j; };

  function parseDates(t, today) {
    const out = {};
    const take = (re, fn) => { t = t.replace(re, (...a) => { fn(...a.slice(1)); return ' '; }); };
    take(new RegExp(`\\b(?:entre (?:le )?|du |de )${DATE} (?:et (?:le )?|au |a |jusqu'?au )${DATE}`, 'g'), (a, b) => {
      const x = dateSpan(a), y = dateSpan(b); if (x) out.from = x[0]; if (y) out.to = y[1];
    });
    take(new RegExp(`\\b(?:depuis (?:le )?|a partir (?:du|de) |apres (?:le )?|des (?:le )?|>= ?)${DATE}`, 'g'), a => { const x = dateSpan(a); if (x) out.from = x[0]; });
    take(new RegExp(`\\b(?:jusqu'? ?(?:au|a|en) |avant (?:le )?|<= ?)${DATE}`, 'g'), a => { const x = dateSpan(a); if (x) out.to = x[1]; });
    take(new RegExp(`\\b(?:en|de l'annee|annee|du mois de|mois de|sur) ${DATE}`, 'g'), a => { const x = dateSpan(a); if (x) { out.from = x[0]; out.to = x[1]; } });
    take(/\b(?:les |des |depuis |sur )?(\d+) derni(?:ers|eres) (jours?|semaines?|mois|ans?|annees?)\b|\bdepuis (\d+) (jours?|semaines?|mois|ans?|annees?)\b/g, (n1, u1, n2, u2) => {
      const n = +(n1 || n2), u = u1 || u2, d = new Date(today);
      if (/^j/.test(u)) d.setDate(d.getDate() - n); else if (/^s/.test(u)) d.setDate(d.getDate() - 7 * n);
      else if (/^m/.test(u)) d.setMonth(d.getMonth() - n); else d.setFullYear(d.getFullYear() - n);
      out.from = iso(d);
    });
    take(/\baujourd'? ?hui\b/g, () => { out.from = out.to = iso(today); });
    take(/\bhier\b/g, () => { const d = new Date(today); d.setDate(d.getDate() - 1); out.from = out.to = iso(d); });
    take(/\b(?:ce mois(?:-ci)?|du mois|mois en cours)\b/g, () => { out.from = iso(new Date(today.getFullYear(), today.getMonth(), 1)); out.to = iso(today); });
    take(/\b(?:le )?mois dernier\b/g, () => { out.from = iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)); out.to = iso(new Date(today.getFullYear(), today.getMonth(), 0)); });
    take(/\b(?:cette annee|annee en cours)\b/g, () => { out.from = `${today.getFullYear()}-01-01`; out.to = iso(today); });
    take(/\b(?:l'?annee derniere|l'?an dernier)\b/g, () => { const y = today.getFullYear() - 1; out.from = `${y}-01-01`; out.to = `${y}-12-31`; });
    // Date ou année seule (« commandes 2025 », « commandes 15/03/2025 ») : toute la période.
    if (!out.from && !out.to) take(new RegExp(`(?:^|\\s)${DATE}(?=\\s|$)`, 'g'), a => { const x = dateSpan(a); if (x) { out.from = x[0]; out.to = x[1]; } });
    return { t, dates: out };
  }

  /* ---------- Versions ---------- */
  const VER = '(1\\.[67](?:\\.\\d{1,2})?|[89](?:\\.\\d{1,2})?)(?:\\.x)?';
  const PSW = '(?:ps|presta(?:shop)?|version|v)';
  function verKey(s) {
    const p = s.split('.');
    if (p[0] === '8' || p[0] === '9') return p[0];
    if (p[1] === '6') return '1.6';
    const n = p[2] == null ? 7 : +p[2];
    return n <= 2 ? '1.7.0' : n <= 4 ? '1.7.3' : n <= 6 ? '1.7.5' : '1.7.7';
  }
  function parseVersions(t) {
    const out = {};
    t = t.replace(new RegExp(`\\b(?:de |depuis |base |source )?(?:${PSW} ?)?${VER}\\s*(?:vers|->|→|>|a|à|en) (?:la |une )?(?:${PSW} ?)?${VER}\\b`, 'g'), (m, a, b) => {
      out.src = verKey(a); out.dst = verKey(b); return ' ';
    });
    t = t.replace(new RegExp(`\\b(?:(?:en|sur|pour) )?${PSW} ?${VER}\\b|\\b(?:(?:en|sur|pour) )?(1\\.[67](?:\\.\\d{1,2})?)(?:\\.x)?\\b|\\b(?:(?:en|sur|pour) )?([89])\\.x\\b`, 'g'), (m, a, b, c) => {
      if (!out.src) out.src = verKey(a || b || c); return ' ';
    });
    return { t, versions: out };
  }

  /* ---------- Réglages, options, limite ---------- */
  function parseSettings(t, raw, curLangs) {
    const out = { vars: {}, notes: [] };
    const take = (re, fn) => { t = t.replace(re, (...a) => { fn(...a.slice(1)); return ' '; }); };
    // Le préfixe est sensible à la casse : on le lit dans le texte d'origine.
    const pm = raw.match(/\bpr[ée]fix(?:e|es)?\s*[=:]?\s*([A-Za-z0-9_]+)/i);
    if (pm) { out.vars.prefix = pm[1]; t = t.replace(/\bprefix(?:e|es)?\s*[=:]?\s*[a-z0-9_]+/, ' '); }
    const um = raw.match(/\bhttps?:\/\/[^\s,;]+/i);
    if (um) { out.vars.shop_url = um[0].replace(/\/+$/, ''); t = t.replace(/\bhttps?:\/\/[^\s,;]+/, ' '); }
    take(/\b(?:id_shop|boutique|magasin)\s*(?:=|:|n°|no|numero)?\s*(\d+)\b/, n => { out.vars.id_shop = n; out.shopOn = true; });
    take(/\bid_lang\s*[=:]?\s*(\d+)\b/, n => { out.vars.id_lang = n; });
    take(ALL_SHOPS, () => { out.shopOff = true; });
    take(/\blangues?\s*[=:]?\s*((?:\d+:[a-z-]+|[a-z]{2})(?:\s*(?:,|;|\+|et|\s)\s*(?:\d+:[a-z-]+|[a-z]{2})\b)*)/, list => {
      const known = {};
      for (const part of String(curLangs || '').split(/[,;\s]+/)) { const m = part.match(/^(\d+):([\w-]+)$/); if (m) known[m[2]] = m[1]; }
      const res = [], miss = [];
      for (const x of list.split(/\s*(?:,|;|\+|\bet\b|\s)\s*/).filter(Boolean)) {
        const m = x.match(/^(\d+):([a-z-]+)$/);
        if (m) res.push(`${m[1]}:${m[2]}`); else if (known[x]) res.push(`${known[x]}:${x}`); else miss.push(x);
      }
      if (res.length) out.vars.langs = res.join(',');
      if (miss.length) out.notes.push({ warn: true, text: `Langue${miss.length > 1 ? 's' : ''} ${miss.join(', ')} : id inconnu, écris-la sous la forme id:code (ex. 2:${miss[0]}).` });
    });
    take(/\b(?:(?:avec )?(?:les )?(?:noms?|en-?tetes?|entetes?|colonnes?) techniques?)\b/, () => { out.headers = 'tech'; });
    take(/\b(?:en-?tetes?|entetes?) (?:en )?(?:clair|libelles?|lisibles?)\b|\bnoms? lisibles?\b/, () => { out.headers = 'label'; });
    take(/\b(?:en |avec (?:des )?)?sous[- ]?requetes?\b/, () => { out.method = 'sub'; });
    take(/\b(?:en |avec (?:des )?)?jointures?\b/, () => { out.method = 'join'; });
    take(/\b(?:limite?|limit|max(?:imum)?)\s*(?:a|de|:|=)?\s*(\d+)(?:\s*(?:lignes?|resultats?))?\b|\b(\d+)\s*(?:lignes|premiers?|premieres?|resultats)\b|\b(?:top|les)\s+(\d+)\s+premi(?:ers?|eres?)\b/, (a, b, c) => { out.limit = a || b || c; });
    take(/\b(?:sans limite|toutes les lignes|pas de limite)\b/, () => { out.limit = ''; });
    take(/\b(?:etat|statut|state|current_state|id_order_state)\s*(?:=|:|n°|no|numero|id)?\s*(\d+)\b/, n => { out.state = n; });
    take(/\b(?:selection )?essentiel(?:le)?s?\b/, () => { out.preset = 'preset'; });
    take(/\b(?:tous les champs|toutes les colonnes|tout cocher|tout)\b/, () => { out.preset = 'all'; });
    return { t, settings: out };
  }

  /* ---------- Champs ---------- */
  const words = s => norm(s).replace(/[()[\]:,'’/.]/g, ' ').split(/[\s_-]+/).filter(w => w && !STOP.has(w));
  function editDist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let pp = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      pp = prev; prev = cur;
    }
    return prev[b.length];
  }
  const fuzzy = (a, b) => a.length >= 5 && b.length >= 4 && editDist(a, b, a.length >= 8 ? 2 : 1) <= (a.length >= 8 ? 2 : 1);

  // Index des champs d'une entité : mots propres (libellé ou colonne) et mots de contexte (groupe, table).
  function buildIndex(entity, groups, preset) {
    const presetSet = new Set(preset);
    const idx = [];
    for (const g of groups) {
      const ctx = new Set([...words(g.label), ...(g.table ? [norm(g.table), ...words(g.table)] : [])]);
      for (const f of g.fields) {
        const ownText = f.raw ? `${f.col} ${f.col.replace(/_/g, ' ')}` : f.label;
        // « Livraison : city » : le préfixe du groupe compte comme un mot du champ.
        const own = [...new Set([...words(ownText), ...(f.raw ? [norm(f.col)] : []), ...(f.hlabel ? words(f.hlabel) : [])])];
        const exact = new Set([norm(f.id), norm(f.label)]);
        if (f.raw) { exact.add(norm(f.col)); exact.add(`${norm(g.table)}.${norm(f.col)}`); exact.add(`${g.id}.${norm(f.col)}`); }
        if (f.hlabel) exact.add(norm(f.hlabel).replace(/\s+/g, ' '));
        // Petite préférence : valeurs de la boutique (multiboutique), champs lisibles, sélection Essentiel.
        let prio = presetSet.has(f.id) ? 0.6 : 0;
        if (/_shop$/.test(g.table || '')) prio += 0.4;
        if (!f.raw) prio += 0.2;
        if (g.id === 'invoice') prio -= 0.1;
        if (g.id === 'customer' && entity !== 'customer') prio -= 0.2;
        idx.push({ f, g, own, ctx, exact, prio });
      }
    }
    return idx;
  }
  function wordHit(w, list) {
    const alts = [w, sing(w), ...(SYN[w] || SYN[sing(w)] || [])];
    let best = 0;
    for (const x of list) {
      for (const a of alts) {
        if (a === x) return 3;
        if (a.includes('_') || x.includes('_')) continue; // un nom technique ne se compare qu'en entier
        if (a.length >= 4 && x.length >= 4 && (x.startsWith(a) || a.startsWith(x))) best = Math.max(best, 2);
        else if (fuzzy(a, x)) best = Math.max(best, 1.5);
      }
    }
    return best;
  }
  // Meilleurs champs pour une suite de mots ; null si un des mots ne colle à rien.
  function scoreFields(idx, ws, entity, plural) {
    const phrase = ws.join(' ');
    const key = sing(phrase);
    const defId = ws.length === 1 && ((plural && PLURAL_DEFAULTS[entity] && PLURAL_DEFAULTS[entity][key]) || (DEFAULTS[entity] || {})[key]);
    const scored = [];
    for (const it of idx) {
      let s = 0, ownHits = 0, ok = true;
      if (it.exact.has(phrase) || it.exact.has(phrase.replace(/ /g, '_'))) s += 20;
      if (defId && it.f.id === defId) s += 15;
      for (const w of ws) {
        const o = wordHit(w, it.own);
        if (!o) { ok = false; break; }
        ownHits++;
        s += o;
      }
      if (!ok && s < 15) continue;
      s += (ownHits / Math.max(it.own.length, 1)) * 2 + it.prio + (ws.some(w => it.ctx.has(w) || it.ctx.has(sing(w))) ? 0.3 : 0);
      scored.push({ it, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.length ? scored : null;
  }
  // Découpe glouton : la plus longue suite de mots qui désigne un seul champ. Les mots liés par « de »
  // (« nombre de commandes ») ne sont coupés qu'en dernier recours. Le nom de l'entité seul est ignoré.
  function parseFields(text, idx, entity, picked = []) {
    const found = [], unknown = [], notes = [];
    const self = new Set(ENTITY_WORDS[entity]);
    for (const seg of text.split(/\s*(?:,|;|\+|\bet\b|\bpuis\b|\/)\s*/)) {
      const toks = norm(seg).replace(/[()[\]:'’]/g, ' ').split(/\s+/).filter(Boolean);
      const ws = [], glue = [];
      for (const w of toks) {
        if (/^(?:de|du|des|d)$/.test(w)) { if (ws.length) glue[ws.length - 1] = true; continue; }
        if (STOP.has(w)) continue;
        ws.push(w);
      }
      let i = 0;
      while (i < ws.length) {
        const pm = ws[i].match(/^@@(\d+)$/);
        if (pm) { const it = picked[+pm[1]]; found.push({ id: it.f.id, field: it.f, group: it.g, text: it.f.label }); i++; continue; }
        let hit = null;
        for (const strict of [true, false]) {
          for (let len = Math.min(5, ws.length - i); len >= 1 && !hit; len--) {
            if (strict && glue[i + len - 1] && i + len < ws.length) continue;
            const part = ws.slice(i, i + len);
            if (len === 1 && self.has(sing(part[0]))) continue;
            const r = scoreFields(idx, part, entity, /[sx]$/.test(part[part.length - 1]));
            if (r && (len === 1 || r[0].s >= len * 2.2)) hit = { r, len, text: part.join(' ') };
          }
          if (hit) break;
        }
        if (!hit) { if (!self.has(sing(ws[i]))) unknown.push(ws[i]); i++; continue; }
        const [best, second] = hit.r;
        found.push({ id: best.it.f.id, field: best.it.f, group: best.it.g, text: hit.text });
        if (second && second.s >= best.s - 0.35 && second.it.f.id !== best.it.f.id && best.s < 15) {
          notes.push({ text: `« ${hit.text} » : j'ai pris ${fieldName(best.it)}, aussi possible : ${hit.r.slice(1, 3).filter(x => x.s >= best.s - 0.35).map(x => fieldName(x.it)).join(', ')}.` });
        }
        i += hit.len;
      }
    }
    return { found, unknown, notes };
  }
  // Libellés exacts et noms techniques complets, repérés dans la phrase avant tout découpage.
  const canon = x => norm(x).replace(/[^a-z0-9_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  function exactSpans(text, idx) {
    const cands = [];
    for (const it of idx) {
      const keys = new Set([canon(it.f.label), canon(it.f.id)]);
      if (it.f.raw) { keys.add(`${canon(it.g.table)}.${canon(it.f.col)}`); keys.add(`${it.g.id}.${canon(it.f.col)}`); }
      if (it.f.hlabel) keys.add(canon(it.f.hlabel));
      for (const k of keys) if (k && (/[ _.]/.test(k))) cands.push([k, it]);
    }
    cands.sort((a, b) => b[0].length - a[0].length);
    // On garde virgules et « + » pour le découpage suivant.
    let t = ' ' + norm(text).replace(/[^a-z0-9_.,;+]+/g, ' ').replace(/([,;+])/g, ' $1 ').replace(/\s+/g, ' ') + ' ';
    const picked = [];
    for (const [k, it] of cands) {
      const needle = ` ${k} `;
      let at;
      while ((at = t.indexOf(needle)) !== -1) {
        picked.push(it);
        t = t.slice(0, at) + ` @@${picked.length - 1} ` + t.slice(at + needle.length);
      }
    }
    return { t, picked };
  }
  const fieldName = it => (it.f.raw ? `${it.g.table}.${it.f.col}` : it.f.label);

  /* ---------- Entité ---------- */
  // Premier mot qui désigne une entité ; on le retire sans toucher aux virgules.
  function findEntity(t) {
    const re = /[a-z0-9_'-]+/g;
    let m;
    while ((m = re.exec(t))) {
      const w = sing(m[0]);
      for (const [k, list] of Object.entries(ENTITY_WORDS)) {
        if (list.some(x => x === w || (w.length >= 5 && (x.startsWith(w) || fuzzy(w, x))))) {
          return { entity: k, rest: t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length) };
        }
      }
    }
    return { entity: null, rest: t };
  }
  const MIGRATION = /\b(?:import(?:er)?|migr(?:er|ation)|format (?:d'?)?import|parametres avances|vers (?:une )?autre boutique)\b/;

  /* ---------- Plan ---------- */
  // ctx : { builder: PBBuilder, catalog, version (clé par défaut), langs (valeur actuelle), today (Date), search(texte) -> fiches }
  function parse(input, ctx) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    let t = ' ' + norm(raw).replace(/\s+/g, ' ') + ' ';
    const today = ctx.today || new Date();
    let r = parseVersions(t); t = r.t; const versions = r.versions;
    r = parseSettings(t, raw, ctx.langs); t = r.t; const st = r.settings;
    r = parseDates(t, today); t = r.t; const dates = r.dates;
    const notes = st.notes.slice();
    for (const d of new Set([dates.from, dates.to])) if (d && !validDate(d)) notes.push({ warn: true, text: `Date ${d} invalide, ignorée.` });
    if (dates.from && !validDate(dates.from)) delete dates.from;
    if (dates.to && !validDate(dates.to)) delete dates.to;

    const migr = MIGRATION.test(t) || !!versions.dst;
    const ent = migr ? { entity: null, rest: t } : findEntity(t);
    const builderEntry = (ctx.entries || []).find(e => e.type === 'builder');

    // Une autre fiche (migration CSV, note…) : on l'ouvre avec ses versions et réglages.
    if (!ent.entity || !builderEntry) {
      const hits = (ctx.search ? ctx.search(t.trim()) : []).filter(e => e.type !== 'builder' || !migr);
      const entry = hits[0];
      if (!entry) return null;
      const substance = versions.src || versions.dst || Object.keys(st.vars).length;
      return substance ? { kind: 'entry', entry, versions, vars: st.vars, notes } : null;
    }

    const entity = ent.entity, B = ctx.builder, E = B.ENTITIES[entity];
    const version = versions.src || ctx.version;
    const groups = B.fieldsOf(entity, ctx.catalog, version);
    const idx = buildIndex(entity, groups, E.preset);
    let rest = ent.rest;

    // Filtres oui/non (libellé exact ou expression), puis libellés exacts des champs.
    const filterOn = {}, fv = {};
    for (const f of E.filters) {
      if (f.input) continue;
      const k = canon(f.label);
      const at = canon(rest).indexOf(k);
      if (at !== -1) { filterOn[f.id] = true; rest = ' ' + canon(rest).slice(0, at) + ' ' + canon(rest).slice(at + k.length) + ' '; }
    }
    for (const [re, id, on] of FILTER_PHRASES[entity] || []) {
      const g = new RegExp(re.source, 'g');
      if (g.test(rest)) { filterOn[id] = on; rest = rest.replace(g, ' '); }
    }
    const ex = exactSpans(rest, idx);
    rest = ex.t;
    if (E.filters.some(f => f.id === 'shop')) { if (st.shopOff) filterOn.shop = false; else if (st.shopOn) filterOn.shop = true; }
    const hasF = id => E.filters.some(f => f.id === id);
    if (dates.from || dates.to) {
      if (hasF('from')) { if (dates.from) fv.from = dates.from; if (dates.to) fv.to = dates.to; }
      else notes.push({ warn: true, text: `Pas de filtre de date pour ${E.label.toLowerCase()} : seules les commandes en ont un.` });
    }
    if (st.state) { if (hasF('state')) fv.state = st.state; else notes.push({ warn: true, text: `Pas de filtre d'état pour ${E.label.toLowerCase()}.` }); }

    for (const [re, to, note] of ENTITY_PHRASES[entity] || []) if (re.test(rest)) { rest = rest.replace(re, ` ${to} `); notes.push({ text: note }); }
    for (const [re, to] of PHRASES) rest = rest.replace(re, typeof to === 'function' ? (...a) => ` ${to(...a)} ` : ` ${to} `);
    const { found, unknown, notes: fnotes } = parseFields(rest, idx, entity, ex.picked);
    notes.push(...fnotes);
    // Doublons et champs indisponibles.
    const seen = new Set(), fields = [];
    let method = st.method;
    for (const x of found) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      if (!x.field.available) { notes.push({ warn: true, text: `${x.field.raw ? x.field.col : x.field.label} n'existe pas en PS ${version} : ignoré.` }); continue; }
      if (x.field.subOnly && method !== 'sub') {
        method = 'sub';
        notes.push({ text: `${x.field.label} n'existe qu'avec les sous-requêtes : je passe en sous-requêtes.` });
      }
      fields.push(x);
    }
    const empty = !fields.length && !st.preset && !Object.keys(filterOn).length && !Object.keys(fv).length && !st.limit;
    if (empty && /\b(?:csv|import)\b/.test(t)) {
      const entry = (ctx.search ? ctx.search(t.trim()) : []).find(e => e.type !== 'builder');
      if (entry) return { kind: 'entry', entry, versions, vars: st.vars, notes: [] };
    }
    if (unknown.length) notes.push({ warn: true, text: `Pas compris : ${[...new Set(unknown)].map(w => `« ${w} »`).join(', ')}.` });
    return {
      kind: 'builder', entry: builderEntry, entity, label: E.label, version: versions.src || null,
      preset: st.preset || null, fields, filterOn, fv, limit: st.limit, headers: st.headers || null, method: method || null,
      vars: st.vars, notes,
    };
  }

  const api = { parse, norm, verKey, dateSpan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PBAssistant = api;
})(typeof window !== 'undefined' ? window : globalThis);
