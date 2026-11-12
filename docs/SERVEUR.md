# Héberger le serveur de visio sur son PC

Ce guide est pour **Sofian E.**, qui héberge la visio sur son PC (EndeavourOS, basé sur Arch Linux).
Il suppose que les prérequis sont réglés : accord des parents, IP publique **non partagée** (pas de
CGNAT), IP locale du PC réservée dans la Bbox, débit montant suffisant.

## Ce qui tourne sur le PC

| Service | Rôle | Ports |
|---|---|---|
| **Caddy** | Porte d'entrée HTTPS, certificat Let's Encrypt automatique | 80, 443 (Internet) |
| **LiveKit** | Visio : audio, vidéo, partage d'écran | 7881/tcp, 7882/udp (Internet) ; 7880 (local) |
| **jetons** | Programme maison (`serveur/jetons/`) : vérifie le compte et donne l'accès aux salles | 8090 (local uniquement) |
| **duckdns** | Met à jour l'adresse IP de la box chez DuckDNS | aucun |

Le reste du site (pages, comptes, Python partagé, tchat) reste sur **GitHub Pages + Firebase** :
si le PC est éteint, seules la vidéo et le partage d'écran sont indisponibles.

Tout tourne dans **Docker**, avec le minimum de droits : pas d'accès au dossier personnel, système
de fichiers en lecture seule, droits Linux retirés. Le service jetons n'utilise **aucune bibliothèque
externe** (Node.js seul), donc rien à mettre à jour de ce côté.

## 1. Installer Docker et le pare-feu

```bash
sudo pacman -S --needed docker docker-compose ufw
sudo systemctl enable --now docker
```

> Ne pas ajouter son utilisateur au groupe `docker` : ça revient à lui donner les droits root.
> On lance les scripts avec `sudo`.

## 2. Pare-feu

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 7881/tcp
sudo ufw allow 7882/udp
sudo ufw enable
sudo systemctl enable ufw
sudo ufw status verbose
```

Le fichier `docker-compose.yml` utilise le réseau de la machine (`network_mode: host`) : le pare-feu
s'applique donc normalement. (Avec les « ports publiés » habituels de Docker, ufw serait contourné.)

`demarrer.sh` refuse de mettre le serveur en ligne si ufw n'est pas actif.

## 3. Nom de domaine gratuit (DuckDNS)

1. Aller sur <https://www.duckdns.org>, se connecter (GitHub par exemple).
2. Créer un sous-domaine, par exemple `nsi-saint-sernin` → `nsi-saint-sernin.duckdns.org`.
3. Noter le **token** affiché en haut de la page : c'est un **secret**.

## 4. Configurer le serveur

```bash
cd serveur
./initialiser.sh          # crée serveur/.env et génère les clés LiveKit
nano .env                 # remplir DOMAINE, DUCKDNS_SOUS_DOMAINE, DUCKDNS_JETON
```

`serveur/.env` contient des secrets : il est dans `.gitignore`, **ne jamais le commiter**, ne jamais
l'envoyer à quelqu'un. S'il fuit : supprimer les lignes `LIVEKIT_CLE` et `LIVEKIT_SECRET`, relancer
`./initialiser.sh`, et régénérer le token sur duckdns.org.

Dans le site, renseigner l'adresse du serveur dans `assets/js/site-config.js` :

```js
export const URL_SERVEUR_VISIO = "https://nsi-saint-sernin.duckdns.org";
```

(commit + push : ce n'est pas un secret).

## 5. Tester en local (mode démo)

Sans rien ouvrir sur la box :

```bash
sudo ./demo.sh
```

Puis dans VS Code : **Live Server** sur `index.html`, page **Visio**. En local (`localhost` ou
`127.0.0.1`), le site utilise tout seul le serveur de démo. C'est aussi le mode à utiliser pour
**présenter le projet en classe** au vidéoprojecteur : tout tourne sur le PC, sans Internet entrant.

Arrêt : `sudo ./arreter.sh`.

## 6. Ouvrir les ports sur la Bbox

Dans l'interface de la Bbox (<https://mabbox.bytel.fr> ou `192.168.1.254`), rubrique de
**redirection de ports (NAT/PAT)**, créer 4 règles vers l'**IP locale réservée** du PC :

| Port externe | Port interne | Protocole |
|---|---|---|
| 80 | 80 | TCP |
| 443 | 443 | TCP |
| 7881 | 7881 | TCP |
| 7882 | 7882 | UDP |

**Rien d'autre.** Pas de DMZ, pas d'UPnP pour ce PC, pas de SSH. Vérifier aussi que l'accès à
l'interface de la Bbox depuis Internet est désactivé.

## 7. Mettre en ligne

Avant un cours :

```bash
cd serveur
sudo ./demarrer.sh
```

Vérifier : <https://nsi-saint-sernin.duckdns.org/api/sante> doit afficher `{"ok":true}` (la
première fois, le certificat HTTPS peut prendre une minute).

Après le cours : `sudo ./arreter.sh`. **En cas de doute** (comportement bizarre, attaque) :
`sudo ./arreter.sh` coupe tout immédiatement.

Journaux : `sudo docker compose logs -f` (dans `serveur/`), ou `sudo docker compose logs jetons`.
Les journaux n'affichent jamais de mot de passe ni de jeton, seulement le début des identifiants.

## 8. Vérifier depuis l'extérieur

Avec un téléphone **en 4G** (pas en Wi-Fi), ouvrir l'adresse `/api/sante` ci-dessus : ça doit répondre.
Puis vérifier qu'**aucun autre port** ne répond, par exemple avec une application de scan de ports
sur le téléphone en 4G : seuls 80, 443 et 7881 (TCP) doivent être ouverts.

## Mises à jour

- **Le système** : `sudo pacman -Syu` régulièrement (Arch est en mise à jour continue).
- **Les images Docker** sont épinglées sur une version précise dans `docker-compose.yml`
  (`livekit/livekit-server:v1.13.11`, `caddy:2.10.2-alpine`, `node:22.23-alpine`,
  `curlimages/curl:8.11.1`). Pour mettre à jour : changer le numéro de version, puis
  `sudo ./arreter.sh && sudo ./demarrer.sh`. Lire les notes de version de LiveKit avant un
  changement de version majeure.

## Comment le serveur décide qui entre

1. Le navigateur envoie son **jeton d'identité Firebase** au service jetons (`POST /api/jeton`).
2. Le service vérifie la **signature de Google** sur ce jeton : impossible de se faire passer pour quelqu'un d'autre.
3. Il lit la base Firebase **avec ce même jeton** (les règles `database.rules.json` s'appliquent) :
   compte validé ? banni ? admin / prof / hôte de la salle ?
4. Il fabrique un **jeton LiveKit** valable 10 minutes pour entrer dans **cette** salle, avec les
   droits adaptés : partage d'écran seulement pour l'hôte (et pour un participant quand l'hôte le lui
   demande, via `POST /api/partage`). Le rôle est inscrit dans le jeton par le serveur : personne ne
   peut le modifier depuis son navigateur.

Le service jetons n'a **aucun secret Firebase** : seulement les clés LiveKit.

Tests du service (sans Docker ni réseau) : `node --test serveur/jetons/`.

## Limites connues

- **L'IP publique de la maison est visible** des participants (la visio passe directement par elle).
  Décision des admins : accepté (tous les participants sont de la même ville). Pour la cacher plus
  tard : un petit serveur relais (VPS) en WireGuard.
- **Réseaux très filtrants** (certains réseaux de lycée) : si l'UDP 7882 est bloqué, LiveKit passe
  par le TCP 7881. Si même ce port est bloqué, la visio ne marche pas sur ce réseau (le tchat et le
  Python partagé, eux, fonctionnent toujours). Solution possible plus tard : un serveur TURN sur le port 443.
- **Débit** : environ 120 Mbit/s montants depuis la chambre pour 15 personnes. Caméras coupées
  par défaut, vignettes en basse définition : ça passe. Pour les vrais cours, se mettre en Ethernet
  ou près de la box si possible.
