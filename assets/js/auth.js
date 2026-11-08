// Comptes et rôles (Firebase Authentication + Realtime Database).
// Module partagé par toutes les pages : import { ecouterCompte, ... } from "./auth.js".
//
// Rôles :
//   "admin" : connecté avec GitHub ET présent dans admins/ de la base
//   "prof"  : connecté avec GitHub ET présent dans profs/ de la base
//   "eleve" : tout le reste (connexion anonyme avec un pseudo, ou GitHub sans rôle)
//
// Attention : le rôle calculé ici sert uniquement à l'affichage. Les droits réels
// sont vérifiés par database.rules.json.

import { configFirebase, firebaseConfigure } from "./firebase-config.js";

const VERSION_SDK = "10.14.1";
const URL_SDK = `https://www.gstatic.com/firebasejs/${VERSION_SDK}`;

export { firebaseConfigure };

// 2 à 20 caractères : lettres (accents compris), chiffres, espace, _ . ' -
// Doit rester identique à la règle utilisateurs/$uid/pseudo de database.rules.json.
const MOTIF_PSEUDO = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 _.'-]{2,20}$/;

export function pseudoValide(pseudo) {
  return MOTIF_PSEUDO.test(pseudo);
}

// Transforme un nom quelconque (ex : nom GitHub) en pseudo accepté par les règles.
function pseudoDepuis(nom) {
  const propre = (nom || "")
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9 _.'-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20)
    .trim();
  return pseudoValide(propre) ? propre : "Utilisateur";
}

// ---------- Chargement paresseux du SDK Firebase ----------

let promesseFirebase = null;

function chargerFirebase() {
  if (!firebaseConfigure) return Promise.reject(new Error("firebase-non-configure"));
  if (!promesseFirebase) {
    promesseFirebase = (async () => {
      const [appMod, authMod, dbMod] = await Promise.all([
        import(`${URL_SDK}/firebase-app.js`),
        import(`${URL_SDK}/firebase-auth.js`),
        import(`${URL_SDK}/firebase-database.js`),
      ]);
      const app = appMod.initializeApp(configFirebase);
      const auth = authMod.getAuth(app);
      auth.languageCode = "fr";
      const db = dbMod.getDatabase(app);
      // a = fonctions d'authentification, d = fonctions de la base (ref, get, set, onValue…)
      return { auth, db, a: authMod, d: dbMod };
    })();
  }
  return promesseFirebase;
}

// Accès au SDK pour les autres modules (ex : python-partage.js).
// Renvoie { auth, db, a, d } : a = fonctions d'authentification, d = fonctions de la base.
export function firebase() {
  return chargerFirebase();
}

// ---------- Lecture du compte courant ----------

// Pseudo choisi par un élève juste avant sa connexion anonyme : utilisé pour créer
// son profil (le compte anonyme n'a pas encore de nom à ce moment-là).
let pseudoEnAttente = null;

async function lireCompte(fb, utilisateur) {
  const { db, d } = fb;
  const uid = utilisateur.uid;
  const fournisseur = utilisateur.isAnonymous
    ? "anonymous"
    : (utilisateur.providerData[0]?.providerId || "inconnu");

  const lire = (dossier) => d.get(d.ref(db, `${dossier}/${uid}`)).catch(() => null);
  const [ban, admin, prof] = await Promise.all([lire("bans"), lire("admins"), lire("profs")]);

  const banni = Boolean(ban && ban.exists());
  let profil = await lire("utilisateurs"); // un banni peut lire son propre profil

  // Première connexion : on crée le profil.
  if (!banni && profil && !profil.exists()) {
    const pseudo = pseudoEnAttente || pseudoDepuis(utilisateur.displayName);
    pseudoEnAttente = null;
    try {
      await d.set(d.ref(db, `utilisateurs/${uid}`), {
        pseudo,
        fournisseur,
        cree: d.serverTimestamp(),
      });
      profil = await lire("utilisateurs");
    } catch (e) {
      console.error("Création du profil impossible", e);
    }
  }

  let role = "eleve";
  if (fournisseur === "github.com" && admin && admin.exists()) role = "admin";
  else if (fournisseur === "github.com" && prof && prof.exists()) role = "prof";

  return {
    uid,
    fournisseur,
    anonyme: utilisateur.isAnonymous,
    pseudo: profil && profil.exists() ? profil.val().pseudo : pseudoDepuis(utilisateur.displayName),
    role,
    banni,
    motifBan: banni ? (ban.val().motif || "") : "",
  };
}

// ---------- API publique ----------

const abonnes = new Set();
let compteCourant; // undefined = pas encore connu, null = déconnecté
let ecouteLancee = false;

function prevenir() {
  for (const fn of abonnes) {
    try { fn(compteCourant); } catch (e) { console.error(e); }
  }
}

async function demarrerEcoute() {
  if (ecouteLancee) return;
  ecouteLancee = true;
  if (!firebaseConfigure) {
    compteCourant = null;
    prevenir();
    return;
  }
  try {
    const fb = await chargerFirebase();
    fb.a.onAuthStateChanged(fb.auth, async (utilisateur) => {
      compteCourant = utilisateur ? await lireCompte(fb, utilisateur) : null;
      prevenir();
    });
  } catch (e) {
    console.error("Firebase indisponible", e);
    compteCourant = null;
    prevenir();
  }
}

// Appelle fn(compte) maintenant (si connu) puis à chaque changement.
// compte vaut null si personne n'est connecté.
export function ecouterCompte(fn) {
  abonnes.add(fn);
  if (compteCourant !== undefined) fn(compteCourant);
  demarrerEcoute();
  return () => abonnes.delete(fn);
}

// Élève : connexion anonyme avec un pseudo.
export async function seConnecterAnonyme(pseudo) {
  pseudo = (pseudo || "").trim();
  if (!pseudoValide(pseudo)) throw new Error("pseudo-invalide");
  const fb = await chargerFirebase();
  pseudoEnAttente = pseudo; // le profil sera créé par lireCompte() avec ce pseudo
  try {
    await fb.a.signInAnonymously(fb.auth);
  } catch (e) {
    pseudoEnAttente = null;
    throw e;
  }
}

// Admins et profs : connexion GitHub (fenêtre surgissante).
export async function seConnecterGitHub() {
  const fb = await chargerFirebase();
  const fournisseur = new fb.a.GithubAuthProvider();
  await fb.a.signInWithPopup(fb.auth, fournisseur);
}

// Jeton Firebase (JWT signé par Google) de la personne connectée, pour prouver son identité
// à un autre service (ex : le service de jetons de notre serveur de visio).
export async function jetonFirebase() {
  const fb = await chargerFirebase();
  if (!fb.auth.currentUser) throw new Error("non-connecte");
  return fb.auth.currentUser.getIdToken();
}

export async function seDeconnecter() {
  const fb = await chargerFirebase();
  await fb.a.signOut(fb.auth);
}

export async function changerPseudo(pseudo) {
  pseudo = (pseudo || "").trim();
  if (!pseudoValide(pseudo)) throw new Error("pseudo-invalide");
  const fb = await chargerFirebase();
  const utilisateur = fb.auth.currentUser;
  if (!utilisateur) throw new Error("non-connecte");
  const ref = fb.d.ref(fb.db, `utilisateurs/${utilisateur.uid}`);
  const existe = (await fb.d.get(ref)).exists();
  if (existe) {
    await fb.d.update(ref, { pseudo });
  } else {
    await fb.d.set(ref, {
      pseudo,
      fournisseur: utilisateur.isAnonymous ? "anonymous" : utilisateur.providerData[0]?.providerId,
      cree: fb.d.serverTimestamp(),
    });
  }
  if (compteCourant) {
    compteCourant = { ...compteCourant, pseudo };
    prevenir();
  }
}

// Message d'erreur lisible à partir d'une erreur Firebase.
export function messageErreur(e) {
  let code = (e && (e.code || e.message)) || "";
  if (String(code).toUpperCase().includes("PERMISSION_DENIED")) code = "PERMISSION_DENIED";
  const messages = {
    "pseudo-invalide": "Le pseudo doit faire 2 à 20 caractères (lettres, chiffres, espace, _ . ' -).",
    "firebase-non-configure": "Les comptes ne sont pas encore activés sur ce site.",
    "auth/popup-blocked": "La fenêtre de connexion a été bloquée : autorise les fenêtres surgissantes pour ce site.",
    "auth/popup-closed-by-user": "Fenêtre de connexion fermée avant la fin.",
    "auth/cancelled-popup-request": "Connexion annulée.",
    "auth/account-exists-with-different-credential": "Un compte existe déjà avec cette adresse via un autre service.",
    "auth/unauthorized-domain": "Ce domaine n'est pas autorisé dans Firebase (voir docs/FIREBASE.md, étape 4).",
    "auth/operation-not-allowed": "Ce mode de connexion n'est pas activé dans Firebase.",
    "auth/network-request-failed": "Problème de réseau, réessaie.",
    "PERMISSION_DENIED": "Action refusée : tu n'as pas les droits pour ça.",
    "non-connecte": "Tu dois être connecté.",
  };
  return messages[code] || "Une erreur est survenue, réessaie.";
}

export const NOMS_ROLES = { admin: "Admin", prof: "Prof", eleve: "Élève" };
