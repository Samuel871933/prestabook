## Utilisation

1. Importe d'abord les **produits** avec la fiche « Export des produits », en gardant les mêmes ID (*Force all ID numbers*). Les images sont recréées à cette étape.
2. Dans **Réglages**, choisis la version de la **base source** et celle de la **boutique cible**, en gardant les mêmes choix que pour les produits.
3. Copie la requête et lance-la avec `SET SESSION group_concat_max_len = 1000000;` dans la même exécution.
4. Exporte en CSV : séparateur `;`, UTF-8, avec la ligne d'en-têtes.
5. Sur la cible : **Paramètres avancés > Importer**, entité **Combinaisons**, *Multiple value separator* `|`, **1 ligne à ignorer**. Les colonnes sont déjà dans l'ordre des champs de l'import.

> Si les ID produits ne sont pas conservés sur la cible, active *Use product reference as key* : la 2ᵉ colonne, `Product Reference`, sert alors à retrouver le produit.

Une ligne = une déclinaison, triées par produit puis par `id_product_attribute`.

## Format des colonnes

### Rattachement & attributs

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Product ID | `id_product` du produit parent | `42` |
| Product Reference | Référence du produit parent. Sert de clé si les ID ne sont pas conservés | `TSH-COTON` |
| Attribute (Name:Type:Position) | Groupes au format `Nom:type:position`, type = `select`, `radio` ou `color` | `Taille:select:0|Couleur:color:1` |
| Value (Value:Position) | Valeurs `Valeur:position`, **dans le même ordre** que les groupes | `M:1|Bleu:3` |

Les deux colonnes sont triées par position du groupe, donc la 1ʳᵉ valeur va toujours avec le 1ᵉʳ groupe. Les groupes et les valeurs sont retrouvés par leur nom, ou créés s'ils n'existent pas.

### Références

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Supplier reference | Référence fournisseur de la déclinaison | `FRN-88231-M` |
| Reference | Référence de la déclinaison | `TSH-M-BL` |
| EAN-13 / UPC | Codes-barres | `3760000000000` |
| MPN | **Cible 1.7.7+**. Vide si la source est plus ancienne | `TSH-M-BL-01` |

### Prix, stock & disponibilité

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Cost price | Prix d'achat HT | `4.000000` |
| Impact on price | Écart avec le prix HT du produit, positif ou négatif | `2.500000` |
| Ecotax | Écotaxe | `0.000000` |
| Quantity | Stock de la déclinaison | `12` |
| Minimal quantity | Quantité minimale de commande | `1` |
| Low stock level / Receive a low stock alert by email | **Cible 1.7.3+** | `2` / `0` |
| Stock location | **Cible 9+**. `stock_available.location` à partir de la 1.7.5, sinon `product_attribute.location` | `Allée B3` |
| Impact on weight | Écart avec le poids du produit | `0.100000` |
| Default (0 = No, 1 = Yes) | Déclinaison par défaut | `1` |
| Combination availability date | Vide si non renseignée | `2026-12-01` |

### Images & boutique

| Colonne CSV | Contenu | Exemple |
|---|---|---|
| Choose among product images by position (1,2,3...) | **Toutes** les images de la déclinaison, par leur position **dans le produit réimporté** | `2|3` |
| Image URLs (x,y,z...) | **Toujours vide, exprès** | *(vide)* |
| Image alt texts (x,y,z...) | **Cible 1.7+**, vide | *(vide)* |
| Delete existing images | **Cible 1.6 uniquement**, `0` | `0` |
| ID / Name of the store | `id_shop` | `1` |
| Advanced Stock Management / Depends on stock / Warehouse | **Cible jusqu'à 8.x** | `0` |

> **Images : pourquoi par position et pas par URL ?** Dans le code de l'import, une URL dans `Image URLs` **télécharge une nouvelle image** dans le produit, et passe avant la colonne position. Les images ayant déjà été recréées par l'import produits, les URLs les mettraient en double. La requête calcule donc le **rang** de chaque image dans l'ordre de l'export produits (couverture d'abord, puis position) : c'est exactement la position qu'elle a sur la boutique cible après l'import.

## Selon la version

| Cible | Champs en plus ou en moins |
|---|---|
| 1.6 | 23 champs, avec « Delete existing images » |
| 1.7.0 – 1.7.2 | + légendes d'images ; − delete existing images |
| 1.7.3 – 1.7.6 | + seuil et alerte de stock bas |
| 1.7.7 – 8.x | + MPN |
| 9.x | + emplacement de stock ; − gestion de stock avancée, entrepôts |

> Vérifié sur les schémas officiels des 7 versions : les 49 combinaisons source/cible s'exécutent en mode strict et sortent exactement les champs de la cible. Sur le jeu de test, les positions d'images obtenues correspondent bien à l'ordre des URLs de l'export produits.

## À savoir

- **Couleurs** : l'import crée les groupes de type `color` sans la couleur hexadécimale des valeurs. Il faut la ressaisir, ou créer les attributs sur la cible avant l'import.
- **Séparateurs** : un `:` ou un `|` dans un nom d'attribut ou de valeur casse le découpage.
- Une déclinaison sans image laisse la colonne position vide : elle n'aura pas d'image associée.
