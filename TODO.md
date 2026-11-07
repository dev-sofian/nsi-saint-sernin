# TODO — Feuille de route NSI en ligne

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

- [ ] **⚠ décision** : choisir le backend. Recommandation : **Firebase** (Authentication + Firestore), offre gratuite suffisante pour une classe, fonctionne depuis un site statique. Alternative équivalente : Supabase.
- [ ] Créer le projet Firebase, ajouter la config (publique) dans `assets/js/firebase-config.js`.
- [ ] Ajouter le domaine GitHub Pages aux domaines autorisés de Firebase Auth.

### Administrateurs

- [ ] Deux administrateurs : **Sofian E.** et **Vianney M.**
- [ ] Connexion **obligatoire par un service tiers** pour eux : **GitHub** et/ou **Google** (Firebase Auth, pas de mot de passe géré par le site).
- [ ] Les admins sont identifiés par leur **UID Firebase**, jamais par leur nom affiché (un nom se falsifie).
  - Stocker les UID dans la collection `admins/{uid}`, modifiable uniquement depuis la console Firebase.
  - Les règles Firestore vérifient `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`.
- [ ] Pouvoirs des admins :
  - [ ] **Kick** : exclure quelqu'un d'un salon en cours (il peut revenir).
  - [ ] **Ban** : interdire l'accès au site / aux salons (stocké dans `bans/{id}`, avec motif, date, auteur).
  - [ ] Voir la liste des bannis et lever un ban.
  - [ ] Créer, fermer et verrouiller des salons.
  - [ ] Ajouter, modifier ou supprimer des cours (optionnel, sinon via GitHub).
- [ ] Les règles Firestore refusent toute action d'admin venant d'un non-admin (ne pas se contenter de cacher les boutons).

### Élèves (participants)

- [ ] **⚠ décision** : connexion des élèves. Options :
  1. Connexion anonyme Firebase + pseudo (simple, mais un banni peut revenir en vidant son navigateur).
  2. Connexion Google/GitHub aussi pour les élèves (ban fiable, mais demande un compte).
  3. Anonyme + **code de salon** donné par l'hôte + salle d'attente où l'hôte valide chaque entrée (bon compromis).
- [ ] Page `connexion.html` + bouton de connexion dans la barre du haut.
- [ ] Collecter seulement un prénom/pseudo pour les élèves (public mineur, voir README).

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
- [ ] Modèle de données Firestore (proposition) :
  ```
  salons/{salonId}
    nom, hoteUid, cree, verrouille, modules: { python: bool, partage: bool }
    participants/{uid}   pseudo, role ("hote" | "participant"), mainLevee, peutEditer, enLigne
    messages/{id}        auteurUid, pseudo, texte, date
    python/etat          code, version, derniereSortie, executePar, executeLe
    demandesPartage/{id} cibleUid, statut ("en_attente" | "acceptee" | "refusee")
  ```
- [ ] Mise en page de la salle : vidéos des participants + zone centrale qui affiche le module actif (Python, partage d'écran, ou rien) + panneau latéral (participants, tchat).

### Module Python (exercices en direct)

- [ ] L'hôte active le module : l'éditeur apparaît pour **tout le monde** dans la salle.
- [ ] Par défaut, seul l'hôte modifie le code. L'hôte peut **autoriser** un ou plusieurs participants à modifier et exécuter (champ `peutEditer`), et retirer ce droit à tout moment.
- [ ] Édition **en temps réel** : tout le monde voit les modifications au fil de la frappe.
  - Simple : synchroniser le texte complet via Firestore avec un léger délai (ok si un seul éditeur à la fois).
  - Robuste (plusieurs éditeurs simultanés) : **Yjs** + liaison CodeMirror (`y-codemirror`), avec un fournisseur de synchronisation. **⚠ décision** selon le besoin.
  - Envisager CodeMirror 6, mieux supporté par Yjs que la version 5 actuelle.
- [ ] **Sortie partagée** : quand quelqu'un d'autorisé clique « Exécuter », tout le monde voit la même sortie au même moment.
  - Recommandation : le code est exécuté **par une seule personne** (celle qui clique) avec Pyodide, puis la sortie est publiée dans `python/etat.derniereSortie`. Évite des résultats différents (aléatoire, `input()`).
  - Limiter la taille de la sortie publiée et prévoir un délai maximum d'exécution (boucles infinies) : exécuter Pyodide dans un **Web Worker** pour pouvoir l'arrêter.
- [ ] Afficher qui a exécuté et quand ; bouton « Arrêter » pour l'hôte.
- [ ] Charger un exercice : l'hôte peut ouvrir un fichier `.py` ou un exercice depuis les cours.
- [ ] Chacun peut **télécharger** le code courant.

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

- [ ] **Tchat écrit** intégré (Firestore), avec suppression de message par l'hôte ou un admin.
- [ ] **Lever la main** : bouton, liste ordonnée des mains levées pour l'hôte, l'hôte peut baisser une main.
- [ ] Salle d'attente / code de salon (voir décision Phase 1).
- [ ] L'hôte peut couper le micro d'un participant, le **kick** ; un admin peut **ban**.

---

## Phase 4 — Administration

- [ ] Page / fenêtre **Admin** (visible et accessible uniquement aux admins, vérifié par les règles Firestore) :
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
- Ne jamais coder une vérification d'admin **uniquement** côté client : toujours la doubler par une règle Firestore.
- Avant toute décision marquée **⚠ décision**, demander aux admins.
- Cocher les cases de ce fichier au fur et à mesure.
