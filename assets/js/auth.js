// Comptes et rôles (Firebase Authentication + Realtime Database).
// Module partagé par toutes les pages : import { ecouterCompte, ... } from "./auth.js".
//
// Deux façons de se connecter :
//   - élèves : nom d'utilisateur + mot de passe. Le compte est créé « en attente » et ne
//     donne accès aux salles qu'une fois validé par un admin (liste blanche) ;
//   - profs et admins : GitHub.
//
// Rôles :
//   "admin" : connecté avec GitHub ET présent dans admins/ de la base
//   "prof"  : connecté avec GitHub ET présent dans profs/ de la base
//   "eleve" : tout le reste
//
// Attention : le rôle et le statut calculés ici servent uniquement à l'affichage.
// Les droits réels sont vérifiés par database.rules.json et par le serveur de visio.

import { configFirebase, firebaseConfigure } from "./firebase-config.js";

const VERSION_SDK = "10.14.1";
const URL_SDK = `https://www.gstatic.com/firebasejs/${VERSION_SDK}`;

export { firebaseConfigure };

// Firebase n'a pas de « nom d'utilisateur » : chaque élève reçoit une adresse technique
// nom + DOMAINE_COMPTES, qui ne reçoit jamais de courrier. Aucune vraie adresse n'est demandée.
// Doit rester identique à DOMAINE_COMPTES dans outils/generer-regles.mjs.
export const DOMAINE_COMPTES = "@nsi-saint-sernin.firebaseapp.com";

// Nom d'utilisateur : 3 à 20 caractères, minuscules, chiffres, _ et -.
const MOTIF_NOM = /^[a-z0-9_-]{3,20}$/;
export const MDP_MINIMUM = 10;

// 2 à 20 caractères : lettres (accents compris), chiffres, espace, _ . ' -
// Doit rester identique à la règle utilisateurs/$uid/pseudo de database.rules.json.
const MOTIF_PSEUDO = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9 _.'-]{2,20}$/;

// Code de vérification recopié sur le papier ou le formulaire : sans 0/O ni 1/I pour éviter
// les confusions à la lecture. Doit rester identique à la règle demandes/$uid/code.
const ALPHABET_CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function pseudoValide(pseudo) {
  return MOTIF_PSEUDO.test(pseudo);
}

export function normaliserNom(nom) {
  return (nom || "").trim().toLowerCase();
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

function nouveauCode() {
  const octets = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(octets, (o) => ALPHABET_CODE[o % ALPHABET_CODE.length]).join("");
}

// "K7QM4P" -> "K7Q-M4P" (plus facile à recopier)
export function formaterCode(code) {
  return code ? `${code.slice(0, 3)}-${code.slice(3)}` : "";
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

// Jeton d'identité de la personne connectée, envoyé au serveur de visio pour prouver qui elle est.
export async function jetonIdentite() {
  const fb = await chargerFirebase();
  if (!fb.auth.currentUser) throw new Error("non-connecte");
  return fb.auth.currentUser.getIdToken();
}

// ---------- Lecture du compte courant ----------

// Classe indiquée à l'inscription : utilisée pour créer la demande d'accès
// (le compte vient d'être créé, la demande est écrite juste après par lireCompte()).
let classeEnAttente = "";

function fournisseurDe(utilisateur) {
  return utilisateur.providerData[0]?.providerId || "inconnu";
}

async function lireCompte(fb, utilisateur) {
  const { db, d } = fb;
  const uid = utilisateur.uid;
  const fournisseur = fournisseurDe(utilisateur);
  const nom = fournisseur === "password" ? (utilisateur.email || "").replace(DOMAINE_COMPTES, "") : "";

  const lire = (chemin) => d.get(d.ref(db, chemin)).catch(() => null);
  const [ban, admin, prof] = await Promise.all([lire(`bans/${uid}`), lire(`admins/${uid}`), lire(`profs/${uid}`)]);
  const banni = Boolean(ban && ban.exists());

  let profil = await lire(`utilisateurs/${uid}`);

  // Première connexion : on crée le profil, toujours « en attente ».
  if (!banni && profil && !profil.exists()) {
    const nouveau = {
      pseudo: nom || pseudoDepuis(utilisateur.displayName),
      fournisseur,
      cree: d.serverTimestamp(),
      statut: "en_attente",
    };
    if (nom) nouveau.nom = nom;
    try {
      await d.set(d.ref(db, `utilisateurs/${uid}`), nouveau);
      profil = await lire(`utilisateurs/${uid}`);
    } catch (e) {
      console.error("Création du profil impossible", e);
    }
  }

  const infos = profil && profil.exists() ? profil.val() : {};
  // Profil créé avant la liste blanche (sans statut) : on le complète, sinon les règles
  // refuseraient toute modification (ex : changer de pseudo).
  if (!banni && profil && profil.exists() && !infos.statut) {
    await d.update(d.ref(db, `utilisateurs/${uid}`), { statut: "en_attente" })
      .catch((e) => console.warn("Mise à niveau du profil impossible", e));
  }
  const statut = infos.statut || "en_attente";

  let role = "eleve";
  if (fournisseur === "github.com" && admin && admin.exists()) role = "admin";
  else if (fournisseur === "github.com" && prof && prof.exists()) role = "prof";

  // Élève en attente : sa demande d'accès (avec le code à recopier). On la crée si besoin.
  let demande = null;
  if (!banni && fournisseur === "password" && statut === "en_attente") {
    const snap = await lire(`demandes/${uid}`);
    if (snap && snap.exists()) {
      demande = snap.val();
    } else if (snap) {
      const nouvelle = { nom, code: nouveauCode(), classe: classeEnAttente.slice(0, 20), date: d.serverTimestamp() };
      try {
        await d.set(d.ref(db, `demandes/${uid}`), nouvelle);
        demande = { ...nouvelle, date: Date.now() };
      } catch (e) {
        console.error("Création de la demande impossible", e);
      }
    }
    classeEnAttente = "";
  }

  return {
    uid,
    fournisseur,
    nom,
    pseudo: infos.pseudo || nom || pseudoDepuis(utilisateur.displayName),
    role,
    statut,
    // Membre = peut entrer dans les salles (élève validé, prof ou admin) et n'est pas banni.
    membre: !banni && (role !== "eleve" || statut === "actif"),
    banni,
    motifBan: banni ? (ban.val().motif || "") : "",
    demande,
  };
}

// ---------- API publique ----------

const abonnes = new Set();
let compteCourant; // undefined = pas encore connu, null = déconnecté
let ecouteLancee = false;
let arreterSuivi = () => {};

function prevenir() {
  for (const fn of abonnes) {
    try { fn(compteCourant); } catch (e) { console.error(e); }
  }
}

// Suit en direct le statut (validation par un admin) et le ban de la personne connectée :
// la page se met à jour sans avoir à se reconnecter.
function suivreCompte(fb, utilisateur) {
  arreterSuivi();
  const { d, db } = fb;
  const uid = utilisateur.uid;
  let premierStatut = true;
  let premierBan = true;
  const relire = async () => {
    if (fb.auth.currentUser?.uid !== uid) return;
    compteCourant = await lireCompte(fb, utilisateur);
    prevenir();
  };
  const arrets = [
    d.onValue(d.ref(db, `utilisateurs/${uid}/statut`), () => {
      if (premierStatut) { premierStatut = false; return; }
      relire();
    }, () => {}),
    d.onValue(d.ref(db, `bans/${uid}`), () => {
      if (premierBan) { premierBan = false; return; }
      relire();
    }, () => {}),
  ];
  arreterSuivi = () => { arrets.forEach((arreter) => arreter()); arreterSuivi = () => {}; };
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
      arreterSuivi();
      compteCourant = utilisateur ? await lireCompte(fb, utilisateur) : null;
      prevenir();
      if (utilisateur) suivreCompte(fb, utilisateur);
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

// Vérifie un mot de passe choisi par un élève ; renvoie un code d'erreur ou null.
export function problemeMotDePasse(mdp, nom) {
  if ((mdp || "").length < MDP_MINIMUM) return "mdp-trop-court";
  if (nom && mdp.toLowerCase().includes(nom)) return "mdp-contient-nom";
  return null;
}

// Élève : création du compte (en attente de validation par un admin).
export async function inscrire(nom, mdp, classe = "") {
  nom = normaliserNom(nom);
  if (!MOTIF_NOM.test(nom)) throw new Error("nom-invalide");
  const probleme = problemeMotDePasse(mdp, nom);
  if (probleme) throw new Error(probleme);
  const fb = await chargerFirebase();
  classeEnAttente = (classe || "").trim();
  try {
    await fb.a.createUserWithEmailAndPassword(fb.auth, nom + DOMAINE_COMPTES, mdp);
  } catch (e) {
    classeEnAttente = "";
    throw e;
  }
}

// Élève : connexion avec nom d'utilisateur + mot de passe.
export async function seConnecterMotDePasse(nom, mdp) {
  nom = normaliserNom(nom);
  if (!MOTIF_NOM.test(nom)) throw new Error("identifiants");
  const fb = await chargerFirebase();
  await fb.a.signInWithEmailAndPassword(fb.auth, nom + DOMAINE_COMPTES, mdp);
}

// Admins et profs : connexion GitHub (fenêtre surgissante).
export async function seConnecterGitHub() {
  const fb = await chargerFirebase();
  const fournisseur = new fb.a.GithubAuthProvider();
  await fb.a.signInWithPopup(fb.auth, fournisseur);
}

export async function seDeconnecter() {
  const fb = await chargerFirebase();
  await fb.a.signOut(fb.auth);
}

// Élève : changer son mot de passe (l'ancien est redemandé par sécurité).
export async function changerMotDePasse(ancien, nouveau) {
  const fb = await chargerFirebase();
  const utilisateur = fb.auth.currentUser;
  if (!utilisateur || fournisseurDe(utilisateur) !== "password") throw new Error("non-connecte");
  const nom = utilisateur.email.replace(DOMAINE_COMPTES, "");
  const probleme = problemeMotDePasse(nouveau, nom);
  if (probleme) throw new Error(probleme);
  const identifiants = fb.a.EmailAuthProvider.credential(utilisateur.email, ancien);
  await fb.a.reauthenticateWithCredential(utilisateur, identifiants);
  await fb.a.updatePassword(utilisateur, nouveau);
}

export async function changerPseudo(pseudo) {
  pseudo = (pseudo || "").trim();
  if (!pseudoValide(pseudo)) throw new Error("pseudo-invalide");
  const fb = await chargerFirebase();
  const utilisateur = fb.auth.currentUser;
  if (!utilisateur) throw new Error("non-connecte");
  await fb.d.update(fb.d.ref(fb.db, `utilisateurs/${utilisateur.uid}`), { pseudo });
  if (compteCourant) {
    compteCourant = { ...compteCourant, pseudo };
    prevenir();
  }
}

// Message d'erreur lisible à partir d'une erreur Firebase ou du serveur de visio.
export function messageErreur(e) {
  let code = (e && (e.code || e.message)) || "";
  if (String(code).toUpperCase().includes("PERMISSION_DENIED")) code = "PERMISSION_DENIED";
  const messages = {
    "pseudo-invalide": "Le pseudo doit faire 2 à 20 caractères (lettres, chiffres, espace, _ . ' -).",
    "nom-invalide": "Le nom d'utilisateur doit faire 3 à 20 caractères : lettres minuscules sans accent, chiffres, _ ou -.",
    "mdp-trop-court": `Le mot de passe doit faire au moins ${MDP_MINIMUM} caractères.`,
    "mdp-contient-nom": "Le mot de passe ne doit pas contenir ton nom d'utilisateur.",
    "mdp-differents": "Les deux mots de passe ne sont pas identiques.",
    "identifiants": "Nom d'utilisateur ou mot de passe incorrect.",
    "firebase-non-configure": "Les comptes ne sont pas encore activés sur ce site.",
    "auth/email-already-in-use": "Ce nom d'utilisateur est déjà pris.",
    "auth/invalid-credential": "Nom d'utilisateur ou mot de passe incorrect.",
    "auth/invalid-login-credentials": "Nom d'utilisateur ou mot de passe incorrect.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/user-not-found": "Nom d'utilisateur ou mot de passe incorrect.",
    "auth/invalid-email": "Nom d'utilisateur invalide.",
    "auth/weak-password": "Mot de passe trop faible.",
    "auth/too-many-requests": "Trop d'essais : attends quelques minutes avant de réessayer.",
    "auth/user-disabled": "Ce compte a été désactivé par un administrateur.",
    "auth/requires-recent-login": "Reconnecte-toi puis recommence.",
    "auth/popup-blocked": "La fenêtre de connexion a été bloquée : autorise les fenêtres surgissantes pour ce site.",
    "auth/popup-closed-by-user": "Fenêtre de connexion fermée avant la fin.",
    "auth/cancelled-popup-request": "Connexion annulée.",
    "auth/account-exists-with-different-credential": "Un compte existe déjà avec cette adresse via un autre service.",
    "auth/unauthorized-domain": "Ce domaine n'est pas autorisé dans Firebase (voir docs/FIREBASE.md, étape 4).",
    "auth/operation-not-allowed": "Ce mode de connexion n'est pas activé dans Firebase.",
    "auth/network-request-failed": "Problème de réseau, réessaie.",
    "PERMISSION_DENIED": "Action refusée : tu n'as pas les droits pour ça.",
    "non-connecte": "Tu dois être connecté.",
    "livekit-absent": "La bibliothèque de visio n'a pas pu être chargée (réseau du lycée ou bloqueur de publicité ?).",
    "serveur-injoignable": "Le serveur de visio ne répond pas : il est peut-être éteint (il n'est allumé que pendant les cours).",
  };
  if (messages[code]) return messages[code];
  // Erreurs du serveur de visio : déjà rédigées en français.
  if (e && e.serveur && e.message) return e.message;
  return "Une erreur est survenue, réessaie.";
}

export const NOMS_ROLES = { admin: "Admin", prof: "Prof", eleve: "Élève" };
export const NOMS_STATUTS = { actif: "Validé", en_attente: "En attente" };
