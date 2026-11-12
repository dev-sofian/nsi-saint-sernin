// Appels au serveur de visio auto-hébergé (serveur/jetons).
// Chaque appel envoie le jeton d'identité Firebase : le serveur vérifie lui-même qui appelle,
// s'il est membre validé, non banni, hôte de la salle… avant d'agir.
//
//   const { jeton, url } = await appelerServeur("/api/jeton", { salle: "nsi-terminale-b" });

import { jetonIdentite } from "./auth.js";
import { urlServeurVisio } from "./site-config.js";

export function serveurConfigure() {
  return Boolean(urlServeurVisio());
}

export async function appelerServeur(chemin, corps = {}) {
  const base = urlServeurVisio();
  if (!base) throw Object.assign(new Error("Le serveur de visio n'est pas encore configuré (assets/js/site-config.js)."), { serveur: true });
  const jeton = await jetonIdentite();
  let reponse;
  try {
    reponse = await fetch(base + chemin, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton}` },
      body: JSON.stringify(corps),
    });
  } catch (e) {
    throw new Error("serveur-injoignable");
  }
  let donnees = {};
  try { donnees = await reponse.json(); } catch (e) { /* réponse vide */ }
  if (!reponse.ok) {
    throw Object.assign(new Error(donnees.erreur || `Erreur du serveur (${reponse.status}).`), { serveur: true, statut: reponse.status });
  }
  return donnees;
}
