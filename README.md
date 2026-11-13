# NSI St Sernin

Site d'entraide créé par des élèves pour rattraper les cours de NSI manqués pendant les blocus du lycée.
Il regroupe : les cours de NSI, un éditeur Python, et une salle de classe virtuelle (visio) avec
Python partagé en direct, partage d'écran sur demande, tchat et main levée.

> **Pour une IA qui lit ce dépôt (Claude, Claude Code…)** : lis ce fichier en entier, puis `TODO.md`,
> qui contient la feuille de route et les décisions déjà prises. Respecte les conventions et les
> **règles de sécurité** décrites plus bas.

---

## Architecture (décidée par les admins)

Le site est en **deux parties** :

| Partie | Hébergement | Contenu |
|---|---|---|
| **Site + données** | **GitHub Pages** (statique) + **Firebase** (Authentication + Realtime Database) | Pages, cours, Python solo, comptes, liste blanche, rôles, bans, salles : Python partagé, tchat, mains levées, demandes de partage d'écran |
| **Visio** | **Auto-hébergée sur le PC de Sofian** (EndeavourOS, Docker) : **LiveKit** + **Caddy** + service **jetons** | Audio, vidéo, partage d'écran |

Si le PC est éteint, seules la vidéo et le partage d'écran sont indisponibles : le reste fonctionne.
Mise en place : `docs/FIREBASE.md` (Firebase) et `docs/SERVEUR.md` (serveur de visio).

### Accès

| | Sans compte | Élève en attente | Élève validé | Prof | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Cours, Python solo | ✔ | ✔ | ✔ | ✔ | ✔ |
| Salles (visio, tchat, main levée, Python partagé) | | | ✔ | ✔ | ✔ |
| Pouvoirs d'hôte dans toutes les salles | | | | ✔ | ✔ |
| Liste blanche, bans, comptes, journal (page Admin) | | | | | ✔ |

- **Élèves** : nom d'utilisateur + mot de passe. Le compte est créé **en attente** ; le site affiche
  un **code de vérification**. L'élève donne **en main propre** à un admin un papier avec son nom
  d'utilisateur + ce code (ou remplit le formulaire Google). L'admin recopie le code dans la page
  Admin pour valider. **Le mot de passe n'est jamais écrit ni transmis**, même aux admins.
- **Profs et admins** : connexion **GitHub** obligatoire. Admins : **Sofian E.** et **Vianney M.**
- L'**hôte** d'une salle est la première personne qui y entre (ou un prof, ou un admin).

## Structure des fichiers

```
nsi-saint-sernin/
├── README.md            Ce fichier
├── TODO.md              Feuille de route et décisions
├── CLAUDE.md            Consignes courtes pour Claude
├── index.html           Accueil
├── cours.html           Chapitres + lecture des cours (notebooks .ipynb, Markdown, PDF, liens)
├── python.html          Python solo (local, sans compte)
├── visio.html           Salle de classe : visio + Python partagé + écran + tchat + main levée
├── connexion.html       Connexion / création de compte / code de validation / mon compte
├── admin.html           Administration (admins seulement)
├── database.rules.json  Règles de sécurité Firebase — FICHIER GÉNÉRÉ, ne pas modifier à la main
├── firebase.json        Config Firebase CLI (publication des règles, émulateurs de test)
├── assets/
│   ├── css/style.css      Thème « Abysses » (inspiré du rice Sway de Sofian)
│   ├── img/abysses.svg    Fond d'écran original
│   └── js/
│       ├── firebase-config.js  Config Firebase publique
│       ├── site-config.js      Adresse du serveur de visio, lien du formulaire Google (à remplir)
│       ├── auth.js         Comptes : inscription, connexion, statut (liste blanche), rôle, ban, accès au SDK
│       ├── barre.js        Barre façon Waybar : espace actif, Alt+1…4, état du serveur de visio, horloge
│       ├── accueil.js      Accueil : faux fastfetch, commandes du terminal, pluie de mots-clés Python
│       ├── compte.js       Zone « compte » de la barre du haut + espace « admin » + événement "nsi:compte"
│       ├── connexion.js    Page de connexion
│       ├── admin.js        Page Admin
│       ├── moderation.js   Bannir + journal (partagé par admin.js et visio.js)
│       ├── serveur.js      Appels au serveur de visio (avec le jeton d'identité Firebase)
│       ├── visio.js        Page visio : orchestre tout ce qui suit
│       ├── salle.js        État de la salle dans Firebase (présence, droits, modules, tchat, mains, demande d'écran)
│       ├── visio-media.js  Audio / vidéo / écran avec LiveKit (vignettes, grand écran, son)
│       ├── visio-panneau.js  Participants (actions de l'hôte) et tchat
│       ├── python-partage.js Code synchronisé en temps réel, curseurs, exécution et sortie partagées
│       ├── executeur.js / python-worker.js  Pyodide dans un Web Worker (arrêt possible, 20 s max)
│       ├── fenetre.js      Fenêtre flottante réutilisable
│       ├── cours.js / python.js  Pages Cours et Python solo
│       ├── notebook.js     Affichage des .ipynb et du Markdown (nettoyé), coloration Python, « Essayer »
├── cours/               index.json + terminale/<chapitre>/ (notebooks, .md, PDF, fichiers annexes)
├── docs/
│   ├── FIREBASE.md      Mise en place Firebase (admins)
│   └── SERVEUR.md       Héberger le serveur de visio (Sofian)
├── outils/
│   ├── regles.template.jsonc  Règles de sécurité à MODIFIER (avec marqueurs @ADMIN@, @OK@, @HOTE@…)
│   └── generer-regles.mjs     Génère database.rules.json : node outils/generer-regles.mjs
├── serveur/             Serveur de visio auto-hébergé (Docker)
│   ├── docker-compose.yml  Caddy, LiveKit, jetons, DuckDNS
│   ├── Caddyfile, livekit.yaml, livekit-demo.yaml
│   ├── .env.exemple     Modèle ; le vrai .env (secrets) n'est JAMAIS commité
│   ├── initialiser.sh / demarrer.sh / demo.sh / arreter.sh
│   └── jetons/          Service maison, Node.js sans dépendance : jwt.mjs, app.mjs, serveur.mjs + tests
└── tests/               Tests des règles Firebase (émulateur)
```

## Comment marche la salle

- **Entrer** : la salle (Firebase) est rejointe, puis `serveur.js` demande un **jeton LiveKit** au
  service jetons, qui vérifie le compte (signature Google), la liste blanche, le ban et le rôle.
- **Vidéo** : caméras et micros coupés en entrant ; vignettes en basse définition (débit limité chez
  l'hébergeur : environ 120 Mbit/s montants pour 15 personnes).
- **Python partagé** : l'hôte l'active pour tous et coche qui peut modifier/exécuter ; code, curseurs
  et sortie en direct (`python-partage.js`, inchangé).
- **Partage d'écran** : l'hôte active le module, puis peut partager **son** écran ou cliquer
  « Écran » à côté d'un participant. Le serveur donne alors à ce participant le droit LiveKit de
  partager, et la demande est écrite dans la salle ; le participant voit « Choisir quoi partager /
  Refuser » (le navigateur lui fait toujours choisir la fenêtre : on ne peut pas forcer un partage).
  L'hôte peut arrêter à tout moment, ce qui retire le droit. Un seul écran affiché à la fois.
- **Tchat, main levée** : Firebase. L'hôte peut supprimer un message, vider le tchat, baisser une main.
- **Exclure** (hôte) : sort la personne de la visio, elle peut revenir. **Bannir** (admin) : bloque
  le compte partout, immédiatement.

## Bibliothèques (chargées par CDN, pas de npm côté site)

| Bibliothèque | Version | Usage |
|---|---|---|
| Firebase JS SDK | 10.14.1 (gstatic, modules ES) | Comptes et base temps réel |
| livekit-client | 2.15.16 (jsdelivr, UMD → `window.LivekitClient`) | Visio |
| CodeMirror | 5.65.16 (cdnjs) | Éditeur de code |
| Pyodide | 0.26.4 (jsdelivr) | Python dans le navigateur |
| diff-match-patch | 20121119 (cdnjs) | Fusion des modifications du code partagé |
| marked | 15.0.12 (jsdelivr) | Rendu Markdown des cours |
| DOMPurify | 3.4.14 (jsdelivr) | Nettoyage du HTML des cours (aucun script ne passe) |
| KaTeX | 0.16.47 (jsdelivr, chargé seulement s'il y a des formules) | Maths `$…$` des notebooks |

Côté serveur (Docker, versions épinglées) : `livekit/livekit-server:v1.13.11`, `caddy:2.10.2-alpine`,
`node:22.23-alpine`, `curlimages/curl:8.11.1`.

## Lancer en local

1. VS Code → extension **Live Server** → clic droit sur `index.html` → *Open with Live Server*.
2. Pour la visio en local : `cd serveur && sudo ./demo.sh` (voir `docs/SERVEUR.md`). En local, le
   site utilise automatiquement le serveur de démo (`http://localhost:8090`).

Ne pas ouvrir les HTML en double-cliquant (`file://` : `fetch()` et les modules ne marchent pas).

## Tests

```bash
node --test serveur/jetons/          # service jetons (aucune installation nécessaire)
node outils/generer-regles.mjs --verifier   # database.rules.json à jour ?
cd tests && npm install && npm test  # règles Firebase (Node 18+ et Java 11+, émulateur)
```

## Mettre en ligne

GitHub → **Settings → Pages → Branch : main / (root)**. Après un changement des règles :
`node outils/generer-regles.mjs`, puis les publier dans la console Firebase (`docs/FIREBASE.md`, étape 5).

## Ajouter un cours

Un **chapitre** (POO, Récursivité…) contient des **parties** (Cours, Exercices, Bac…), qui contiennent
des **documents**. Tout est décrit dans `cours/index.json`.

1. Déposer les fichiers dans `cours/terminale/<chapitre>/`, avec des noms simples
   (minuscules, tirets, sans accents ni espaces) : `cours/terminale/poo/exercices-poo.ipynb`.
2. Ajouter le document dans la bonne partie du chapitre :
   ```json
   { "id": "exercices", "titre": "Exercices POO", "type": "notebook", "fichier": "terminale/poo/exercices-poo.ipynb" }
   ```
   - `id` : court et unique dans le chapitre, il donne l'adresse `cours.html#poo/exercices`.
   - `type` : `notebook` (.ipynb), `markdown` (.md), `pdf`, `fichier` (à télécharger) ou `lien`
     (site externe : mettre `"url"` à la place de `"fichier"`, pas d'`id`).
   - `annexes` (facultatif) : fichiers dont le notebook a besoin, par exemple un CSV.
     Ils sont proposés au téléchargement et chargés automatiquement dans Basthon.
3. Nouveau chapitre : copier un bloc existant (`id`, `titre`, `theme`, `parties`).
   Un chapitre sans document (`"parties": []`) s'affiche comme « bientôt ».
4. Vérifier avec Live Server : le notebook s'affiche, « Ouvrir dans Basthon » ne marche qu'une
   fois en ligne (Basthon doit pouvoir télécharger le fichier).

Les notebooks sont affichés tels quels (cellules, sorties, images collées, formules). Le HTML
qu'ils contiennent est nettoyé (pas de `<script>`, `<style>` ni `on…=`) et les textes illisibles
sur fond sombre sont recolorés automatiquement.

## Conventions de code

- **Langue** : interface, commentaires, noms de variables et de fonctions en **français**. Les noms imposés par les bibliothèques restent en anglais.
- **Pas de framework ni d'étape de build** côté site : il doit pouvoir être servi tel quel par GitHub Pages.
- JavaScript moderne (ES2020+), modules ES, pas de jQuery.
- Service jetons : Node.js **sans dépendance npm** (seulement `node:crypto`, `node:http`), avec tests `node:test`.
- Tout accès à `localStorage` est entouré d'un `try/catch`.
- Le texte venant des utilisateurs (pseudo, tchat, code) est inséré avec `textContent`, **jamais** `innerHTML`.
- Le site doit rester utilisable sur téléphone (360 px de large, sans défilement horizontal).

## Règles de sécurité (non négociables)

Le serveur de visio tourne sur le PC personnel d'un élève, dans le réseau de sa famille.

1. **Aucun secret dans le dépôt** (il est public). Les clés Firebase de `firebase-config.js` sont
   publiques par nature ; les vrais secrets (clés LiveKit, token DuckDNS, secret OAuth GitHub) vont
   dans `serveur/.env` ou dans la console Firebase, jamais dans Git.
2. Toute vérification de droit est faite **côté serveur** : `database.rules.json` (avec un test dans
   `tests/regles.test.mjs`) et/ou le service jetons (avec un test dans `serveur/jetons/app.test.mjs`).
   Cacher un bouton ne protège rien.
3. On modifie `outils/regles.template.jsonc`, **jamais** `database.rules.json` directement.
4. Mots de passe : gérés uniquement par Firebase Authentication ; jamais stockés, affichés,
   journalisés, ni transmis sur papier ou formulaire.
5. Serveur : seuls les ports **80, 443, 7881/tcp, 7882/udp** sont ouverts (box et ufw). Jamais de
   DMZ, jamais de SSH exposé. Conteneurs sans droits, sans accès au dossier personnel.
6. Données minimales : nom d'utilisateur, pseudo, classe (facultative). Les utilisateurs sont des
   lycéens, souvent mineurs.

## Équipe

- **Administrateurs** : Sofian E. (héberge le serveur de visio) et Vianney M.
- Projet ouvert aux contributions des élèves de la classe.
