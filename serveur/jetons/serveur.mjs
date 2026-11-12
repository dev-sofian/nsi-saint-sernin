// Point d'entrée du service « jetons » (lancé par docker-compose.yml, voir docs/SERVEUR.md).
// Toute la configuration vient des variables d'environnement (fichier serveur/.env).

import { creerApp } from "./app.mjs";
import { sourceClesGoogle } from "./jwt.mjs";

function variable(nom, defaut) {
  const valeur = process.env[nom] ?? defaut;
  if (valeur === undefined || valeur === "") {
    console.error(`Variable ${nom} manquante dans serveur/.env (lancer serveur/initialiser.sh).`);
    process.exit(1);
  }
  return valeur;
}

const config = {
  livekitCle: variable("LIVEKIT_CLE"),
  livekitSecret: variable("LIVEKIT_SECRET"),
  livekitInterne: variable("LIVEKIT_INTERNE", "http://127.0.0.1:7880"),
  domaine: variable("DOMAINE", "localhost"),
  firebaseProjet: variable("FIREBASE_PROJET"),
  firebaseBdd: variable("FIREBASE_BDD").replace(/\/$/, ""),
  origines: variable("ORIGINES").split(",").map((o) => o.trim()).filter(Boolean),
  obtenirCles: sourceClesGoogle(),
};

if (config.livekitSecret.length < 32) {
  console.error("LIVEKIT_SECRET doit faire au moins 32 caractères (relancer serveur/initialiser.sh).");
  process.exit(1);
}

const port = Number(variable("PORT", "8090"));
const hote = variable("HOTE", "127.0.0.1"); // jamais exposé directement : Caddy est devant

const serveur = creerApp(config);
serveur.listen(port, hote, () => {
  console.log(`Service jetons prêt sur http://${hote}:${port} (sites autorisés : ${config.origines.join(", ")})`);
});

// Arrêt propre quand Docker arrête le conteneur.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => serveur.close(() => process.exit(0)));
}
