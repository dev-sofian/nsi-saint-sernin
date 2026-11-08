// Tests du service de jetons Jitsi (serveur/jeton/serveur.mjs), sans réseau :
// une fausse « clé Google » signe des jetons Firebase, et une fausse base répond aux lectures.
// Lancer : cd tests && node --test jeton.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fabriquerJeton, verifierJetonFirebase, ErreurHttp } from "../serveur/jeton/serveur.mjs";

const PROJET = "nsi-test";
const MAINTENANT = 1_800_000_000;
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const autreCle = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const certificats = async () => ({ cle1: publicKey.export({ type: "spki", format: "pem" }) });

const config = { projet: PROJET, urlBase: "https://base.test", appId: "nsi-st-sernin", secret: "secret-de-test" };

function jetonFirebase(contenu = {}, { cle = privateKey, kid = "cle1", alg = "RS256" } = {}) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const corps = {
    aud: PROJET, iss: `https://securetoken.google.com/${PROJET}`, sub: "eleve1",
    iat: MAINTENANT - 60, exp: MAINTENANT + 3600, firebase: { sign_in_provider: "anonymous" },
    ...contenu,
  };
  const debut = `${b64({ alg, kid, typ: "JWT" })}.${b64(corps)}`;
  const signature = crypto.sign("sha256", Buffer.from(debut), cle).toString("base64url");
  return `${debut}.${signature}`;
}

// Fausse Realtime Database : données + droits simplifiés (un banni ne lit pas les salles).
function fausseBase(donnees) {
  return async (url) => {
    const chemin = new URL(url).pathname.replace(/^\//, "").replace(/\.json$/, "");
    const uid = "eleve1";
    if (chemin.startsWith("salons/") && donnees[`bans/${uid}`]) return new Response("{}", { status: 401 });
    return new Response(JSON.stringify(donnees[chemin] ?? null), { status: 200 });
  };
}

function decoder(jwt) {
  const [h, c, s] = jwt.split(".");
  const attendu = crypto.createHmac("sha256", config.secret).update(`${h}.${c}`).digest("base64url");
  assert.equal(s, attendu, "signature HS256 correcte");
  return JSON.parse(Buffer.from(c, "base64url").toString());
}

const demander = (idToken, salle = "nsi-terminale", donnees = {}, uid = "eleve1") =>
  fabriquerJeton({ idToken, salle }, config, {
    certificats, maintenant: MAINTENANT,
    recuperer: fausseBase({ [`utilisateurs/${uid}/pseudo`]: "Léa", [`salons/${salle}/hote`]: "quelquun", ...donnees }),
  });

async function refuse(promesse, statut, message) {
  await assert.rejects(promesse, (e) => e instanceof ErreurHttp && e.statut === statut && (!message || e.message === message));
}

test("élève normal : jeton Jitsi pour la salle demandée, sans droits de modérateur", async () => {
  const { jeton, moderateur } = await demander(jetonFirebase());
  const contenu = decoder(jeton);
  assert.equal(moderateur, false);
  assert.equal(contenu.room, "nsi-terminale");
  assert.equal(contenu.iss, "nsi-st-sernin");
  assert.equal(contenu.aud, "jitsi");
  assert.equal(contenu.context.user.id, "eleve1");
  assert.equal(contenu.context.user.name, "Léa");
  assert.equal(contenu.exp, MAINTENANT + 4 * 3600);
});

test("l'hôte de la salle est modérateur", async () => {
  const { moderateur } = await demander(jetonFirebase(), "nsi-terminale", { "salons/nsi-terminale/hote": "eleve1" });
  assert.equal(moderateur, true);
});

test("admin ou prof connecté avec GitHub : modérateur ; via anonyme : non", async () => {
  const github = { firebase: { sign_in_provider: "github.com" } };
  assert.equal((await demander(jetonFirebase(github), "s", { "admins/eleve1": "Sofian" })).moderateur, true);
  assert.equal((await demander(jetonFirebase(github), "s", { "profs/eleve1": { nom: "M. X" } })).moderateur, true);
  assert.equal((await demander(jetonFirebase(), "s", { "admins/eleve1": "Sofian" })).moderateur, false);
});

test("banni : refusé", async () => {
  await refuse(demander(jetonFirebase(), "s", { "bans/eleve1": { motif: "spam" } }), 403, "banni");
});

test("jeton Firebase absent, falsifié ou signé par une autre clé : refusé", async () => {
  await refuse(demander(""), 401);
  await refuse(demander("a.b.c"), 401);
  await refuse(demander(jetonFirebase({}, { cle: autreCle })), 401, "signature-invalide");
  await refuse(demander(jetonFirebase({}, { kid: "inconnue" })), 401, "cle-inconnue");
  await refuse(demander(jetonFirebase({}, { alg: "HS256" })), 401, "algorithme-refuse");
  // Contenu modifié après signature (ex : on change l'uid)
  const [h, , s] = jetonFirebase().split(".");
  const triche = Buffer.from(JSON.stringify({ aud: PROJET, iss: `https://securetoken.google.com/${PROJET}`, sub: "admin", iat: MAINTENANT, exp: MAINTENANT + 60 })).toString("base64url");
  await refuse(demander(`${h}.${triche}.${s}`), 401, "signature-invalide");
});

test("jeton d'un autre projet Firebase ou expiré : refusé", async () => {
  await refuse(demander(jetonFirebase({ aud: "autre-projet" })), 401, "mauvais-projet");
  await refuse(demander(jetonFirebase({ iss: "https://securetoken.google.com/autre" })), 401, "mauvais-emetteur");
  await refuse(demander(jetonFirebase({ exp: MAINTENANT - 1 })), 401, "jeton-expire");
});

test("nom de salle invalide : refusé", async () => {
  for (const salle of ["", "Salle Majuscule", "a/b", "x".repeat(61), 42]) {
    await refuse(demander(jetonFirebase(), salle), 400, "salle-invalide");
  }
});

test("verifierJetonFirebase renvoie l'uid et le fournisseur", async () => {
  const r = verifierJetonFirebase(jetonFirebase({ firebase: { sign_in_provider: "github.com" } }), await certificats(), PROJET, MAINTENANT);
  assert.deepEqual(r, { uid: "eleve1", fournisseur: "github.com" });
});

test("panne réseau (Google ou base) : 503, pas d'erreur interne", async () => {
  const panne = async () => { throw new TypeError("fetch failed"); };
  const { chargeurCertificats } = await import("../serveur/jeton/serveur.mjs");
  await refuse(fabriquerJeton({ idToken: jetonFirebase(), salle: "s" }, config,
    { certificats: chargeurCertificats(panne), maintenant: MAINTENANT }), 503, "certificats-indisponibles");
  await refuse(fabriquerJeton({ idToken: jetonFirebase(), salle: "s" }, config,
    { certificats, recuperer: panne, maintenant: MAINTENANT }), 503, "base-indisponible");
});
