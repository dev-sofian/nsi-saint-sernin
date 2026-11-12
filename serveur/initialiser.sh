#!/usr/bin/env bash
# Prépare le serveur la première fois : crée .env à partir de .env.exemple et génère
# les clés LiveKit. Sans risque à relancer : ne remplace jamais une clé existante.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  cp .env.exemple .env
  echo "Fichier .env créé à partir de .env.exemple."
fi
chmod 600 .env

# $1 caractères aléatoires (lettres et chiffres)
aleatoire() { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$1" || true; }

if ! grep -q '^LIVEKIT_CLE=.\+' .env; then
  sed -i "s|^LIVEKIT_CLE=.*|LIVEKIT_CLE=API$(aleatoire 12)|" .env
  echo "Clé LiveKit générée."
fi
if ! grep -q '^LIVEKIT_SECRET=.\+' .env; then
  sed -i "s|^LIVEKIT_SECRET=.*|LIVEKIT_SECRET=$(aleatoire 48)|" .env
  echo "Secret LiveKit généré."
fi

mkdir -p data/caddy data/caddy-config

echo
echo "À faire maintenant : ouvrir serveur/.env et remplir DOMAINE, DUCKDNS_SOUS_DOMAINE et DUCKDNS_JETON."
echo "Ensuite : sudo ./demo.sh (test local) ou sudo ./demarrer.sh (en ligne). Voir docs/SERVEUR.md."
