# NSI St Sernin

Site d'entraide créé par des élèves pour rattraper les cours de NSI manqués pendant les blocus du lycée.
Il regroupe : les cours de NSI, une salle de classe virtuelle (visio) avec un éditeur Python partagé et du partage d'écran, un tchat et la main levée.

> **Pour une IA qui lit ce dépôt (Claude, Claude Code…)** : lis ce fichier en entier, puis `TODO.md`, qui contient la feuille de route et les décisions déjà prises. Respecte les conventions décrites plus bas.

---

## État actuel (v0.2, prototype statique + comptes + Python partagé)

- Site **100 % statique** (HTML, CSS, JavaScript sans framework ni build), hébergé sur **GitHub Pages**.
- Comptes, rôles et salles via **Firebase** (Authentication + **Realtime Database**), appelé directement
  depuis le navigateur : élèves en connexion anonyme avec un pseudo, profs et admins via GitHub.
  Mise en place : `docs/FIREBASE.md`. Si `assets/js/firebase-config.js` est incomplet, le site fonctionne sans comptes.
- La sécurité (qui est admin, qui est banni, qui peut modifier le code…) est appliquée par
  `database.rules.json`, côté serveur.
- La visio est un salon **Jitsi Meet** (serveur public `meet.jit.si`) intégré dans `visio.html`, réservé aux personnes connectées.
- Dans la visio, un **Python partagé en temps réel** s'ouvre dans une **fenêtre flottante** déplaçable :
  l'hôte l'active pour tous, choisit qui peut modifier/exécuter, et tout le monde voit le code,
  les curseurs et la sortie en direct.
- `python.html` reste un éditeur Python **solo** (local, sans partage).
- L'interface est volontairement basique : elle sera refaite (voir `TODO.md`, phase 2).

## Structure des fichiers

```
nsi-saint-sernin/
├── README.md            Ce fichier : présentation et conventions
├── TODO.md              Feuille de route et spécifications détaillées
├── index.html           Accueil (3 cartes : Cours, Python, Visio)
├── cours.html           Liste + lecture des cours en Markdown
├── python.html          Python solo : éditeur CodeMirror + exécution Pyodide (local)
├── visio.html           Salle : visio Jitsi + fenêtre flottante « Python partagé »
├── connexion.html       Connexion (élève anonyme / prof-admin GitHub), mon compte
├── database.rules.json  Règles de sécurité de la Realtime Database (la vraie sécurité du site)
├── firebase.json        Config Firebase CLI (publication des règles, émulateurs de test)
├── .nojekyll            Empêche GitHub Pages de passer le site dans Jekyll
├── assets/
│   ├── css/style.css    Style commun (thème clair/sombre automatique)
│   └── js/
│       ├── firebase-config.js  Config Firebase publique (incomplète = pas de comptes)
│       ├── auth.js      Module partagé : connexion, déconnexion, pseudo, rôle (admin/prof/eleve), ban, accès au SDK
│       ├── compte.js    Zone « compte » de la barre du haut + événement "nsi:compte"
│       ├── connexion.js Page de connexion
│       ├── cours.js     Charge cours/index.json, recherche, affiche le Markdown (marked)
│       ├── python.js    Python solo : Pyodide, input() via prompt, ouvrir/télécharger .py, sauvegarde localStorage
│       ├── visio.js     Page visio : compte requis, salon Jitsi (préfixe "nsi-st-sernin-"), barre de la salle
│       ├── salle.js     Salle (salons/{nom}) : hôte, présence, droits de modification, modules activés
│       ├── python-partage.js  Code synchronisé en temps réel, curseurs des autres, exécution et sortie partagées
│       ├── executeur.js Pilote le worker Python : exécuter, arrêter, délai maximum (20 s)
│       ├── python-worker.js   Pyodide dans un Web Worker ; input() lit le champ « Entrées »
│       └── fenetre.js   Fenêtre flottante réutilisable : déplacer, redimensionner, réduire, fermer
├── cours/
│   ├── index.json       Catalogue : niveaux → chapitres {titre, theme, fichier}
│   ├── premiere/*.md    Cours de Première
│   └── terminale/*.md   Cours de Terminale
├── docs/FIREBASE.md     Guide de mise en place Firebase (pour les admins)
└── tests/               Tests des règles de sécurité (outil de dev, npm, pas utilisé par le site)
```

## Comptes et rôles

| Rôle | Connexion | Comment on l'obtient |
|---|---|---|
| Élève | Anonyme + pseudo (Google prévu) | Par défaut |
| Prof | GitHub | Un admin ajoute son UID dans `profs/` |
| Admin | GitHub | UID ajouté à la main dans `admins/` (console Firebase uniquement) |

Dans une page, pour connaître la personne connectée :

```js
import { ecouterCompte } from "./auth.js";
ecouterCompte((compte) => {
  // compte = null, ou { uid, pseudo, role: "admin" | "prof" | "eleve", banni, motifBan, anonyme, fournisseur }
});
```

Les scripts classiques (non-modules) peuvent écouter l'événement `nsi:compte` envoyé par `compte.js` (`ev.detail` = compte).
**Le rôle côté navigateur sert uniquement à l'affichage** : toute action protégée doit être vérifiée dans `database.rules.json`, avec un test dans `tests/regles.test.mjs`.

## Python partagé : comment ça marche

- **Code** (`salons/{nom}/python/code` = `{ texte, v, par, pseudo }`) : à chaque frappe (regroupées par 40 ms),
  le navigateur envoie le texte dans une **transaction**. Si quelqu'un a modifié le code entre-temps, on
  applique nos changements (calculés avec *diff-match-patch*) sur sa version au lieu de l'écraser :
  plusieurs personnes peuvent taper en même temps. `v` augmente de 1 à chaque écriture (vérifié par les règles).
- **Curseurs** (`python/curseurs/{uid}`) : position des personnes qui peuvent modifier, affichée en couleur avec leur pseudo.
- **Exécution** : seule la personne qui clique exécute (Pyodide dans un **Web Worker**, arrêt possible,
  20 s maximum) et publie la sortie dans `python/sortie` au fil de l'eau ; tout le monde voit la même chose.
  `input()` lit les lignes du champ « Entrées ».
- **Droits** : l'hôte (premier arrivé dans la salle), les admins et les profs peuvent modifier ; l'hôte
  coche dans « Droits » qui d'autre peut modifier et exécuter (`editeurs/{uid}`).

## Bibliothèques utilisées (chargées par CDN, pas de npm)

| Bibliothèque | Version | Usage |
|---|---|---|
| CodeMirror | 5.65.16 (cdnjs) | Éditeur de code Python |
| Pyodide | 0.26.4 (jsdelivr) | Python en WebAssembly dans le navigateur |
| marked | dernière (jsdelivr) | Rendu Markdown des cours |
| Firebase JS SDK | 10.14.1 (gstatic, modules ES) | Comptes (Auth) et base de données temps réel (Realtime Database) |
| diff-match-patch | 20121119 (cdnjs) | Fusion des modifications simultanées du code partagé |
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

## Tester les règles de sécurité

Il faut Node.js 18+ et Java 11+ (pour l'émulateur Firebase) :

```bash
cd tests && npm install && npm test
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
