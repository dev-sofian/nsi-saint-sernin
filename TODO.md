# TODO — Feuille de route NSI St Sernin

Légende : `[ ]` à faire · `[~]` en cours · `[x]` fait · **⚠ décision** = à valider par les admins avant de coder.
**👤 Admins** = action manuelle des admins (console, box, PC), pas du code.

Architecture, accès et règles de sécurité : voir `README.md`.

---

## Prochaines étapes (dans l'ordre)

1. ✔ Tests (jetons 20/20, règles 46/46), Firebase configuré, mode démo, mise en ligne, test réel en 4G (vidéo, son, écran, main levée, tchat).
2. 👤 Tester la **demande d'écran à un élève** en vrai (élève sur ordinateur : les navigateurs de téléphone ne partagent pas l'écran).
3. 👤 Créer le **formulaire Google** et mettre son lien dans `LIEN_FORMULAIRE_ACCES` (`assets/js/site-config.js`).
4. 👤 Test avec 2 ou 3 élèves, puis avec la classe entière.
5. Phase 4 : finir l'interface (voir plus bas).

---

## Phase 0 — Prototype ✔

- [x] Pages Accueil, Cours, Python, Visio
- [x] Cours en Markdown + catalogue JSON + recherche
- [x] Éditeur Python local (CodeMirror + Pyodide), ouvrir/télécharger `.py`

---

## Phase 1 — Comptes, rôles, liste blanche

- [x] **Décision (admins)** : backend = **Firebase** (Authentication + **Realtime Database**, pas Firestore : voir `docs/FIREBASE.md`).
- [x] Admins **Sofian E.** et **Vianney M.**, connexion **GitHub** obligatoire, identifiés par leur UID (`admins/`, modifiable seulement depuis la console).
- [x] Profs : GitHub + `profs/{uid}` ajouté par un admin ; pouvoirs d'hôte dans toutes les salles.
- [x] **Décision (admins)** : plus d'accès anonyme aux salles. Sans compte : cours + Python solo seulement.
- [x] **Décision (admins)** : comptes élèves en **liste blanche**, validés par un admin à partir d'un **papier remis en main propre** (ou d'un **formulaire Google**).
- [x] Procédure retenue (le mot de passe ne circule jamais) :
  1. l'élève crée son compte sur le site (nom d'utilisateur + mot de passe ≥ 10 caractères + classe facultative) ;
  2. le compte est **en attente** ; le site affiche un **code** (6 caractères sans 0/O/1/I) ;
  3. l'élève remet un papier « nom d'utilisateur + code » à un admin (ou remplit le formulaire Google avec ces mêmes infos) ;
  4. l'admin recopie le code dans la page Admin : **Valider** ne s'active que si le code correspond ;
  5. la page de l'élève passe à « Autorisé » toute seule.
- [x] Nom d'utilisateur → adresse technique `nom@nsi-saint-sernin.firebaseapp.com` (aucune vraie adresse demandée) ; vérifié par les règles (`auth.token.email`).
- [x] Règles : statut `en_attente` à la création, seul un admin passe à `actif` ; demande créée une seule fois, au nom du compte ; tout ce qui concerne les salles exige « membre validé non banni ».
- [x] Changement de mot de passe (ancien mot de passe redemandé).
- [x] Mise à jour en direct du statut et du ban (validation, suspension, ban pendant une séance).
- [x] Tests des règles mis à jour (`tests/regles.test.mjs`) — **à lancer** (voir « Prochaines étapes »).
- [ ] 👤 Créer le **formulaire Google** : uniquement *nom d'utilisateur*, *code*, *classe*. Description : « N'écris jamais ton mot de passe ici ». Mettre le lien dans `site-config.js`.
- [ ] 👤 (Conseillé) Console Firebase → Authentication → Paramètres → **Règles de mot de passe** : minimum 10 caractères, pour que la règle soit aussi appliquée par Firebase (aujourd'hui seulement par le site).
- [ ] Supprimer son propre compte depuis la page Mon compte.
- [ ] Limite connue : « mot de passe oublié » demande une action dans la console Firebase (supprimer l'utilisateur dans Authentication). Automatisable plus tard avec un petit service serveur utilisant le SDK Admin, si besoin.

---

## Phase 2 — Serveur de visio auto-hébergé (PC de Sofian)

- [x] **Décision (admins)** : la visio est **auto-hébergée** sur le PC de Sofian (EndeavourOS) ; le reste reste sur GitHub Pages + Firebase.
- [x] Prérequis : accord des parents ✔, IP publique non partagée (Bbox fibre, pas de CGNAT) ✔, IP locale réservée ✔, débit montant ≈ 120 Mbit/s en Wi-Fi depuis la chambre (jusqu'à 500 Mbit/s près de la box) pour 15 personnes ✔.
- [x] **Décision (admins)** : pas de serveur relais (VPS) : l'IP publique (ville seulement) visible des participants est acceptée.
- [x] `serveur/` : Docker Compose (réseau hôte pour que ufw s'applique, conteneurs sans droits, lecture seule, versions épinglées) avec **Caddy** (HTTPS), **LiveKit** v1.13.11 (7881/tcp + 7882/udp), **jetons**, **DuckDNS**.
- [x] Service **jetons** (Node.js sans dépendance, 20 tests) : vérifie la signature Google du jeton Firebase, la liste blanche, le ban et le rôle en lisant Firebase avec le jeton de la personne ; délivre des jetons LiveKit de 10 min ; donne/retire le partage d'écran ; exclut. CORS limité au site, limite de requêtes, aucun secret Firebase.
- [x] Scripts `initialiser.sh` (génère les clés), `demarrer.sh` (refuse si ufw inactif ou `.env` incomplet), `demo.sh`, `arreter.sh` (interrupteur d'urgence).
- [x] **Mode démo** pour présenter au prof et à la classe : tout sur le PC, rien d'ouvert.
- [x] Guide pas à pas : `docs/SERVEUR.md`.
- [x] 👤 Étapes de `docs/SERVEUR.md` : Docker, ufw, DuckDNS, ports de la Bbox, certificat HTTPS, test depuis la 4G.
- [x] Correctif : `demarrer.sh` donne `serveur/data/caddy*` à root (sinon Caddy ne pouvait pas enregistrer son certificat).
- [ ] 👤 Enregistrer une courte vidéo d'un vrai cours pour la présentation en classe (le serveur en ligne ne peut pas tourner depuis le lycée : les ports sont ouverts sur la Bbox de la maison).
- [ ] Optionnel : **CrowdSec** ou **fail2ban** sur les journaux de Caddy.
- [ ] Optionnel : **TURN sur le port 443** pour les réseaux qui bloquent 7881/7882 (certains réseaux de lycée).
- [ ] Optionnel : sauvegarde de `serveur/.env` hors du dépôt (sinon, on régénère les clés).

---

## Phase 3 — Salle de classe

- [x] Visio **LiveKit** (`visio-media.js`) : vignettes, qui parle, micro et caméra coupés en entrant, vignettes en basse définition (simulcast + adaptiveStream), bouton « Activer le son » si le navigateur bloque l'audio, reconnexion signalée.
- [x] **Python partagé** dans une fenêtre flottante (inchangé) : l'hôte l'active pour tous, coche qui peut modifier/exécuter, code + curseurs + sortie en direct. Si l'éditeur ne se charge pas, la salle fonctionne quand même.
- [x] **Partage d'écran** : module activé par l'hôte ; l'hôte partage le sien ; **demande à un participant** (droit LiveKit donné par le serveur → fenêtre « Choisir quoi partager / Refuser » → l'hôte peut arrêter, ce qui retire le droit) ; un seul écran affiché ; hors module ou sans demande, un élève ne peut pas partager (vérifié par LiveKit, pas seulement par l'interface).
- [x] **Tchat** (Firebase) : 500 caractères max, texte brut, l'hôte supprime un message ou vide le tchat.
- [x] **Main levée** : ordre d'arrivée, visible sur les vignettes et dans la liste, l'hôte peut baisser une main ; retirée automatiquement à la déconnexion.
- [x] **Exclure** (hôte) et **Bannir** (admin) depuis la liste des participants ; banni = sorti immédiatement et plus aucun jeton.
- [x] Testé dans Chromium avec Firebase et LiveKit simulés (inscription → validation → salle → écran demandé/accepté/refusé/arrêté → exclusion → ban → page Admin), puis **en vrai** : PC + téléphone en 4G (vidéo, son, écran de l'hôte, main levée, tchat).
- [x] **Décision (admins)** : un élève peut **créer** une salle et en devient l'hôte (travaux de groupe à distance, ex : Pac-Man).
- [x] **Bloqueurs de publicité** (uBlock Origin a bloqué la visio pendant les tests) : encadré « Avant de rejoindre » avec une case obligatoire (mémorisée), détection d'un bloqueur par un élément-appât, et message précis si la visio échoue alors que le serveur répond.
- [ ] Salle **verrouillée** par l'hôte / code de salle.
- [ ] L'hôte peut **couper le micro** de quelqu'un (API LiveKit `MutePublishedTrack` via le service jetons).
- [ ] Charger un exercice directement depuis les cours (bouton « Essayer ce code », phase 6).
- [ ] Limite : l'historique Ctrl+Z du Python partagé contient aussi les modifications des autres.

---

## Phase 4 — Interface inspirée du rice Sway de Sofian

Objectif : une UI qui ne ressemble **pas** à un site généré par IA, reprenant l'**esthétique du bureau Linux personnalisé de Sofian** (capture fournie). C'est le **thème principal**. Les thèmes des captures précédentes (Nordic violet/rose sous GNOME, Manjaro rouge/noir sous KDE) restent des thèmes secondaires optionnels.

### Référence : le rice de Sofian

EndeavourOS + **Sway / SwayFX** (gestionnaire de fenêtres en **mosaïque**, Wayland), terminal **kitty**, police **Maple Mono Italic**.

- **Fond d'écran** : bleu nuit profond, abysses avec méduses bioluminescentes bleues.
- **Barre du haut (type Waybar)**, encadrée d'un fin liseré violet-bleu, fond bleu-noir :
  - à gauche, les **espaces de travail** `1` `2`, celui actif en bloc **violet plein** ;
  - au centre, un **cercle jaune-vert** (indicateur d'état) ;
  - à droite, des modules en « pastilles » : réseau (icône orange), Bluetooth, batterie (vert), volume (pastille sur fond violet), icône Discord, horloge `Thu 12 Nov 19:47`, bouton d'arrêt rouge.
- **Fenêtres en mosaïque** avec des espaces réguliers, **angles droits**, **sans barre de titre**, bordure fine violet-bleu, fond sombre légèrement translucide.
- **Terminal** : `fastfetch` avec logo ASCII en dégradé violet → bleu, libellés en gras clair, valeurs en italique, pourcentages en jaune et vert.
- **Panneau de droite** : pluie de caractères façon `cmatrix`, bleu et violet, quelques caractères en rose/magenta.
- Palette approximative : fond `#0b0f24`, surface `#11163a` (~80 % d'opacité), bordure `#4b3cff`, violet actif `#5b2ee6`, bleu `#3f6bff`, magenta `#d03cff`, jaune `#e3e32a`, vert `#4ade80`, orange `#f59e0b`, rouge `#ef4444`, texte `#dfe3ff`.

### Fait (thème « Abysses »)

- [x] **Barre façon Waybar** (`assets/js/barre.js`) : espaces de travail `nsi` `1` cours · `2` classe · `3` python · `4` admin (admins seulement), espace actif en violet plein ; **Alt+1…4** pour changer d'espace ; cercle d'état au centre (jaune-vert = serveur de visio en ligne, rouge = injoignable, gris = pas configuré, vérifié chaque minute) ; pastilles à droite : compte + rôle, **⏻** déconnexion, horloge.
- [x] **Fenêtres** : coque translucide, angles droits, sans barre de titre, liseré fin qui s'allume sur la fenêtre où l'on travaille (comme la fenêtre active de Sway), espaces réguliers entre fenêtres.
- [x] **Accueil** = terminal : faux `fastfetch` (logo ASCII « NSI » en dégradé violet → bleu, compte, nombre de cours, état de la visio, palette) + invite `~ ❯❯❯` avec des commandes (`aide`, `cours`, `classe`, `python`, `connexion`, `clear`, `whoami`).
- [x] **Pluie de mots-clés Python** façon `cmatrix` (canvas, bleu/violet avec quelques gouttes magenta) ; image fixe si `prefers-reduced-motion`, masquée sur téléphone, en pause quand l'onglet est caché.
- [x] **Fond d'écran original** : abysses avec méduses bioluminescentes (`assets/img/abysses.svg`, dessiné pour le projet).
- [x] **Police** : Maple Mono si elle est installée sur l'ordinateur, sinon JetBrains Mono (Google Fonts) ; valeurs en italique comme dans le terminal.
- [x] Téléphone : seulement les numéros des espaces, fenêtres empilées, sans défilement horizontal.

### Reste à faire

- [ ] Héberger **Maple Mono** (licence OFL) dans `assets/fonts/` avec sa licence, pour que tout le monde la voie (aujourd'hui : seulement ceux qui l'ont installée).
- [ ] Vrai gestionnaire de fenêtres en mosaïque : `Alt+flèches` pour changer de fenêtre active, redimensionner les fenêtres de la salle.
- [ ] Icônes style Nerd Font / Waybar en SVG dans `assets/icons/` (micro, caméra, écran, main…).
- [ ] Thèmes secondaires optionnels (Nordic violet/rose, Manjaro rouge/noir) via `:root[data-theme=…]`.

---

## Phase 5 — Administration

- [x] Page **Admin** : demandes d'accès (validation par code), comptes (suspendre, valider sans code, bannir, débannir, supprimer), bannis, salles (présents, fermer), journal (50 dernières actions).
- [x] Toutes ces actions sont vérifiées par les règles et écrites au **journal** (non modifiable).
- [ ] Ajouter / retirer un prof depuis la page Admin (aujourd'hui : console, `docs/FIREBASE.md` étape 7).
- [ ] Nettoyage automatique des salles inactives depuis longtemps.
- [ ] Fin d'année : bouton « supprimer tous les comptes élèves ».

---

## Phase 6 — Cours et finitions

- [x] **Décision (admins)** : seulement les cours de Terminale (exemples de Première retirés).
- [ ] Ajouter les vrais cours de Terminale (avec l'accord du prof).
- [x] **Décision (admins)** : les noms des admins n'apparaissent pas sur le site (accessible à tous).
- [ ] Bouton « Essayer ce code » sur chaque bloc Python d'un cours.
- [ ] Coloration syntaxique dans les cours.
- [ ] Page « À propos » : but du projet, contacts des admins, règles de bonne conduite, données collectées et leur suppression.
- [ ] Tests sur Chrome, Firefox, Safari et sur le réseau du lycée (partage d'écran indisponible sur la plupart des téléphones).

---

## Notes pour l'IA qui travaille sur ce dépôt

- Respecter les conventions et les **règles de sécurité** du `README.md`.
- Règles Firebase : modifier `outils/regles.template.jsonc` puis `node outils/generer-regles.mjs` ; ajouter un test dans `tests/regles.test.mjs`.
- Service jetons : pas de dépendance npm ; tout changement avec un test dans `serveur/jetons/app.test.mjs` (`node --test serveur/jetons/`).
- Ne jamais coder une vérification de droit **uniquement** côté navigateur.
- Ne jamais commiter `serveur/.env` ni aucun secret ; ne jamais proposer d'ouvrir d'autres ports, une DMZ ou SSH.
- Avant toute décision marquée **⚠ décision**, demander aux admins.
- Cocher les cases de ce fichier au fur et à mesure.
