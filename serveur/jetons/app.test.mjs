// Tests du service « jetons », sans réseau ni Docker :
// une fausse base Firebase et un faux LiveKit tournent dans le même processus,
// et les jetons Firebase sont signés avec une clé RSA générée pour l'occasion.
//
// Lancer :  node --test serveur/jetons/

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { creerApp } from "./app.mjs";
import { base64url, clePublique } from "./jwt.mjs";

const PROJET = "demo-nsi";
const SECRET = "secret-de-test-assez-long-pour-livekit-0123456789";
const DOMAINE = "nsi.example.org";
const ORIGINE = "https://dev-sofian.github.io";

// ---------- Fausse base Firebase ----------

const bdd = {
  admins: { sofian: "Sofian E." },
  profs: { prof1: { nom: "M. Prof" } },
  bans: { banni: { motif: "spam" } },
  utilisateurs: {
    lea: { pseudo: "Léa", statut: "actif" },
    hote: { pseudo: "Hôte", statut: "actif" },
    tom: { pseudo: "tom", statut: "en_attente" },
    banni: { pseudo: "Troll", statut: "actif" },
    sofian: { pseudo: "Sofian", statut: "en_attente" },
  },
  salons: {
    "nsi-tg2": { hote: "hote", modules: { partage: true } },
    "sans-partage": { hote: "hote" },
  },
};

function lireChemin(chemin) {
  return chemin.split("/").filter(Boolean).reduce((noeud, cle) => (noeud == null ? null : noeud[cle] ?? null), bdd);
}

// ---------- Faux LiveKit ----------

const appelsLivekit = [];
const presentsVisio = {
  lea: { identity: "lea", metadata: JSON.stringify({ role: "eleve" }) },
  hote: { identity: "hote", metadata: JSON.stringify({ role: "hote" }) },
  sofian: { identity: "sofian", metadata: JSON.stringify({ role: "admin" }) },
};

// ---------- Clés et jetons ----------

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const cles = new Map([["cle1", clePublique(publicKey.export({ type: "spki", format: "pem" }))]]);

function jetonFirebase(uid, { fournisseur = "password", projet = PROJET, cle = privateKey, exp } = {}) {
  const s = Math.floor(Date.now() / 1000);
  const entete = base64url(JSON.stringify({ alg: "RS256", kid: "cle1", typ: "JWT" }));
  const corps = base64url(JSON.stringify({
    iss: `https://securetoken.google.com/${projet}`, aud: projet, sub: uid,
    iat: s - 5, auth_time: s - 5, exp: exp ?? s + 3600, firebase: { sign_in_provider: fournisseur },
  }));
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${entete}.${corps}`), cle).toString("base64url");
  return `${entete}.${corps}.${signature}`;
}

function contenuJwt(jeton) {
  return JSON.parse(Buffer.from(jeton.split(".")[1], "base64url").toString());
}

function signatureHS256Valide(jeton) {
  const [e, c, s] = jeton.split(".");
  return crypto.createHmac("sha256", SECRET).update(`${e}.${c}`).digest("base64url") === s;
}

// ---------- Démarrage des trois serveurs ----------

let serveurBdd, serveurLivekit, app, base;

function ecouter(serveur) {
  return new Promise((resolve) => serveur.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${serveur.address().port}`)));
}

before(async () => {
  serveurBdd = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const jeton = url.searchParams.get("auth") || "";
    // La vraie base vérifie le jeton ; ici on vérifie juste qu'il est transmis.
    if (jeton.split(".").length !== 3) { res.writeHead(401); res.end("{}"); return; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(lireChemin(url.pathname.replace(/\.json$/, ""))));
  });
  serveurLivekit = http.createServer((req, res) => {
    let texte = "";
    req.on("data", (m) => { texte += m; });
    req.on("end", () => {
      const methode = req.url.split("/").pop();
      const corps = JSON.parse(texte || "{}");
      const admin = contenuJwt((req.headers.authorization || "").slice(7));
      appelsLivekit.push({ methode, corps, admin });
      const p = presentsVisio[corps.identity];
      if (!p) { res.writeHead(404); res.end(JSON.stringify({ code: "not_found", msg: "absent" })); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(methode === "GetParticipant" ? p : {}));
    });
  });
  const urlBdd = await ecouter(serveurBdd);
  const urlLivekit = await ecouter(serveurLivekit);
  app = creerApp({
    livekitCle: "APItest", livekitSecret: SECRET, livekitInterne: urlLivekit, domaine: DOMAINE,
    firebaseProjet: PROJET, firebaseBdd: urlBdd, origines: [ORIGINE],
    obtenirCles: async () => cles, journal: () => {},
  });
  base = await ecouter(app);
});

after(() => {
  for (const s of [app, serveurBdd, serveurLivekit]) s.close();
});

async function appeler(chemin, corps, { uid, jeton, origine = ORIGINE, hote = DOMAINE, fournisseur } = {}) {
  const entetes = { "Content-Type": "application/json", Host: hote };
  if (origine) entetes.Origin = origine;
  const j = jeton ?? (uid ? jetonFirebase(uid, { fournisseur }) : null);
  if (j) entetes.Authorization = `Bearer ${j}`;
  // fetch() n'autorise pas à changer l'en-tête Host : on passe par http.request.
  return new Promise((resolve, reject) => {
    const req = http.request(base + chemin, { method: "POST", headers: entetes }, (res) => {
      let texte = "";
      res.on("data", (m) => { texte += m; });
      res.on("end", () => resolve({ statut: res.statusCode, corps: texte ? JSON.parse(texte) : {}, entetes: res.headers }));
    });
    req.on("error", reject);
    req.end(JSON.stringify(corps));
  });
}

// ---------- Identité ----------

test("santé du service", async () => {
  const r = await fetch(`${base}/api/sante`);
  assert.equal(r.status, 200);
});

test("sans jeton Firebase : refusé", async () => {
  const r = await appeler("/api/jeton", { salle: "nsi-tg2" });
  assert.equal(r.statut, 401);
});

test("jeton signé par une autre clé : refusé", async () => {
  const { privateKey: autre } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { jeton: jetonFirebase("lea", { cle: autre }) });
  assert.equal(r.statut, 401);
});

test("jeton d'un autre projet Firebase ou expiré : refusé", async () => {
  let r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { jeton: jetonFirebase("lea", { projet: "pirate" }) });
  assert.equal(r.statut, 401);
  r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { jeton: jetonFirebase("lea", { exp: Math.floor(Date.now() / 1000) - 600 }) });
  assert.equal(r.statut, 401);
});

test("jeton modifié à la main (uid changé) : refusé", async () => {
  const [e, c, s] = jetonFirebase("lea").split(".");
  const faux = JSON.parse(Buffer.from(c, "base64url").toString());
  faux.sub = "sofian";
  const r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { jeton: `${e}.${base64url(JSON.stringify(faux))}.${s}` });
  assert.equal(r.statut, 401);
});

// ---------- Jetons LiveKit ----------

test("élève validé : jeton sans partage d'écran", async () => {
  const r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { uid: "lea" });
  assert.equal(r.statut, 200);
  assert.equal(r.corps.url, `wss://${DOMAINE}`);
  assert.equal(r.corps.pouvoirs, false);
  assert.ok(signatureHS256Valide(r.corps.jeton));
  const c = contenuJwt(r.corps.jeton);
  assert.equal(c.iss, "APItest");
  assert.equal(c.sub, "lea");
  assert.equal(c.name, "Léa");
  assert.equal(c.video.room, "nsi-tg2");
  assert.equal(c.video.roomJoin, true);
  assert.equal(c.video.canUpdateOwnMetadata, false);
  assert.deepEqual(c.video.canPublishSources, ["camera", "microphone"]);
  assert.deepEqual(JSON.parse(c.metadata), { role: "eleve" });
  assert.ok(c.exp - c.nbf <= 11 * 60);
});

test("hôte de la salle : partage d'écran autorisé", async () => {
  const r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { uid: "hote" });
  const c = contenuJwt(r.corps.jeton);
  assert.equal(r.corps.pouvoirs, true);
  assert.ok(c.video.canPublishSources.includes("screen_share"));
  assert.deepEqual(JSON.parse(c.metadata), { role: "hote" });
});

test("admin connecté avec GitHub : pouvoirs partout ; le même compte sans GitHub : non", async () => {
  let r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { uid: "sofian", fournisseur: "github.com" });
  assert.equal(r.statut, 200);
  assert.deepEqual(JSON.parse(contenuJwt(r.corps.jeton).metadata), { role: "admin" });
  r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { uid: "sofian", fournisseur: "password" });
  assert.equal(r.statut, 403); // son profil est « en attente » et il n'est pas admin sans GitHub
});

test("compte en attente ou banni : pas de jeton", async () => {
  let r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { uid: "tom" });
  assert.equal(r.statut, 403);
  assert.match(r.corps.erreur, /pas encore validé/);
  r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { uid: "banni" });
  assert.equal(r.statut, 403);
  assert.match(r.corps.erreur, /bloqué/);
  r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { uid: "inconnu" });
  assert.equal(r.statut, 403);
});

test("nom de salle invalide : refusé", async () => {
  const r = await appeler("/api/jeton", { salle: "../admins" }, { uid: "lea" });
  assert.equal(r.statut, 400);
});

test("mode démo (localhost) : adresse LiveKit locale", async () => {
  const r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { uid: "lea", hote: "localhost:8090", origine: null });
  assert.equal(r.corps.url, "ws://localhost:7880");
});

// ---------- Partage d'écran sur demande ----------

test("partage : un simple participant ne peut pas le donner", async () => {
  const r = await appeler("/api/partage", { salle: "nsi-tg2", cible: "hote", autoriser: true }, { uid: "lea" });
  assert.equal(r.statut, 403);
});

test("partage : refusé tant que l'hôte n'a pas activé le module", async () => {
  const r = await appeler("/api/partage", { salle: "sans-partage", cible: "lea", autoriser: true }, { uid: "hote" });
  assert.equal(r.statut, 409);
});

test("partage : l'hôte autorise puis retire le partage d'un élève", async () => {
  appelsLivekit.length = 0;
  let r = await appeler("/api/partage", { salle: "nsi-tg2", cible: "lea", autoriser: true }, { uid: "hote" });
  assert.equal(r.statut, 200);
  const maj = appelsLivekit.find((a) => a.methode === "UpdateParticipant");
  assert.equal(maj.corps.room, "nsi-tg2");
  assert.equal(maj.corps.identity, "lea");
  assert.deepEqual(maj.corps.permission.can_publish_sources, ["CAMERA", "MICROPHONE", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"]);
  assert.equal(maj.admin.video.roomAdmin, true);
  assert.equal(maj.admin.video.room, "nsi-tg2");

  appelsLivekit.length = 0;
  r = await appeler("/api/partage", { salle: "nsi-tg2", cible: "lea", autoriser: false }, { uid: "hote" });
  assert.equal(r.statut, 200);
  assert.deepEqual(appelsLivekit.find((a) => a.methode === "UpdateParticipant").corps.permission.can_publish_sources, ["CAMERA", "MICROPHONE"]);
});

test("partage : on ne touche pas aux droits d'un admin", async () => {
  appelsLivekit.length = 0;
  const r = await appeler("/api/partage", { salle: "nsi-tg2", cible: "sofian", autoriser: false }, { uid: "hote" });
  assert.equal(r.statut, 200);
  assert.equal(appelsLivekit.filter((a) => a.methode === "UpdateParticipant").length, 0);
});

test("partage : personne absente de la visio", async () => {
  const r = await appeler("/api/partage", { salle: "nsi-tg2", cible: "absent", autoriser: true }, { uid: "hote" });
  assert.equal(r.statut, 404);
});

// ---------- Exclusion ----------

test("exclure : l'hôte sort un élève ; personne ne sort un admin", async () => {
  appelsLivekit.length = 0;
  let r = await appeler("/api/exclure", { salle: "nsi-tg2", cible: "lea" }, { uid: "hote" });
  assert.equal(r.statut, 200);
  assert.ok(appelsLivekit.some((a) => a.methode === "RemoveParticipant" && a.corps.identity === "lea"));
  r = await appeler("/api/exclure", { salle: "nsi-tg2", cible: "sofian" }, { uid: "hote" });
  assert.equal(r.statut, 403);
  r = await appeler("/api/exclure", { salle: "nsi-tg2", cible: "hote" }, { uid: "lea" });
  assert.equal(r.statut, 403);
});

test("exclure : un admin peut agir dans n'importe quelle salle", async () => {
  const r = await appeler("/api/exclure", { salle: "nsi-tg2", cible: "lea" }, { uid: "sofian", fournisseur: "github.com" });
  assert.equal(r.statut, 200);
});

// ---------- Sites autorisés (CORS) ----------

test("CORS : le site autorisé passe, un autre site est refusé", async () => {
  const pre = await fetch(`${base}/api/jeton`, { method: "OPTIONS", headers: { Origin: ORIGINE } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), ORIGINE);
  const r = await appeler("/api/jeton", { salle: "nsi-tg2" }, { uid: "lea", origine: "https://pirate.example" });
  assert.equal(r.statut, 403);
  assert.equal(r.entetes["access-control-allow-origin"], undefined);
});

test("requête illisible ou trop grosse : refusée proprement", async () => {
  const r = await fetch(`${base}/api/jeton`, {
    method: "POST", headers: { Origin: ORIGINE, Authorization: `Bearer ${jetonFirebase("lea")}` }, body: "{pas du json",
  });
  assert.equal(r.status, 400);
  const gros = await fetch(`${base}/api/jeton`, {
    method: "POST", headers: { Origin: ORIGINE }, body: JSON.stringify({ x: "a".repeat(20000) }),
  }).catch(() => ({ status: 413 }));
  assert.equal(gros.status, 413);
});
