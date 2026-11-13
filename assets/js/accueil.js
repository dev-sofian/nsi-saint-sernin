// Accueil : terminal façon kitty (faux fastfetch + quelques commandes) et pluie de mots-clés
// Python façon cmatrix. Tout le texte affiché passe par textContent.

import { etatServeur } from "./barre.js";

const $ = (id) => document.getElementById(id);

// ---------- fastfetch ----------

function remplir(id, texte, classe = "") {
  const dd = $(id);
  dd.textContent = texte;
  dd.className = classe;
}

document.addEventListener("nsi:compte", (ev) => {
  const c = ev.detail;
  $("ff-qui").textContent = c ? c.pseudo : "invite";
  if (!c) remplir("ff-compte", "anonyme (cours et Python seulement)");
  else if (c.banni) remplir("ff-compte", "bloqué", "ko");
  else if (!c.membre) remplir("ff-compte", "en attente de validation", "attention");
  else remplir("ff-compte", { admin: "admin", prof: "prof", eleve: "élève validé" }[c.role], "ok");
});

function afficherServeur(etat) {
  if (etat === "ok") remplir("ff-visio", "en ligne", "ok");
  else if (etat === "eteint") remplir("ff-visio", "éteinte", "attention");
  else if (etat === "absent") remplir("ff-visio", "pas encore configurée", "attention");
}
document.addEventListener("nsi:serveur", (ev) => afficherServeur(ev.detail));
afficherServeur(etatServeur);

fetch("cours/index.json")
  .then((r) => r.json())
  .then((niveaux) => {
    const chapitres = niveaux.flatMap((n) => n.chapitres);
    const docs = chapitres.reduce(
      (somme, c) => somme + (c.parties ? c.parties.reduce((s, p) => s + p.documents.length, 0) : 1),
      0
    );
    // « 7 chapitres, 24 documents (Terminale) »
    const detail = niveaux.map((n) => n.niveau).join(", ");
    remplir("ff-cours", `${chapitres.length} chapitres, ${docs} documents (${detail})`);
  })
  .catch(() => remplir("ff-cours", "indisponible", "ko"));

// ---------- Terminal ----------

const sortie = $("term-sortie");
const entree = $("term-entree");

function ligne(texte, classe = "") {
  const p = document.createElement("p");
  p.textContent = texte;
  if (classe) p.className = classe;
  sortie.append(p);
}

const AIDE = [
  "cours       ouvrir les cours            (Alt+1)",
  "classe      rejoindre une salle de classe (Alt+2)",
  "python      ouvrir l'éditeur Python      (Alt+3)",
  "connexion   se connecter ou créer un compte",
  "clear       effacer le terminal",
];

const PAGES = {
  cours: "cours.html",
  classe: "visio.html",
  visio: "visio.html",
  python: "python.html",
  connexion: "connexion.html",
  compte: "connexion.html",
  admin: "admin.html",
  accueil: "index.html",
};

function executer(commande) {
  const mot = commande.trim().toLowerCase().replace(/^cd\s+~?\/?/, "");
  if (!mot) return;
  ligne(`❯❯❯ ${commande.trim()}`, "cmd");
  if (mot === "aide" || mot === "help") {
    AIDE.forEach((l) => ligne(l));
  } else if (mot === "clear") {
    sortie.replaceChildren();
  } else if (mot === "whoami") {
    ligne($("ff-qui").textContent);
  } else if (mot === "neofetch" || mot === "fastfetch") {
    ligne("c'est juste au-dessus 🙂");
  } else if (mot === "sudo" || mot.startsWith("sudo ")) {
    ligne("bien essayé. Les droits se vérifient côté serveur.", "err");
  } else if (PAGES[mot]) {
    location.href = PAGES[mot];
  } else {
    ligne(`commande introuvable : ${mot}. Tape « aide ».`, "err");
  }
}

$("term-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  executer(entree.value);
  entree.value = "";
});

ligne("Bienvenue. Tape « aide » pour la liste des commandes.");

// ---------- Pluie de mots-clés Python (façon cmatrix) ----------

const toile = $("pluie");
const ctx = toile.getContext("2d");
const MOTS = ["def", "for", "while", "return", "lambda", "if", "else", "elif", "import", "print", "range", "len",
  "True", "False", "None", "and", "or", "not", "in", "class", "try", "except", "yield", "list", "dict", "input"];
const TAILLE = 15;
let colonnes = [];
let largeur = 0;
let hauteur = 0;

function nouvelleGoutte(enHaut) {
  const mot = MOTS[Math.floor(Math.random() * MOTS.length)] + " ";
  return {
    lettres: mot,
    i: 0,
    y: enHaut ? -Math.floor(Math.random() * 30) : Math.floor(Math.random() * (hauteur / TAILLE)),
    rare: Math.random() < 0.08, // quelques gouttes magenta, comme dans le rice
  };
}

function redimensionner() {
  const ratio = window.devicePixelRatio || 1;
  largeur = toile.clientWidth;
  hauteur = toile.clientHeight;
  toile.width = largeur * ratio;
  toile.height = hauteur * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.font = `italic ${TAILLE}px "Maple Mono", "JetBrains Mono", monospace`;
  const n = Math.max(1, Math.floor(largeur / (TAILLE * 1.6)));
  colonnes = Array.from({ length: n }, () => nouvelleGoutte(false));
  ctx.fillStyle = "rgba(11, 15, 36, 1)";
  ctx.fillRect(0, 0, largeur, hauteur);
}

function image() {
  // Voile sombre : les anciennes lettres s'estompent et laissent une traînée.
  ctx.fillStyle = "rgba(11, 15, 36, 0.16)";
  ctx.fillRect(0, 0, largeur, hauteur);
  colonnes.forEach((goutte, c) => {
    const x = c * TAILLE * 1.6 + 4;
    const lettre = goutte.lettres[goutte.i % goutte.lettres.length];
    ctx.fillStyle = goutte.rare ? "#d03cff" : (goutte.i % 5 === 0 ? "#9fb2ff" : "#3f6bff");
    ctx.fillText(lettre, x, goutte.y * TAILLE);
    goutte.i += 1;
    goutte.y += 1;
    if (goutte.y * TAILLE > hauteur + 40 && Math.random() > 0.9) colonnes[c] = nouvelleGoutte(true);
  });
}

const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;
const petitEcran = matchMedia("(max-width: 800px)");
redimensionner();
addEventListener("resize", redimensionner);
if (calme) {
  for (let k = 0; k < 40; k++) image(); // une image fixe, sans animation
} else {
  let precedent = 0;
  const boucle = (t) => {
    if (t - precedent > 70 && !document.hidden && !petitEcran.matches) { // ≈ 14 images/s, comme cmatrix
      image();
      precedent = t;
    }
    requestAnimationFrame(boucle);
  };
  requestAnimationFrame(boucle);
}
