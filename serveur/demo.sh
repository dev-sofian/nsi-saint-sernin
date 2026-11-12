#!/usr/bin/env bash
# Mode DÉMO : tout tourne sur ce PC, rien n'est accessible depuis Internet.
# Pour présenter le projet au vidéoprojecteur, ou tester avant de mettre en ligne.
#   sudo ./demo.sh
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Pas de fichier .env : lance d'abord ./initialiser.sh"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker ne répond pas : lance ce script avec sudo."
  exit 1
fi

# Le mode en ligne utilise les mêmes ports : on l'arrête.
docker compose --profile en-ligne stop caddy livekit duckdns >/dev/null 2>&1 || true
docker compose --profile demo up -d --remove-orphans jetons livekit-demo

echo
echo "Démo prête. Dans VS Code : clic droit sur index.html → « Open with Live Server »,"
echo "puis page Visio. Le site détecte tout seul qu'il est en local et utilise ce serveur."
echo "Arrêt : sudo ./arreter.sh"
