// Service « jetons » : le seul programme maison du serveur de visio.
//
// Le navigateur ne peut pas entrer dans une salle LiveKit sans un jeton signé avec le secret
// LiveKit, que seul ce service connaît. Avant de donner un jeton, il vérifie :
//   1. QUI appelle (jeton d'identité Firebase, signature Google vérifiée) ;
//   2. que cette personne est membre validé (liste blanche) et non bannie ;
//   3. ses pouvoirs dans la salle (hôte, prof, admin) pour choisir ses droits LiveKit.
//
// Il lit la base Firebase AVEC le jeton de la personne : ce sont donc les mêmes règles
// (database.rules.json) qui s'appliquent, et ce service n'a besoin d'aucun secret Firebase.
//
// Routes (toutes en POST JSON avec « Authorization: Bearer <jeton Firebase> », sauf /api/sante) :
//   GET  /api/sante                          → { ok: true }
//   POST /api/jeton    { salle }             → { jeton, url, pouvoirs }
//   POST /api/partage  { salle, cible, autoriser } → autorise / retire le partage d'écran de cible
//   POST /api/exclure  { salle, cible }      → sort cible de la visio (il peut revenir, sauf s'il est banni)

import http from "node:http";
import { signerHS256, verifierJetonFirebase, ErreurJeton } from "./jwt.mjs";

const MOTIF_SALLE = /^[a-z0-9-]{1,60}$/;
const MOTIF_UID = /^[A-Za-z0-9_-]{1,128}$/;
const TAILLE_MAX_CORPS = 10 * 1024;
const DUREE_JETON_S = 10 * 60;        // le jeton sert seulement à entrer ; la session dure ensuite
const LIMITE_REQUETES = 60;           // par adresse IP et par minute

const SOURCES_BASE = ["camera", "microphone"];
const SOURCES_ECRAN = ["screen_share", "screen_share_audio"];
// Noms des mêmes sources dans l'API serveur de LiveKit (énumération TrackSource).
const API_SOURCES = { camera: "CAMERA", microphone: "MICROPHONE", screen_share: "SCREEN_SHARE", screen_share_audio: "SCREEN_SHARE_AUDIO" };

class ErreurHttp extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

export function creerApp(config) {
  const {
    livekitCle, livekitSecret, livekitInterne, domaine,
    firebaseProjet, firebaseBdd, origines, obtenirCles,
    journal = (...args) => console.log(new Date().toISOString(), ...args),
  } = config;

  // ---------- Base Firebase (lecture avec le jeton de la personne) ----------

  async function lireBdd(chemin, jetonFirebase) {
    const url = `${firebaseBdd}/${chemin}.json?auth=${encodeURIComponent(jetonFirebase)}`;
    let reponse;
    try {
      reponse = await fetch(url);
    } catch (e) {
      throw new ErreurHttp(502, "Base de données injoignable.");
    }
    if (reponse.status === 401 || reponse.status === 403) return null; // lecture refusée par les règles
    if (!reponse.ok) throw new ErreurHttp(502, "Base de données indisponible.");
    return reponse.json();
  }

  // ---------- API serveur de LiveKit (Twirp, réseau local uniquement) ----------

  async function livekit(methode, salle, corps) {
    const s = Math.floor(Date.now() / 1000);
    const jetonAdmin = signerHS256({ iss: livekitCle, nbf: s - 10, exp: s + 60, video: { roomAdmin: true, room: salle } }, livekitSecret);
    let reponse;
    try {
      reponse = await fetch(`${livekitInterne}/twirp/livekit.RoomService/${methode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jetonAdmin}` },
        body: JSON.stringify({ room: salle, ...corps }),
      });
    } catch (e) {
      throw new ErreurHttp(502, "Le serveur de visio (LiveKit) ne répond pas.");
    }
    const donnees = await reponse.json().catch(() => ({}));
    if (reponse.status === 404 || donnees.code === "not_found") return null;
    if (!reponse.ok) {
      journal("LiveKit", methode, reponse.status, donnees.code || "", donnees.msg || "");
      throw new ErreurHttp(502, "Le serveur de visio a refusé l'action.");
    }
    return donnees;
  }

  async function participantVisio(salle, identite) {
    const info = await livekit("GetParticipant", salle, { identity: identite });
    if (!info) return null;
    let meta = {};
    try { meta = JSON.parse(info.metadata || "{}"); } catch (e) { /* métadonnées absentes */ }
    return { ...info, role: meta.role || "eleve" };
  }

  // ---------- Qui appelle ? ----------

  async function identifier(req) {
    const entete = req.headers.authorization || "";
    const jeton = entete.startsWith("Bearer ") ? entete.slice(7) : "";
    if (!jeton) throw new ErreurHttp(401, "Connecte-toi d'abord.");
    let contenu;
    try {
      contenu = await verifierJetonFirebase(jeton, { projet: firebaseProjet, obtenirCles });
    } catch (e) {
      if (e instanceof ErreurJeton) throw new ErreurHttp(401, "Session invalide ou expirée : recharge la page.");
      throw new ErreurHttp(502, "Impossible de vérifier ta session pour le moment.");
    }
    const uid = contenu.sub;
    const fournisseur = contenu.firebase?.sign_in_provider || "";
    const lire = (chemin) => lireBdd(chemin, jeton);
    const [ban, admin, prof, profil] = await Promise.all([
      lire(`bans/${uid}`), lire(`admins/${uid}`), lire(`profs/${uid}`), lire(`utilisateurs/${uid}`),
    ]);
    let role = "eleve";
    if (fournisseur === "github.com" && admin !== null) role = "admin";
    else if (fournisseur === "github.com" && prof !== null) role = "prof";
    const banni = ban !== null;
    const membre = !banni && (role !== "eleve" || profil?.statut === "actif");
    const pseudo = typeof profil?.pseudo === "string" ? profil.pseudo.slice(0, 20) : "Participant";
    return { uid, role, banni, membre, pseudo, lire };
  }

  function exigerMembre(qui) {
    if (qui.banni) throw new ErreurHttp(403, "Ton accès aux salles a été bloqué par un administrateur.");
    if (!qui.membre) throw new ErreurHttp(403, "Ton compte n'est pas encore validé par un administrateur.");
  }

  function lireSalle(corps) {
    const salle = corps.salle;
    if (typeof salle !== "string" || !MOTIF_SALLE.test(salle)) throw new ErreurHttp(400, "Nom de salle invalide.");
    return salle;
  }

  function lireCible(corps, qui) {
    const cible = corps.cible;
    if (typeof cible !== "string" || !MOTIF_UID.test(cible)) throw new ErreurHttp(400, "Participant invalide.");
    if (cible === qui.uid) throw new ErreurHttp(400, "Action impossible sur toi-même.");
    return cible;
  }

  // Pouvoirs d'hôte : hôte de la salle (premier arrivé), prof ou admin.
  async function pouvoirsHote(qui, salle) {
    if (qui.role === "admin" || qui.role === "prof") return true;
    return (await qui.lire(`salons/${salle}/hote`)) === qui.uid;
  }

  // ---------- Routes ----------

  async function routeJeton(qui, corps, req) {
    exigerMembre(qui);
    const salle = lireSalle(corps);
    const hote = await pouvoirsHote(qui, salle);
    const role = qui.role !== "eleve" ? qui.role : hote ? "hote" : "eleve";
    const s = Math.floor(Date.now() / 1000);
    const jeton = signerHS256({
      iss: livekitCle,
      sub: qui.uid,
      name: qui.pseudo,
      nbf: s - 10,
      exp: s + DUREE_JETON_S,
      // Le rôle est inscrit par le serveur : personne ne peut le modifier depuis son navigateur.
      metadata: JSON.stringify({ role }),
      video: {
        room: salle,
        roomJoin: true,
        canSubscribe: true,
        canPublish: true,
        canPublishData: false,
        canUpdateOwnMetadata: false,
        // Partage d'écran : réservé à l'hôte. Les autres le reçoivent sur demande (/api/partage).
        canPublishSources: hote ? [...SOURCES_BASE, ...SOURCES_ECRAN] : SOURCES_BASE,
      },
    }, livekitSecret);
    journal("jeton", salle, qui.uid.slice(0, 8), role);
    return { jeton, url: urlPublique(req), pouvoirs: hote };
  }

  async function routePartage(qui, corps) {
    exigerMembre(qui);
    const salle = lireSalle(corps);
    const cible = lireCible(corps, qui);
    const autoriser = corps.autoriser === true;
    if (!(await pouvoirsHote(qui, salle))) throw new ErreurHttp(403, "Seul l'hôte peut gérer le partage d'écran.");
    if (autoriser && (await qui.lire(`salons/${salle}/modules/partage`)) !== true) {
      throw new ErreurHttp(409, "Active d'abord le partage d'écran pour la salle.");
    }
    const participant = await participantVisio(salle, cible);
    if (!participant) throw new ErreurHttp(404, "Cette personne n'est pas connectée à la visio.");
    // Hôte, prof, admin : ils peuvent déjà partager, on ne touche pas à leurs droits.
    if (participant.role !== "eleve") return { ok: true };
    const sources = autoriser ? [...SOURCES_BASE, ...SOURCES_ECRAN] : SOURCES_BASE;
    await livekit("UpdateParticipant", salle, {
      identity: cible,
      permission: {
        can_subscribe: true,
        can_publish: true,
        can_publish_data: false,
        can_update_metadata: false,
        can_publish_sources: sources.map((source) => API_SOURCES[source]),
      },
    });
    journal("partage", salle, cible.slice(0, 8), autoriser ? "autorisé" : "retiré", "par", qui.uid.slice(0, 8));
    return { ok: true };
  }

  async function routeExclure(qui, corps) {
    exigerMembre(qui);
    const salle = lireSalle(corps);
    const cible = lireCible(corps, qui);
    if (!(await pouvoirsHote(qui, salle))) throw new ErreurHttp(403, "Seul l'hôte peut exclure quelqu'un.");
    const participant = await participantVisio(salle, cible);
    if (!participant) return { ok: true, absent: true };
    if (participant.role === "admin") throw new ErreurHttp(403, "On ne peut pas exclure un administrateur.");
    if (participant.role === "prof" && qui.role !== "admin") throw new ErreurHttp(403, "Seul un administrateur peut exclure un prof.");
    await livekit("RemoveParticipant", salle, { identity: cible });
    journal("exclusion", salle, cible.slice(0, 8), "par", qui.uid.slice(0, 8));
    return { ok: true };
  }

  const ROUTES = { "/api/jeton": routeJeton, "/api/partage": routePartage, "/api/exclure": routeExclure };

  // ---------- HTTP : CORS, limites, erreurs ----------

  // Adresse de LiveKit pour le navigateur : wss://domaine en ligne, ws://localhost en mode démo.
  function urlPublique(req) {
    const hote = (req.headers.host || "").replace(/:\d+$/, "");
    if (hote === "localhost" || hote === "127.0.0.1") return "ws://localhost:7880";
    return `wss://${domaine}`;
  }

  const compteurs = new Map(); // ip -> { n, debut }
  function tropDeRequetes(req) {
    // Derrière Caddy (même machine), l'adresse réelle est la dernière de X-Forwarded-For.
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
    const transmis = (req.headers["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean);
    const ip = local && transmis.length ? transmis[transmis.length - 1] : req.socket.remoteAddress;
    const maintenant = Date.now();
    let c = compteurs.get(ip);
    if (!c || maintenant - c.debut > 60_000) {
      c = { n: 0, debut: maintenant };
      compteurs.set(ip, c);
    }
    c.n += 1;
    if (compteurs.size > 10_000) compteurs.clear(); // évite de grossir indéfiniment
    return c.n > LIMITE_REQUETES;
  }

  function lireCorps(req) {
    return new Promise((resolve, reject) => {
      let taille = 0;
      const morceaux = [];
      req.on("data", (morceau) => {
        taille += morceau.length;
        if (taille > TAILLE_MAX_CORPS) {
          reject(new ErreurHttp(413, "Requête trop grosse."));
          req.destroy();
          return;
        }
        morceaux.push(morceau);
      });
      req.on("end", () => {
        try {
          const texte = Buffer.concat(morceaux).toString("utf8");
          const corps = texte ? JSON.parse(texte) : {};
          if (typeof corps !== "object" || corps === null || Array.isArray(corps)) throw new Error();
          resolve(corps);
        } catch (e) {
          reject(new ErreurHttp(400, "Requête illisible."));
        }
      });
      req.on("error", reject);
    });
  }

  function repondre(res, statut, donnees) {
    res.writeHead(statut, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(donnees));
  }

  return http.createServer(async (req, res) => {
    const origine = req.headers.origin;
    const origineAutorisee = origine && origines.includes(origine);
    if (origineAutorisee) {
      res.setHeader("Access-Control-Allow-Origin", origine);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    const chemin = (req.url || "").split("?")[0];

    try {
      if (req.method === "OPTIONS") {
        res.writeHead(origineAutorisee ? 204 : 403);
        res.end();
        return;
      }
      if (req.method === "GET" && chemin === "/api/sante") return repondre(res, 200, { ok: true });

      const route = ROUTES[chemin];
      if (!route) throw new ErreurHttp(404, "Adresse inconnue.");
      if (req.method !== "POST") throw new ErreurHttp(405, "Méthode non autorisée.");
      if (origine && !origineAutorisee) throw new ErreurHttp(403, "Site non autorisé à utiliser ce serveur.");
      if (tropDeRequetes(req)) throw new ErreurHttp(429, "Trop de requêtes : patiente une minute.");

      const corps = await lireCorps(req);
      const qui = await identifier(req);
      repondre(res, 200, await route(qui, corps, req));
    } catch (e) {
      if (e instanceof ErreurHttp) return repondre(res, e.statut, { erreur: e.message });
      journal("Erreur inattendue", e);
      repondre(res, 500, { erreur: "Erreur interne du serveur." });
    }
  });
}
