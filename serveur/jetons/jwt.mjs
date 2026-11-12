// Jetons JWT, sans aucune dépendance (module node:crypto uniquement).
//
// - signerHS256 : fabrique les jetons LiveKit (signés avec le secret LiveKit du fichier .env).
// - verifierJetonFirebase : vérifie le jeton d'identité envoyé par le navigateur
//   (signé par Google en RS256) pour savoir avec certitude QUI appelle le serveur.

import crypto from "node:crypto";

export function base64url(donnees) {
  return Buffer.from(donnees).toString("base64url");
}

function decoder(partie) {
  return JSON.parse(Buffer.from(partie, "base64url").toString("utf8"));
}

export function signerHS256(contenu, secret) {
  const entete = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corps = base64url(JSON.stringify(contenu));
  const signature = crypto.createHmac("sha256", secret).update(`${entete}.${corps}`).digest("base64url");
  return `${entete}.${corps}.${signature}`;
}

export class ErreurJeton extends Error {}

// Transforme un certificat X.509 ou une clé publique PEM en objet clé utilisable.
export function clePublique(pem) {
  if (pem.includes("BEGIN CERTIFICATE")) return new crypto.X509Certificate(pem).publicKey;
  return crypto.createPublicKey(pem);
}

// Clés publiques de Google qui signent les jetons Firebase ; elles changent régulièrement,
// on les garde en mémoire le temps indiqué par Google (Cache-Control: max-age).
const URL_CLES_GOOGLE = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export function sourceClesGoogle(url = URL_CLES_GOOGLE) {
  let cles = null;
  let expire = 0;
  return async function obtenirCles() {
    if (cles && Date.now() < expire) return cles;
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error(`Clés Google indisponibles (${reponse.status})`);
    const brut = await reponse.json();
    const age = Number(/max-age=(\d+)/.exec(reponse.headers.get("cache-control") || "")?.[1] || 3600);
    cles = new Map(Object.entries(brut).map(([kid, pem]) => [kid, clePublique(pem)]));
    expire = Date.now() + Math.min(age, 6 * 3600) * 1000;
    return cles;
  };
}

// Vérifie un jeton d'identité Firebase et renvoie son contenu (uid = contenu.sub).
// Règles officielles : https://firebase.google.com/docs/auth/admin/verify-id-tokens
export async function verifierJetonFirebase(jeton, { projet, obtenirCles, maintenant = Date.now() }) {
  const parties = String(jeton || "").split(".");
  if (parties.length !== 3) throw new ErreurJeton("jeton mal formé");
  let entete, contenu;
  try {
    entete = decoder(parties[0]);
    contenu = decoder(parties[1]);
  } catch (e) {
    throw new ErreurJeton("jeton illisible");
  }
  if (entete.alg !== "RS256") throw new ErreurJeton("algorithme refusé");

  const cles = await obtenirCles();
  const cle = cles.get(entete.kid);
  if (!cle) throw new ErreurJeton("clé de signature inconnue");
  const valide = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${parties[0]}.${parties[1]}`),
    cle,
    Buffer.from(parties[2], "base64url"),
  );
  if (!valide) throw new ErreurJeton("signature invalide");

  const s = Math.floor(maintenant / 1000);
  const tolerance = 30; // secondes : horloges légèrement décalées
  if (contenu.aud !== projet) throw new ErreurJeton("jeton d'un autre projet");
  if (contenu.iss !== `https://securetoken.google.com/${projet}`) throw new ErreurJeton("émetteur inconnu");
  if (typeof contenu.sub !== "string" || !contenu.sub || contenu.sub.length > 128) throw new ErreurJeton("identifiant invalide");
  if (typeof contenu.exp !== "number" || contenu.exp < s - tolerance) throw new ErreurJeton("jeton expiré");
  if (typeof contenu.iat !== "number" || contenu.iat > s + tolerance) throw new ErreurJeton("jeton daté du futur");
  if (typeof contenu.auth_time === "number" && contenu.auth_time > s + tolerance) throw new ErreurJeton("connexion datée du futur");
  return contenu;
}
