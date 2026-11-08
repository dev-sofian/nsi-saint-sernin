# TODO — Feuille de route NSI St Sernin

Légende : `[ ]` à faire · `[~]` en cours · `[x]` fait · **⚠ décision** = à valider par les admins avant de coder.

Ordre conseillé : **Phase 1 → 2 → 3 → 4 → 5**. Chaque phase doit laisser le site fonctionnel.

---

## Phase 0 — Fait (prototype)

- [x] Pages Accueil, Cours, Python, Visio
- [x] Cours en Markdown + catalogue JSON + recherche
- [x] Éditeur Python local (CodeMirror + Pyodide), ouvrir/télécharger `.py`
- [x] Salon Jitsi intégré + lien de secours dans un onglet

---

## Phase 1 — Backend et comptes

Le site est statique (GitHub Pages) : impossible de sécuriser des comptes ou des bannissements en JavaScript seul, car tout le code client est public et modifiable. Il faut un service qui applique les règles **côté serveur**.

- [x] **Décision (admins)** : backend = **Firebase**.
- [x] **Base de données = Realtime Database** (et non Firestore) depuis le Python partagé : Firestore facture une lecture par personne et par modification, ce qui dépasse le quota gratuit dès qu'une classe regarde quelqu'un taper ; la Realtime Database ne compte pas les opérations, est plus rapide et gère la présence (déconnexions). Détails : `docs/FIREBASE.md`.
- [x] Code prêt : `assets/js/firebase-config.js` (config incomplète = site sans comptes), `assets/js/auth.js` (comptes et rôles), `database.rules.json` (sécurité), tests des règles dans `tests/`.
- [x] **Admins** : créer le projet Firebase et remplir `assets/js/firebase-config.js`.
- [ ] **Admins** : activer Anonyme + GitHub, domaines autorisés, **créer la Realtime Database (europe-west1) et publier `database.rules.json`** → `docs/FIREBASE.md`, étapes 3 à 5.

### Administrateurs

- [x] Deux administrateurs : **Sofian E.** et **Vianney M.**
- [x] Connexion **obligatoire via GitHub** (décision admins). Les règles refusent les droits d'admin à une session qui n'est pas connectée avec GitHub.
- [x] Les admins sont identifiés par leur **UID Firebase**, jamais par leur nom affiché (un nom se falsifie).
  - UID stockés dans `admins/{uid}`, modifiable uniquement depuis la console Firebase (aucune règle d'écriture).
  - La page Connexion affiche l'UID (« Identifiant technique ») pour faciliter l'ajout.
- [ ] **Admins** : se déclarer dans `admins/` de la Realtime Database (`docs/FIREBASE.md`, étape 6).
- [~] Pouvoirs des admins :
  - [ ] **Kick** : exclure quelqu'un d'un salon en cours (il peut revenir) → avec les salons, phase 3.
  - [~] **Ban** : `bans/{uid}` (pseudo, motif, auteurUid, date). Règles faites et testées (un admin ne peut ni se bannir ni bannir un autre admin ; un banni ne peut plus lire ni écrire dans les salles). Pour l'instant, bannir = créer l'entrée dans la console ; interface en phase 4.
  - [ ] Voir la liste des bannis et lever un ban → phase 4.
  - [ ] Créer, fermer et verrouiller des salons → phase 3.
  - [ ] Ajouter, modifier ou supprimer des cours (optionnel, sinon via GitHub).
- [x] Les règles refusent toute action d'admin venant d'un non-admin (testé dans `tests/regles.test.mjs`).
- [x] Journal de modération `journal/{id}` : écrit par les admins, jamais modifiable ni effaçable (règles prêtes, utilisé en phase 4).

### Profs

- [x] Connexion **via GitHub** (décision admins), rôle stocké dans `profs/{uid}` (nom, ajoutePar, date).
- [x] Seul un admin peut ajouter ou retirer un prof (règles).
- [x] Un prof a les **pouvoirs d'hôte dans toutes les salles** (activer le Python, donner les droits, modifier, arrêter une exécution).
- [ ] Ajout d'un prof depuis le site (aujourd'hui : console, `docs/FIREBASE.md` étape 7) → phase 4.

### Élèves (participants)

- [x] **Décision (admins)** : connexion **anonyme + pseudo** d'abord, **compte Google** ensuite (au choix de l'élève).
- [x] Connexion anonyme : pseudo de 2 à 20 caractères, vérifié aussi par les règles. Profil `utilisateurs/{uid}` = pseudo, fournisseur, date de création, rien d'autre.
- [x] Page `connexion.html` (élève / prof-admin, changement de pseudo, déconnexion) + zone de compte dans la barre du haut de chaque page.
- [x] Collecter seulement un prénom/pseudo pour les élèves (public mineur, voir README).
- [ ] Connexion **Google** pour les élèves : activer Google dans Firebase, ajouter `seConnecterGoogle()` dans `auth.js` (même principe que GitHub) et un bouton dans `connexion.html`.
- [ ] Limite connue : un banni anonyme peut revenir en vidant son navigateur. À compenser en phase 3 par le code de salon + salle d'attente validée par l'hôte.

---

## Phase 2 — Nouvelle interface « bureau Linux »

Objectif : une UI qui ne ressemble **pas** à un site généré par IA (pas de cartes arrondies génériques, dégradés violets standards, emojis partout). Inspiration : bureaux Linux personnalisés (« rice »), d'après deux captures fournies par l'utilisateur :

- **Capture 1 – GNOME, thème Nordic + icônes Papirus** : fond de paysage montagneux en couches violet → rose → bleu nuit ; barre supérieure fine (bouton d'activités à gauche, date et heure au centre, icônes système à droite) ; dock centré en bas ; icônes de bureau à gauche (Ordinateur, Dossier personnel, Corbeille) ; fenêtres sombres légèrement translucides, titre centré, trois boutons ronds en contour ; terminal avec invite `~ ❯❯❯` colorée, sortie `neofetch` et une bulle `cowsay` ; gestionnaire de fichiers avec barre latérale et grandes icônes de dossiers bleues.
- **Capture 2 – KDE Plasma, thème Manjaro rouge/noir** : fond de ville futuriste rouge et noir ; énorme horloge `HH:MM:SS` en police monospace en haut à gauche, date en rouge en dessous ; barre des tâches en bas avec icônes et horloge à droite ; fenêtres noires à barre fine, éléments actifs en rouge vif ; gestionnaire de fichiers type Dolphin (panneau « Places » à gauche, élément sélectionné rouge) ; logithèque avec catégories et boutons Install/Remove rouges ; terminal `neofetch` avec palette de couleurs.

### Concept

- [ ] Le site est un **bureau** : chaque fonctionnalité s'ouvre dans une **fenêtre** déplaçable (sur ordinateur) :
  - **Cours** = gestionnaire de fichiers (dossiers Première / Terminale, fichiers `.md`, barre latérale « Emplacements »).
  - **Visio** = application principale, plein écran par défaut.
  - **Accueil** = fenêtre « terminal » avec un faux `neofetch` du site (nombre de cours, salons ouverts, utilisateurs en ligne) et une phrase du jour façon `fortune | cowsay` (textes originaux, liés à la NSI).
- [ ] **Barre du haut** : nom du site à gauche, date et heure au centre, état de connexion / avatar à droite.
- [ ] **Dock** en bas : Cours, Visio, Python solo, Admin (visible seulement pour les admins), Paramètres.
- [ ] **Deux thèmes** au choix, mémorisés : « Nordic » (violet/rose/bleu nuit, capture 1) et « Rouge » (noir/rouge, capture 2). Variables CSS sur `:root[data-theme=...]`.
- [ ] Fond d'écran : **illustration originale** (paysage SVG de montagnes en couches, généré en CSS/SVG). Ne pas reprendre les fonds d'écran des captures ni les logos Arch/Manjaro (droits d'auteur et marques).
- [ ] Typographies : une monospace pour les éléments « terminal » et l'horloge (ex. JetBrains Mono ou Fira Code via Google Fonts), une sans-serif lisible pour le texte.
- [ ] Icônes : style plat type Papirus, en SVG dans `assets/icons/` (dessinées soi-même ou sous licence libre compatible, mentionner la licence).
- [ ] Sur téléphone : pas de fenêtres flottantes, chaque application passe en plein écran avec le dock en bas.
- [ ] Accessibilité : contrastes suffisants, navigation clavier, `prefers-reduced-motion` respecté.

---

## Phase 3 — Salle de classe (visio) avec modules intégrés

Le Python et le partage d'écran sont **dans** la visio, pas dans des pages séparées. L'**hôte** (admin ou personne qui a créé le salon) active ou désactive chaque module.

### Architecture

- [ ] **⚠ décision** : partie audio/vidéo.
  - Garder **Jitsi** pour la vidéo et l'audio, et gérer tout le reste (participants, droits, Python, demandes de partage, tchat, main levée) dans Firebase. Limite : sur `meet.jit.si`, l'intégration peut être limitée en durée et on ne contrôle pas finement l'interface.
  - Ou passer à **LiveKit** (offre cloud gratuite limitée, SDK JavaScript) pour contrôler entièrement l'interface, les droits et le partage d'écran. Plus de travail, mais nécessaire pour un vrai « demander à un participant de partager ».
  - Recommandation : prototype avec Jitsi + Firebase, puis LiveKit si les limites gênent.
- [x] Prototype : **Jitsi** (`meet.jit.si`) pour l'audio/vidéo, tout le reste dans la Realtime Database.
- [~] Modèle de données (Realtime Database, voir l'en-tête de `database.rules.json`) :
  ```
  salons/{nom}                (nom = nom de la salle nettoyé, ex : nsi-terminale-b)
    hote                      uid du premier arrivé                       [x]
    modules/python            bool                                        [x]
    editeurs/{uid}            true = peut modifier/exécuter le Python     [x]
    participants/{uid}        { pseudo, depuis } + suppression auto       [x]
    python/code               { texte, v, par, pseudo }                   [x]
    python/sortie             { texte, erreur, etat, par, pseudo, date }  [x]
    python/curseurs/{uid}     { l, c, pseudo }                            [x]
    messages/{id}             auteurUid, pseudo, texte, date              [ ]
    mainsLevees/{uid}         date                                        [ ]
    demandesPartage/{id}      cibleUid, statut                            [ ]
    verrouille, code d'accès                                              [ ]
  ```
- [ ] Les salles ne sont jamais effacées : prévoir un nettoyage (par un admin) des salles inactives.
- [ ] Mise en page de la salle : vidéos des participants + zone centrale qui affiche le module actif (Python, partage d'écran, ou rien) + panneau latéral (participants, tchat).

### Module Python (exercices en direct)

- [x] **Dans la page visio**, dans une **fenêtre flottante** déplaçable (barre de titre), redimensionnable (coin), réductible ; position mémorisée. Sur téléphone : panneau fixe en bas de l'écran. Composant réutilisable `assets/js/fenetre.js` (servira au bureau de la phase 2).
- [x] L'hôte active le module : la fenêtre s'ouvre pour **tout le monde** ; s'il le désactive, elle se ferme chez les participants.
- [x] Par défaut, seul l'hôte (et les admins/profs) modifie le code. Bouton « Droits » : l'hôte coche qui peut modifier et exécuter, et peut retirer ce droit à tout moment.
- [x] Édition **en temps réel**, plusieurs éditeurs simultanés possibles (décision admins : « vraiment en temps réel ») : synchronisation différentielle par transactions + fusion *diff-match-patch*, numéro de version vérifié par les règles. Environ 60 ms entre une frappe et son affichage chez les autres (mesuré avec l'émulateur).
- [x] Curseurs des autres éditeurs affichés en couleur avec leur pseudo.
- [x] **Sortie partagée** : exécutée par la personne qui clique (Pyodide dans un **Web Worker**), publiée au fil de l'eau dans `python/sortie` ; sortie limitée à 20 000 caractères, arrêt automatique après 20 s.
- [x] `input()` : lit les lignes du champ « Entrées » (tout le monde voit les mêmes valeurs).
- [x] Affiche qui a exécuté et l'état (en cours, terminé, erreur, arrêté) ; bouton « Arrêter » pour la personne qui exécute et pour l'hôte.
- [x] Ouvrir un fichier `.py` (remplace le code de la salle après confirmation) ; chacun peut **télécharger** le code.
- [ ] Charger un exercice directement depuis les cours (avec le bouton « Essayer ce code », phase 5).
- [ ] Afficher l'heure d'exécution.
- [ ] Limite : l'historique d'annulation (Ctrl+Z) contient aussi les modifications des autres.

### Module Partage d'écran

- [ ] L'hôte active le module.
- [ ] L'hôte peut **partager son propre écran**.
- [ ] L'hôte peut **demander à un participant** de partager son écran (ex. présenter un projet perso ou le projet Pac-Man fait en groupe) :
  - le participant reçoit une invitation « L'hôte te demande de partager ton écran » avec **Accepter / Refuser** ;
  - s'il accepte, le navigateur lui demande de choisir la fenêtre ou l'écran (obligatoire, on ne peut pas forcer un partage, c'est une protection du navigateur) ;
  - l'hôte peut arrêter le partage d'un participant à tout moment.
- [ ] Un seul partage affiché à la fois (sinon choix par l'hôte).
- [ ] Hors module actif, les participants ne peuvent pas partager leur écran.

### Autres fonctions de la salle

- [ ] **Tchat écrit** intégré (Realtime Database), avec suppression de message par l'hôte ou un admin.
- [ ] **Lever la main** : bouton, liste ordonnée des mains levées pour l'hôte, l'hôte peut baisser une main.
- [x] Visio réservée aux personnes connectées et non bannies.
- [x] Présence : liste des participants à jour en direct (retrait automatique à la déconnexion).
- [ ] Salle d'attente / code de salon (voir décision Phase 1).
- [ ] L'hôte peut couper le micro d'un participant, le **kick** ; un admin peut **ban**.

---

## Phase 4 — Administration

- [ ] Page / fenêtre **Admin** (visible et accessible uniquement aux admins, vérifié par `database.rules.json`) :
  - [ ] liste des salons ouverts, possibilité de les fermer ;
  - [ ] liste des participants connectés, kick / ban ;
  - [ ] liste des bans avec motif, levée de ban ;
  - [ ] journal des actions de modération (qui a fait quoi, quand).

---

## Phase 5 — Cours et finitions

- [ ] Ajouter les vrais cours de Première et Terminale (avec l'accord du prof).
- [ ] Bouton « Essayer ce code » sur chaque bloc Python d'un cours : l'ouvre dans l'éditeur.
- [ ] Coloration syntaxique des blocs de code dans les cours.
- [ ] Page « À propos » : but du projet, contacts des admins, règles de bonne conduite.
- [ ] Tests sur Chrome, Firefox, Safari (le partage d'écran n'existe pas sur la plupart des téléphones).

---

## Notes pour l'IA qui travaille sur ce dépôt

- Respecter les conventions du `README.md` (français, pas de framework, `textContent` pour les entrées utilisateur).
- Ne jamais coder une vérification d'admin **uniquement** côté client : toujours la doubler par une règle dans `database.rules.json`, avec un test dans `tests/regles.test.mjs`.
- Avant toute décision marquée **⚠ décision**, demander aux admins.
- Cocher les cases de ce fichier au fur et à mesure.
