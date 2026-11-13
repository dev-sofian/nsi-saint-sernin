// Zone « compte » à droite de la barre du haut, présente sur toutes les pages.
// Affiche « se connecter » ou le pseudo + rôle + bouton ⏻ (déconnexion), et montre
// l'espace de travail 4 « admin » aux administrateurs.
// Prévient aussi la page avec l'événement "nsi:compte" (detail = compte ou null).

import { ecouterCompte, seDeconnecter, firebaseConfigure, NOMS_ROLES } from "./auth.js";

const zone = document.getElementById("zone-compte");

function element(balise, classe, texte) {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

function afficher(compte) {
  if (!zone) return;
  zone.replaceChildren();

  if (!compte) {
    const lien = element("a", "pastille pastille-violette", "se connecter");
    const retour = location.pathname.split("/").pop() || "index.html";
    lien.href = retour === "connexion.html" ? "connexion.html" : `connexion.html?retour=${encodeURIComponent(retour)}`;
    zone.append(lien);
    return;
  }

  const lienProfil = element("a", "pastille compte-nom", compte.pseudo);
  lienProfil.href = "connexion.html";
  lienProfil.title = "Mon compte";

  let badge;
  if (compte.banni) badge = element("span", "badge badge-banni", "Banni");
  else if (!compte.membre) badge = element("span", "badge badge-attente", "En attente");
  else badge = element("span", `badge badge-${compte.role}`, NOMS_ROLES[compte.role]);
  lienProfil.append(badge);

  const btn = element("button", "pastille pastille-arret", "⏻");
  btn.type = "button";
  btn.title = "Se déconnecter";
  btn.setAttribute("aria-label", "Se déconnecter");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try { await seDeconnecter(); } finally { btn.disabled = false; }
  });
  zone.append(lienProfil, btn);
}

function majEspaceAdmin(compte) {
  const lien = document.querySelector(".espaces .ws-admin");
  if (lien) lien.hidden = !(compte && compte.role === "admin");
}

if (firebaseConfigure && zone) {
  zone.textContent = "…";
}

ecouterCompte((compte) => {
  if (firebaseConfigure) afficher(compte);
  majEspaceAdmin(compte);
  document.dispatchEvent(new CustomEvent("nsi:compte", { detail: compte }));
});
