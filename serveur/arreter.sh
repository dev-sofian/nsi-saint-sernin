#!/usr/bin/env bash
# Coupe TOUT le serveur (en ligne et démo). Interrupteur d'urgence : en cas de doute, lancer ça.
#   sudo ./arreter.sh
set -euo pipefail
cd "$(dirname "$0")"
docker compose --profile en-ligne --profile demo down
echo "Serveur arrêté : plus rien n'écoute sur les ports 80, 443, 7881 et 7882."
