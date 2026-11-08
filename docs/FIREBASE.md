# Mettre en place Firebase

Ce guide est pour les **administrateurs** (Sofian E. et Vianney M.).

Le site utilise deux services Firebase :
- **Authentication** : les comptes (élèves en anonyme, profs et admins avec GitHub) ;
- **Realtime Database** : les rôles, les bans, les profils et les salles (Python partagé en temps réel).

> **Pourquoi pas Firestore ?** Firestore facture une lecture à chaque personne qui reçoit une
> modification. Avec une classe qui regarde quelqu'un taper du code, on dépasserait le quota
> gratuit (50 000 lectures par jour) en une seule séance. La Realtime Database ne compte pas les
> opérations, a une latence de quelques dizaines de millisecondes et sait détecter les
> déconnexions (liste des présents). Si vous aviez créé une base Firestore, vous pouvez la
> supprimer ou la laisser : le site ne s'en sert plus.

Tant que la configuration n'est pas complète, le site fonctionne sans comptes (visio seule).

## 1. Créer le projet ✅ (déjà fait : `nsi-saint-sernin`)

1. <https://console.firebase.google.com> → **Créer un projet**. Google Analytics : **désactivé**.
2. Rester sur l'offre gratuite **Spark** (pas de carte bancaire).

## 2. Ajouter le site web ✅ (déjà fait)

Icône **`</>`** (Web) → copier les valeurs de `firebaseConfig` dans `assets/js/firebase-config.js`.
Ces valeurs ne sont **pas secrètes** : elles sont visibles par tout visiteur, c'est normal.

## 3. Activer les modes de connexion

Console Firebase → **Authentication** → onglet **Sign-in method** :

### Anonyme (élèves)

**Anonyme** → Activer → Enregistrer.

### GitHub (admins et profs)

1. Dans Firebase, cliquer sur **GitHub** → Activer. Firebase affiche une **URL de rappel** :
   `https://nsi-saint-sernin.firebaseapp.com/__/auth/handler`. La copier, laisser l'onglet ouvert.
2. Dans un autre onglet, sur GitHub : **Settings → Developer settings → OAuth Apps → New OAuth App** :
   - *Application name* : `NSI St Sernin`
   - *Homepage URL* : l'adresse du site
   - *Authorization callback URL* : l'URL de rappel copiée juste avant
3. Créer l'application, puis **Generate a new client secret**.
4. Revenir dans Firebase et coller le **Client ID** et le **Client secret**. Enregistrer.

> ⚠ Le *client secret* GitHub est un **vrai secret** : il va uniquement dans la console Firebase,
> **jamais** dans le dépôt (le dépôt est public).

## 4. Domaines autorisés

Authentication → **Settings** → **Authorized domains** → ajouter :

- le domaine du site en ligne (ex : `dev-sofian.github.io`, ou votre domaine personnalisé) ;
- `127.0.0.1` (Live Server dans VS Code ; `localhost` est déjà présent).

## 5. Créer la Realtime Database et publier les règles

1. Console → **Build → Realtime Database** → **Créer une base de données**.
2. Emplacement : **Belgique (europe-west1)**, le plus proche.
3. Démarrer en **mode verrouillé** (tout est refusé par défaut).
4. En haut de l'onglet **Données**, Firebase affiche l'adresse de la base, par exemple
   `https://nsi-saint-sernin-default-rtdb.europe-west1.firebasedatabase.app`.
   Vérifier qu'elle est **exactement** égale à `databaseURL` dans `assets/js/firebase-config.js`,
   sinon la corriger (commit + push).
5. Onglet **Règles** : remplacer tout le contenu par celui du fichier
   [`database.rules.json`](../database.rules.json) du dépôt, puis **Publier**.

À chaque modification de `database.rules.json` dans le dépôt, il faut la republier ici, ou utiliser
`firebase deploy --only database` si Firebase CLI est installé.

## 6. Se déclarer administrateur

Les admins sont reconnus par leur **identifiant Firebase (UID)**, jamais par leur nom affiché.

1. Sur le site, page **Connexion** → **Se connecter avec GitHub**.
2. Sur la même page, ouvrir **Identifiant technique** et cliquer sur **Copier**.
3. Console → Realtime Database → **Données** → survoler la racine → **+** :
   - Clé : `admins`
   - cliquer à nouveau sur **+** à côté de `admins` : Clé = l'UID collé, Valeur = `Sofian E.`
   - **Ajouter**.
4. Recharger le site : le badge **Admin** apparaît à côté du pseudo.

Recommencer pour Vianney M. avec son propre compte GitHub.

La branche `admins` ne peut **pas** être modifiée depuis le site, même par un admin.
C'est voulu : personne ne peut se donner ces droits en trichant dans le navigateur.

## 7. Ajouter un prof

1. Le prof se connecte avec **GitHub** sur la page Connexion et vous envoie son identifiant technique.
2. Console → Realtime Database → Données → branche `profs` → **+** : Clé = l'UID du prof, puis
   à l'intérieur trois valeurs :
   - `nom` : le nom du prof
   - `ajoutePar` : votre propre UID
   - `date` : `0` (ou n'importe quel nombre ; la console n'applique pas les règles)

Un prof a les pouvoirs d'hôte dans toutes les salles. Une page d'administration pour faire ça
depuis le site arrivera en phase 4.

## 8. (Conseillé) Restreindre la clé d'API

La clé `apiKey` est publique, mais on peut limiter les sites qui ont le droit de l'utiliser :
<https://console.cloud.google.com/apis/credentials> → choisir le projet → cliquer sur la clé
« Browser key » → **Restrictions relatives aux applications** → *Sites web* → ajouter l'adresse du
site (ex : `https://dev-sofian.github.io/*`), `http://127.0.0.1:5500/*` et `http://localhost:5500/*`.

## Bannir quelqu'un (en attendant la page Admin)

Console → Realtime Database → Données → branche `bans` → **+** : Clé = l'UID de la personne
(visible dans `salons/<salle>/participants`), puis à l'intérieur `pseudo`, `motif`,
`auteurUid` (votre UID) et `date` (`0`). Pour lever le ban, supprimer cette entrée.

Un banni ne peut plus lire ni écrire dans les salles, ni modifier son profil.

Limite connue : un élève connecté en **anonyme** peut contourner un ban en se déconnectant ou en
effaçant les données de son navigateur, car il obtient alors un nouveau compte. Pour des bans
vraiment fiables, il faudra des comptes Google ou une salle d'attente validée par l'hôte
(voir `TODO.md`).

## Limites de l'offre gratuite (Spark)

- **100 connexions simultanées** à la Realtime Database (un onglet ouvert = une connexion).
  Largement suffisant pour une classe.
- 1 Go de données stockées, 10 Go téléchargés par mois.

## Tester les règles

Des tests automatiques vérifient les règles avec l'émulateur Firebase. Il faut Node.js 18+ et Java 11+ :

```bash
cd tests
npm install
npm test
```
