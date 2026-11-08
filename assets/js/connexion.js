// Page de connexion : élève (anonyme + pseudo) ou prof/admin (GitHub).

import {
  ecouterCompte, seConnecterAnonyme, seConnecterGitHub, seDeconnecter,
  changerPseudo, messageErreur, firebaseConfigure, NOMS_ROLES,
} from "./auth.js";

const $ = (id) => document.getElementById(id);

const vues = {
  chargement: $("vue-chargement"),
  nonConfigure: $("vue-non-configure"),
  deconnecte: $("vue-deconnecte"),
  connecte: $("vue-connecte"),
};
const message = $("message");

const NOMS_FOURNISSEURS = {
  "anonymous": "Anonyme (ce navigateur)",
  "github.com": "GitHub",
  "google.com": "Google",
};

function montrer(nom) {
  for (const [cle, el] of Object.entries(vues)) el.hidden = cle !== nom;
}

function afficherMessage(texte, erreur = false) {
  message.textContent = texte;
  message.classList.toggle("erreur", erreur);
  message.hidden = !texte;
}

// Page vers laquelle revenir après la connexion (ex : connexion.html?retour=visio.html).
// On n'accepte qu'un nom de page du site, jamais une adresse externe.
function pageRetour() {
  const retour = new URLSearchParams(location.search).get("retour") || "";
  return /^[a-z0-9-]+\.html$/.test(retour) && retour !== "connexion.html" ? retour : null;
}

// Bloque les boutons pendant une action pour éviter les doubles clics.
async function pendant(bouton, action) {
  bouton.disabled = true;
  afficherMessage("");
  try {
    await action();
  } catch (e) {
    console.error(e);
    afficherMessage(messageErreur(e), true);
  } finally {
    bouton.disabled = false;
  }
}

let attenteConnexion = false;

function afficherCompte(compte) {
  $("info-pseudo").textContent = compte.pseudo;
  $("info-role").textContent = compte.banni ? "Banni" : NOMS_ROLES[compte.role];
  $("info-fournisseur").textContent = NOMS_FOURNISSEURS[compte.fournisseur] || compte.fournisseur;
  $("info-uid").textContent = compte.uid;
  $("nouveau-pseudo").value = compte.pseudo;

  $("bloc-banni").hidden = !compte.banni;
  $("info-motif").textContent = compte.motifBan || "non précisé";
  $("form-pseudo").hidden = compte.banni;
}

if (!firebaseConfigure) {
  montrer("nonConfigure");
} else {
  ecouterCompte((compte) => {
    if (!compte) {
      montrer("deconnecte");
      return;
    }
    afficherCompte(compte);
    montrer("connecte");

    // Juste après une connexion réussie : retour à la page d'origine si demandé.
    const retour = pageRetour();
    if (attenteConnexion && retour && !compte.banni) location.href = retour;
    attenteConnexion = false;
  });
}

$("form-anonyme").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const bouton = ev.submitter || ev.target.querySelector("button");
  pendant(bouton, async () => {
    attenteConnexion = true;
    await seConnecterAnonyme($("pseudo-anonyme").value);
  }).finally(() => { if (message.classList.contains("erreur")) attenteConnexion = false; });
});

$("btn-github").addEventListener("click", (ev) => {
  pendant(ev.currentTarget, async () => {
    attenteConnexion = true;
    await seConnecterGitHub();
  }).finally(() => { if (message.classList.contains("erreur")) attenteConnexion = false; });
});

$("form-pseudo").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const bouton = ev.submitter || ev.target.querySelector("button");
  pendant(bouton, async () => {
    await changerPseudo($("nouveau-pseudo").value);
    afficherMessage("Pseudo enregistré.");
  });
});

$("btn-copier-uid").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("info-uid").textContent);
    afficherMessage("Identifiant copié.");
  } catch (e) {
    afficherMessage("Copie impossible : sélectionne l'identifiant à la main.", true);
  }
});

$("btn-deconnexion").addEventListener("click", (ev) => {
  pendant(ev.currentTarget, seDeconnecter);
});
