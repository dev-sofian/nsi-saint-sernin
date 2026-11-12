// Réglages du site à remplir par les admins. Rien de secret ici : ce fichier est public.

// Adresse du serveur de visio auto-hébergé (PC de Sofian, voir docs/SERVEUR.md).
// = https:// + DOMAINE choisi dans serveur/.env (ex : https://nsi-saint-sernin.duckdns.org).
// Vide = visio indisponible sur le site en ligne (le reste fonctionne).
export const URL_SERVEUR_VISIO = "https://nsi-saint-sernin.duckdns.org";

// Formulaire Google pour les élèves qui ne peuvent pas remettre leur papier en main propre.
// Il doit demander UNIQUEMENT : nom d'utilisateur, code de vérification, classe.
// JAMAIS de mot de passe (Google l'interdit, et l'admin ne doit pas le connaître).
export const LIEN_FORMULAIRE_ACCES = "";

// En local (Live Server, mode démo), on utilise le serveur de démo lancé sur le même PC
// par serveur/demo.sh, quelle que soit la valeur ci-dessus.
const EN_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
export const URL_SERVEUR_DEMO = "http://localhost:8090";

export function urlServeurVisio() {
  return EN_LOCAL ? URL_SERVEUR_DEMO : URL_SERVEUR_VISIO;
}
