// Tests de l'assistant : node tests/assistant.test.js
// 1. Chaque champ de chaque entité, pour chaque version, est atteignable par son libellé, son id et table.colonne.
// 2. Chaque filtre oui/non est atteignable par son libellé.
// 3. Des phrases courantes donnent le plan attendu.
'use strict';
const path = require('path');
const root = path.join(__dirname, '..');
const B = require(path.join(root, 'assets/js/builder.js'));
const A = require(path.join(root, 'assets/js/assistant.js'));
const catalog = require(path.join(root, 'data/schema-catalog.json'));
const entries = require(path.join(root, 'data/entries.json'));

const search = q => {
  const t = A.norm(q).split(/\s+/).filter(Boolean);
  const hay = e => A.norm([e.title, e.summary, (e.tags || []).join(' '), (e.keywords || []).join(' ')].join(' '));
  return entries.filter(e => t.length && t.every(w => hay(e).includes(w)));
};
const ctx = { builder: B, catalog, entries, search, version: '9', langs: '1:fr,2:en', today: new Date(2026, 9, 16) };
const WORD = { customer: 'clients', order: 'commandes', product: 'produits', combination: 'déclinaisons' };
const fails = [];
let n = 0;
const check = (ok, msg) => { n++; if (!ok) fails.push(msg); };

for (const ver of ['1.6', '1.7.0', '1.7.3', '1.7.5', '1.7.7', '8', '9']) {
  for (const ent of Object.keys(B.ENTITIES)) {
    const groups = B.ENTITIES[ent].groups;
    for (const g of B.fieldsOf(ent, catalog, ver)) for (const f of g.fields) {
      if (!f.available) continue;
      // Une table jointe deux fois (adresse de livraison / facturation) : « address.city » est ambigu, on passe par l'id du groupe.
      const twice = groups.filter(x => x.table === g.table).length > 1;
      const qs = f.raw ? [...(twice ? [] : [`${g.table}.${f.col}`]), `${g.id}.${f.col}`, ...(f.hlabel ? [f.hlabel] : [])] : [f.label, f.id];
      for (const q of qs) {
        const p = A.parse(`${WORD[ent]} ${q} ps ${ver}`, ctx);
        const got = p && p.fields ? p.fields.map(x => x.id) : [];
        check(p && p.entity === ent && got.length === 1 && got[0] === f.id, `[${ver}] ${WORD[ent]} « ${q} » → ${got.join(',') || 'rien'} (attendu ${f.id})`);
      }
    }
  }
}
for (const [ent, E] of Object.entries(B.ENTITIES)) for (const f of E.filters) {
  if (f.input) continue;
  const p = A.parse(`${WORD[ent]} ${f.label}`, ctx);
  check(p && p.filterOn[f.id] === true && !p.fields.length, `filtre ${ent} « ${f.label} »`);
}

const cases = [
  ['commandes ref, client, transporteur, total ttc depuis 01/01/2025 validées limite 500', p =>
    p.entity === 'order' && p.fields.map(x => x.id).join() === 'orders.reference,cu_name,carrier_name,orders.total_paid_tax_incl'
    && p.fv.from === '2025-01-01' && p.filterOn.valid && p.limit === '500'],
  ['export comande id email pays livraison ville facturation du 01/03/2025 au 31/03/2025', p =>
    p.fields.map(x => x.id).join() === 'orders.id_order,customer.email,ad_country,invoice.city' && p.fv.to === '2025-03-31'],
  ['prodiuts refrence prix quantitée marqe actifs sans brouillons', p =>
    p.fields.map(x => x.id).join() === 'product.reference,product_shop.price,stock.quantity,manufacturer' && p.filterOn.active && p.filterOn.not_draft],
  ['clients nom prénom email date de naissance abonnés newsletter sans invités', p =>
    p.fields.map(x => x.id).join() === 'customer.lastname,customer.firstname,customer.email,customer.birthday' && p.filterOn.newsletter && p.filterOn.no_guest],
  ['clients total dépensé', p => p.method === 'sub' && p.fields[0].id === 'total_spent'],
  ['produits essentiel + poids en ps 1.7 langues fr,en', p => p.preset === 'preset' && p.version === '1.7.7' && p.vars.langs === '1:fr,2:en'],
  ['déclinaisons ref ean prix stock attributs images', p => p.fields.length === 6],
  ['commandes en mars 2025 état 4 toutes boutiques noms techniques', p =>
    p.fv.from === '2025-03-01' && p.fv.to === '2025-03-31' && p.fv.state === '4' && p.filterOn.shop === false && p.headers === 'tech'],
  ['commandes 2025', p => p.fv.from === '2025-01-01' && p.fv.to === '2025-12-31'],
  ['export produits csv 1.6 vers 8 préfixe Abc_', p => p.kind === 'entry' && p.entry.id === 'export-produits-csv' && p.versions.dst === '8' && p.vars.prefix === 'Abc_'],
  // Mots anglais : traduits puis traités comme leur équivalent français.
  ['commande user_id', p => p.fields.map(x => x.id).join() === 'orders.id_customer'],
  ['orders reference, customer, carrier, total paid', p =>
    p.entity === 'order' && p.fields.map(x => x.id).join() === 'orders.reference,cu_name,carrier_name,orders.total_paid_tax_incl'],
  ['commande status country city', p => p.fields.map(x => x.id).join() === 'state,ad_country,delivery.city'],
  ['users first name last name zip code', p =>
    p.entity === 'customer' && p.fields.map(x => x.id).join() === 'customer.firstname,customer.lastname,address.postcode'],
  ['products price qty brand categories', p =>
    p.fields.map(x => x.id).join() === 'product_shop.price,stock.quantity,manufacturer,categories' && !p.notes.some(n => n.warn)],
  // Un mot répété ouvre un nouveau champ ; « nom produit » ne prend que les noms.
  ['commande id client nom produits nom client téléphone mobile téléphone', p =>
    p.fields.map(x => x.id).join() === 'orders.id_customer,lines_names,cu_name,delivery.phone_mobile,delivery.phone'],
  ['commande ville ville facturation', p => p.fields.map(x => x.id).join() === 'delivery.city,invoice.city'],
  ['commande nom produit, réf produit, produits', p => p.fields.map(x => x.id).join() === 'lines_names,lines_refs,lines'],
  ['migration déclinaisons 1.7.8 vers 9', p => p.kind === 'entry' && p.entry.id === 'export-declinaisons-csv' && p.versions.src === '1.7.7'],
];
for (const [q, ok] of cases) {
  let p = null, res = false;
  try { p = A.parse(q, ctx); res = !!(p && ok(p)); } catch (e) { res = false; }
  check(res, `phrase « ${q} » → ${p ? JSON.stringify({ e: p.entity, f: (p.fields || []).map(x => x.id), on: p.filterOn, fv: p.fv }) : 'null'}`);
}

console.log(`${n - fails.length}/${n} OK`);
if (fails.length) { console.log(fails.slice(0, 40).join('\n')); process.exit(1); }
