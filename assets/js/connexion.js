// Page de connexion : élève (nom d'utilisateur + mot de passe, liste blanche) ou prof/admin (GitHub).

import {
  ecouterCompte, inscrire, seConnecterMotDePasse, seConnecterGitHub, seDeconnecter,
  changerPseudo, changerMotDePasse, messageErreur, firebaseConfigure, formaterCode,
  NOMS_ROLES,
} from "./auth.js";
import { LIEN_FORMULAIRE_ACCES } from "./site-config.js";

const $ = (id) => document.getElementById(id);

const vues = {
  chargement: $("vue-chargement"),
  nonConfigure: $("vue-non-configure"),
  deconnecte: $("vue-deconnecte"),
  connecte: $("vue-connecte"),
};
const message = $("message");

const NOMS_FOURNISSEURS = {
  "password": "Nom d'utilisateur et mot de passe",
  "github.com": "GitHub",
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
    return true;
  } catch (e) {
    console.error(e);
    afficherMessage(messageErreur(e), true);
    return false;
  } finally {
    bouton.disabled = false;
  }
}

// ---------- Onglets « J'ai un compte » / « Créer un compte » ----------

for (const onglet of document.querySelectorAll("[data-onglet]")) {
  onglet.addEventListener("click", () => {
    for (const autre of document.querySelectorAll("[data-onglet]")) {
      const actif = autre === onglet;
      autre.classList.toggle("actif", actif);
      autre.setAttribute("aria-selected", String(actif));
      $(autre.dataset.onglet).hidden = !actif;
    }
    afficherMessage("");
  });
}

// ---------- Affichage du compte ----------

let attenteConnexion = false;

function afficherCompte(compte) {
  const eleveMdp = compte.fournisseur === "password";
  $("info-pseudo").textContent = compte.pseudo;
  $("info-nom").textContent = compte.nom;
  $("titre-nom").hidden = $("info-nom").hidden = !eleveMdp;
  $("info-role").textContent = compte.banni ? "Banni" : NOMS_ROLES[compte.role];
  $("info-statut").textContent = compte.banni ? "Bloqué" : compte.membre ? "Autorisé" : "En attente de validation";
  $("info-fournisseur").textContent = NOMS_FOURNISSEURS[compte.fournisseur] || compte.fournisseur;
  $("info-uid").textContent = compte.uid;
  $("nouveau-pseudo").value = compte.pseudo;

  // Code à recopier sur le papier / le formulaire.
  const enAttente = !compte.banni && eleveMdp && compte.statut !== "actif";
  $("bloc-attente").hidden = !enAttente;
  if (enAttente) {
    $("attente-nom").textContent = compte.nom;
    $("attente-code").textContent = compte.demande ? formaterCode(compte.demande.code) : "(indisponible, recharge la page)";
    $("ligne-formulaire").hidden = !LIEN_FORMULAIRE_ACCES;
    if (LIEN_FORMULAIRE_ACCES) $("lien-formulaire").href = LIEN_FORMULAIRE_ACCES;
  }
  $("bloc-github-sans-role").hidden = compte.banni || eleveMdp || compte.role !== "eleve";

  $("bloc-banni").hidden = !compte.banni;
  $("info-motif").textContent = compte.motifBan || "non précisé";
  $("form-pseudo").hidden = compte.banni;
  $("bloc-mdp").hidden = !eleveMdp;
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

    // Juste après une connexion réussie : retour à la page d'origine si le compte y a accès.
    const retour = pageRetour();
    if (attenteConnexion && retour && compte.membre) location.href = retour;
    attenteConnexion = false;
  });
}

// ---------- Formulaires ----------

$("form-connexion").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  attenteConnexion = true;
  const ok = await pendant(ev.submitter || ev.target.querySelector("button"), () =>
    seConnecterMotDePasse($("nom-connexion").value, $("mdp-connexion").value));
  if (!ok) attenteConnexion = false;
  $("mdp-connexion").value = "";
});

$("form-inscription").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  await pendant(ev.submitter || ev.target.querySelector("button"), async () => {
    if ($("mdp-inscription").value !== $("mdp2-inscription").value) throw new Error("mdp-differents");
    await inscrire($("nom-inscription").value, $("mdp-inscription").value, $("classe-inscription").value);
  });
  $("mdp-inscription").value = "";
  $("mdp2-inscription").value = "";
});

// Le nom d'utilisateur est toujours en minuscules : on corrige pendant la frappe.
$("nom-inscription").addEventListener("input", (ev) => {
  const champ = ev.target;
  const propre = champ.value.toLowerCase().replace(/\s/g, "");
  if (propre !== champ.value) champ.value = propre;
});

$("btn-github").addEventListener("click", async (ev) => {
  attenteConnexion = true;
  const ok = await pendant(ev.currentTarget, seConnecterGitHub);
  if (!ok) attenteConnexion = false;
});

$("form-pseudo").addEventListener("submit", (ev) => {
  ev.preventDefault();
  pendant(ev.submitter || ev.target.querySelector("button"), async () => {
    await changerPseudo($("nouveau-pseudo").value);
    afficherMessage("Pseudo enregistré.");
  });
});

$("form-mdp").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const ok = await pendant(ev.submitter || ev.target.querySelector("button"), async () => {
    if ($("mdp-nouveau").value !== $("mdp-nouveau2").value) throw new Error("mdp-differents");
    await changerMotDePasse($("mdp-ancien").value, $("mdp-nouveau").value);
    afficherMessage("Mot de passe changé.");
  });
  if (ok) ev.target.reset();
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
