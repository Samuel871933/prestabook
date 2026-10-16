## Utilisation

1. Dans **Réglages**, choisis la version de la **base source** (là où tu lances la requête) et celle de la **boutique cible** (là où tu importes). Elles peuvent être différentes : par exemple une base 1.6 vers une boutique 8.
2. Copie la requête et lance-la avec `SET SESSION group_concat_max_len = 1000000;` **dans la même exécution**, sinon les listes (images, catégories…) sont coupées à 1024 caractères.
3. Exporte le résultat en CSV : séparateur de champs `;`, encodage UTF-8, **avec la ligne d'en-têtes**.
4. Sur la boutique cible : **Paramètres avancés > Importer**, entité **Produits**. Réglages : *Field separator* `;`, ***Multiple value separator* `|`**. Active *Force all ID numbers* (« forcer les ID ») pour garder les mêmes ID, ce qui est indispensable pour les accessoires et pour enchaîner sur les déclinaisons.
5. À l'étape de correspondance, mets **1 ligne à ignorer** (les en-têtes). Les colonnes sont déjà dans le bon ordre, tu n'as rien à changer.

> **Pourquoi l'ordre compte** : PrestaShop ne lit pas les en-têtes. Il associe la colonne n° 1 au 1ᵉʳ champ de sa liste, la n° 2 au 2ᵉ, et ainsi de suite (en sautant « Prix TTC »). La requête sort donc exactement les champs de la version cible, dans son ordre. Liste vérifiée dans `AdminImportController` de la 1.6.1 à la 9.0.

Ensuite, importe les déclinaisons avec la fiche « Export des déclinaisons ».

## Format des colonnes

Les valeurs multiples sont séparées par `|`. Une cellule vide veut dire « pas de valeur » : la requête ne sort jamais `NULL`, que phpMyAdmin écrirait en toutes lettres dans le CSV.

### Identité & catégories

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| ID | `id_product` | `42` |
| Active (0/1) | Produit activé sur la boutique | `1` |
| Name | Nom du produit | `Peinture acrylique 500 ml` |
| Categories (x,y,z...) | Noms des catégories, **catégorie par défaut en premier**. L'import retrouve chaque catégorie par son nom, ou la crée sous l'accueil | `Peintures|Accueil` |

### Prix & taxes

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Price tax excluded | Prix de vente HT | `12.500000` |
| Tax rule ID | `id_tax_rules_group`, `0` = aucune taxe. Doit exister sur la cible | `1` |
| Cost price | Prix d'achat HT | `5.200000` |
| On sale (0/1) | Bandeau « Promo ! » | `0` |
| Ecotax | Écotaxe | `0.000000` |
| Unit for the price per unit | Unité du prix unitaire | `litre` |
| Price per unit | Prix unitaire HT. Avant PS 8, recalculé depuis `unit_price_ratio` | `25.000000` |
| Additional shipping cost | Frais de port supplémentaires | `0.00` |

### Réduction

Une seule réduction exportée, et seulement si l'import sait la recréer à l'identique : pour tout le monde (sans client, groupe, pays ni devise), dès 1 unité, sans prix fixe, hors règles de prix catalogue et non expirée. Si plusieurs conviennent, celle de la boutique courante passe en premier, puis la plus récente.

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Discount amount | Montant si réduction en montant, sinon vide | `2.000000` |
| Discount percent | Pourcentage si réduction en % (`0.15` en base → `15`) | `15.000000` |
| Discount from (yyyy-mm-dd) | Début, vide = sans limite | `2026-11-01` |
| Discount to (yyyy-mm-dd) | Fin, vide = sans limite | `2026-11-30` |

### Références

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Reference # | Référence produit | `ACR-500-BL` |
| Supplier reference # | Référence chez le fournisseur par défaut | `FRN-88231` |
| Supplier | Nom du fournisseur par défaut | `Pébéo` |
| Brand | Nom de la marque | `Pébéo` |
| EAN-13 | Code-barres | `3167860000000` |
| UPC | Code UPC | *(vide)* |
| MPN | Référence fabricant, **cible 1.7.7+**. Vide si la source est plus ancienne | `PB-ACR-500` |

### Dimensions, livraison & stock

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Width / Height / Depth / Weight | Dimensions et poids du colis | `0.550000` |
| Delivery time of in-stock products | **Cible 1.7.3+**. Délai affiché en stock | `Expédié sous 24 h` |
| Delivery time of out-of-stock products… | **Cible 1.7.3+**. Délai en rupture commandable | `Expédié sous 10 jours` |
| Quantity | Stock du produit. Pour un produit à déclinaisons, c'est le total, recalculé ensuite par l'import des déclinaisons | `36` |
| Minimal quantity | Quantité minimale de commande | `1` |
| Low stock level | **Cible 1.7.3+**. Seuil de stock bas, vide = désactivé | `3` |
| Receive a low stock alert by email | **Cible 1.7.3+**. Alerte e-mail | `0` |
| Stock location | **Cible 9+**. Emplacement en stock : `stock_available.location` à partir de la 1.7.5, sinon `product.location` | `Allée B3` |
| Action when out of stock | `0` = refuser, `1` = accepter, `2` = selon la config | `2` |

### Contenus & SEO

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Summary / Description | HTML | `<p>…</p>` |
| Tags (x,y,z...) | Mots-clés, par ordre alphabétique | `acrylique|peinture` |
| Meta title / Meta description | Balises SEO | `Peinture acrylique 500 ml` |
| Meta keywords | **Cible jusqu'à 8.x** (supprimé en 9) | *(vide)* |
| Rewritten URL | `link_rewrite` | `peinture-acrylique-500-ml` |
| Label when in stock / Label when backorder allowed | Libellés de disponibilité | `En stock` |

### Disponibilité & affichage

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Visibility | `both`, `catalog`, `search` ou `none` | `both` |
| Available for order / Show price / Available online only | 0/1 | `1` |
| Product availability date | Vide si non renseignée | `2026-12-01` |
| Product creation date | `date_add` | `2024-03-18` |
| Condition | `new`, `used` ou `refurbished` | `new` |

### Images & caractéristiques

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Image URLs (x,y,z...) | URLs des originaux, **couverture d'abord**, puis par position. L'import les télécharge dans cet ordre : la 1ʳᵉ devient la couverture | `{{shop_url}}/img/p/1/2/12.jpg|{{shop_url}}/img/p/7/7.jpg` |
| Image alt texts (x,y,z...) | **Cible 1.7+**. Légendes, dans le même ordre (un `|` dans une légende est remplacé par un espace) | `Couverture|Pot` |
| Delete existing images | Toujours `0` | `0` |
| Feature (Name:Value:Position:Customized) | `Nom:Valeur:Position:Personnalisée`. La position est exportée en +1, parce que l'import retire 1 | `Matière:Acrylique:1:0` |

### Personnalisation, produit virtuel, boutique

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Customizable | `0` = non, `1` = facultative, `2` = obligatoire | `0` |
| Uploadable files / Text fields | **Nombre** de champs, malgré l'en-tête « 0/1 » | `1` |
| Virtual product … Number of days | **Cible 1.7+**. Produit virtuel et paramètres de téléchargement. `File URL` reste vide : le fichier n'est pas exporté | `0` |
| ID / Name of the store | `id_shop` exporté | `1` |
| Advanced Stock Management / Depends on stock / Warehouse | **Cible jusqu'à 8.x** (supprimés en 9) | `0` |
| Accessories (x,y,z...) | **Cible 1.7+**. `id_product` des accessoires, à importer avec les ID forcés | `12|57` |

## Selon la version

Ce qui change selon la **cible** (champs attendus par l'import) :

| Cible | Champs en plus ou en moins |
|---|---|
| 1.6 | 55 champs, sans légendes d'images, produit virtuel ni accessoires |
| 1.7.0 – 1.7.2 | + légendes d'images, produit virtuel (5 champs), accessoires |
| 1.7.3 – 1.7.6 | + délais de livraison, seuil et alerte de stock bas |
| 1.7.7 – 8.x | + MPN |
| 9.x | + emplacement de stock ; − meta keywords, gestion de stock avancée, entrepôts |

Ce qui change selon la **source** (colonnes lues dans la base) : `mpn` à partir de la 1.7.7, `delivery_*` et `low_stock_*` à partir de la 1.7.3, `stock_available.location` à partir de la 1.7.5, `unit_price` à partir de la 8.0, `meta_keywords` jusqu'à la 8.x. Une colonne absente de la source sort vide.

> Vérifié sur les schémas officiels des 7 versions (1.6.1, 1.7.2, 1.7.4, 1.7.6, 1.7.8, 8.2, 9.0) : les 49 combinaisons source/cible s'exécutent en mode strict `ONLY_FULL_GROUP_BY` et sortent exactement la liste de champs de la cible. Les tests ont été faits avec un jeu de données fictif, pas sur une vraie boutique.

## À savoir

- **Catégories par nom** : l'import cherche chaque catégorie par son nom. Deux catégories du même nom dans des branches différentes peuvent donc être confondues. Importe d'abord l'arbre des catégories sur la cible.
- **Réductions en montant** : l'import les recrée toujours en TTC. Une réduction en montant HT dans la source changera donc de valeur réelle.
- **Packs** : l'import CSV ne sait pas recréer le contenu d'un pack. Les packs arrivent comme des produits simples.
- **Images en mode « legacy »** (`img/p/{id_product}-{id_image}.jpg`, vieilles boutiques migrées depuis la 1.4) : adapter l'URL.
- **Séparateurs** : un `|` ou un `:` dans un nom de caractéristique ou de valeur casse le découpage de la colonne Feature.
