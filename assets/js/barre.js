// Barre du haut façon Waybar (présente sur toutes les pages) :
//   - espace de travail actif en violet (selon la page ouverte) ;
//   - raccourcis Alt+1…4 pour changer d'espace, comme dans Sway ;
//   - cercle d'état du serveur de visio (jaune-vert = en ligne, rouge = injoignable) ;
//   - horloge.

import { urlServeurVisio } from "./site-config.js";

const page = location.pathname.split("/").pop() || "index.html";

// Espace actif
for (const lien of document.querySelectorAll(".espaces .ws")) {
  if (lien.getAttribute("href") === page) {
    lien.classList.add("actif");
    lien.setAttribute("aria-current", "page");
  }
}

// Alt+1…4 : changer d'espace de travail (sauf pendant la frappe dans un champ).
addEventListener("keydown", (ev) => {
  if (!ev.altKey || ev.ctrlKey || ev.metaKey || !/^[1-4]$/.test(ev.key)) return;
  const lien = document.querySelector(`.espaces .ws[data-raccourci="${ev.key}"]`);
  if (!lien || lien.hidden) return;
  ev.preventDefault();
  location.href = lien.getAttribute("href");
});

// Horloge : « ven. 13 nov. 14:45 », comme le module horloge de la Waybar.
const horloge = document.getElementById("horloge");
function majHorloge() {
  if (!horloge) return;
  const maintenant = new Date();
  horloge.textContent = maintenant.toLocaleString("fr-FR", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
  horloge.dateTime = maintenant.toISOString();
}
majHorloge();
setInterval(majHorloge, 15000);

// État du serveur de visio. Le résultat est partagé avec la page (événement "nsi:serveur").
const voyant = document.getElementById("etat-serveur");
export let etatServeur = "inconnu"; // "ok", "eteint", "absent" (pas configuré)

async function verifierServeur() {
  const base = urlServeurVisio();
  if (!base) {
    etatServeur = "absent";
  } else {
    try {
      const reponse = await fetch(`${base}/api/sante`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      etatServeur = reponse.ok ? "ok" : "eteint";
    } catch (e) {
      etatServeur = "eteint";
    }
  }
  if (voyant) {
    voyant.classList.toggle("ok", etatServeur === "ok");
    voyant.classList.toggle("eteint", etatServeur === "eteint");
    const textes = {
      ok: "Serveur de visio en ligne",
      eteint: "Serveur de visio injoignable (éteint, ou bloqué par une extension)",
      absent: "Serveur de visio pas encore configuré",
    };
    voyant.title = textes[etatServeur];
    voyant.setAttribute("aria-label", textes[etatServeur]);
  }
  document.dispatchEvent(new CustomEvent("nsi:serveur", { detail: etatServeur }));
}
verifierServeur();
setInterval(verifierServeur, 60000);
