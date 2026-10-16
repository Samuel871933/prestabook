Crée un thème enfant à ton nom : `config/theme.yml` pré-rempli (parent, nom, chargement du CSS et du JS) et dossier `_dev` pour écrire le CSS en SCSS (`package.json` Dart Sass, fichiers découpés par composant et par page, composants vides ou pré-remplis). Pas de templates : tout vient du parent tant que tu ne surcharges rien.

```kit
dev
```

## 1. Installer

Dézippe dans `themes/` : tu obtiens `themes/{{theme}}/` avec `config/theme.yml` et `_dev/`. Puis, avec Node.js 18 ou plus :

```bash
cd themes/{{theme}}/_dev
npm install
npm run watch:sass
```

Dans le BO :

1. **Apparence > Thème et logo** : active `{{theme}}`.
2. **Paramètres avancés > Performances** : vide le cache.

## 2. Ce qu'il faut savoir

- `config/theme.yml` déclare le parent (`parent: {{theme_parent}}`) et charge `_dev/css/theme.css` et `_dev/js/theme.js` sur toutes les pages (bloc `assets`).
- `name:` doit rester identique au nom du dossier.
- **Modifier un template** : copie le `.tpl` de `themes/{{theme_parent}}/templates/` au même chemin dans `themes/{{theme}}/templates/`.
- **Vignette dans le BO** (facultatif) : une image `preview.png` à la racine du thème.
- Après une modification de `config/theme.yml`, réactive le thème.

**Thème qui existe déjà** : décoche `config/theme.yml` au téléchargement, dézippe dans `themes/`, puis ajoute ces lignes sous `assets:` dans son `config/theme.yml` et réactive-le :

```yaml
  css:
    all:
      - id: theme-dev
        path: _dev/css/theme.css
        media: all
        priority: 200
  js:
    all:
      - id: theme-dev-js
        path: _dev/js/theme.js
        priority: 200
        position: bottom
```

## Où écrire

| Fichier du _dev | Contenu |
|---|---|
| `css/partials/_variables.scss` | Couleurs, polices, arrondis : utilisés par tous les fichiers |
| `css/components/` | Les composants choisis au téléchargement (sélecteurs Hummingbird et Classic) |
| `css/pages/` | Un fichier par page, ciblée par l'id du `<body>` (`#index`, `#product`…) |
| `css/theme.scss` | La liste des fichiers compilés |
| `js/theme.js` | JS du thème, jQuery disponible |

- **Ajouter un fichier** : crée-le (par exemple `pages/_blog.scss`) avec la ligne `@use` du haut des autres fichiers, puis ajoute `@use "pages/blog";` dans `theme.scss`.
- **Retirer un composant** : commente sa ligne dans `theme.scss`.

| Commande | Effet |
|---|---|
| `npm run watch:sass` | Recompile à chaque enregistrement (Ctrl+C pour arrêter) |
| `npm run sass:compile` | Compile une fois |
| `npm run sass:prod` | Compile pour la mise en ligne, sans fichier `.map` |

Après une compilation, vide le cache de PrestaShop. Mise en ligne : envoie le thème **sans** `_dev/node_modules`.
