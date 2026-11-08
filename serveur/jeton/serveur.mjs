// Service de jetons pour notre serveur Jitsi (aucune dépendance, Node 20+).
//
// Le site (statique) ne peut pas garder de secret. Ce petit service, lui, tourne sur
// le serveur Oracle à côté de Jitsi et connaît JWT_APP_SECRET. Pour chaque demande :
//   1. il vérifie le jeton Firebase de la personne (signature Google, projet, expiration) ;
//   2. il lit dans la Realtime Database, AVEC le jeton de la personne (donc en respectant
//      database.rules.json), si elle est bannie, admin, prof, hôte de la salle, et son pseudo ;
//   3. il fabrique un jeton Jitsi (JWT signé HS256) valable pour CETTE salle seulement.
// Sans ce jeton, le serveur Jitsi refuse l'entrée.
//
// Requête : POST /jeton   Authorization: Bearer <jeton Firebase>   {"salle": "nsi-terminale-b"}
// Réponse : {"jeton": "...", "moderateur": true|false}

import http from "node:http";
import crypto from "node:crypto";

const URL_CERTIFICATS =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const DUREE_JETON_S = 4 * 3600;            // un jeton Jitsi vaut 4 heures
const MOTIF_SALLE = /^[a-z0-9-]{1,60}$/;   // même règle que database.rules.json

export class ErreurHttp extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

// ---------- Utilitaires JWT ----------

const base64url = (donnees) => Buffer.from(donnees).toString("base64url");

function decoderPartie(partie) {
  try {
    return JSON.parse(Buffer.from(partie, "base64url").toString("utf8"));
  } catch {
    throw new ErreurHttp(401, "jeton-illisible");
  }
}

export function signerJwtHs256(contenu, secret) {
  const debut = `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(JSON.stringify(contenu))}`;
  const signature = crypto.createHmac("sha256", secret).update(debut).digest("base64url");
  return `${debut}.${signature}`;
}

// ---------- Certificats publics de Google (signature des jetons Firebase) ----------

export function chargeurCertificats(recuperer = fetch) {
  let cache = null;
  let expire = 0;
  return async () => {
    if (cache && Date.now() < expire) return cache;
    const rep = await recuperer(URL_CERTIFICATS).catch(() => null);
    if (!rep || !rep.ok) throw new ErreurHttp(503, "certificats-indisponibles");
    cache = await rep.json();
    const maxAge = Number(/max-age=(\d+)/.exec(rep.headers.get("cache-control") || "")?.[1] || 3600);
    expire = Date.now() + maxAge * 1000;
    return cache;
  };
}

// Vérifie un jeton Firebase (règles officielles : RS256, kid connu, aud = projet,
// iss = https://securetoken.google.com/<projet>, exp dans le futur, sub non vide).
export function verifierJetonFirebase(jeton, certificats, projet, maintenant = Date.now() / 1000) {
  const parties = String(jeton || "").split(".");
  if (parties.length !== 3) throw new ErreurHttp(401, "jeton-absent");
  const [h, c, s] = parties;
  const entete = decoderPartie(h);
  const contenu = decoderPartie(c);

  if (entete.alg !== "RS256") throw new ErreurHttp(401, "algorithme-refuse");
  const certificat = certificats[entete.kid];
  if (!certificat) throw new ErreurHttp(401, "cle-inconnue");
  const valide = crypto.verify(
    "sha256",
    Buffer.from(`${h}.${c}`),
    crypto.createPublicKey(certificat),
    Buffer.from(s, "base64url"),
  );
  if (!valide) throw new ErreurHttp(401, "signature-invalide");

  if (contenu.aud !== projet) throw new ErreurHttp(401, "mauvais-projet");
  if (contenu.iss !== `https://securetoken.google.com/${projet}`) throw new ErreurHttp(401, "mauvais-emetteur");
  if (typeof contenu.exp !== "number" || contenu.exp <= maintenant) throw new ErreurHttp(401, "jeton-expire");
  if (typeof contenu.iat !== "number" || contenu.iat > maintenant + 300) throw new ErreurHttp(401, "date-invalide");
  if (typeof contenu.sub !== "string" || !contenu.sub || contenu.sub.length > 128) throw new ErreurHttp(401, "utilisateur-invalide");

  return {
    uid: contenu.sub,
    fournisseur: contenu.firebase?.sign_in_provider || "",
  };
}

// ---------- Lecture de la Realtime Database au nom de la personne ----------

async function lireBase(urlBase, chemin, idToken, recuperer) {
  const rep = await recuperer(`${urlBase}/${chemin}.json?auth=${encodeURIComponent(idToken)}`).catch(() => null);
  if (rep && (rep.status === 401 || rep.status === 403)) return { refuse: true, valeur: null };
  if (!rep || !rep.ok) throw new ErreurHttp(503, "base-indisponible");
  return { refuse: false, valeur: await rep.json() };
}

// Cœur du service : de (jeton Firebase, salle) à un jeton Jitsi. Testé dans tests/jeton.test.mjs.
export async function fabriquerJeton({ idToken, salle }, config, { certificats, recuperer = fetch, maintenant }) {
  if (typeof salle !== "string" || !MOTIF_SALLE.test(salle)) throw new ErreurHttp(400, "salle-invalide");
  if (String(idToken || "").split(".").length !== 3) throw new ErreurHttp(401, "jeton-absent");
  const instant = maintenant ?? Math.floor(Date.now() / 1000);
  const { uid, fournisseur } = verifierJetonFirebase(idToken, await certificats(), config.projet, instant);

  const lire = (chemin) => lireBase(config.urlBase, chemin, idToken, recuperer);
  const ban = await lire(`bans/${uid}`);
  if (ban.valeur !== null) throw new ErreurHttp(403, "banni");

  const [admin, prof, profil, hote] = await Promise.all([
    lire(`admins/${uid}`), lire(`profs/${uid}`), lire(`utilisateurs/${uid}/pseudo`), lire(`salons/${salle}/hote`),
  ]);
  if (hote.refuse) throw new ErreurHttp(403, "acces-refuse");

  const viaGitHub = fournisseur === "github.com";
  const moderateur = (viaGitHub && (admin.valeur !== null || prof.valeur !== null)) || hote.valeur === uid;
  const pseudo = typeof profil.valeur === "string" ? profil.valeur : "Participant";

  const jeton = signerJwtHs256({
    aud: "jitsi",
    iss: config.appId,
    sub: "*",
    room: salle,
    iat: instant,
    nbf: instant - 10,
    exp: instant + DUREE_JETON_S,
    context: { user: { id: uid, name: pseudo, moderator: moderateur } },
    moderator: moderateur,
  }, config.secret);

  return { jeton, moderateur };
}

// ---------- Serveur HTTP ----------

function lireCorps(req) {
  return new Promise((resoudre, rejeter) => {
    let corps = "";
    req.on("data", (morceau) => {
      corps += morceau;
      if (corps.length > 2000) rejeter(new ErreurHttp(413, "requete-trop-grosse"));
    });
    req.on("end", () => {
      try { resoudre(JSON.parse(corps || "{}")); } catch { rejeter(new ErreurHttp(400, "json-invalide")); }
    });
    req.on("error", rejeter);
  });
}

export function creerServeur(config, dependances = {}) {
  const certificats = dependances.certificats || chargeurCertificats(dependances.recuperer);
  return http.createServer(async (req, res) => {
    const origine = req.headers.origin;
    if (origine && config.origines.includes(origine)) {
      res.setHeader("Access-Control-Allow-Origin", origine);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    const envoyer = (statut, donnees) => {
      res.writeHead(statut, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(donnees));
    };

    const chemin = new URL(req.url, "http://x").pathname;
    if (req.method === "GET" && chemin.endsWith("/sante")) return envoyer(200, { ok: true });
    if (!chemin.endsWith("/jeton")) return envoyer(404, { erreur: "introuvable" });
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method !== "POST") return envoyer(405, { erreur: "methode" });

    try {
      const { salle } = await lireCorps(req);
      const idToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      envoyer(200, await fabriquerJeton({ idToken, salle }, config, { certificats, recuperer: dependances.recuperer || fetch }));
    } catch (e) {
      const statut = e instanceof ErreurHttp ? e.statut : 500;
      if (statut === 500) console.error(e);
      envoyer(statut, { erreur: e instanceof ErreurHttp ? e.message : "erreur-interne" });
    }
  });
}

// Lancement direct : node serveur.mjs (configuration par variables d'environnement).
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = {
    projet: process.env.FIREBASE_PROJET,
    urlBase: (process.env.FIREBASE_DATABASE_URL || "").replace(/\/$/, ""),
    appId: process.env.JWT_APP_ID,
    secret: process.env.JWT_APP_SECRET,
    origines: (process.env.ORIGINES_AUTORISEES || "").split(",").map((o) => o.trim()).filter(Boolean),
  };
  for (const [cle, valeur] of Object.entries(config)) {
    if (!valeur || (Array.isArray(valeur) && !valeur.length)) {
      console.error(`Configuration manquante : ${cle}`);
      process.exit(1);
    }
  }
  const port = Number(process.env.PORT || 8080);
  creerServeur(config).listen(port, () => console.log(`Service de jetons prêt sur le port ${port}`));
}
