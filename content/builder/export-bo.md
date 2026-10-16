## Utilisation dans le BO

1. Dans **Réglages**, choisis la **version de la base**. Puis, dans le générateur : **1.** ce que tu exportes (Clients, Commandes, Produits ou Déclinaisons), **2.** les colonnes (le bouton **Essentiel** propose une sélection courante), **3.** les lignes à garder (laisser vide = tout).
2. Renseigne le préfixe des tables, l'`id_shop` et les **langues** au format `id:code`, séparées par des virgules (ex. `1:fr,2:en`). Chaque champ « langue » sort alors en une colonne par langue : `name [fr]`, `name [en]`…
3. Clique **Copier la requête** (le bouton reste en bas de l'écran), puis dans le BO : **Paramètres avancés > Base de données > Gestionnaire SQL > Ajouter une requête SQL**. Colle la requête, donne-lui un nom et enregistre.
4. Dans la liste des requêtes, le bouton **Exporter** télécharge le résultat en CSV (séparateur `;`). L'encodage se règle dans le même écran.

> Le préfixe des tables doit être celui de la boutique (visible dans la liste des tables du Gestionnaire SQL) : le BO refuse une table qui n'existe pas.

## Ce que le Gestionnaire SQL impose

Le BO passe chaque requête dans le validateur `RequestSql` avant de l'enregistrer. La requête générée en tient compte :

| Règle du validateur | Conséquence dans la requête générée |
|---|---|
| Mots interdits : `SET`, `REPLACE`, `DISTINCT`, `USING`, `WITH`, `INTO`, `DROP`… | Pas de `SET SESSION`, pas de CTE ni de `REPLACE()`. `DISTINCT` n'apparaît qu'à l'intérieur de `GROUP_CONCAT`/`COUNT`, ce qui est accepté |
| Chaque table et chaque colonne des `JOIN … ON` doit exister | Les colonnes proposées viennent des schémas officiels de la version choisie. Les autres sont grisées |
| Les tables dérivées (`JOIN (SELECT …)`) font planter la validation | Les listes passent par des jointures simples + `GROUP BY` |
| Une sous-requête dans le `SELECT` déclenche un avertissement PHP | Acceptée en mode normal, mais **refusée si le mode debug est actif** (dès que les avertissements PHP deviennent des erreurs). D'où le choix « Jointures » par défaut |
| `passwd` et `secure_key` sont masqués par des étoiles | Exclus de la liste, avec `reset_password_token` et `reset_password_validity` |

## Commandes

- Une ligne par commande. Les deux adresses sont jointes séparément : les colonnes sont préfixées « Livraison : » / « Facturation : » (`delivery_` / `invoice_` en noms techniques), et les colonnes du client par « Client : ».
- Champs liés : état actuel (dans la 1ʳᵉ langue), devise, transporteur, langue, boutique, totaux convertis dans la devise par défaut (`total / conversion_rate`).
- Listes : produits commandés (`2 x Nom [réf]`), références, EAN, paiements et ID de transaction (liés par la référence de commande), bons de réduction, n° de suivi, date du dernier changement d'état.
- Filtres : boutique, commandes validées, **période** (du / au, sur `date_add`) et **état actuel** (`id_order_state`). Saisir une valeur active le filtre.
- « Quantité totale d'articles » n'est disponible qu'en sous-requêtes. En jointures, une somme serait multipliée par les autres listes.
- `secure_key` est exclu. Les colonnes qui changent selon la version sont grisées, comme les autres : par exemple `shipping_number` (jusqu'à 1.7.8) ou `note` (8+).

## Méthodes pour les listes

À choisir dans **Options avancées**.

- **Jointures** (par défaut) : toujours acceptée. Les listes (catégories, tags, images…) sont rassemblées avec `GROUP_CONCAT(DISTINCT …)` et les colonnes simples passent dans `MAX()`, pour rester valides avec `ONLY_FULL_GROUP_BY`. Chaque liste jointe multiplie les lignes intermédiaires : au-delà de 2 ou 3 listes sur un gros catalogue, la requête peut devenir lente.
- **Sous-requêtes** : une sous-requête par liste, plus rapide sur les gros volumes. Seule cette méthode permet le « Total dépensé » d'un client sans double comptage. Elle est refusée si le mode debug de PrestaShop est activé.

Les deux méthodes renvoient exactement les mêmes valeurs (vérifié sur les quatre entités).

## Bon à savoir

- **Listes coupées à 1024 caractères** : `SET` étant interdit dans le BO, `GROUP_CONCAT` garde la limite du serveur (`group_concat_max_len`, 1024 sur MySQL par défaut, 1 Mo sur MariaDB 10.2+). Sur MySQL, une longue liste d'URLs d'images peut donc être tronquée : préfère « Images : ID » ou la seule image de couverture.
- **Une ligne par adresse** : cocher un champ du groupe « Adresse (1 ligne par adresse) » duplique le client sur chacune de ses adresses non supprimées. Pour garder une ligne par client, utilise plutôt le groupe « Adresses (regroupées) ».
- **Stock** : lu dans `stock_available` pour la boutique `id_shop`. Avec un stock partagé entre boutiques d'un même groupe, il est rangé sous `id_shop = 0` : la colonne sort alors vide.
- **Valeurs par boutique** : prix, actif, visibilité… viennent de `product_shop` / `product_attribute_shop` pour la boutique `id_shop`. Les valeurs « globales » de `product` / `product_attribute` restent disponibles dans leurs propres groupes.

## Vérifications

Les requêtes générées ont été passées dans le **code réel du validateur** : `RequestSql.php` et le parseur SQL de chaque version (1.6.1, 1.7.8, 8.2, 9.0), sur les schémas officiels des 7 tranches de versions.

- 140 requêtes (7 versions × 4 entités × 5 cas, dont « tous les champs ») sont acceptées en mode normal.
- Elles s'exécutent aussi en `ONLY_FULL_GROUP_BY` strict.
- Le mode sous-requêtes est bien refusé quand les avertissements PHP deviennent des erreurs, comme en mode debug.

Les tests ont tourné sur MariaDB avec un jeu de données fictif, pas dans un vrai BO. MySQL 8 n'a pas été testé.
