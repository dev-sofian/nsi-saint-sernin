// Salle de classe : visio LiveKit auto-hébergée + Python partagé + partage d'écran sur demande
// + tchat + main levée.
//
// Qui fait quoi :
//   - salle.js          : état de la salle dans Firebase (présence, droits, tchat, mains, demandes d'écran)
//   - visio-media.js    : audio / vidéo / écran avec LiveKit
//   - visio-panneau.js  : liste des participants et tchat
//   - python-partage.js : éditeur Python partagé (fenêtre flottante)
//   - serveur.js        : appels au serveur de visio (jeton d'entrée, droits d'écran, exclusion)

import { ecouterCompte, firebaseConfigure, messageErreur } from "./auth.js";
import { Salle } from "./salle.js";
import { PythonPartage, rafraichirEditeur } from "./python-partage.js";
import { creerFenetre } from "./fenetre.js";
import { appelerServeur, serveurConfigure } from "./serveur.js";
import { bannirCompte } from "./moderation.js";
import { Media } from "./visio-media.js";
import { Panneau } from "./visio-panneau.js";

const $ = (id) => document.getElementById(id);
const form = $("form-salle");
const salleInput = $("salle");

let compte = null;
let salle = null;    // Salle (Firebase)
let python = null;   // PythonPartage
let pythonEtaitActif = null;

const fenetre = creerFenetre($("fenetre-python"), {
  cle: "python",
  position: { x: Math.max(16, innerWidth - 620), y: 140, l: 600, h: 560 },
  surChangement: rafraichirEditeur,
});

const media = new Media({
  grille: $("scene-grille"),
  ecran: $("scene-ecran"),
  ecranVideo: $("ecran-video"),
  ecranLegende: $("ecran-legende"),
  sons: $("sons"),
});

const panneau = new Panneau(
  {
    participants: $("liste-participants"),
    nb: $("nb-participants"),
    messages: $("tchat-messages"),
    vider: $("btn-vider-tchat"),
  },
  {
    demanderEcran,
    arreterEcran: arreterPartageDistant,
    exclure,
    bannir,
    baisserMain: (uid) => salle.baisserMain(uid),
    erreur: (e) => message(messageErreur(e), true),
  },
);

// "NSI Terminale B" -> "nsi-terminale-b"
function nettoyer(nom) {
  return nom
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 40);
}

function message(texte, erreur = false) {
  const el = $("visio-message");
  el.textContent = texte;
  el.classList.toggle("erreur", erreur);
  el.hidden = !texte;
}

// Bloque un bouton pendant une action et affiche l'erreur éventuelle.
async function pendant(bouton, action) {
  bouton.disabled = true;
  try {
    await action();
  } catch (e) {
    console.error(e);
    message(messageErreur(e), true);
  } finally {
    bouton.disabled = false;
    majBoutons();
  }
}

try {
  salleInput.value = new URLSearchParams(location.search).get("salle") || localStorage.getItem("nsi-salle") || "";
} catch (e) {}

// ---------- Compte ----------

function montrerAccueil(c) {
  const dansSalle = Boolean(salle);
  $("vue-chargement").hidden = true;
  $("visio-non-configure").hidden = firebaseConfigure;
  $("visio-connexion").hidden = !firebaseConfigure || Boolean(c);
  $("visio-attente").hidden = !c || c.banni || c.membre;
  $("visio-banni").hidden = !(c && c.banni);
  form.hidden = dansSalle || !(c && c.membre);
  $("avert-serveur").hidden = form.hidden || serveurConfigure();
  $("visio-identite").textContent = c && c.membre ? `Tu entres en tant que ${c.pseudo}.` : "";
}

ecouterCompte((c) => {
  compte = c;
  // Banni ou suspendu pendant la séance : on sort de la salle.
  if (salle && !(c && c.membre)) quitter();
  montrerAccueil(c);
});

// ---------- Entrer dans une salle ----------

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const nom = nettoyer(salleInput.value);
  if (!nom || !compte || !compte.membre) {
    salleInput.focus();
    return;
  }
  try { localStorage.setItem("nsi-salle", salleInput.value.trim()); } catch (e) {}
  const bouton = ev.submitter || form.querySelector("button");
  bouton.disabled = true;
  try {
    await quitter();
    await entrer(nom);
  } finally {
    bouton.disabled = false;
  }
});

async function entrer(nom) {
  message("");
  try {
    salle = await Salle.rejoindre(nom, compte);
  } catch (e) {
    console.error(e);
    salle = null;
    message(messageErreur(e), true);
    return;
  }
  $("nom-salle").textContent = nom;
  $("vue-salle").hidden = false;
  montrerAccueil(compte);

  // Python partagé : si son éditeur n'a pas pu être chargé (CDN bloqué), le reste de la salle marche.
  try {
    python = new PythonPartage(salle);
    python.demarrer();
  } catch (e) {
    console.error(e);
    python = null;
    message("Python partagé indisponible (éditeur non chargé). La visio et le tchat fonctionnent.", true);
  }
  panneau.attacher(salle, compte.role === "admin");
  salle.addEventListener("change", majSalle);
  salle.addEventListener("messages", () => panneau.rendreTchat());
  salle.addEventListener("erreur", () => message("Accès à la salle refusé.", true));
  majSalle();

  // Visio : jeton d'entrée délivré par notre serveur, puis connexion à LiveKit.
  if (!serveurConfigure()) {
    $("etat-visio").textContent = "visio indisponible (serveur non configuré)";
    majBoutons();
    return;
  }
  $("etat-visio").textContent = "connexion à la visio…";
  try {
    const { jeton, url } = await appelerServeur("/api/jeton", { salle: nom });
    if (!salle || salle.nom !== nom) return; // on a quitté entre-temps
    await media.connecter(url, jeton);
    $("etat-visio").textContent = "";
  } catch (e) {
    console.error(e);
    $("etat-visio").textContent = "visio indisponible";
    message(`${messageErreur(e)} Le tchat et le Python partagé fonctionnent quand même.`, true);
  }
  majBoutons();
}

// ---------- Mise à jour de l'affichage ----------

function majSalle() {
  if (!salle) return;
  panneau.rendreParticipants();
  media.afficherMains(salle.mains.map((m) => m.uid));
  suivrePartage();
  majBoutons();
  if (!salle.pret) return;

  $("role-salle").textContent = salle.estHote ? (compte.role === "eleve" ? "Hôte" : (compte.role === "admin" ? "Admin" : "Prof")) : "Participant";

  // L'hôte active le Python : la fenêtre s'ouvre chez tout le monde.
  const actif = salle.pythonActif && Boolean(python);
  if (actif && pythonEtaitActif !== true) fenetre.ouvrir();
  if (!actif && pythonEtaitActif === true && !salle.estHote) fenetre.fermer();
  pythonEtaitActif = actif;
}

function majBoutons() {
  const dansSalle = Boolean(salle && salle.pret);
  const enVisio = media.connecte;

  const btnMicro = $("btn-micro");
  btnMicro.disabled = !enVisio;
  btnMicro.textContent = media.micro ? "Couper le micro" : "Activer le micro";
  btnMicro.classList.toggle("actif", media.micro);

  const btnCamera = $("btn-camera");
  btnCamera.disabled = !enVisio;
  btnCamera.textContent = media.camera ? "Couper la caméra" : "Activer la caméra";
  btnCamera.classList.toggle("actif", media.camera);

  $("btn-son").hidden = media.sonAutorise;

  // Partage d'écran : l'hôte quand le module est actif ; un participant seulement
  // pendant qu'il partage à la demande de l'hôte (pour pouvoir arrêter).
  const btnEcran = $("btn-ecran");
  const partage = dansSalle ? salle.partage : null;
  const moiCible = partage && partage.cible === salle.uid;
  btnEcran.hidden = !enVisio || !dansSalle || !((salle.estHote && salle.partageActif) || media.ecranPartage);
  btnEcran.textContent = media.ecranPartage ? "Arrêter mon partage" : "Partager mon écran";
  btnEcran.classList.toggle("actif", media.ecranPartage);

  // Bouton « Arrêter ce partage » sur le grand écran : pour l'hôte, quand un participant partage.
  $("btn-arreter-partage").hidden = !(dansSalle && salle.estHote && partage && !moiCible
    && media.identiteEcranAffiche === partage.cible);

  const btnMain = $("btn-main");
  btnMain.disabled = !dansSalle;
  btnMain.textContent = dansSalle && salle.mainLevee ? "✋ Baisser la main" : "✋ Lever la main";
  btnMain.classList.toggle("actif", dansSalle && salle.mainLevee);

  const btnPython = $("btn-python");
  btnPython.disabled = !dansSalle || !python || !(salle.pythonActif || salle.estHote);
  btnPython.title = btnPython.disabled ? "L'hôte n'a pas encore activé le Python" : "";

  const hote = dansSalle && salle.estHote;
  const btnModPy = $("btn-module-python");
  btnModPy.hidden = !hote;
  if (hote) btnModPy.textContent = salle.pythonActif ? "Désactiver Python pour tous" : "Activer Python pour tous";
  const btnModEcran = $("btn-module-partage");
  btnModEcran.hidden = !hote;
  if (hote) btnModEcran.textContent = salle.partageActif ? "Désactiver le partage d'écran" : "Activer le partage d'écran";
}

media.addEventListener("etat", majBoutons);
media.addEventListener("reseau", (ev) => {
  $("etat-visio").textContent = ev.detail === "reconnexion" ? "connexion perdue, reconnexion…" : "";
});
media.addEventListener("deconnexion", (ev) => {
  const textes = {
    exclu: "Tu as été exclu de la salle par l'hôte.",
    doublon: "Tu as rejoint cette salle depuis un autre onglet ou appareil : celui-ci a été déconnecté.",
    "salle-fermee": "La salle a été fermée.",
    reseau: "La visio s'est coupée. Quitte la salle et rejoins-la pour réessayer.",
  };
  if (ev.detail === "exclu") {
    quitter().then(() => message(textes.exclu, true));
    return;
  }
  $("etat-visio").textContent = "visio coupée";
  message(textes[ev.detail] || textes.reseau, true);
});

// ---------- Partage d'écran sur demande ----------
//
// 1. L'hôte clique « Écran » à côté d'un participant : le serveur lui donne le droit de
//    partager (LiveKit), puis la demande est écrite dans la salle (Firebase).
// 2. Le participant voit une fenêtre « Choisir quoi partager / Refuser ».
// 3. Il répond (accepte / refuse) ; quand il arrête, il écrit « fini ».
// 4. L'hôte (ou la fin) retire le droit et efface la demande.

const dialogue = $("dialogue-partage");

async function demanderEcran(uid) {
  if (!salle.partageActif) throw Object.assign(new Error("Active d'abord le partage d'écran."), { serveur: true });
  // Un seul partage à la fois.
  if (salle.partage) await arreterPartageDistant();
  if (media.ecranPartage) await media.partagerEcran(false);
  await appelerServeur("/api/partage", { salle: salle.nom, cible: uid, autoriser: true });
  await salle.demanderPartage(uid);
  message(`Demande envoyée à ${salle.pseudoDe(uid)}.`);
}

let arretEnCours = false;
async function arreterPartageDistant() {
  const p = salle && salle.partage;
  if (!p || arretEnCours) return;
  arretEnCours = true;
  try {
    await salle.terminerPartage(); // la personne arrête de partager en voyant la demande disparaître
    await appelerServeur("/api/partage", { salle: salle.nom, cible: p.cible, autoriser: false })
      .catch((e) => console.warn("Retrait du droit de partage", e));
  } finally {
    arretEnCours = false;
  }
}

function suivrePartage() {
  const p = salle.partage;
  const moiCible = Boolean(p && p.cible === salle.uid);

  // Côté participant : afficher ou retirer la demande.
  if (moiCible && p.statut === "demande" && !dialogue.open) {
    $("dialogue-qui").textContent = salle.pseudoDe(p.par);
    dialogue.showModal();
  }
  if (!(moiCible && p.statut === "demande") && dialogue.open) dialogue.close();

  // L'hôte a arrêté (ou le module est coupé) : on arrête de partager.
  if (!salle.estHote && media.ecranPartage && (!moiCible || !salle.partageActif)) {
    media.partagerEcran(false).catch(console.error);
  }

  // Côté hôte : la personne a refusé ou a fini → on range tout.
  if (salle.estHote && p && !moiCible && (p.statut === "refuse" || p.statut === "fini")) {
    if (p.statut === "refuse") message(`${salle.pseudoDe(p.cible)} a refusé de partager son écran.`);
    arreterPartageDistant().catch(console.error);
  }
}

$("btn-accepter-partage").addEventListener("click", async () => {
  dialogue.close();
  try {
    await media.partagerEcran(true);
    await salle.repondrePartage("accepte");
  } catch (e) {
    console.error(e);
    // Annulé dans la fenêtre du navigateur, ou droit pas (encore) reçu.
    await salle.repondrePartage("refuse").catch(() => {});
    if (e && e.name !== "NotAllowedError") message("Partage d'écran impossible.", true);
  }
});

$("btn-refuser-partage").addEventListener("click", async () => {
  dialogue.close();
  await salle.repondrePartage("refuse").catch(console.error);
});

// Échap ferme la fenêtre : on le traite comme un refus.
dialogue.addEventListener("cancel", () => {
  if (salle && salle.partage && salle.partage.cible === salle.uid) salle.repondrePartage("refuse").catch(() => {});
});

// Mon partage s'arrête (bouton du navigateur, ou bouton « Arrêter mon partage »).
media.addEventListener("ecran", (ev) => {
  if (ev.detail || !salle) return;
  const p = salle.partage;
  if (p && p.cible === salle.uid && p.statut === "accepte") salle.repondrePartage("fini").catch(() => {});
});

$("btn-ecran").addEventListener("click", (ev) => pendant(ev.currentTarget, async () => {
  if (media.ecranPartage) {
    await media.partagerEcran(false);
    return;
  }
  // L'hôte reprend la main : il arrête le partage d'un participant avant de montrer le sien.
  if (salle.partage) await arreterPartageDistant();
  try {
    await media.partagerEcran(true);
  } catch (e) {
    if (e && e.name === "NotAllowedError") return; // annulé dans la fenêtre du navigateur
    throw e;
  }
}));

$("btn-arreter-partage").addEventListener("click", (ev) => pendant(ev.currentTarget, arreterPartageDistant));

// ---------- Modération ----------

async function exclure(uid, pseudo) {
  if (!confirm(`Exclure ${pseudo} de la salle ? Il pourra revenir (un admin peut le bannir).`)) return;
  if (salle.partage && salle.partage.cible === uid) await arreterPartageDistant();
  await appelerServeur("/api/exclure", { salle: salle.nom, cible: uid });
  await salle.baisserMain(uid).catch(() => {});
  message(`${pseudo} a été exclu de la visio.`);
}

async function bannir(uid, pseudo) {
  const motif = prompt(`Motif du bannissement de ${pseudo} :`);
  if (motif === null) return;
  await bannirCompte({ uid, pseudo, motif });
  if (serveurConfigure()) await appelerServeur("/api/exclure", { salle: salle.nom, cible: uid }).catch(() => {});
  message(`${pseudo} est banni.`);
}

// ---------- Boutons de la salle ----------

$("btn-micro").addEventListener("click", (ev) => pendant(ev.currentTarget, () => media.basculerMicro()));
$("btn-camera").addEventListener("click", (ev) => pendant(ev.currentTarget, () => media.basculerCamera()));
$("btn-son").addEventListener("click", (ev) => pendant(ev.currentTarget, () => media.activerSon()));
$("btn-main").addEventListener("click", (ev) => pendant(ev.currentTarget, () => salle.leverMain(!salle.mainLevee)));
$("btn-python").addEventListener("click", () => fenetre.basculer());

$("btn-module-python").addEventListener("click", (ev) => pendant(ev.currentTarget, () => salle.activerPython(!salle.pythonActif)));

$("btn-module-partage").addEventListener("click", (ev) => pendant(ev.currentTarget, async () => {
  const activer = !salle.partageActif;
  if (!activer) {
    await arreterPartageDistant();
    if (media.ecranPartage) await media.partagerEcran(false);
  }
  await salle.activerPartage(activer);
}));

$("form-tchat").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const champ = $("tchat-texte");
  const texte = champ.value;
  if (!texte.trim() || !salle) return;
  champ.value = "";
  try {
    await salle.envoyerMessage(texte);
  } catch (e) {
    champ.value = texte;
    message(messageErreur(e), true);
  }
});

$("btn-vider-tchat").addEventListener("click", (ev) => pendant(ev.currentTarget, async () => {
  if (confirm("Effacer tout le tchat de la salle ?")) await salle.viderTchat();
}));

$("btn-quitter").addEventListener("click", () => quitter());

async function quitter() {
  const s = salle;
  salle = null;
  if (dialogue.open) dialogue.close();
  await media.deconnecter().catch(() => {});
  if (python) python.quitter();
  python = null;
  panneau.detacher();
  if (s) {
    if (s.estHote && s.partage) await s.terminerPartage().catch(() => {});
    await s.quitter();
  }
  pythonEtaitActif = null;
  fenetre.fermer();
  $("vue-salle").hidden = true;
  $("etat-visio").textContent = "";
  message("");
  montrerAccueil(compte);
}

// Quitter proprement en fermant l'onglet (la présence Firebase est de toute façon retirée).
addEventListener("pagehide", () => { media.deconnecter().catch(() => {}); });
