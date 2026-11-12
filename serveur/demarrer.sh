#!/usr/bin/env bash
# Met le serveur de visio EN LIGNE (accessible depuis Internet). À lancer avant un cours.
#   sudo ./demarrer.sh
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Pas de fichier .env : lance d'abord ./initialiser.sh"
  exit 1
fi
for variable in DOMAINE DUCKDNS_SOUS_DOMAINE DUCKDNS_JETON LIVEKIT_CLE LIVEKIT_SECRET; do
  if ! grep -q "^${variable}=.\+" .env; then
    echo "${variable} est vide dans serveur/.env : remplis-le d'abord (docs/SERVEUR.md)."
    exit 1
  fi
done
if ! docker info >/dev/null 2>&1; then
  echo "Docker ne répond pas : lance ce script avec sudo, et vérifie « systemctl status docker »."
  exit 1
fi
if ! command -v ufw >/dev/null; then
  echo "Le pare-feu ufw n'est pas installé : sudo pacman -S ufw (docs/SERVEUR.md, étape « Pare-feu »)."
  exit 1
fi
if ! LC_ALL=C ufw status | grep -q "Status: active"; then
  echo "ATTENTION : le pare-feu ufw n'est pas actif. Active-le avant de mettre le serveur en ligne"
  echo "(docs/SERVEUR.md, étape « Pare-feu »). Arrêt."
  exit 1
fi

# Dossiers du certificat HTTPS : Caddy tourne en root SANS ses super-pouvoirs (cap_drop: ALL),
# il ne peut donc écrire que dans des dossiers qui appartiennent à root.
mkdir -p data/caddy data/caddy-config
chown -R 0:0 data/caddy data/caddy-config

# Au cas où la démo tournerait encore (mêmes ports).
docker compose --profile demo stop livekit-demo >/dev/null 2>&1 || true
docker compose --profile en-ligne up -d --remove-orphans

source <(grep '^DOMAINE=' .env)
echo
echo "Serveur en ligne : https://${DOMAINE}/api/sante doit afficher {\"ok\":true}"
echo "(la première fois, le certificat HTTPS peut prendre une minute)."
echo "Journaux : sudo docker compose logs -f     Arrêt : sudo ./arreter.sh"
