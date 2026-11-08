#!/usr/bin/env bash
# Installation complète sur le serveur Oracle (Ubuntu), à lancer UNE fois :
#   git clone https://github.com/dev-sofian/nsi-saint-sernin
#   cd nsi-saint-sernin/serveur
#   ./installer.sh <domaine>          ex : ./installer.sh nsi-st-sernin.duckdns.org
# Pour mettre à jour plus tard : git pull, puis relancer la même commande.
set -euo pipefail
DOMAINE=${1:?"Usage : ./installer.sh <domaine>"}
ICI=$(cd "$(dirname "$0")" && pwd)

# 1. Pare-feu interne d'Ubuntu sur Oracle (en plus des règles de la console Oracle) :
#    80 et 443 (pages web, HTTPS) en TCP, 443 et 10000 en UDP (vidéo).
ouvrir() {
  sudo iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT -p "$1" --dport "$2" -j ACCEPT
}
ouvrir tcp 80; ouvrir tcp 443; ouvrir udp 443; ouvrir udp 10000
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi

# 2. Docker
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi

# 3. Dossier Jitsi + lancement
"$ICI/preparer.sh" "$DOMAINE" "$HOME/jitsi"
cd "$HOME/jitsi"
sudo docker compose -f docker-compose.yml -f docker-compose.nsi.yml pull
sudo docker compose -f docker-compose.yml -f docker-compose.nsi.yml up -d

echo
echo "Jitsi démarre. Dans une minute, ouvre https://$DOMAINE/jeton/sante : tu dois voir {\"ok\":true}."
echo "Ensuite, mets ce domaine dans assets/js/firebase-config.js (voir docs/JITSI.md)."
