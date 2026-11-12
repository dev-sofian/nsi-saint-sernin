# TODO — Feuille de route NSI St Sernin

Légende : `[ ]` à faire · `[~]` en cours · `[x]` fait · **⚠ décision** = à valider par les admins avant de coder.
**👤 Admins** = action manuelle des admins (console, box, PC), pas du code.

Architecture, accès et règles de sécurité : voir `README.md`.

---

## Prochaines étapes (dans l'ordre)

1. 👤 Firebase : activer **Adresse e-mail/Mot de passe**, désactiver **Anonyme**, publier les nouvelles règles (`docs/FIREBASE.md`, étapes 3 et 5).
2. 👤 Lancer les tests des règles sur un PC avec Java : `cd tests && npm install && npm test` (ils n'ont pas pu être lancés là où ils ont été écrits, faute d'accès réseau pour installer l'émulateur).
3. 👤 Serveur : `docs/SERVEUR.md`, étapes 1 à 5 (Docker, ufw, DuckDNS, `initialiser.sh`, **mode démo**).
4. 👤 Renseigner `URL_SERVEUR_VISIO` (et `LIEN_FORMULAIRE_ACCES`) dans `assets/js/site-config.js`.
5. 👤 Ouvrir les 4 ports sur la Bbox, `sudo ./demarrer.sh`, vérifier depuis un téléphone en 4G (`docs/SERVEUR.md`, étapes 6 à 8).
6. Test grandeur nature avec quelques élèves, puis avec la classe entière.
7. Phase 4 : la nouvelle interface.

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
- [ ] 👤 Étapes de `docs/SERVEUR.md` (voir « Prochaines étapes »).
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
- [x] Testé dans Chromium avec Firebase et LiveKit simulés (inscription → validation → salle → écran demandé/accepté/refusé/arrêté → exclusion → ban → page Admin). **À tester pour de vrai** avec le serveur en ligne et plusieurs appareils.
- [ ] **⚠ décision** : un élève peut-il **créer** une salle (il en devient l'hôte, ex : travail de groupe Pac-Man) ? Aujourd'hui : oui, le premier arrivé est hôte.
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

### Concept

- [ ] Le site est un **gestionnaire de fenêtres en mosaïque** :
  - espaces de travail = sections : `1` Cours · `2` Classe · `3` Python · `4` Admin (admins seulement) ;
  - raccourcis façon Sway : `Alt+1…4` change d'espace, `Alt+flèches` change la fenêtre active (bordure en surbrillance) ;
  - fenêtres côte à côte avec des espaces (« gaps »), sans barre de titre.
- [ ] **Barre du haut** façon Waybar : espaces de travail à gauche ; cercle d'état au centre (vert-jaune = serveur de visio joignable, gris = anonyme, rouge = serveur éteint) ; pastilles à droite : salle, participants, micro, caméra, main levée, horloge, **⏻** = déconnexion.
- [ ] **Accueil** = terminal avec un faux `fastfetch` du site : logo ASCII **original** « NSI » en dégradé violet → bleu, `Cours: 12`, `Salles ouvertes: 1`, `Utilisateur: anonyme`… + quelques commandes (`cours`, `classe`, `python`, `aide`, `connexion`).
- [ ] **Classe** : vidéos, module actif (Python / écran) et tchat en mosaïque (la structure actuelle de `visio.html` s'y prête : scène + panneau latéral + fenêtre Python).
- [ ] **Pluie de caractères** : canvas avec des mots-clés Python (`def`, `for`, `while`, `return`, `lambda`…), fenêtre décorative de l'accueil et écran de veille ; désactivée si `prefers-reduced-motion`.
- [ ] Fond d'écran : **illustration originale** d'abysses bioluminescentes (SVG/canvas). Ne pas reprendre le fond d'écran réel ni le logo EndeavourOS (droits d'auteur, marque).
- [ ] Police **Maple Mono** (licence OFL) hébergée dans `assets/fonts/` avec sa licence.
- [ ] Icônes style Nerd Font / Waybar en SVG dans `assets/icons/` (faites maison ou sous licence libre, licence mentionnée).
- [ ] Téléphone : un espace = une fenêtre plein écran, barre du haut compacte.
- [ ] Accessibilité : contrastes suffisants malgré la transparence, navigation clavier, focus visible.

---

## Phase 5 — Administration

- [x] Page **Admin** : demandes d'accès (validation par code), comptes (suspendre, valider sans code, bannir, débannir, supprimer), bannis, salles (présents, fermer), journal (50 dernières actions).
- [x] Toutes ces actions sont vérifiées par les règles et écrites au **journal** (non modifiable).
- [ ] Ajouter / retirer un prof depuis la page Admin (aujourd'hui : console, `docs/FIREBASE.md` étape 7).
- [ ] Nettoyage automatique des salles inactives depuis longtemps.
- [ ] Fin d'année : bouton « supprimer tous les comptes élèves ».

---

## Phase 6 — Cours et finitions

- [ ] Ajouter les vrais cours de Première et Terminale (avec l'accord du prof).
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
