// Tests des règles de la Realtime Database (database.rules.json) avec l'émulateur Firebase.
// Lancer : cd tests && npm install && npm test   (Java 11+ nécessaire)

import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";

const MAINTENANT = { ".sv": "timestamp" }; // heure du serveur
const SALON = "salons/nsi-terminale";
const DOMAINE = "@nsi-saint-sernin.firebaseapp.com"; // = DOMAINE_COMPTES de auth.js

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nsi",
    database: { rules: readFileSync(new URL("../database.rules.json", import.meta.url), "utf8") },
  });
});
after(() => env.cleanup());

const membre = (pseudo, nom) => ({ pseudo, fournisseur: "password", cree: 1, statut: "actif", nom });

// Données de départ : un admin, un prof, des élèves validés, un élève en attente,
// un élève banni, une salle ouverte par « hote ».
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      admins: { sofian: "Sofian E." },
      profs: { prof1: { nom: "M. Prof", ajoutePar: "sofian", date: 1 } },
      bans: { banni: { pseudo: "Troll", motif: "spam", auteurUid: "sofian", date: 1 } },
      utilisateurs: {
        eleve: membre("Léa", "lea"),
        hote: membre("Hôte", "hote"),
        autorise: membre("Autorisé", "autorise"),
        banni: membre("Troll", "troll"),
        attente: { pseudo: "tom", fournisseur: "password", cree: 1, statut: "en_attente", nom: "tom" },
      },
      demandes: { attente: { nom: "tom", code: "K7QM4P", classe: "TG2", date: 1 } },
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

// Élève à mot de passe : son adresse technique est nom + DOMAINE.
const eleve = (uid, nom = uid) => env.authenticatedContext(uid, {
  email: nom + DOMAINE,
  firebase: { sign_in_provider: "password" },
}).database();
const github = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "github.com" } }).database();
const anonyme = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).database();
const visiteur = () => env.unauthenticatedContext().database();

const profil = (pseudo, extra = {}) => ({ pseudo, fournisseur: "password", cree: MAINTENANT, statut: "en_attente", ...extra });
const demande = (nom, code = "AB2CD3") => ({ nom, code, classe: "1G3", date: MAINTENANT });
const ban = (auteurUid) => ({ pseudo: "Léa", motif: "insultes", auteurUid, date: MAINTENANT });
const code = (texte, v, par) => ({ texte, v, par, pseudo: "X" });

// ---------- Profils et liste blanche ----------

test("un élève crée son profil, forcément « en attente »", async () => {
  await assertSucceeds(eleve("nouveau", "zoe").ref("utilisateurs/nouveau").set(profil("zoe", { nom: "zoe" })));
  await assertFails(eleve("autre", "max").ref("utilisateurs/autre").set(profil("max", { statut: "actif" })));
});

test("le nom d'utilisateur doit correspondre au compte et ne change jamais", async () => {
  await assertFails(eleve("nouveau", "zoe").ref("utilisateurs/nouveau").set(profil("zoe", { nom: "sofian" })));
  await assertFails(eleve("eleve", "lea").ref("utilisateurs/eleve/nom").set("autre"));
});

test("un élève ne peut pas se valider lui-même", async () => {
  await assertFails(eleve("attente", "tom").ref("utilisateurs/attente/statut").set("actif"));
  await assertFails(eleve("attente", "tom").ref("utilisateurs/attente").set({ pseudo: "tom", fournisseur: "password", cree: 1, statut: "actif", nom: "tom" }));
});

test("un admin valide un compte ; un prof ou un élève ne peut pas", async () => {
  await assertFails(github("prof1").ref("utilisateurs/attente/statut").set("actif"));
  await assertFails(eleve("eleve", "lea").ref("utilisateurs/attente/statut").set("actif"));
  await assertSucceeds(github("sofian").ref("utilisateurs/attente/statut").set("actif"));
});

test("un admin peut suspendre un compte (retour en attente)", async () => {
  await assertSucceeds(github("sofian").ref("utilisateurs/eleve/statut").set("en_attente"));
  await assertFails(github("sofian").ref("utilisateurs/eleve/statut").set("roi"));
});

test("un profil de l'ancienne version (sans statut) peut être complété « en attente », pas « actif »", async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref("utilisateurs/ancien").set({ pseudo: "Vieux", fournisseur: "anonymous", cree: 1 }));
  await assertFails(anonyme("ancien").ref("utilisateurs/ancien").update({ statut: "actif" }));
  await assertSucceeds(anonyme("ancien").ref("utilisateurs/ancien").update({ statut: "en_attente" }));
});

test("pseudo invalide refusé (trop court, trop long, caractères interdits)", async () => {
  for (const pseudo of ["a", "x".repeat(21), "<script>", ""]) {
    await assertFails(eleve("nouveau", "zoe").ref("utilisateurs/nouveau").set(profil(pseudo)));
  }
});

test("on ne peut pas mentir sur son fournisseur de connexion", async () => {
  await assertFails(eleve("nouveau", "zoe").ref("utilisateurs/nouveau").set(profil("zoe", { fournisseur: "github.com" })));
});

test("champ supplémentaire (ex : role) refusé", async () => {
  await assertFails(eleve("nouveau", "zoe").ref("utilisateurs/nouveau").set(profil("zoe", { role: "admin" })));
});

test("on ne crée pas le profil de quelqu'un d'autre", async () => {
  await assertFails(eleve("pirate").ref("utilisateurs/autre").set(profil("Faux")));
});

test("changer son pseudo : oui ; changer la date de création ou le profil d'un autre : non", async () => {
  const db = eleve("eleve", "lea");
  await assertSucceeds(db.ref("utilisateurs/eleve/pseudo").set("Léa M"));
  await assertFails(db.ref("utilisateurs/eleve/cree").set(12345));
  await assertFails(eleve("pirate").ref("utilisateurs/eleve/pseudo").set("Pirate"));
});

test("profils : chacun lit le sien, les admins lisent tout", async () => {
  await assertSucceeds(eleve("eleve", "lea").ref("utilisateurs/eleve").get());
  await assertFails(eleve("autre").ref("utilisateurs/eleve").get());
  await assertFails(visiteur().ref("utilisateurs/eleve").get());
  await assertFails(eleve("eleve", "lea").ref("utilisateurs").get());
  await assertSucceeds(github("sofian").ref("utilisateurs").get());
});

test("un banni ne peut plus modifier son profil, mais lit son ban", async () => {
  const db = eleve("banni", "troll");
  await assertFails(db.ref("utilisateurs/banni/pseudo").set("Troll2"));
  await assertSucceeds(db.ref("bans/banni").get());
});

// ---------- Demandes d'accès ----------

test("un élève en attente crée sa demande une seule fois, à son nom", async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref("demandes/attente").remove());
  const db = eleve("attente", "tom");
  await assertFails(db.ref("demandes/attente").set(demande("lea")));        // pas son nom
  await assertFails(db.ref("demandes/attente").set(demande("tom", "abc"))); // code invalide
  await assertSucceeds(db.ref("demandes/attente").set(demande("tom")));
  await assertFails(db.ref("demandes/attente").set(demande("tom", "ZZZZZZ"))); // déjà créée
});

test("un élève déjà validé ne crée pas de demande", async () => {
  await assertFails(eleve("eleve", "lea").ref("demandes/eleve").set(demande("lea")));
});

test("demandes : l'élève lit la sienne, les admins lisent et suppriment", async () => {
  await assertSucceeds(eleve("attente", "tom").ref("demandes/attente").get());
  await assertFails(eleve("eleve", "lea").ref("demandes/attente").get());
  await assertFails(github("prof1").ref("demandes").get());
  await assertSucceeds(github("sofian").ref("demandes").get());
  await assertSucceeds(github("sofian").ref("demandes/attente").remove());
});

test("validation en une seule écriture (statut + suppression de la demande + journal)", async () => {
  await assertSucceeds(github("sofian").ref().update({
    "utilisateurs/attente/statut": "actif",
    "demandes/attente": null,
    "journal/j1": { action: "validation", cibleUid: "attente", details: "tom", auteurUid: "sofian", date: MAINTENANT },
  }));
});

// ---------- Admins ----------

test("personne ne peut s'ajouter admin depuis le site, même un admin", async () => {
  await assertFails(github("pirate").ref("admins/pirate").set("Moi"));
  await assertFails(github("sofian").ref("admins/ami").set("Ami"));
});

test("on peut lire son propre statut admin, pas celui des autres", async () => {
  await assertSucceeds(eleve("eleve", "lea").ref("admins/eleve").get());
  await assertFails(eleve("eleve", "lea").ref("admins/sofian").get());
  await assertFails(eleve("eleve", "lea").ref("admins").get());
});

// ---------- Bans ----------

test("un admin connecté avec GitHub peut bannir", async () => {
  await assertSucceeds(github("sofian").ref("bans/eleve").set(ban("sofian")));
});

test("un admin connecté autrement que par GitHub n'a aucun droit", async () => {
  await assertFails(anonyme("sofian").ref("bans/eleve").set(ban("sofian")));
  await assertFails(eleve("sofian").ref("utilisateurs/attente/statut").set("actif"));
});

test("un prof ou un élève ne peut pas bannir", async () => {
  await assertFails(github("prof1").ref("bans/eleve").set(ban("prof1")));
  await assertFails(eleve("eleve", "lea").ref("bans/autre").set(ban("eleve")));
});

test("un admin ne peut pas falsifier l'auteur d'un ban, ni se bannir", async () => {
  await assertFails(github("sofian").ref("bans/eleve").set(ban("quelquun")));
  await assertFails(github("sofian").ref("bans/sofian").set(ban("sofian")));
});

test("seul un admin lève un ban ; le banni ne peut pas se débannir", async () => {
  await assertFails(eleve("banni", "troll").ref("bans/banni").remove());
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
  await assertFails(eleve("eleve", "lea").ref("journal").get());
});

// ---------- Salons ----------

test("lire une salle : membre validé et non banni uniquement", async () => {
  await assertSucceeds(eleve("eleve", "lea").ref(SALON).get());
  await assertSucceeds(github("prof1").ref(SALON).get());
  await assertFails(eleve("attente", "tom").ref(SALON).get()); // pas encore validé
  await assertFails(anonyme("inconnu").ref(SALON).get());
  await assertFails(visiteur().ref(SALON).get());
  await assertFails(eleve("banni", "troll").ref(SALON).get());
});

test("un compte en attente ne peut rien écrire dans une salle", async () => {
  await assertFails(eleve("attente", "tom").ref("salons/nouvelle/hote").set("attente"));
  await assertFails(eleve("attente", "tom").ref(`${SALON}/participants/attente`).set({ pseudo: "tom", depuis: MAINTENANT }));
});

test("le premier arrivé devient hôte ; on ne peut pas voler la place", async () => {
  await assertSucceeds(eleve("eleve", "lea").ref("salons/nouvelle/hote").set("eleve"));
  await assertFails(eleve("autorise").ref("salons/nouvelle/hote").set("autorise"));
  await assertFails(eleve("autorise").ref("salons/autre-salle/hote").set("quelquun"));
  await assertSucceeds(github("sofian").ref("salons/nouvelle/hote").set("sofian")); // admin
});

test("nom de salle invalide refusé", async () => {
  await assertFails(eleve("eleve", "lea").ref("salons/Salle Pas Valide/hote").set("eleve"));
});

test("seul un admin ferme (supprime) une salle", async () => {
  await assertFails(eleve("hote").ref(SALON).remove());
  await assertFails(github("prof1").ref(SALON).remove());
  await assertSucceeds(github("sofian").ref(SALON).remove());
});

test("activer le Python ou le partage d'écran et donner les droits : hôte, admin ou prof uniquement", async () => {
  for (const module of ["python", "partage"]) {
    await assertSucceeds(eleve("hote").ref(`${SALON}/modules/${module}`).set(true));
    await assertSucceeds(github("prof1").ref(`${SALON}/modules/${module}`).set(false));
    await assertFails(eleve("eleve", "lea").ref(`${SALON}/modules/${module}`).set(true));
  }
  await assertFails(eleve("hote").ref(`${SALON}/modules/autre`).set(true));
  await assertSucceeds(eleve("hote").ref(`${SALON}/editeurs/eleve`).set(true));
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/editeurs/eleve`).set(true));
  await assertFails(eleve("autorise").ref(`${SALON}/editeurs/eleve`).set(true));
});

test("présence : chacun ne s'inscrit que lui-même", async () => {
  await assertSucceeds(eleve("eleve", "lea").ref(`${SALON}/participants/eleve`).set({ pseudo: "Léa", depuis: MAINTENANT }));
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/participants/autre`).set({ pseudo: "Faux", depuis: MAINTENANT }));
  await assertFails(eleve("banni", "troll").ref(`${SALON}/participants/banni`).set({ pseudo: "Troll", depuis: MAINTENANT }));
});

// ---------- Main levée ----------

test("main levée : on lève la sienne, l'hôte peut la baisser", async () => {
  const main = { pseudo: "Léa", date: MAINTENANT };
  await assertSucceeds(eleve("eleve", "lea").ref(`${SALON}/mains/eleve`).set(main));
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/mains/autorise`).set(main));
  await assertFails(eleve("autorise").ref(`${SALON}/mains/eleve`).remove());
  await assertSucceeds(eleve("hote").ref(`${SALON}/mains/eleve`).remove());
});

// ---------- Tchat ----------

test("tchat : on écrit à son nom, on ne modifie pas, l'hôte supprime", async () => {
  const msg = (par, texte = "Bonjour") => ({ par, pseudo: "X", texte, date: MAINTENANT });
  const db = eleve("eleve", "lea");
  await assertSucceeds(db.ref(`${SALON}/messages/m1`).set(msg("eleve")));
  await assertFails(db.ref(`${SALON}/messages/m2`).set(msg("autorise")));       // au nom d'un autre
  await assertFails(db.ref(`${SALON}/messages/m1`).set(msg("eleve", "modifié"))); // modification
  await assertFails(db.ref(`${SALON}/messages/m3`).set(msg("eleve", "x".repeat(501))));
  await assertFails(db.ref(`${SALON}/messages/m1`).remove());
  await assertSucceeds(eleve("hote").ref(`${SALON}/messages/m1`).remove());
  await assertFails(db.ref(`${SALON}/messages`).remove());
  await assertSucceeds(github("prof1").ref(`${SALON}/messages`).remove()); // vider le tchat
});

test("tchat interdit aux comptes en attente", async () => {
  await assertFails(eleve("attente", "tom").ref(`${SALON}/messages/m1`).set({ par: "attente", pseudo: "tom", texte: "salut", date: MAINTENANT }));
});

// ---------- Partage d'écran ----------

test("partage : l'hôte demande, la personne visée répond, les autres non", async () => {
  const demandePartage = { cible: "eleve", statut: "demande", par: "hote", date: MAINTENANT };
  await assertFails(eleve("autorise").ref(`${SALON}/partage`).set({ ...demandePartage, par: "autorise" }));
  await assertSucceeds(eleve("hote").ref(`${SALON}/partage`).set(demandePartage));
  await assertFails(eleve("autorise").ref(`${SALON}/partage/statut`).set("accepte"));
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/partage/statut`).set("demande"));
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/partage/cible`).set("autorise"));
  await assertSucceeds(eleve("eleve", "lea").ref(`${SALON}/partage/statut`).set("accepte"));
  await assertSucceeds(eleve("eleve", "lea").ref(`${SALON}/partage/statut`).set("fini"));
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/partage`).remove());
  await assertSucceeds(eleve("hote").ref(`${SALON}/partage`).remove());
});

test("partage : impossible de répondre s'il n'y a pas de demande", async () => {
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/partage/statut`).set("accepte"));
});

// ---------- Python partagé ----------

test("modifier le code : hôte et éditeurs autorisés, pas les autres", async () => {
  await assertSucceeds(eleve("hote").ref(`${SALON}/python/code`).set(code("a", 4, "hote")));
  await assertSucceeds(eleve("autorise").ref(`${SALON}/python/code`).set(code("b", 5, "autorise")));
  await assertSucceeds(github("prof1").ref(`${SALON}/python/code`).set(code("c", 6, "prof1")));
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/python/code`).set(code("pirate", 7, "eleve")));
});

test("le numéro de version doit augmenter de 1 exactement", async () => {
  const db = eleve("hote");
  await assertFails(db.ref(`${SALON}/python/code`).set(code("a", 3, "hote")));  // même version
  await assertFails(db.ref(`${SALON}/python/code`).set(code("a", 10, "hote"))); // saut
  await assertSucceeds(db.ref(`${SALON}/python/code`).set(code("a", 4, "hote")));
});

test("on ne peut pas signer une modification au nom d'un autre", async () => {
  await assertFails(eleve("autorise").ref(`${SALON}/python/code`).set(code("b", 4, "hote")));
});

test("code trop long refusé (> 20 000 caractères)", async () => {
  await assertFails(eleve("hote").ref(`${SALON}/python/code`).set(code("x".repeat(20001), 4, "hote")));
});

test("sortie : un éditeur publie, un simple participant ne peut pas", async () => {
  const sortie = (par) => ({ texte: "1\n", erreur: "", etat: "fini", par, pseudo: "X", date: MAINTENANT });
  await assertSucceeds(eleve("autorise").ref(`${SALON}/python/sortie`).set(sortie("autorise")));
  await assertSucceeds(eleve("hote").ref(`${SALON}/python/sortie/arret`).set(true)); // l'hôte arrête
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/python/sortie`).set(sortie("eleve")));
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/python/sortie/arret`).set(true));
});

test("curseurs : seulement le sien, et seulement si on peut modifier", async () => {
  const curseur = { l: 0, c: 3, pseudo: "X" };
  await assertSucceeds(eleve("autorise").ref(`${SALON}/python/curseurs/autorise`).set(curseur));
  await assertFails(eleve("autorise").ref(`${SALON}/python/curseurs/hote`).set(curseur));
  await assertFails(eleve("eleve", "lea").ref(`${SALON}/python/curseurs/eleve`).set(curseur));
});

test("un banni ne peut rien écrire dans une salle, même s'il était éditeur", async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref(`${SALON}/editeurs/banni`).set(true));
  await assertFails(eleve("banni", "troll").ref(`${SALON}/python/code`).set(code("x", 4, "banni")));
});

// ---------- Défaut ----------

test("toute autre branche est interdite", async () => {
  await assertFails(github("sofian").ref("nimporte/quoi").set(1));
  await assertFails(eleve("hote").ref(`${SALON}/autre`).set(1));
});
