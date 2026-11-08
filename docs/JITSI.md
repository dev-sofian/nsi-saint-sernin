# Héberger notre propre Jitsi (Oracle Cloud, gratuit)

Ce guide est pour les **administrateurs**. Durée : environ 1 heure la première fois.

## Pourquoi ?

Le serveur public `meet.jit.si` coupe les appels au bout de **5 minutes** quand la visio est intégrée
dans un autre site (notre page Visio). Avec notre propre Jitsi :

- pas de limite de durée ni de nombre d'utilisateurs ;
- la visio reste **dans** notre page, avec la fenêtre Python partagé par-dessus ;
- seules les personnes **connectées et non bannies** sur notre site peuvent entrer ;
- l'hôte de la salle, les profs et les admins sont **modérateurs** dans Jitsi (couper un micro,
  exclure quelqu'un) ; les autres sont simples participants.

## Comment ça marche

```
Navigateur ──(1) jeton Firebase──▶ https://<domaine>/jeton   (service de jetons, serveur/jeton/)
           ◀──(2) jeton Jitsi───── vérifie : connecté ? banni ? hôte/prof/admin ? (Realtime Database)
           ──(3) entre avec le jeton──▶ https://<domaine>/<salle>   (Jitsi, refuse sans jeton valide)
```

Tout tourne sur un serveur Oracle gratuit, dans Docker :
**Caddy** (HTTPS automatique), **Jitsi** (version `stable-11031`) et le **service de jetons**.
Les fichiers sont dans le dossier [`serveur/`](../serveur).

---

## 1. Créer le compte Oracle Cloud

1. <https://www.oracle.com/cloud/free/> → **Start for free**.
2. **Région d'origine (Home Region)** : choisir **France Central (Paris)** ou **France South (Marseille)**.
   ⚠ Ce choix est **définitif** et les serveurs gratuits ne sont disponibles que dans cette région.
3. La carte bancaire sert à **vérifier l'identité**. Oracle peut faire une autorisation temporaire de
   quelques euros, annulée ensuite. Rien n'est prélevé tant qu'on reste dans les ressources marquées
   « Always Free ».

> Relisez les conditions de l'offre gratuite au moment de l'inscription : une source indiquait qu'Oracle
> réduirait en 2026 le serveur gratuit à 2 processeurs / 12 Go. C'est **largement suffisant** pour 16 personnes.
>
> Oracle peut aussi récupérer un serveur gratuit resté **inactif** plusieurs jours (processeur presque
> toujours au repos). Un serveur de visio qui ne sert que pendant les cours peut être concerné. À vérifier
> dans les conditions ; passer le compte en « Pay As You Go » (toujours gratuit dans les limites
> Always Free) est la parade habituelle, à décider entre admins.

## 2. Créer le serveur (instance)

Console Oracle → **☰ → Compute → Instances → Create instance** :

| Réglage | Valeur |
|---|---|
| Name | `jitsi` |
| Image | **Canonical Ubuntu 24.04** (bouton *Change image*) |
| Shape | *Change shape* → **Ampere** → `VM.Standard.A1.Flex`, **2 OCPU, 12 Go** de mémoire |
| Networking | laisser par défaut (crée un réseau virtuel), **Assign a public IPv4 address** coché |
| Add SSH keys | **Generate a key pair for me** → **Save private key** (fichier `ssh-key-….key`) |

**Create**. Si Oracle répond *Out of capacity*, réessayer un peu plus tard (c'est fréquent avec
les serveurs gratuits), ou choisir un autre *Availability domain*.

Notez l'**adresse IP publique** affichée sur la page de l'instance (ex : `152.70.12.34`).

⚠ Le fichier `.key` donne un accès complet au serveur : gardez-le pour vous, **jamais** dans le dépôt.

## 3. Ouvrir les ports dans le pare-feu d'Oracle

Page de l'instance → *Primary VNIC* → lien du **Subnet** → **Security Lists** → la liste par défaut →
**Add Ingress Rules**. Ajouter ces 4 règles (Source CIDR : `0.0.0.0/0`) :

| Protocole | Port de destination | Rôle |
|---|---|---|
| TCP | 80 | obtention du certificat HTTPS |
| TCP | 443 | site Jitsi et service de jetons |
| UDP | 443 | HTTP/3 (plus rapide) |
| UDP | 10000 | **audio et vidéo** (indispensable) |

(Le pare-feu interne d'Ubuntu est ouvert automatiquement par le script d'installation.)

## 4. Un nom de domaine gratuit (DuckDNS)

Il faut un nom de domaine pour le HTTPS, sans lequel les navigateurs refusent caméra et micro.

1. <https://www.duckdns.org> → se connecter (GitHub, par exemple).
2. Choisir un sous-domaine, ex : `nsi-st-sernin` → **add domain**.
3. Dans **current ip**, mettre l'IP publique du serveur (étape 2) → **update ip**.

Le domaine est alors `nsi-st-sernin.duckdns.org`.

## 5. Se connecter au serveur et installer

Dans un terminal (Windows : **PowerShell** ; Mac/Linux : Terminal), depuis le dossier du fichier `.key` :

```bash
ssh -i ssh-key-XXXX.key ubuntu@152.70.12.34
```

Sous Mac/Linux, si `ssh` se plaint des permissions de la clé : `chmod 600 ssh-key-XXXX.key`.
Répondre `yes` à la première connexion. Puis, **sur le serveur** :

```bash
git clone https://github.com/dev-sofian/nsi-saint-sernin
cd nsi-saint-sernin/serveur
./installer.sh nsi-st-sernin.duckdns.org
```

Le script (5 à 10 minutes) : ouvre le pare-feu Ubuntu, installe Docker, télécharge Jitsi, génère les
mots de passe et le secret des jetons, puis démarre tout.

Si le site n'est pas servi depuis `https://dev-sofian.github.io`, indiquer son adresse avant :
`ORIGINES_AUTORISEES=https://mon-site.example ./installer.sh nsi-st-sernin.duckdns.org`.

**Vérification** : ouvrir <https://nsi-st-sernin.duckdns.org/jeton/sante> dans un navigateur → `{"ok":true}`.
Ouvrir <https://nsi-st-sernin.duckdns.org/test> → Jitsi doit **refuser** l'entrée (pas de jeton) : c'est normal.

## 6. Brancher le site

Dans le dépôt, fichier [`assets/js/visio-config.js`](../assets/js/visio-config.js) :

```js
export const SERVEUR_VISIO = "nsi-st-sernin.duckdns.org";
```

Commit, push : la page Visio utilise maintenant notre serveur. Testez à deux, sur deux appareils.

Rien à changer dans Firebase : le service de jetons lit la Realtime Database **avec le jeton de la
personne**, donc en respectant `database.rules.json`.

## Mettre à jour

Sur le serveur :

```bash
cd ~/nsi-saint-sernin && git pull
cd serveur && ./installer.sh nsi-st-sernin.duckdns.org
```

Les mots de passe et le secret déjà générés sont conservés. Ubuntu installe tout seul les mises à jour
de sécurité du système.

## En cas de problème

| Symptôme | À vérifier |
|---|---|
| `/jeton/sante` ne répond pas | DuckDNS pointe bien vers la bonne IP ? Ports 80/443 ouverts (étape 3) ? Sur le serveur : `cd ~/jitsi && sudo docker compose -f docker-compose.yml -f docker-compose.nsi.yml ps` puis `… logs caddy` |
| La page Visio dit « Le serveur de visio ne répond pas » | Même chose ; et `ORIGINES_AUTORISEES` contient bien l'adresse exacte du site ; `… logs jeton` |
| On entre, mais pas de son ni d'image entre les personnes | **UDP 10000** pas ouvert (étape 3), ou IP publique changée : relancer `./installer.sh` |
| Tout le monde est modérateur, ou personne | `… logs prosody` ; le réglage `XMPP_MUC_MODULES=token_affiliation` doit être dans `~/jitsi/.env` |

## Sécurité

- `~/jitsi/.env` contient le **secret des jetons** et les mots de passe internes de Jitsi : il reste sur
  le serveur (droits `600`), jamais dans le dépôt. Avec ce secret, on pourrait fabriquer des jetons.
- Seuls les ports 80, 443 et 10000 sont ouverts ; les services internes de Jitsi ne sont pas exposés.
- Si le secret fuite : le supprimer de `~/jitsi/.env` (ligne `JWT_APP_SECRET=`) et relancer
  `./installer.sh` : un nouveau secret est généré, les anciens jetons ne marchent plus.

## Tests (pour les développeurs)

- `cd tests && npm test` : règles de la base **et** service de jetons (signature Google falsifiée,
  autre projet, jeton expiré, banni, salle invalide, panne réseau…).
- La configuration Jitsi de `serveur/` a été testée en local avec Docker : sans jeton ou avec un jeton
  d'une autre salle, expiré ou mal signé, l'entrée est refusée ; hôte = modérateur, élève = participant.
