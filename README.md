# NSI en ligne

Site d'entraide créé par des élèves pour rattraper les cours de NSI manqués pendant les blocus du lycée.
Il regroupe : les cours de NSI, une salle de classe virtuelle (visio) avec un éditeur Python partagé et du partage d'écran, un tchat et la main levée.

> **Pour une IA qui lit ce dépôt (Claude, Claude Code…)** : lis ce fichier en entier, puis `TODO.md`, qui contient la feuille de route et les décisions déjà prises. Respecte les conventions décrites plus bas.

---

## État actuel (v0, prototype statique)

- Site **100 % statique** (HTML, CSS, JavaScript sans framework ni build), hébergé sur **GitHub Pages**.
- Aucun backend pour l'instant : pas de comptes, pas de base de données.
- La visio est un simple salon **Jitsi Meet** (serveur public `meet.jit.si`) intégré dans `visio.html`.
- L'éditeur Python est **séparé** de la visio (`python.html`) et purement local (pas de partage).
- L'interface est volontairement basique : elle sera refaite (voir `TODO.md`, section UI).

## Structure des fichiers

```
nsi-classe/
├── README.md            Ce fichier : présentation et conventions
├── TODO.md              Feuille de route et spécifications détaillées
├── index.html           Accueil (3 cartes : Cours, Python, Visio)
├── cours.html           Liste + lecture des cours en Markdown
├── python.html          Éditeur CodeMirror + exécution Python (Pyodide)
├── visio.html           Salon Jitsi intégré
├── .nojekyll            Empêche GitHub Pages de passer le site dans Jekyll
├── assets/
│   ├── css/style.css    Style commun (thème clair/sombre automatique)
│   └── js/
│       ├── cours.js     Charge cours/index.json, recherche, affiche le Markdown (marked)
│       ├── python.js    Pyodide : stdout/stderr vers la console, input() via prompt, ouvrir/télécharger .py, sauvegarde localStorage
│       └── visio.js     Crée le salon Jitsi (préfixe "nsi-en-ligne-"), bouton "ouvrir dans un onglet"
└── cours/
    ├── index.json       Catalogue : niveaux → chapitres {titre, theme, fichier}
    ├── premiere/*.md    Cours de Première
    └── terminale/*.md   Cours de Terminale
```

## Bibliothèques utilisées (chargées par CDN, pas de npm)

| Bibliothèque | Version | Usage |
|---|---|---|
| CodeMirror | 5.65.16 (cdnjs) | Éditeur de code Python |
| Pyodide | 0.26.4 (jsdelivr) | Python en WebAssembly dans le navigateur |
| marked | dernière (jsdelivr) | Rendu Markdown des cours |
| Jitsi Meet External API | `meet.jit.si/external_api.js` | Visio, partage d'écran, tchat |

## Lancer le site en local

1. Ouvrir le dossier dans VS Code.
2. Installer l'extension **Live Server**.
3. Clic droit sur `index.html` → **Open with Live Server**.

Ne pas ouvrir les HTML en double-cliquant : `fetch()` ne fonctionne pas en `file://`, la page Cours resterait vide.

## Mettre en ligne

GitHub → **Settings → Pages → Branch : main / (root)**. Le site est servi à `https://<pseudo>.github.io/<repo>/`.

## Ajouter un cours

1. Écrire le cours en Markdown dans `cours/premiere/` ou `cours/terminale/` (nom : `NN-titre-en-minuscules.md`).
2. Ajouter l'entrée dans `cours/index.json` :
   ```json
   { "titre": "Mon chapitre", "theme": "Données", "fichier": "premiere/03-mon-chapitre.md" }
   ```

## Conventions de code

- **Langue** : interface, commentaires, noms de variables et de fonctions en **français** (`ouvrirCours`, `chargerPython`…). Les noms imposés par les bibliothèques restent en anglais.
- **Pas de framework ni d'étape de build** tant que ce n'est pas décidé dans `TODO.md` : le site doit pouvoir être servi tel quel par GitHub Pages.
- JavaScript moderne (ES2020+), pas de jQuery. Un fichier JS par page dans `assets/js/`.
- Tout accès à `localStorage` est entouré d'un `try/catch` (peut être bloqué).
- Le texte venant des utilisateurs (pseudo, tchat, code) est toujours inséré avec `textContent`, **jamais** `innerHTML`.
- Aucune clé secrète dans le dépôt : il est public. Les clés de configuration Firebase (publiques par nature) sont acceptées, la sécurité repose sur les règles côté serveur.
- Le site doit rester utilisable sur téléphone (largeur 360 px minimum).

## Public et vie privée

Les utilisateurs sont des **lycéens, souvent mineurs**. Conséquences :
- collecter le minimum de données (prénom ou pseudo, rien d'autre pour les élèves) ;
- les salons ne doivent pas être accessibles à n'importe qui sur Internet ;
- les administrateurs doivent pouvoir exclure rapidement une personne malveillante.

## Équipe

- **Administrateurs** : Sofian E. et Vianney M.
- Projet ouvert aux contributions des élèves de la classe.
