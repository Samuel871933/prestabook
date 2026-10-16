# PrestaBook

Base de connaissances PrestaShop perso : requêtes SQL, notes, snippets. Site 100 % statique (HTML/CSS/JS, aucune dépendance), prêt pour GitHub Pages.

## Lancer en local

Les fiches sont chargées en `fetch`, il faut donc un petit serveur (l'ouverture directe en `file://` ne marche pas) :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## Kits téléchargeables (`kits/`)

Un bloc ```` ```kit ```` dans une note (contenu : le nom du kit, ex. `dev`) affiche un générateur. On y choisit le nom du thème et le parent (qui remplissent aussi `{{theme}}` et `{{theme_parent}}` dans les exemples de la note), l'ajout de `config/theme.yml` (parent, nom, chargement du CSS et du JS compilés), puis pour chaque composant « sans / vide / pré-rempli ». Le zip `<thème>/` (`config/theme.yml` + `_dev/`) est assemblé dans le navigateur (`assets/js/kit.js`), sans serveur.

- `kits/dev/` : le contenu du dossier `_dev`, composants vides.
- `kits/prefill/components/` : les versions pré-remplies des composants.
- `kits/dev.json` : le manifeste (dossier racine du zip, liste des fichiers, composants). Après avoir ajouté ou retiré un fichier dans `kits/dev/`, mets à jour sa liste `files`. Pour un nouveau composant, ajoute son fichier vide dans `kits/dev/css/components/`, sa version pré-remplie dans `kits/prefill/components/`, son `@use` dans `theme.scss` et une entrée dans `components`.

## Cache du navigateur

Dans `index.html`, les liens vers `style.css` et les scripts portent un numéro de version (`?v=2026-10-16j`). **Change-le à chaque modification du CSS ou du JS**, par exemple avec la date du jour, sinon les navigateurs peuvent garder l'ancienne version. En local, un rechargement forcé (Ctrl+Maj+R) suffit aussi.

## Publier sur GitHub Pages

1. Pousser le dossier sur un dépôt GitHub.
2. **Settings > Pages > Build and deployment** : Source = *Deploy from a branch*, branche `main`, dossier `/ (root)`.

Le fichier `.nojekyll` désactive Jekyll pour que les fichiers soient servis tels quels.

## Ajouter une fiche

1. Créer le contenu :
   - requête : `content/sql/ma-requete.sql`
   - note : `content/notes/ma-note.md` (titres `##`, listes, tableaux, `> encadré`, blocs de code)
2. Déclarer la fiche dans `data/entries.json` :

```json
{
  "id": "ma-requete",
  "title": "Titre lisible",
  "type": "sql",
  "category": "Exporter des données",
  "run": "bo",
  "tags": ["commandes"],
  "keywords": ["export", "CSV"],
  "versions": ["1.7", "8.x"],
  "status": "testé",
  "updated": "2026-10-16",
  "file": "content/sql/ma-requete.sql",
  "summary": "Une phrase qui dit ce que fait la fiche.",
  "notes": ["## À savoir", "- Ligne de note en **markdown**."]
}
```

Pour une doc longue (tableaux de colonnes…), mettre plutôt `"doc": "content/sql/ma-requete.md"` : le markdown est affiché sous la requête. Dans un tableau, un `|` à l'intérieur de `code` ne coupe pas la cellule.

- `category` : ce qu'on veut faire. Les catégories de l'accueil, leur ordre et leur description sont dans `CATS`, en haut de `assets/js/app.js` : « Exporter des données », « Migrer une boutique », « Comprendre PrestaShop ». Une catégorie absente de `CATS` s'affiche quand même, en dernier.
- `run` : où lancer la requête, `bo` (Gestionnaire SQL du back-office) ou `db` (phpMyAdmin, Adminer…). À omettre pour une note.
- `tags` : les **sujets** seulement (produits, commandes, clients, images, stock…). Ils sont affichés et servent de filtre.
- `keywords` : synonymes et termes techniques trouvés par la recherche, mais pas affichés (ex. `combinaisons`, `import CSV`).

`type` : `sql`, `note` ou `snippet` (snippet = code brut, préciser `"lang": "php"` par ex.). Un `status` contenant « vérifier », « todo » ou « brouillon » s'affiche en orange.

## Variables dans les requêtes

Dans les `.sql` et dans les blocs de code des notes, ces marqueurs sont remplacés à l'affichage, à la copie et au téléchargement par les valeurs saisies sur la fiche (mémorisées dans le navigateur) :

| Marqueur | Défaut |
|---|---|
| `{{prefix}}` | `ps_` |
| `{{id_lang}}` | `1` |
| `{{id_shop}}` | `1` |
| `{{shop_url}}` | `https://www.ma-boutique.fr` |

Exemple : `FROM {{prefix}}product p WHERE p.id_shop_default = {{id_shop}}`.

Pour en ajouter une, compléter l'objet `VARS` en haut de `assets/js/app.js`.

## Versions PrestaShop

`versions` d'une fiche (`1.6`, `1.7`, `8.x`, `9.x`) alimente le choix **Ma version de PrestaShop** de la barre latérale : il masque les fiches qui ne couvrent pas cette version et règle la base source des fiches sur cette version. Le choix est mémorisé dans le navigateur. Les cartes n'affichent les versions que si une fiche ne les couvre pas toutes.

Pour une requête qui change selon la version, on encadre les lignes avec des commentaires SQL. Deux variables sont disponibles :

- `ps` : version de la **base source**, celle où on lance la requête (quelles colonnes existent) ;
- `cible` : version de la **boutique cible**, celle où on importe (quels champs, dans quel ordre).

```sql
-- @if cible >= 1.7.7
-- @if ps >= 1.7.7
    COALESCE(p.mpn, '') AS 'MPN',
-- @else
    '' AS 'MPN',
-- @endif
-- @endif
```

- Opérateurs : `>=`, `<=`, `>`, `<`, `==` (sur le début du numéro : `ps == 1.7` couvre toute la 1.7) et `!=`, combinables avec `and`. On peut aussi utiliser `@elif`, et imbriquer les blocs.
- Sur la fiche, des onglets **Base source** / **Boutique cible** apparaissent. L'onglet cible n'est affiché que si la requête utilise `cible`. Seules les branches retenues sont affichées, copiées et téléchargées, et leurs numéros de ligne sont en rose.
- Les tranches de versions proposées (`PS_VERSIONS` dans `assets/js/app.js`) suivent les changements de l'import : 1.6, 1.7.0–1.7.2, 1.7.3–1.7.4, 1.7.5–1.7.6, 1.7.7–1.7.8, 8.x, 9.x.
- Une ligne qui commence par `--!` est un commentaire réservé au fichier brut : elle n'apparaît pas sur le site.
- Ça marche aussi dans les blocs de code des notes markdown.

## Générateur d'export (Gestionnaire SQL)

La fiche de type `builder` (« Export configurable clients, commandes, produits, déclinaisons ») construit une requête compatible avec **Paramètres avancés > Base de données > Gestionnaire SQL**.

- Moteur et définition des entités : `assets/js/builder.js`. Pour chaque entité : jointures, groupes de colonnes brutes, champs liés, listes, filtres et préréglage « Essentiel ».
- Colonnes disponibles par version : `data/schema-catalog.json`. Il a été généré depuis les `db_structure.sql` officiels et les entités Doctrine (`lang`, `shop`, `attribute*`) de 14 versions, de 1.6.1 à 9.0.
- Pour ajouter une table, ajoute ses colonnes au catalogue, puis un groupe `{ table, alias, join }` dans l'entité.

## Où lancer la requête (`run`)

- `bo` : la requête passe dans le Gestionnaire SQL du back-office (vérifiée avec le validateur `RequestSql`).
- `db` : à lancer dans phpMyAdmin, Adminer, DBeaver… Le Gestionnaire SQL refuse par exemple `SET`, les tables dérivées `JOIN (SELECT …)` ou `REPLACE()`.

Le champ ajoute un badge sur les cartes et les fiches, et alimente le filtre « Où lancer la requête ? » de la barre latérale.

## Assistant (barre de recherche)

La recherche comprend aussi une demande. Un encart montre ce qui a été compris, et **Entrée** ouvre la fiche déjà réglée. Exemples :

- `commandes ref, client, transporteur, total ttc, produits depuis 01/01/2025 validées limite 500`
- `clients nom prénom email date de naissance abonnés newsletter sans invités`
- `produits essentiel + poids, meta titre en ps 1.7 langues 1:fr,2:en`
- `déclinaisons ref ean prix stock attributs images`
- `export produits csv 1.6 vers 8 préfixe abc_` (ouvre la fiche CSV avec ces versions)

Ce qu'il reconnaît :

- **Entité** : clients, commandes, produits, déclinaisons (tolère les fautes, ex. « comande »).
- **Colonnes** : tous les champs du générateur, par libellé (« Transporteur »), par nom technique (`total_paid_tax_incl`, `orders.reference`) ou en français courant (ref, prix, ttc, ville de livraison, pays de facturation, date de naissance, code postal, meta titre…). Les colonnes sortent **dans l'ordre tapé**. `essentiel` ou `tout` partent d'une sélection toute faite.
- **Filtres** : leurs libellés et des formules courantes (validées, actifs, sans invités, sans brouillons, toutes boutiques…). Pour les dates des commandes : `depuis 01/01/2025`, `du … au …`, `entre … et …`, `en mars 2025`, `2025`, `les 30 derniers jours`, `ce mois`, `le mois dernier`, `cette année`, `hier`. Et aussi `état 4`, `limite 500`, `100 premières`.
- **Réglages** : `ps 1.7` / `presta 8` (version), `1.6 vers 8` (migration), `langues 1:fr,2:en`, `boutique 2`, `préfixe abc_`, une URL de boutique, `noms techniques`, `sous-requêtes`.

Les mots non compris et les choix ambigus sont signalés dans l'encart. Le vocabulaire (synonymes, expressions figées, champ choisi par défaut pour chaque mot) se trouve en haut de `assets/js/assistant.js`.

**Après avoir ajouté un champ, un filtre ou une entité** au générateur, lance `node tests/assistant.test.js`. Le test vérifie que chaque champ reste atteignable par son libellé, son id et `table.colonne`, pour chaque version, ainsi que les phrases d'exemple.

## Raccourcis

- `/` ou `Ctrl+K` : focus sur la recherche
- `Entrée` : ouvre le premier résultat
- `Échap` : vide la recherche

La recherche ignore accents et casse, tolère une faute de frappe par mot (« comande », « clinet »), et fouille aussi le contenu des requêtes (tape un nom de table, ex. `specific_price`). Ouvrir le générateur depuis une recherche qui cite clients, commandes, produits ou déclinaisons l’ouvre sur le bon onglet.
# prestabook
