// Zone « compte » à droite de la barre du haut, présente sur toutes les pages.
// Affiche « Se connecter » ou le pseudo + rôle + bouton de déconnexion.
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
    const lien = element("a", "btn", "Se connecter");
    const retour = location.pathname.split("/").pop() || "index.html";
    lien.href = retour === "connexion.html" ? "connexion.html" : `connexion.html?retour=${encodeURIComponent(retour)}`;
    zone.append(lien);
    return;
  }

  const lienProfil = element("a", "compte-nom", compte.pseudo);
  lienProfil.href = "connexion.html";
  lienProfil.title = "Mon compte";

  const badge = compte.banni
    ? element("span", "badge badge-banni", "Banni")
    : element("span", `badge badge-${compte.role}`, NOMS_ROLES[compte.role]);

  const btn = element("button", "btn", "Déconnexion");
  btn.type = "button";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try { await seDeconnecter(); } finally { btn.disabled = false; }
  });

  zone.append(lienProfil, badge, btn);
}

if (firebaseConfigure && zone) {
  zone.textContent = "…";
}

ecouterCompte((compte) => {
  if (firebaseConfigure) afficher(compte);
  document.dispatchEvent(new CustomEvent("nsi:compte", { detail: compte }));
});
