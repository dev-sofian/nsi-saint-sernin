// Liste des cours lue depuis cours/index.json, contenu en Markdown affiché avec marked

const liste = document.getElementById("liste-cours");
const contenu = document.getElementById("contenu-cours");
const recherche = document.getElementById("recherche");

let catalogue = [];

async function chargerCatalogue() {
  try {
    const rep = await fetch("cours/index.json");
    catalogue = await rep.json();
    afficherListe("");
    // Ouvre le cours indiqué dans l'adresse (ex : cours.html#premiere/01-types-de-base.md)
    const depuisAdresse = decodeURIComponent(location.hash.slice(1));
    if (depuisAdresse) ouvrirCours(depuisAdresse);
  } catch (e) {
    liste.innerHTML =
      '<p class="muted">Impossible de charger la liste. Ouvre le site avec Live Server ou en ligne (pas en double-cliquant le fichier).</p>';
  }
}

function afficherListe(filtre) {
  const f = filtre.trim().toLowerCase();
  liste.innerHTML = "";
  for (const niveau of catalogue) {
    const chapitres = niveau.chapitres.filter(
      (c) => !f || c.titre.toLowerCase().includes(f) || (c.theme || "").toLowerCase().includes(f)
    );
    if (!chapitres.length) continue;

    const titre = document.createElement("h3");
    titre.textContent = niveau.niveau;
    const ul = document.createElement("ul");
    for (const c of chapitres) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + c.fichier;
      a.textContent = c.titre;
      a.dataset.fichier = c.fichier;
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        history.replaceState(null, "", "#" + c.fichier);
        ouvrirCours(c.fichier);
      });
      li.appendChild(a);
      ul.appendChild(li);
    }
    liste.append(titre, ul);
  }
  if (!liste.children.length) liste.innerHTML = '<p class="muted">Aucun cours trouvé.</p>';
}

async function ouvrirCours(fichier) {
  contenu.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const rep = await fetch("cours/" + fichier);
    if (!rep.ok) throw new Error(rep.status);
    contenu.innerHTML = marked.parse(await rep.text());
    window.scrollTo(0, 0);
  } catch (e) {
    contenu.innerHTML = '<p class="muted">Ce cours est introuvable.</p>';
  }
  document.querySelectorAll("#liste-cours a").forEach((a) => {
    a.classList.toggle("active", a.dataset.fichier === fichier);
  });
}

recherche.addEventListener("input", () => afficherListe(recherche.value));
chargerCatalogue();
