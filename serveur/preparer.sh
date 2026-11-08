#!/usr/bin/env bash
# Prépare (ou met à jour) le dossier Jitsi de NSI St Sernin, sans rien lancer.
#   ./preparer.sh <domaine> [dossier]       ex : ./preparer.sh nsi-st-sernin.duckdns.org ~/jitsi
# Réutilisable : les mots de passe et le secret déjà générés sont conservés.
set -euo pipefail

DOMAINE=${1:?"Usage : ./preparer.sh <domaine> [dossier]"}
DOSSIER=$(realpath -m "${2:-$HOME/jitsi}")
VERSION_JITSI=${VERSION_JITSI:-stable-11031}   # version de docker-jitsi-meet
ICI=$(cd "$(dirname "$0")" && pwd)
CONFIG_SITE="$ICI/../assets/js/firebase-config.js"

# Valeurs Firebase lues dans la config du site (modifiables par variables d'environnement)
lire_config_site() { sed -n "s/^ *$1: *\"\(.*\)\".*/\1/p" "$CONFIG_SITE" | head -1; }
FIREBASE_PROJET=${FIREBASE_PROJET:-$(lire_config_site projectId)}
FIREBASE_DATABASE_URL=${FIREBASE_DATABASE_URL:-$(lire_config_site databaseURL)}
ORIGINES_AUTORISEES=${ORIGINES_AUTORISEES:-https://dev-sofian.github.io,http://127.0.0.1:5500,http://localhost:5500}
IP_PUBLIQUE=${IP_PUBLIQUE:-$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)}

echo "Domaine        : $DOMAINE"
echo "Dossier        : $DOSSIER"
echo "Jitsi          : $VERSION_JITSI"
echo "Projet Firebase: $FIREBASE_PROJET"
echo "Base           : $FIREBASE_DATABASE_URL"
echo "Site autorisé  : $ORIGINES_AUTORISEES"
echo "IP publique    : $IP_PUBLIQUE"
[ -n "$FIREBASE_PROJET" ] && [ -n "$FIREBASE_DATABASE_URL" ] || { echo "Config Firebase introuvable" >&2; exit 1; }

# 1. Jitsi officiel (docker-jitsi-meet), téléchargé une seule fois
if [ ! -f "$DOSSIER/docker-compose.yml" ]; then
  mkdir -p "$DOSSIER"
  curl -fsSL "https://github.com/jitsi/docker-jitsi-meet/archive/refs/tags/$VERSION_JITSI.tar.gz" \
    | tar -xz -C "$DOSSIER" --strip-components=1
fi
cd "$DOSSIER"
if [ ! -f .env ]; then
  cp env.example .env
  ./gen-passwords.sh
fi

# regler CLE VALEUR : remplace la ligne CLE=… (même commentée) dans .env, ou l'ajoute
regler() {
  if grep -qE "^#?$1=" .env; then sed -i "s|^#\?$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
valeur() { sed -n "s/^$1=//p" .env | head -1; }

# 2. Réglages de base : Caddy fait le HTTPS devant Jitsi, qui reste en HTTP interne
regler CONFIG "$DOSSIER/config"
regler HTTP_PORT "127.0.0.1:8000"
regler HTTPS_PORT "127.0.0.1:8443"
regler TZ "Europe/Paris"
regler PUBLIC_URL "https://$DOMAINE"
regler DISABLE_HTTPS 1
regler ENABLE_HTTP_REDIRECT 0
regler ENABLE_LETSENCRYPT 0
regler JVB_ADVERTISE_IPS "$IP_PUBLIQUE"
regler ENABLE_WELCOME_PAGE 0
regler ENABLE_IPV6 0          # le réseau Oracle par défaut est en IPv4 seulement

# 3. Entrée réservée aux personnes qui ont un jeton (donné par le service de jetons)
regler ENABLE_AUTH 1
regler AUTH_TYPE jwt
regler ENABLE_GUESTS 0
regler JWT_APP_ID nsi-st-sernin
[ -n "$(valeur JWT_APP_SECRET)" ] || regler JWT_APP_SECRET "$(openssl rand -hex 32)"
# Modérateur seulement si le jeton le dit (hôte de la salle, prof, admin), pas « tout
# le monde » ni « le premier arrivé ».
regler XMPP_MUC_MODULES token_affiliation
regler ENABLE_AUTO_OWNER false
regler JICOFO_ENABLE_AUTH false   # sinon Jicofo rend modérateur tout jeton valide (Prosody vérifie toujours les jetons)

# 4. Réglages propres à NSI St Sernin (Caddy et service de jetons)
regler DOMAINE "$DOMAINE"
regler FIREBASE_PROJET "$FIREBASE_PROJET"
regler FIREBASE_DATABASE_URL "$FIREBASE_DATABASE_URL"
regler ORIGINES_AUTORISEES "$ORIGINES_AUTORISEES"

# 5. Nos fichiers à côté de ceux de Jitsi
cp "$ICI/docker-compose.nsi.yml" "$ICI/Caddyfile" .
rm -rf jeton && cp -r "$ICI/jeton" jeton
chmod 600 .env
mkdir -p config/{web,transcripts,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb,jigasi,jibri,caddy/data,caddy/config}

echo
echo "Prêt. Pour lancer : cd $DOSSIER && docker compose -f docker-compose.yml -f docker-compose.nsi.yml up -d"
