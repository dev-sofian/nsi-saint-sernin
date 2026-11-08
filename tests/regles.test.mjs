// Tests des règles de la Realtime Database (database.rules.json) avec l'émulateur Firebase.
// Lancer : cd tests && npm install && npm test   (Java 11+ nécessaire)

import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";

const MAINTENANT = { ".sv": "timestamp" }; // heure du serveur
const SALON = "salons/nsi-terminale";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nsi",
    database: { rules: readFileSync(new URL("../database.rules.json", import.meta.url), "utf8") },
  });
});
after(() => env.cleanup());

// Données de départ : un admin, un prof, un élève banni, une salle ouverte par « hote ».
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      admins: { sofian: "Sofian E." },
      profs: { prof1: { nom: "M. Prof", ajoutePar: "sofian", date: 1 } },
      bans: { banni: { pseudo: "Troll", motif: "spam", auteurUid: "sofian", date: 1 } },
      utilisateurs: { eleve: { pseudo: "Léa", fournisseur: "anonymous", cree: 1 } },
      salons: {
        "nsi-terminale": {
          hote: "hote",
          editeurs: { autorise: true },
          python: { code: { texte: "print(1)", v: 3, par: "hote", pseudo: "Hôte" } },
        },
      },
    });
  });
});

const github = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "github.com" } }).database();
const anonyme = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).database();
const visiteur = () => env.unauthenticatedContext().database();

const profil = (pseudo, fournisseur = "anonymous") => ({ pseudo, fournisseur, cree: MAINTENANT });
const ban = (auteurUid) => ({ pseudo: "Léa", motif: "insultes", auteurUid, date: MAINTENANT });
const code = (texte, v, par) => ({ texte, v, par, pseudo: "X" });

// ---------- Profils ----------

test("un élève anonyme crée son propre profil", async () => {
  await assertSucceeds(anonyme("nouveau").ref("utilisateurs/nouveau").set(profil("Élodie")));
});

test("pseudo invalide refusé (trop court, trop long, caractères interdits)", async () => {
  for (const pseudo of ["a", "x".repeat(21), "<script>", ""]) {
    await assertFails(anonyme("nouveau").ref("utilisateurs/nouveau").set(profil(pseudo)));
  }
});

test("on ne peut pas mentir sur son fournisseur de connexion", async () => {
  await assertFails(anonyme("nouveau").ref("utilisateurs/nouveau").set(profil("Élodie", "github.com")));
});

test("champ supplémentaire (ex : role) refusé", async () => {
  await assertFails(anonyme("nouveau").ref("utilisateurs/nouveau").set({ ...profil("Élodie"), role: "admin" }));
});

test("on ne crée pas le profil de quelqu'un d'autre", async () => {
  await assertFails(anonyme("pirate").ref("utilisateurs/autre").set(profil("Faux")));
});

test("changer son pseudo : oui ; changer la date de création ou le profil d'un autre : non", async () => {
  const db = anonyme("eleve");
  await assertSucceeds(db.ref("utilisateurs/eleve/pseudo").set("Léa M"));
  await assertFails(db.ref("utilisateurs/eleve/cree").set(12345));
  await assertFails(anonyme("pirate").ref("utilisateurs/eleve/pseudo").set("Pirate"));
});

test("un visiteur non connecté ne lit pas les profils", async () => {
  await assertFails(visiteur().ref("utilisateurs/eleve").get());
  await assertSucceeds(anonyme("autre").ref("utilisateurs/eleve").get());
});

test("un banni ne peut ni créer de profil ni lire ceux des autres, mais lit son ban", async () => {
  const db = anonyme("banni");
  await assertFails(db.ref("utilisateurs/banni").set(profil("Troll")));
  await assertFails(db.ref("utilisateurs/eleve").get());
  await assertSucceeds(db.ref("bans/banni").get());
});

// ---------- Admins ----------

test("personne ne peut s'ajouter admin depuis le site, même un admin", async () => {
  await assertFails(github("pirate").ref("admins/pirate").set("Moi"));
  await assertFails(github("sofian").ref("admins/ami").set("Ami"));
});

test("on peut lire son propre statut admin, pas celui des autres", async () => {
  await assertSucceeds(anonyme("eleve").ref("admins/eleve").get());
  await assertFails(anonyme("eleve").ref("admins/sofian").get());
  await assertFails(anonyme("eleve").ref("admins").get());
});

// ---------- Bans ----------

test("un admin connecté avec GitHub peut bannir", async () => {
  await assertSucceeds(github("sofian").ref("bans/eleve").set(ban("sofian")));
});

test("un admin connecté autrement que par GitHub n'a aucun droit", async () => {
  await assertFails(anonyme("sofian").ref("bans/eleve").set(ban("sofian")));
});

test("un prof ou un élève ne peut pas bannir", async () => {
  await assertFails(github("prof1").ref("bans/eleve").set(ban("prof1")));
  await assertFails(anonyme("eleve").ref("bans/autre").set(ban("eleve")));
});

test("un admin ne peut pas falsifier l'auteur d'un ban, ni se bannir", async () => {
  await assertFails(github("sofian").ref("bans/eleve").set(ban("quelquun")));
  await assertFails(github("sofian").ref("bans/sofian").set(ban("sofian")));
});

test("seul un admin lève un ban ; le banni ne peut pas se débannir", async () => {
  await assertFails(anonyme("banni").ref("bans/banni").remove());
  await assertSucceeds(github("sofian").ref("bans/banni").remove());
});

// ---------- Profs ----------

test("un admin ajoute un prof ; un prof ne peut pas en ajouter", async () => {
  const prof = (auteur) => ({ nom: "Mme Prof", ajoutePar: auteur, date: MAINTENANT });
  await assertSucceeds(github("sofian").ref("profs/nouveau").set(prof("sofian")));
  await assertFails(github("prof1").ref("profs/autre").set(prof("prof1")));
});

// ---------- Journal ----------

test("journal : un admin ajoute, personne ne modifie ni n'efface", async () => {
  const db = github("sofian");
  const entree = { action: "ban", cibleUid: "eleve", details: "insultes", auteurUid: "sofian", date: MAINTENANT };
  await assertSucceeds(db.ref("journal/e1").set(entree));
  await assertFails(db.ref("journal/e1/details").set("rien"));
  await assertFails(db.ref("journal/e1").remove());
  await assertFails(anonyme("eleve").ref("journal").get());
});

// ---------- Salons ----------

test("lire une salle : connecté et non banni uniquement", async () => {
  await assertSucceeds(anonyme("eleve").ref(SALON).get());
  await assertFails(visiteur().ref(SALON).get());
  await assertFails(anonyme("banni").ref(SALON).get());
});

test("le premier arrivé devient hôte ; on ne peut pas voler la place", async () => {
  await assertSucceeds(anonyme("eleve").ref("salons/nouvelle/hote").set("eleve"));
  await assertFails(anonyme("autre").ref("salons/nouvelle/hote").set("autre"));
  await assertFails(anonyme("autre").ref("salons/autre-salle/hote").set("quelquun"));
  await assertSucceeds(github("sofian").ref("salons/nouvelle/hote").set("sofian")); // admin
});

test("nom de salle invalide refusé", async () => {
  await assertFails(anonyme("eleve").ref("salons/Salle Pas Valide/hote").set("eleve"));
});

test("activer le Python et donner les droits : hôte, admin ou prof uniquement", async () => {
  await assertSucceeds(anonyme("hote").ref(`${SALON}/modules/python`).set(true));
  await assertSucceeds(github("prof1").ref(`${SALON}/modules/python`).set(false));
  await assertFails(anonyme("eleve").ref(`${SALON}/modules/python`).set(true));
  await assertSucceeds(anonyme("hote").ref(`${SALON}/editeurs/eleve`).set(true));
  await assertFails(anonyme("eleve").ref(`${SALON}/editeurs/eleve`).set(true));
  await assertFails(anonyme("autorise").ref(`${SALON}/editeurs/eleve`).set(true));
});

test("présence : chacun ne s'inscrit que lui-même", async () => {
  await assertSucceeds(anonyme("eleve").ref(`${SALON}/participants/eleve`).set({ pseudo: "Léa", depuis: MAINTENANT }));
  await assertFails(anonyme("eleve").ref(`${SALON}/participants/autre`).set({ pseudo: "Faux", depuis: MAINTENANT }));
  await assertFails(anonyme("banni").ref(`${SALON}/participants/banni`).set({ pseudo: "Troll", depuis: MAINTENANT }));
});

// ---------- Python partagé ----------

test("modifier le code : hôte et éditeurs autorisés, pas les autres", async () => {
  await assertSucceeds(anonyme("hote").ref(`${SALON}/python/code`).set(code("a", 4, "hote")));
  await assertSucceeds(anonyme("autorise").ref(`${SALON}/python/code`).set(code("b", 5, "autorise")));
  await assertSucceeds(github("prof1").ref(`${SALON}/python/code`).set(code("c", 6, "prof1")));
  await assertFails(anonyme("eleve").ref(`${SALON}/python/code`).set(code("pirate", 7, "eleve")));
});

test("le numéro de version doit augmenter de 1 exactement", async () => {
  const db = anonyme("hote");
  await assertFails(db.ref(`${SALON}/python/code`).set(code("a", 3, "hote")));  // même version
  await assertFails(db.ref(`${SALON}/python/code`).set(code("a", 10, "hote"))); // saut
  await assertSucceeds(db.ref(`${SALON}/python/code`).set(code("a", 4, "hote")));
});

test("on ne peut pas signer une modification au nom d'un autre", async () => {
  await assertFails(anonyme("autorise").ref(`${SALON}/python/code`).set(code("b", 4, "hote")));
});

test("code trop long refusé (> 20 000 caractères)", async () => {
  await assertFails(anonyme("hote").ref(`${SALON}/python/code`).set(code("x".repeat(20001), 4, "hote")));
});

test("sortie : un éditeur publie, un simple participant ne peut pas", async () => {
  const sortie = (par) => ({ texte: "1\n", erreur: "", etat: "fini", par, pseudo: "X", date: MAINTENANT });
  await assertSucceeds(anonyme("autorise").ref(`${SALON}/python/sortie`).set(sortie("autorise")));
  await assertSucceeds(anonyme("hote").ref(`${SALON}/python/sortie/arret`).set(true)); // l'hôte arrête
  await assertFails(anonyme("eleve").ref(`${SALON}/python/sortie`).set(sortie("eleve")));
  await assertFails(anonyme("eleve").ref(`${SALON}/python/sortie/arret`).set(true));
});

test("curseurs : seulement le sien, et seulement si on peut modifier", async () => {
  const curseur = { l: 0, c: 3, pseudo: "X" };
  await assertSucceeds(anonyme("autorise").ref(`${SALON}/python/curseurs/autorise`).set(curseur));
  await assertFails(anonyme("autorise").ref(`${SALON}/python/curseurs/hote`).set(curseur));
  await assertFails(anonyme("eleve").ref(`${SALON}/python/curseurs/eleve`).set(curseur));
});

test("un banni ne peut rien écrire dans une salle, même s'il était éditeur", async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(`${SALON}/editeurs/banni`).set(true));
  await assertFails(anonyme("banni").ref(`${SALON}/python/code`).set(code("x", 4, "banni")));
});

// ---------- Défaut ----------

test("toute autre branche est interdite", async () => {
  await assertFails(github("sofian").ref("nimporte/quoi").set(1));
  await assertFails(anonyme("hote").ref(`${SALON}/autre`).set(1));
});
