// Génère database.rules.json à partir de outils/regles.template.jsonc.
//
// Les règles de la Realtime Database n'ont pas de fonctions : les mêmes conditions
// (« est admin », « est membre non banni », « a les pouvoirs d'hôte »…) reviennent partout.
// On les écrit une seule fois ici, et le modèle utilise des marqueurs @NOM@.
//
// Lancer depuis la racine du dépôt :   node outils/generer-regles.mjs
// Vérifier sans écrire (utile avant un commit) :   node outils/generer-regles.mjs --verifier

import { readFileSync, writeFileSync } from "node:fs";

// Suffixe des adresses techniques des comptes élèves (nom d'utilisateur + ce suffixe).
// Doit rester identique à DOMAINE_COMPTES dans assets/js/auth.js.
const DOMAINE_COMPTES = "@nsi-saint-sernin.firebaseapp.com";

const PROF_OU_ADMIN =
  "(auth.token.firebase.sign_in_provider === 'github.com' && (root.child('admins').child(auth.uid).exists() || root.child('profs').child(auth.uid).exists()))";

const MARQUEURS = {
  // Admin : connecté avec GitHub ET présent dans admins/.
  "@ADMIN@": "(auth.token.firebase.sign_in_provider === 'github.com' && root.child('admins').child(auth.uid).exists())",
  "@NON_BANNI@": "!root.child('bans').child(auth.uid).exists()",
  // Membre non banni : élève validé (liste blanche), prof ou admin.
  "@OK@": `(auth != null && !root.child('bans').child(auth.uid).exists() && (root.child('utilisateurs').child(auth.uid).child('statut').val() === 'actif' || ${PROF_OU_ADMIN}))`,
  // Pouvoirs d'hôte dans la salle $salon.
  "@HOTE@": `(root.child('salons').child($salon).child('hote').val() === auth.uid || ${PROF_OU_ADMIN})`,
  "@DOMAINE@": DOMAINE_COMPTES,
};

const racine = new URL("../", import.meta.url);
const modele = readFileSync(new URL("outils/regles.template.jsonc", racine), "utf8");

let resultat = modele;
for (const [marqueur, valeur] of Object.entries(MARQUEURS)) {
  resultat = resultat.split(marqueur).join(valeur);
}

const oublie = resultat.match(/@[A-Z_]+@/);
if (oublie) {
  console.error(`Marqueur inconnu dans le modèle : ${oublie[0]}`);
  process.exit(1);
}

// Vérifie que le résultat est un JSON valide une fois les commentaires retirés.
const sansCommentaires = resultat
  .split("\n")
  .filter((ligne) => !ligne.trim().startsWith("//"))
  .join("\n");
try {
  JSON.parse(sansCommentaires);
} catch (e) {
  console.error("Le modèle ne donne pas un JSON valide :", e.message);
  process.exit(1);
}

const entete = "// FICHIER GÉNÉRÉ par outils/generer-regles.mjs : ne pas modifier à la main.\n";
const sortie = entete + resultat;
const cible = new URL("database.rules.json", racine);

if (process.argv.includes("--verifier")) {
  const actuel = readFileSync(cible, "utf8");
  if (actuel !== sortie) {
    console.error("database.rules.json n'est pas à jour : lancer node outils/generer-regles.mjs");
    process.exit(1);
  }
  console.log("database.rules.json est à jour.");
} else {
  writeFileSync(cible, sortie);
  console.log("database.rules.json généré.");
}
