// Tests des règles Firestore (firestore.rules) avec l'émulateur Firebase.
// Lancer : cd tests && npm install && npm test   (Java 11+ nécessaire)

import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nsi",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
after(() => env.cleanup());

// Données de départ : un admin, un prof, un élève banni.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "admins/sofian"), { nom: "Sofian E." });
    await setDoc(doc(db, "profs/prof1"), { nom: "M. Prof" });
    await setDoc(doc(db, "bans/banni"), { pseudo: "Troll", motif: "spam", auteurUid: "sofian", date: new Date() });
    await setDoc(doc(db, "utilisateurs/eleve"), { pseudo: "Léa", fournisseur: "anonymous", cree: new Date() });
  });
});

const github = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "github.com" } }).firestore();
const anonyme = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
const visiteur = () => env.unauthenticatedContext().firestore();

const ban = (auteurUid) => ({ pseudo: "Léa", motif: "insultes", auteurUid, date: serverTimestamp() });

// ---------- Profils ----------

test("un élève anonyme crée son propre profil", async () => {
  await assertSucceeds(setDoc(doc(anonyme("nouveau"), "utilisateurs/nouveau"), {
    pseudo: "Élodie", fournisseur: "anonymous", cree: serverTimestamp(),
  }));
});

test("pseudo invalide refusé (trop court, trop long, caractères interdits)", async () => {
  for (const pseudo of ["a", "x".repeat(21), "<script>", ""]) {
    await assertFails(setDoc(doc(anonyme("nouveau"), "utilisateurs/nouveau"), {
      pseudo, fournisseur: "anonymous", cree: serverTimestamp(),
    }));
  }
});

test("on ne peut pas mentir sur son fournisseur de connexion", async () => {
  await assertFails(setDoc(doc(anonyme("nouveau"), "utilisateurs/nouveau"), {
    pseudo: "Élodie", fournisseur: "github.com", cree: serverTimestamp(),
  }));
});

test("champ supplémentaire (ex : role) refusé", async () => {
  await assertFails(setDoc(doc(anonyme("nouveau"), "utilisateurs/nouveau"), {
    pseudo: "Élodie", fournisseur: "anonymous", cree: serverTimestamp(), role: "admin",
  }));
});

test("on ne crée pas le profil de quelqu'un d'autre", async () => {
  await assertFails(setDoc(doc(anonyme("pirate"), "utilisateurs/autre"), {
    pseudo: "Faux", fournisseur: "anonymous", cree: serverTimestamp(),
  }));
});

test("changer son pseudo : oui ; changer autre chose : non", async () => {
  const db = anonyme("eleve");
  await assertSucceeds(updateDoc(doc(db, "utilisateurs/eleve"), { pseudo: "Léa M" }));
  await assertFails(updateDoc(doc(db, "utilisateurs/eleve"), { fournisseur: "github.com" }));
  await assertFails(updateDoc(doc(anonyme("pirate"), "utilisateurs/eleve"), { pseudo: "Pirate" }));
});

test("un visiteur non connecté ne lit pas les profils", async () => {
  await assertFails(getDoc(doc(visiteur(), "utilisateurs/eleve")));
  await assertSucceeds(getDoc(doc(anonyme("autre"), "utilisateurs/eleve")));
});

test("un banni ne peut ni créer de profil ni lire ceux des autres", async () => {
  const db = anonyme("banni");
  await assertFails(setDoc(doc(db, "utilisateurs/banni"), {
    pseudo: "Troll", fournisseur: "anonymous", cree: serverTimestamp(),
  }));
  await assertFails(getDoc(doc(db, "utilisateurs/eleve")));
  await assertSucceeds(getDoc(doc(db, "bans/banni"))); // il peut lire son ban (motif)
});

// ---------- Admins ----------

test("personne ne peut s'ajouter admin depuis le site, même un admin", async () => {
  await assertFails(setDoc(doc(github("pirate"), "admins/pirate"), { nom: "Moi" }));
  await assertFails(setDoc(doc(github("sofian"), "admins/ami"), { nom: "Ami" }));
});

test("on peut lire son propre document admin, pas celui des autres", async () => {
  await assertSucceeds(getDoc(doc(anonyme("eleve"), "admins/eleve")));
  await assertFails(getDoc(doc(anonyme("eleve"), "admins/sofian")));
});

// ---------- Bans ----------

test("un admin connecté avec GitHub peut bannir", async () => {
  await assertSucceeds(setDoc(doc(github("sofian"), "bans/eleve"), ban("sofian")));
});

test("un admin connecté autrement que par GitHub n'a aucun droit", async () => {
  await assertFails(setDoc(doc(anonyme("sofian"), "bans/eleve"), ban("sofian")));
});

test("un prof ou un élève ne peut pas bannir", async () => {
  await assertFails(setDoc(doc(github("prof1"), "bans/eleve"), ban("prof1")));
  await assertFails(setDoc(doc(anonyme("eleve"), "bans/autre"), ban("eleve")));
});

test("un admin ne peut pas falsifier l'auteur d'un ban ni bannir un admin", async () => {
  await assertFails(setDoc(doc(github("sofian"), "bans/eleve"), ban("quelquun")));
  await assertFails(setDoc(doc(github("sofian"), "bans/sofian"), ban("sofian")));
});

test("seul un admin lève un ban ; le banni ne peut pas se débannir", async () => {
  await assertFails(deleteDoc(doc(anonyme("banni"), "bans/banni")));
  await assertSucceeds(deleteDoc(doc(github("sofian"), "bans/banni")));
});

// ---------- Profs ----------

test("un admin ajoute un prof ; un prof ne peut pas en ajouter", async () => {
  const prof = (auteur) => ({ nom: "Mme Prof", ajoutePar: auteur, date: serverTimestamp() });
  await assertSucceeds(setDoc(doc(github("sofian"), "profs/nouveau"), prof("sofian")));
  await assertFails(setDoc(doc(github("prof1"), "profs/autre"), prof("prof1")));
});

// ---------- Journal ----------

test("journal : un admin écrit, personne ne modifie ni n'efface", async () => {
  const db = github("sofian");
  const ref = doc(db, "journal/e1");
  await assertSucceeds(setDoc(ref, {
    action: "ban", cibleUid: "eleve", details: "insultes", auteurUid: "sofian", date: serverTimestamp(),
  }));
  await assertFails(updateDoc(ref, { details: "rien" }));
  await assertFails(deleteDoc(ref));
  await assertFails(getDoc(doc(anonyme("eleve"), "journal/e1")));
});

// ---------- Défaut ----------

test("toute autre collection est interdite", async () => {
  await assertFails(setDoc(doc(github("sofian"), "nimporte/quoi"), { a: 1 }));
});
