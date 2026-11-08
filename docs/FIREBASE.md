# Mettre en place Firebase

Ce guide est pour les **administrateurs** (Sofian E. et Vianney M.). À faire une seule fois, environ 20 minutes.
Tant que ces étapes ne sont pas faites, le site fonctionne comme avant, sans comptes.

## 1. Créer le projet

1. Aller sur <https://console.firebase.google.com> avec un compte Google.
2. **Créer un projet**, par exemple `nsi-en-ligne`. Google Analytics : **désactivé** (inutile, et le public est mineur).
3. Rester sur l'offre gratuite **Spark**. Elle suffit pour une classe et ne demande pas de carte bancaire.

## 2. Ajouter le site web et remplir la configuration

1. Dans le projet : icône **`</>`** (Web) → nom `site` → **ne pas** cocher Firebase Hosting (le site est sur GitHub Pages).
2. Firebase affiche un objet `firebaseConfig`. Copier ses valeurs dans `assets/js/firebase-config.js`.
3. Commit et push. Ces valeurs ne sont **pas secrètes** : elles sont visibles par tout visiteur du site, c'est normal.

## 3. Activer les modes de connexion

Console Firebase → **Authentication** → **Commencer** → onglet **Sign-in method** :

### Anonyme (élèves)

**Anonyme** → Activer → Enregistrer.

### GitHub (admins et profs)

1. Dans Firebase, cliquer sur **GitHub** → Activer. Firebase affiche une **URL de rappel** du type
   `https://nsi-en-ligne.firebaseapp.com/__/auth/handler`. La copier, laisser l'onglet ouvert.
2. Dans un autre onglet, sur GitHub : **Settings → Developer settings → OAuth Apps → New OAuth App** :
   - *Application name* : `NSI en ligne`
   - *Homepage URL* : `https://dev-sofian.github.io/nsi-saint-sernin/`
   - *Authorization callback URL* : l'URL de rappel copiée juste avant
3. Créer l'application, puis **Generate a new client secret**.
4. Revenir dans Firebase et coller le **Client ID** et le **Client secret**. Enregistrer.

> ⚠ Le *client secret* GitHub est un **vrai secret** : il va uniquement dans la console Firebase,
> **jamais** dans le dépôt (le dépôt est public).

## 4. Domaines autorisés

Authentication → **Settings** → **Authorized domains** → ajouter :

- `dev-sofian.github.io` (le site en ligne)
- `127.0.0.1` (Live Server dans VS Code ; `localhost` est déjà présent)

## 5. Créer la base Firestore et publier les règles

1. Console → **Firestore Database** → **Créer une base de données**.
2. Emplacement : une région européenne, par exemple `europe-west9` (Paris). **Ce choix est définitif.**
3. Démarrer en **mode production** (tout est refusé par défaut).
4. Onglet **Règles** : remplacer tout le contenu par celui du fichier [`firestore.rules`](../firestore.rules) du dépôt, puis **Publier**.

À chaque modification de `firestore.rules` dans le dépôt, il faut la republier ici, ou utiliser la commande
`firebase deploy --only firestore:rules` si Firebase CLI est installé.

## 6. Se déclarer administrateur

Les admins sont reconnus par leur **identifiant Firebase (UID)**, jamais par leur nom affiché.

1. Sur le site, page **Connexion** → **Se connecter avec GitHub**.
2. Sur la même page, ouvrir **Identifiant technique** et cliquer sur **Copier**.
3. Console Firebase → Firestore → **Commencer une collection** :
   - ID de la collection : `admins`
   - ID du document : coller l'UID
   - un champ `nom` (string) : `Sofian E.`
4. Recharger le site : le badge **Admin** apparaît à côté du pseudo.

Recommencer pour Vianney M. avec son propre compte GitHub.

La collection `admins` ne peut **pas** être modifiée depuis le site, même par un admin.
C'est voulu : personne ne peut se donner ces droits en trichant dans le navigateur.

## 7. Ajouter un prof

1. Le prof se connecte avec **GitHub** sur la page Connexion et vous envoie son identifiant technique.
2. Console Firestore → collection `profs` → document dont l'ID est cet UID, avec les champs :
   - `nom` (string) : le nom du prof
   - `ajoutePar` (string) : votre propre UID
   - `date` (timestamp) : maintenant

Une page d'administration pour faire ça depuis le site arrivera en phase 4.

## 8. (Conseillé) Restreindre la clé d'API

La clé `apiKey` est publique, mais on peut limiter les sites qui ont le droit de l'utiliser :
<https://console.cloud.google.com/apis/credentials> → choisir le projet → cliquer sur la clé
« Browser key » → **Restrictions relatives aux applications** → *Sites web* → ajouter
`https://dev-sofian.github.io/*`, `http://127.0.0.1:5500/*` et `http://localhost:5500/*`.

## Bannir quelqu'un (en attendant la page Admin)

Console Firestore → collection `bans` → document dont l'ID est l'UID de la personne, avec les champs
`pseudo` (string), `motif` (string), `auteurUid` (string, votre UID) et `date` (timestamp).
Pour lever le ban, supprimer le document.

Limite connue : un élève connecté en **anonyme** peut contourner un ban en se déconnectant ou en
effaçant les données de son navigateur, car il obtient alors un nouveau compte. Pour des bans
vraiment fiables, il faudra des comptes Google ou une salle d'attente validée par l'hôte
(voir `TODO.md`).

## Tester les règles

Des tests automatiques vérifient les règles avec l'émulateur Firebase. Il faut Node.js 18+ et Java 11+ :

```bash
cd tests
npm install
npm test
```
