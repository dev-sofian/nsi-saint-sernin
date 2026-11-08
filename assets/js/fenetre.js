// Fenêtre flottante : déplaçable par sa barre de titre, redimensionnable par son coin,
// réductible et fermable. Position et taille mémorisées dans le navigateur.
// Réutilisable (prévu pour le « bureau » de la phase 2).
//
// HTML attendu :
//   <section class="fenetre" hidden>
//     <header class="fenetre-titre"> … <button data-fenetre="reduire"> <button data-fenetre="fermer"> </header>
//     <div class="fenetre-corps"> … </div>
//     <div class="fenetre-poignee"></div>
//   </section>
//
// Sur petit écran (≤ 800 px), la fenêtre occupe le bas de l'écran et ne se déplace pas (voir style.css).

const MOBILE = window.matchMedia("(max-width: 800px)");
const MARGE = 8;            // distance minimale aux bords de l'écran
const LARGEUR_MIN = 320;
const HAUTEUR_MIN = 200;
let plan = 100;             // z-index : la dernière fenêtre touchée passe devant

export function creerFenetre(el, { cle, position, surChangement = () => {} } = {}) {
  const titre = el.querySelector(".fenetre-titre");
  const poignee = el.querySelector(".fenetre-poignee");
  const CLE = `nsi-fenetre-${cle}`;

  let geo = { ...position };
  try {
    const sauvee = JSON.parse(localStorage.getItem(CLE));
    if (sauvee && typeof sauvee.x === "number") geo = sauvee;
  } catch (e) { /* stockage indisponible : position par défaut */ }

  function sauver() {
    try { localStorage.setItem(CLE, JSON.stringify(geo)); } catch (e) {}
  }

  // Garde toute la fenêtre dans l'écran (sinon le coin de redimensionnement devient inaccessible).
  function contraindre() {
    geo.l = Math.max(LARGEUR_MIN, Math.min(geo.l, innerWidth - 2 * MARGE));
    geo.h = Math.max(HAUTEUR_MIN, Math.min(geo.h, innerHeight - 2 * MARGE));
    geo.x = Math.max(MARGE, Math.min(geo.x, innerWidth - geo.l - MARGE));
    geo.y = Math.max(MARGE, Math.min(geo.y, innerHeight - geo.h - MARGE));
  }

  function appliquer() {
    if (MOBILE.matches) {
      el.style.cssText = "";
      return;
    }
    contraindre();
    el.style.left = geo.x + "px";
    el.style.top = geo.y + "px";
    el.style.width = geo.l + "px";
    el.style.height = el.classList.contains("reduite") ? "" : geo.h + "px";
  }

  function auPremierPlan() {
    el.style.zIndex = ++plan;
  }

  // Glisser (déplacement ou redimensionnement) avec la souris, le doigt ou le stylet.
  function glisser(poignee, surDeplacement) {
    poignee.addEventListener("pointerdown", (ev) => {
      if (MOBILE.matches || ev.button !== 0 || ev.target.closest("button")) return;
      ev.preventDefault();
      auPremierPlan();
      const depart = { x: ev.clientX, y: ev.clientY, geo: { ...geo } };
      poignee.setPointerCapture(ev.pointerId);
      // Pendant le glissement, la visio (iframe) ne doit pas « avaler » la souris.
      document.body.classList.add("fenetre-glisse");

      const bouger = (e) => {
        surDeplacement(e.clientX - depart.x, e.clientY - depart.y, depart.geo);
        appliquer();
      };
      const finir = () => {
        poignee.removeEventListener("pointermove", bouger);
        document.body.classList.remove("fenetre-glisse");
        sauver();
        surChangement();
      };
      poignee.addEventListener("pointermove", bouger);
      poignee.addEventListener("pointerup", finir, { once: true });
      poignee.addEventListener("pointercancel", finir, { once: true });
    });
  }

  glisser(titre, (dx, dy, g) => { geo.x = g.x + dx; geo.y = g.y + dy; });
  if (poignee) glisser(poignee, (dx, dy, g) => { geo.l = g.l + dx; geo.h = g.h + dy; });

  // Clavier : barre de titre sélectionnée + flèches = déplacer (Maj + flèches = redimensionner).
  titre.tabIndex = 0;
  titre.addEventListener("keydown", (ev) => {
    const pas = 20;
    const d = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] }[ev.key];
    if (!d || MOBILE.matches) return;
    ev.preventDefault();
    if (ev.shiftKey) { geo.l += d[0]; geo.h += d[1]; } else { geo.x += d[0]; geo.y += d[1]; }
    appliquer();
    sauver();
    surChangement();
  });

  el.addEventListener("pointerdown", auPremierPlan);

  el.querySelectorAll("[data-fenetre]").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      if (bouton.dataset.fenetre === "fermer") api.fermer();
      if (bouton.dataset.fenetre === "reduire") api.reduire();
    });
  });

  addEventListener("resize", () => { if (!el.hidden) appliquer(); });
  MOBILE.addEventListener("change", () => { appliquer(); surChangement(); });

  const api = {
    element: el,
    get ouverte() { return !el.hidden; },
    ouvrir() {
      el.hidden = false;
      el.classList.remove("reduite");
      auPremierPlan();
      appliquer();
      surChangement();
    },
    fermer() {
      el.hidden = true;
      el.dispatchEvent(new CustomEvent("fenetre:fermee"));
    },
    basculer() {
      if (el.hidden) api.ouvrir(); else api.fermer();
    },
    reduire() {
      el.classList.toggle("reduite");
      appliquer();
      surChangement();
    },
  };
  return api;
}
