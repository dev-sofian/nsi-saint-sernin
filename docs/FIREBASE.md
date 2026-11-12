# Mettre en place Firebase

Ce guide est pour les **administrateurs** (Sofian E. et Vianney M.).

Le site utilise deux services Firebase :
- **Authentication** : les comptes (élèves avec nom d'utilisateur + mot de passe, profs et admins avec GitHub) ;
- **Realtime Database** : les rôles, la liste blanche, les bans, les profils et les salles (Python partagé, tchat, mains levées, demandes de partage d'écran).

La vidéo et le partage d'écran passent par le serveur auto-hébergé : voir `docs/SERVEUR.md`.

> **Pourquoi pas Firestore ?** Firestore facture une lecture à chaque personne qui reçoit une
> modification. Avec une classe qui regarde quelqu'un taper du code, on dépasserait le quota
> gratuit (50 000 lectures par jour) en une seule séance. La Realtime Database ne compte pas les
> opérations, a une latence de quelques dizaines de millisecondes et sait détecter les
> déconnexions (liste des présents). Si vous aviez créé une base Firestore, vous pouvez la
> supprimer ou la laisser : le site ne s'en sert plus.

Tant que la configuration n'est pas complète, le site fonctionne sans comptes (cours et Python solo seulement).

## 1. Créer le projet ✅ (déjà fait : `nsi-saint-sernin`)

1. <https://console.firebase.google.com> → **Créer un projet**. Google Analytics : **désactivé**.
2. Rester sur l'offre gratuite **Spark** (pas de carte bancaire).

## 2. Ajouter le site web ✅ (déjà fait)

Icône **`</>`** (Web) → copier les valeurs de `firebaseConfig` dans `assets/js/firebase-config.js`.
Ces valeurs ne sont **pas secrètes** : elles sont visibles par tout visiteur, c'est normal.

## 3. Activer les modes de connexion

Console Firebase → **Authentication** → onglet **Sign-in method** :

### Adresse e-mail / mot de passe (élèves)

**Adresse e-mail/Mot de passe** → Activer (première option seulement, **pas** « Lien envoyé par
e-mail ») → Enregistrer.

Les élèves ne donnent **aucune adresse e-mail** : le site transforme leur nom d'utilisateur en une
adresse technique `nom@nsi-saint-sernin.firebaseapp.com` qui ne reçoit jamais de courrier (c'est
pour ça que Firebase affiche des « adresses » dans l'onglet Users).

### Anonyme : à désactiver

Si **Anonyme** est activé (ancienne version du site), le **désactiver** : les élèves n'entrent plus
sans compte. Les anciens comptes anonymes n'ont plus accès aux salles (ils ne sont pas validés).

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

À chaque modification des règles, il faut les republier ici, ou utiliser
`firebase deploy --only database` si Firebase CLI est installé.

> `database.rules.json` est **généré** : on modifie `outils/regles.template.jsonc`, puis
> `node outils/generer-regles.mjs` (les conditions répétées partout, comme « est admin » ou
> « est membre validé », n'y sont écrites qu'une fois).

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

Un prof a les pouvoirs d'hôte dans toutes les salles. (Ajouter un prof depuis la page Admin est
prévu dans `TODO.md`.)

## 8. (Conseillé) Restreindre la clé d'API

La clé `apiKey` est publique, mais on peut limiter les sites qui ont le droit de l'utiliser :
<https://console.cloud.google.com/apis/credentials> → choisir le projet → cliquer sur la clé
« Browser key » → **Restrictions relatives aux applications** → *Sites web* → ajouter l'adresse du
site (ex : `https://dev-sofian.github.io/*`), `http://127.0.0.1:5500/*` et `http://localhost:5500/*`.

## Liste blanche, bans, mot de passe oublié : la page Admin

Tout se fait depuis la page **Admin** du site (lien dans la barre du haut quand on est connecté
en admin) :

- **Demandes d'accès** : un élève crée son compte, le site lui affiche un code (ex : `K7Q-M4P`). Il
  le recopie sur un papier avec son nom d'utilisateur (ou dans le formulaire Google). Recopier le code
  dans la ligne de sa demande : **Valider** ne s'active que si le code correspond.
- **Comptes** : suspendre, valider sans code, bannir, débannir, supprimer.
- **Salles** : voir qui est présent, fermer une salle.
- **Journal** : toutes les actions de modération, non modifiables.

**Mot de passe oublié** : personne (même un admin) ne peut lire ni changer le mot de passe d'un élève.
1. Page Admin → **Supprimer** son compte.
2. Console Firebase → **Authentication → Users** → chercher `nom@nsi-saint-sernin.firebaseapp.com`
   → **Supprimer le compte** (sinon le nom d'utilisateur reste pris).
3. L'élève recrée son compte avec le même nom et refait valider son code.

Un banni ne peut plus entrer dans les salles ni modifier son profil, et le serveur de visio refuse
de lui donner un jeton. S'il est en visio au moment du ban, la page Admin le sort de la salle.

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
