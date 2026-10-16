# PrestaBook

Base de connaissances PrestaShop perso : requêtes SQL, notes, snippets. Site 100 % statique (HTML/CSS/JS, aucune dépendance), prêt pour GitHub Pages.

## Lancer en local

Les fiches sont chargées en `fetch`, il faut donc un petit serveur (l'ouverture directe en `file://` ne marche pas) :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

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
  "category": "Commandes",
  "tags": ["commandes", "export"],
  "versions": ["1.7", "8.x"],
  "status": "testé",
  "updated": "2026-10-16",
  "file": "content/sql/ma-requete.sql",
  "summary": "Une phrase qui dit ce que fait la fiche.",
  "notes": ["## À savoir", "- Ligne de note en **markdown**."]
}
```

Pour une doc longue (tableaux de colonnes…), mettre plutôt `"doc": "content/sql/ma-requete.md"` : le markdown est affiché sous la requête. Dans un tableau, un `|` à l'intérieur de `code` ne coupe pas la cellule.

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

`versions` d'une fiche (`1.6`, `1.7`, `8.x`, `9.x`) alimente le filtre **Version PrestaShop** de la barre latérale. Le choix est mémorisé dans le navigateur.

Pour une requête qui change selon la version, encadrer les lignes concernées avec des commentaires SQL :

```sql
-- @if ps >= 8
    ps.unit_price AS 'Unit price',
-- @elif ps >= 1.7.3
    ...
-- @else
    IF(ps.unit_price_ratio > 0, ROUND(ps.price / ps.unit_price_ratio, 6), 0) AS 'Unit price',
-- @endif
```

- Opérateurs : `>=`, `<=`, `>`, `<`, `==` (égalité sur le début du numéro : `ps == 1.7` couvre toute la 1.7) et `!=`. On peut les combiner avec `and`.
- La fiche affiche des onglets de version. Seule la branche correspondante est affichée, copiée et téléchargée, et ses numéros de ligne sont en rose.
- Pour les comparaisons, chaque version vaut sa dernière mineure : 1.6 = 1.6.1, 1.7 = 1.7.8, 8 = 8.2, 9 = 9.0 (`PS_VERSIONS` dans `assets/js/app.js`).
- Ça marche aussi dans les blocs de code des notes markdown.

## Raccourcis

- `/` ou `Ctrl+K` : focus sur la recherche
- `Entrée` : ouvre le premier résultat
- `Échap` : vide la recherche

La recherche ignore accents et casse, et fouille aussi le contenu des requêtes (tape un nom de table, ex. `specific_price`).
# prestabook
