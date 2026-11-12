// Page d'administration : liste blanche (demandes d'accès), comptes, bans, salles, journal.
// Tout est vérifié par database.rules.json : un non-admin qui ouvre cette page ne peut
// rien lire ni écrire, même en modifiant ce code.

import { ecouterCompte, firebase, messageErreur, formaterCode, NOMS_STATUTS } from "./auth.js";
import { appelerServeur, serveurConfigure } from "./serveur.js";
import { bannirCompte, entreeJournal } from "./moderation.js";

const $ = (id) => document.getElementById(id);

let fb = null;
let moi = null;
let arrets = [];
const donnees = { demandes: {}, utilisateurs: {}, bans: {}, admins: {}, profs: {}, salons: {}, journal: {} };

// ---------- Outils d'affichage ----------

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function bouton(texte, action, classe = "btn") {
  const b = el("button", classe, texte);
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await action();
    } catch (e) {
      console.error(e);
      afficherMessage(messageErreur(e), true);
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

function afficherMessage(texte, erreur = false) {
  $("message").textContent = texte;
  $("message").classList.toggle("erreur", erreur);
  $("message").hidden = !texte;
}

function dateCourte(ms) {
  if (typeof ms !== "number") return "";
  return new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function vide(conteneur, texte) {
  conteneur.replaceChildren(el("p", "muted", texte));
}

// "k7q-m4p" -> "K7QM4P"
function normaliserCode(code) {
  return (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ---------- Actions (une seule écriture groupée + entrée de journal) ----------

function journal(action, cibleUid, details) {
  return entreeJournal(fb, moi.uid, action, cibleUid, details);
}

function ecrire(modifications) {
  return fb.d.update(fb.d.ref(fb.db), modifications);
}

function nomDe(uid) {
  const u = donnees.utilisateurs[uid];
  if (!u) return uid;
  return u.nom ? `${u.pseudo} (${u.nom})` : u.pseudo;
}

async function valider(uid, demande) {
  await ecrire({
    [`utilisateurs/${uid}/statut`]: "actif",
    [`demandes/${uid}`]: null,
    ...journal("validation", uid, demande.nom),
  });
  afficherMessage(`Compte « ${demande.nom} » validé.`);
}

async function refuser(uid, demande) {
  if (!confirm(`Refuser la demande de « ${demande.nom} » ? Son compte sera effacé du site.`)) return;
  await ecrire({
    [`utilisateurs/${uid}`]: null,
    [`demandes/${uid}`]: null,
    ...journal("refus", uid, demande.nom),
  });
}

async function bannir(uid) {
  const motif = prompt(`Motif du bannissement de ${nomDe(uid)} :`);
  if (motif === null) return;
  const pseudo = donnees.utilisateurs[uid]?.pseudo || "?";
  await bannirCompte({ uid, pseudo, motif });
  // S'il est en visio, on le sort tout de suite de chaque salle où il est présent.
  const salles = Object.entries(donnees.salons).filter(([, s]) => s.participants && s.participants[uid]);
  if (salles.length && serveurConfigure()) {
    await Promise.all(salles.map(([salle]) =>
      appelerServeur("/api/exclure", { salle, cible: uid }).catch((e) => console.warn("Exclusion visio", e))));
  }
  afficherMessage(`${pseudo} est banni : il ne peut plus entrer dans les salles.`);
}

async function debannir(uid) {
  const ban = donnees.bans[uid];
  await ecrire({ [`bans/${uid}`]: null, ...journal("deban", uid, ban?.pseudo || uid) });
}

async function changerStatut(uid, statut) {
  const action = statut === "actif" ? "validation" : "suspension";
  const modifications = { [`utilisateurs/${uid}/statut`]: statut, ...journal(action, uid, nomDe(uid)) };
  // Validé : sa demande n'a plus lieu d'être. Suspendu : il en recevra une nouvelle (nouveau code).
  if (statut === "actif") modifications[`demandes/${uid}`] = null;
  await ecrire(modifications);
}

async function supprimer(uid) {
  if (!confirm(`Supprimer le compte de ${nomDe(uid)} du site ?`)) return;
  await ecrire({
    [`utilisateurs/${uid}`]: null,
    [`demandes/${uid}`]: null,
    ...journal("suppression", uid, nomDe(uid)),
  });
}

async function fermerSalle(nom) {
  if (!confirm(`Fermer et effacer la salle « ${nom} » (code Python, tchat compris) ?`)) return;
  await ecrire({ [`salons/${nom}`]: null, ...journal("fermeture_salle", nom, nom) });
}

// ---------- Rendu ----------

function rendreDemandes() {
  const liste = $("liste-demandes");
  const entrees = Object.entries(donnees.demandes).sort((a, b) => (a[1].date || 0) - (b[1].date || 0));
  $("nb-demandes").textContent = String(entrees.length);
  if (!entrees.length) return vide(liste, "Aucune demande en attente.");
  liste.replaceChildren();
  for (const [uid, demande] of entrees) {
    const ligne = el("div", "ligne-admin");
    const infos = el("div", "ligne-infos");
    infos.append(el("strong", "", demande.nom));
    if (demande.classe) infos.append(el("span", "badge", demande.classe));
    infos.append(el("span", "petit muted", dateCourte(demande.date)));

    const saisie = el("input", "champ-code");
    saisie.type = "text";
    saisie.placeholder = "Code du papier";
    saisie.maxLength = 7;
    saisie.autocomplete = "off";
    saisie.setAttribute("aria-label", `Code de vérification de ${demande.nom}`);

    const btnValider = bouton("Valider", () => valider(uid, demande), "btn primary");
    btnValider.disabled = true;
    saisie.addEventListener("input", () => {
      const ok = normaliserCode(saisie.value) === demande.code;
      btnValider.disabled = !ok;
      saisie.classList.toggle("code-ok", ok);
    });

    const voirCode = el("details", "petit");
    voirCode.append(el("summary", "", "Afficher le code attendu"), el("code", "", formaterCode(demande.code)));

    const actions = el("div", "ligne-actions");
    actions.append(saisie, btnValider, bouton("Refuser", () => refuser(uid, demande)), bouton("Bannir", () => bannir(uid)));
    ligne.append(infos, actions, voirCode);
    liste.append(ligne);
  }
}

function roleDe(uid) {
  if (donnees.admins[uid]) return "Admin";
  if (donnees.profs[uid]) return "Prof";
  return "Élève";
}

function rendreComptes() {
  const liste = $("liste-comptes");
  const filtre = $("filtre-comptes").value.trim().toLowerCase();
  const entrees = Object.entries(donnees.utilisateurs)
    .filter(([, u]) => !filtre || (u.pseudo || "").toLowerCase().includes(filtre) || (u.nom || "").includes(filtre))
    .sort((a, b) => (a[1].pseudo || "").localeCompare(b[1].pseudo || "", "fr"));
  if (!entrees.length) return vide(liste, filtre ? "Aucun compte ne correspond." : "Aucun compte.");
  liste.replaceChildren();
  for (const [uid, u] of entrees) {
    const ligne = el("div", "ligne-admin");
    const infos = el("div", "ligne-infos");
    infos.append(el("strong", "", u.pseudo));
    if (u.nom) infos.append(el("span", "muted", `@${u.nom}`));
    const role = roleDe(uid);
    infos.append(el("span", "badge", role));
    const banni = Boolean(donnees.bans[uid]);
    if (banni) infos.append(el("span", "badge badge-banni", "Banni"));
    else if (role === "Élève") infos.append(el("span", `badge ${u.statut === "actif" ? "badge-prof" : "badge-attente"}`, NOMS_STATUTS[u.statut] || u.statut));

    const actions = el("div", "ligne-actions");
    if (uid !== moi.uid && role !== "Admin") {
      if (role === "Élève" && u.fournisseur === "password" && !banni) {
        actions.append(u.statut === "actif"
          ? bouton("Suspendre", () => changerStatut(uid, "en_attente"))
          : bouton("Valider sans code", () => changerStatut(uid, "actif")));
      }
      actions.append(banni ? bouton("Débannir", () => debannir(uid)) : bouton("Bannir", () => bannir(uid)));
      actions.append(bouton("Supprimer", () => supprimer(uid)));
    }
    ligne.append(infos, actions);
    liste.append(ligne);
  }
}

function rendreBans() {
  const liste = $("liste-bans");
  const entrees = Object.entries(donnees.bans);
  if (!entrees.length) return vide(liste, "Personne n'est banni.");
  liste.replaceChildren();
  for (const [uid, ban] of entrees) {
    const ligne = el("div", "ligne-admin");
    const infos = el("div", "ligne-infos");
    infos.append(el("strong", "", ban.pseudo), el("span", "muted", ban.motif || "sans motif"), el("span", "petit muted", dateCourte(ban.date)));
    const actions = el("div", "ligne-actions");
    actions.append(bouton("Débannir", () => debannir(uid)));
    ligne.append(infos, actions);
    liste.append(ligne);
  }
}

function rendreSalles() {
  const liste = $("liste-salles");
  const entrees = Object.entries(donnees.salons);
  if (!entrees.length) return vide(liste, "Aucune salle.");
  liste.replaceChildren();
  for (const [nom, salle] of entrees) {
    const presents = Object.values(salle.participants || {});
    const ligne = el("div", "ligne-admin");
    const infos = el("div", "ligne-infos");
    infos.append(el("strong", "", nom));
    infos.append(el("span", "muted", presents.length ? `${presents.length} présent(s) : ${presents.map((p) => p.pseudo).join(", ")}` : "vide"));
    if (salle.hote) infos.append(el("span", "petit muted", `hôte : ${nomDe(salle.hote)}`));
    const actions = el("div", "ligne-actions");
    actions.append(bouton("Fermer", () => fermerSalle(nom)));
    ligne.append(infos, actions);
    liste.append(ligne);
  }
}

const NOMS_ACTIONS = {
  ban: "a banni", deban: "a débanni", ajout_prof: "a ajouté le prof", retrait_prof: "a retiré le prof",
  kick: "a exclu", validation: "a validé", refus: "a refusé", suspension: "a suspendu",
  suppression: "a supprimé", fermeture_salle: "a fermé la salle",
};

function rendreJournal() {
  const liste = $("liste-journal");
  const entrees = Object.values(donnees.journal).sort((a, b) => (b.date || 0) - (a.date || 0));
  if (!entrees.length) return vide(liste, "Journal vide.");
  liste.replaceChildren();
  for (const j of entrees) {
    const auteur = donnees.admins[j.auteurUid] || nomDe(j.auteurUid);
    liste.append(el("p", "", `${dateCourte(j.date)} — ${auteur} ${NOMS_ACTIONS[j.action] || j.action} : ${j.details}`));
  }
}

function toutRendre() {
  rendreDemandes();
  rendreComptes();
  rendreBans();
  rendreSalles();
  rendreJournal();
}

$("filtre-comptes").addEventListener("input", rendreComptes);

// ---------- Démarrage ----------

function arreterEcoutes() {
  arrets.forEach((arreter) => arreter());
  arrets = [];
}

function ecouter(cle, ref) {
  arrets.push(fb.d.onValue(ref, (snap) => {
    donnees[cle] = snap.val() || {};
    toutRendre();
  }, (e) => {
    console.error(e);
    afficherMessage(messageErreur(e), true);
  }));
}

ecouterCompte(async (compte) => {
  moi = compte;
  arreterEcoutes();
  const admin = Boolean(compte && compte.role === "admin");
  $("vue-refus").hidden = admin;
  $("vue-admin").hidden = !admin;
  if (!admin) return;
  fb = await firebase();
  const { d, db } = fb;
  for (const cle of ["demandes", "utilisateurs", "bans", "admins", "profs", "salons"]) {
    ecouter(cle, d.ref(db, cle));
  }
  ecouter("journal", d.query(d.ref(db, "journal"), d.limitToLast(50)));
});
