// Page Cours : cours/index.json décrit niveaux → chapitres → parties (sous-catégories) → documents.
// Types de documents : notebook (.ipynb), markdown (.md), pdf, fichier (à télécharger), lien (site externe).
// Adresses : cours.html#poo (chapitre) et cours.html#poo/principes (document).

import { afficherNotebook, afficherMarkdown } from "./notebook.js";

const liste = document.getElementById("liste-cours");
const contenu = document.getElementById("contenu-cours");
const recherche = document.getElementById("recherche");
const TITRE_PAGE = document.title;

let catalogue = [];
const chapitres = new Map(); // id → { niveau, chapitre }
const documents = new Map(); // "chapitre/document" → { niveau, chapitre, partie, doc }

// ---------- Catalogue ----------

const EXTENSIONS = { ipynb: "notebook", md: "markdown", pdf: "pdf" };

function typeDe(doc) {
  if (doc.type) return doc.type;
  if (doc.url) return "lien";
  return EXTENSIONS[(doc.fichier || "").split(".").pop()] || "fichier";
}

function etiquette(doc) {
  const type = typeDe(doc);
  if (type === "lien") return "web ↗";
  return (doc.fichier || "").split(".").pop();
}

function nomDeFichier(chemin) {
  return chemin.split("/").pop();
}

// Accepte aussi l'ancien format { titre, fichier } (un chapitre = un seul fichier)
function normaliser(brut) {
  for (const niveau of brut) {
    for (const ch of niveau.chapitres) {
      ch.id ||= (ch.fichier || ch.titre).replace(/^.*\//, "").replace(/\.\w+$/, "");
      if (!ch.parties) {
        ch.parties = ch.fichier ? [{ titre: "Cours", documents: [{ id: "cours", titre: ch.titre, fichier: ch.fichier }]}] : [];
      }
      chapitres.set(ch.id, { niveau, chapitre: ch });
      for (const partie of ch.parties) {
        for (const doc of partie.documents) {
          if (typeDe(doc) === "lien") continue; // un lien s'ouvre dans un nouvel onglet
          doc.id ||= nomDeFichier(doc.fichier).replace(/\.\w+$/, "");
          documents.set(`${ch.id}/${doc.id}`, { niveau, chapitre: ch, partie, doc });
        }
      }
    }
  }
  return brut;
}

function nombreDeDocuments(ch) {
  return ch.parties.reduce((s, p) => s + p.documents.length, 0);
}

// ---------- Liste de gauche ----------

function lienDocument(ch, doc) {
  const a = document.createElement("a");
  a.textContent = doc.titre + " ";
  const ext = document.createElement("span");
  ext.className = "ext";
  ext.textContent = etiquette(doc);
  a.appendChild(ext);
  if (typeDe(doc) === "lien") {
    a.href = doc.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  } else {
    a.href = `#${ch.id}/${doc.id}`;
    a.dataset.cle = `${ch.id}/${doc.id}`;
  }
  return a;
}

function correspond(texte, f) {
  return texte.toLowerCase().includes(f);
}

function afficherListe(filtre) {
  const f = filtre.trim().toLowerCase();
  liste.innerHTML = "";
  for (const niveau of catalogue) {
    const blocs = [];
    for (const ch of niveau.chapitres) {
      const chapitreCorrespond = !f || correspond(ch.titre, f) || correspond(ch.theme || "", f);
      const details = document.createElement("details");
      details.className = "chapitre";
      details.dataset.id = ch.id;
      if (f) details.open = true;

      const resume = document.createElement("summary");
      const titre = document.createElement("a");
      titre.href = "#" + ch.id;
      titre.dataset.cle = ch.id;
      titre.textContent = ch.titre;
      const nombre = document.createElement("span");
      nombre.className = "ext";
      nombre.textContent = nombreDeDocuments(ch) || "bientôt";
      resume.append(titre, nombre);
      details.appendChild(resume);

      let trouves = 0;
      for (const partie of ch.parties) {
        const docs = partie.documents.filter((d) => chapitreCorrespond || correspond(d.titre, f) || correspond(partie.titre, f));
        if (!docs.length) continue;
        trouves += docs.length;
        const p = document.createElement("p");
        p.className = "partie";
        p.textContent = partie.titre;
        const ul = document.createElement("ul");
        for (const d of docs) {
          const li = document.createElement("li");
          li.appendChild(lienDocument(ch, d));
          ul.appendChild(li);
        }
        details.append(p, ul);
      }
      if (!ch.parties.length) {
        const vide = document.createElement("p");
        vide.className = "partie muted";
        vide.textContent = "Les documents arrivent bientôt.";
        details.appendChild(vide);
      }
      if (chapitreCorrespond || trouves) blocs.push(details);
    }
    if (!blocs.length) continue;
    const h3 = document.createElement("h3");
    h3.textContent = niveau.niveau;
    liste.append(h3, ...blocs);
  }
  if (!liste.children.length) liste.innerHTML = '<p class="muted">Aucun cours trouvé.</p>';
  marquerActif(decodeURIComponent(location.hash.slice(1)));
}

function marquerActif(cle) {
  const chapitreActif = cle.split("/")[0];
  for (const a of liste.querySelectorAll("a[data-cle]")) {
    a.classList.toggle("active", a.dataset.cle === cle);
  }
  const details = liste.querySelector(`details[data-id="${CSS.escape(chapitreActif)}"]`);
  if (details) details.open = true;
}

// ---------- Contenu ----------

function filDAriane(morceaux) {
  const p = document.createElement("p");
  p.className = "fil";
  morceaux.forEach((m, i) => {
    if (i) p.append(" › ");
    if (m.href) {
      const a = document.createElement("a");
      a.href = m.href;
      a.textContent = m.texte;
      p.appendChild(a);
    } else {
      p.append(m.texte);
    }
  });
  return p;
}

function message(texte) {
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = texte;
  return p;
}

// Sur téléphone, la liste est au-dessus : on descend jusqu'au contenu, juste sous la barre du haut
function placerEnHaut() {
  if (!matchMedia("(max-width: 800px)").matches) return window.scrollTo(0, 0);
  const barre = document.querySelector(".barre");
  const marge = barre ? barre.getBoundingClientRect().bottom + 6 : 0;
  window.scrollTo(0, contenu.getBoundingClientRect().top + window.scrollY - marge);
}

function montrer(...elements) {
  contenu.replaceChildren(...elements);
  placerEnHaut();
}

function afficherAccueil() {
  document.title = TITRE_PAGE;
  montrer(message("Choisis un chapitre dans la liste."));
}

function afficherChapitre({ niveau, chapitre: ch }) {
  document.title = `${ch.titre} — NSI St Sernin`;
  const h1 = document.createElement("h1");
  h1.textContent = ch.titre;
  const elements = [filDAriane([{ texte: niveau.niveau }, { texte: ch.theme || "" }].filter((m) => m.texte)), h1];
  for (const partie of ch.parties) {
    const h2 = document.createElement("h2");
    h2.textContent = partie.titre;
    const ul = document.createElement("ul");
    ul.className = "docs-chapitre";
    for (const d of partie.documents) {
      const li = document.createElement("li");
      li.appendChild(lienDocument(ch, d));
      ul.appendChild(li);
    }
    elements.push(h2, ul);
  }
  if (!ch.parties.length) elements.push(message("Ce chapitre n'a pas encore de documents. Ils arrivent bientôt."));
  montrer(...elements);
}

function lienAction(texte, href, options = {}) {
  const a = document.createElement("a");
  a.className = "btn btn-petit";
  a.textContent = texte;
  a.href = href;
  if (options.telecharger) a.download = options.telecharger;
  if (options.externe) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  if (options.titre) a.title = options.titre;
  return a;
}

function urlAbsolue(chemin) {
  return new URL("cours/" + chemin, location.href).href;
}

function barreActions(doc) {
  const barre = document.createElement("div");
  barre.className = "actions-doc";
  const type = typeDe(doc);
  if (type === "notebook") {
    // Basthon (Jupyter dans le navigateur) télécharge le notebook depuis le site, ainsi que ses fichiers annexes
    let basthon = "https://notebook.basthon.fr/?from=" + encodeURIComponent(urlAbsolue(doc.fichier));
    for (const annexe of doc.annexes || []) basthon += "&aux=" + encodeURIComponent(urlAbsolue(annexe));
    barre.appendChild(lienAction("Ouvrir dans Basthon ↗", basthon, {
      externe: true,
      titre: "Exécuter et compléter le notebook dans le navigateur (rien à installer)",
    }));
  }
  if (type !== "markdown") {
    barre.appendChild(lienAction(`Télécharger ${nomDeFichier(doc.fichier)}`, "cours/" + doc.fichier, { telecharger: nomDeFichier(doc.fichier) }));
  }
  for (const annexe of doc.annexes || []) {
    barre.appendChild(lienAction(`Télécharger ${nomDeFichier(annexe)}`, "cours/" + annexe, { telecharger: nomDeFichier(annexe) }));
  }
  return barre.children.length ? barre : null;
}

let ouverture = 0; // évite qu'un document lent s'affiche après un plus récent

async function ouvrirDocument({ niveau, chapitre: ch, partie, doc }) {
  const numero = ++ouverture;
  document.title = `${doc.titre} — NSI St Sernin`;
  const entete = document.createElement("header");
  entete.className = "entete-doc";
  entete.appendChild(filDAriane([{ texte: niveau.niveau }, { texte: ch.titre, href: "#" + ch.id }, { texte: partie.titre }]));
  const actions = barreActions(doc);
  if (actions) entete.appendChild(actions);
  const corps = document.createElement("div");
  corps.appendChild(message("Chargement…"));
  montrer(entete, corps);

  const type = typeDe(doc);
  try {
    if (type === "pdf") {
      const objet = document.createElement("object");
      objet.className = "pdf";
      objet.type = "application/pdf";
      objet.data = "cours/" + doc.fichier;
      objet.appendChild(message("Ton navigateur n'affiche pas les PDF ici : utilise le bouton Télécharger."));
      corps.replaceChildren(objet);
      return;
    }
    if (type === "fichier") {
      corps.replaceChildren(message("Ce fichier se télécharge avec le bouton ci-dessus."));
      return;
    }
    const rep = await fetch("cours/" + doc.fichier);
    if (!rep.ok) throw new Error(rep.status);
    if (numero !== ouverture) return;
    corps.replaceChildren();
    if (type === "notebook") await afficherNotebook(await rep.json(), corps);
    else await afficherMarkdown(await rep.text(), corps);
    placerEnHaut(); // le navigateur a pu décaler la page pendant le chargement
  } catch (e) {
    console.error(e);
    if (numero === ouverture) corps.replaceChildren(message("Ce document est introuvable ou illisible."));
  }
}

function router() {
  const cle = decodeURIComponent(location.hash.slice(1));
  marquerActif(cle);
  if (!cle) return afficherAccueil();
  if (documents.has(cle)) return ouvrirDocument(documents.get(cle));
  if (chapitres.has(cle)) return afficherChapitre(chapitres.get(cle));
  // Anciennes adresses (cours.html#terminale/01-recursivite.md) : on cherche par nom de fichier
  const ancien = [...documents.values()].find((d) => d.doc.fichier === cle);
  if (ancien) return ouvrirDocument(ancien);
  document.title = TITRE_PAGE;
  montrer(message("Ce cours est introuvable. Choisis-en un dans la liste."));
}

async function chargerCatalogue() {
  try {
    const rep = await fetch("cours/index.json");
    catalogue = normaliser(await rep.json());
  } catch (e) {
    liste.innerHTML =
      '<p class="muted">Impossible de charger la liste. Ouvre le site avec Live Server ou en ligne (pas en double-cliquant le fichier).</p>';
    return;
  }
  afficherListe("");
  router();
}

recherche.addEventListener("input", () => afficherListe(recherche.value));
window.addEventListener("hashchange", router);
chargerCatalogue();
