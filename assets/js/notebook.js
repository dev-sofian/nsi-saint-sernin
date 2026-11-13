// Affichage d'un notebook Jupyter (.ipynb) et de Markdown, sans serveur.
// Le notebook est montré tel que le prof l'a écrit, sur fond blanc comme dans Jupyter :
// aucune couleur ni aucun texte n'est modifié. Seul le HTML dangereux est retiré par DOMPurify
// (scripts, gestionnaires d'événements, <style> qui changerait toute la page).
// Les maths ($…$) passent par KaTeX, chargé seulement si le document en contient.

const URL_KATEX = "https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/";

const OPTIONS_NETTOYAGE = {
  // <style> modifierait toute la page ; les formulaires n'ont rien à faire dans un cours
  FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
  ADD_ATTR: ["target"],
};

export function texteDe(source) {
  return Array.isArray(source) ? source.join("") : source || "";
}

// ---------- Maths ----------

let promesseKatex = null;

function chargerKatex() {
  if (window.katex) return Promise.resolve(true);
  if (!promesseKatex) {
    promesseKatex = new Promise((resolve) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = URL_KATEX + "katex.min.css";
      document.head.appendChild(css);
      const script = document.createElement("script");
      script.src = URL_KATEX + "katex.min.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false); // sans KaTeX, les formules restent lisibles en texte
      document.head.appendChild(script);
    });
  }
  return promesseKatex;
}

// $$…$$ (bloc) ou $…$ (en ligne, un seul retour à la ligne permis, comme dans Jupyter)
const RE_MATHS = /\$\$([\s\S]+?)\$\$|\$(?!\s)((?:[^$\n]|\n(?!\s*\n))+?)(?<!\s)\$/g;
const RE_CODE_MD = /```[\s\S]*?```|`[^`\n]+`/g;

export function contientDesMaths(texte) {
  return new RegExp(RE_MATHS.source).test(texte.replace(RE_CODE_MD, "")); // copie sans « g » : test() sans état
}

function echapper(texte) {
  return texte.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formule(tex, bloc) {
  if (window.katex) {
    try {
      return window.katex.renderToString(tex, { displayMode: bloc, throwOnError: false, output: "html" });
    } catch (e) { /* on retombe sur le texte brut */ }
  }
  return `<code class="maths">${echapper(tex)}</code>`;
}

// ---------- Markdown ----------

// Transforme du Markdown (éventuellement avec du HTML dedans) en HTML propre.
// piecesJointes : images collées dans une cellule de notebook (« attachment:nom.png »).
export function markdownVersHtml(texte, piecesJointes = {}) {
  // 1. On met de côté le code (pour ne pas y chercher de maths), puis les maths
  //    (pour que marked ne transforme pas les « _ » en italique).
  const codes = [];
  let t = texte.replace(RE_CODE_MD, (m) => `\u0000C${codes.push(m) - 1}\u0000`);
  const maths = [];
  t = t.replace(RE_MATHS, (m, bloc, ligne) => `MATHS${maths.push([bloc ?? ligne, bloc !== undefined]) - 1}FIN`);
  t = t.replace(/\u0000C(\d+)\u0000/g, (m, i) => codes[+i]);

  let html = marked.parse(t);
  html = html.replace(/MATHS(\d+)FIN/g, (m, i) => formule(maths[+i][0], maths[+i][1]));

  // 2. Images jointes : remplacées par leur contenu (data:…) avant le nettoyage
  html = html.replace(/attachment:([^"'\s)]+)/g, (m, nom) => {
    let nomDecode = nom;
    try { nomDecode = decodeURIComponent(nom); } catch (e) {}
    const piece = piecesJointes[nom] || piecesJointes[nomDecode];
    const [type, donnees] = piece ? Object.entries(piece)[0] : [];
    return donnees ? `data:${type};base64,${String(donnees).replace(/\s/g, "")}` : "#image-absente";
  });

  return DOMPurify.sanitize(html, OPTIONS_NETTOYAGE);
}

// ---------- Coloration Python ----------

const MOTS_CLES = new Set(
  "False None True and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield".split(" ")
);
const FONCTIONS = new Set(
  "abs all any bool chr dict enumerate filter float input int isinstance len list map max min next open ord print range repr reversed round set sorted str sum super tuple type zip".split(" ")
);
const RE_JETONS =
  /(#[^\n]*)|((?:[rRbBfFuU]{1,2})?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(\b\d[\d_]*(?:\.\d+)?(?:e-?\d+)?\b)|([\p{L}_][\p{L}\p{N}_]*)/gu;

// Remplit l'élément <code> avec le code coloré (uniquement des nœuds texte : rien n'est interprété)
export function colorerPython(elementCode, code) {
  elementCode.textContent = "";
  let position = 0;
  let precedent = "";
  const morceau = (texte, classe) => {
    if (!classe) return elementCode.append(texte);
    const span = document.createElement("span");
    span.className = classe;
    span.textContent = texte;
    elementCode.append(span);
  };
  for (const m of code.matchAll(RE_JETONS)) {
    if (m.index > position) morceau(code.slice(position, m.index));
    const [jeton, commentaire, chaine, nombre, nom] = m;
    if (commentaire) morceau(jeton, "py-com");
    else if (chaine) morceau(jeton, "py-chaine");
    else if (nombre) morceau(jeton, "py-nombre");
    else if (MOTS_CLES.has(nom)) morceau(jeton, "py-mot");
    else if (precedent === "def" || precedent === "class") morceau(jeton, "py-def");
    else if (FONCTIONS.has(nom)) morceau(jeton, "py-fonction");
    else morceau(jeton);
    if (nom) precedent = nom;
    position = m.index + jeton.length;
  }
  if (position < code.length) morceau(code.slice(position));
}

// Un exemple de console (« >>> ») n'est pas exécutable tel quel : on garde les lignes tapées.
export function codeExecutable(code) {
  if (!/^>>> /m.test(code)) return code;
  return code
    .split("\n")
    .filter((l) => /^(>>>|\.\.\.)( |$)/.test(l))
    .map((l) => l.slice(4))
    .join("\n");
}

// ---------- Boutons sous les blocs de code ----------

const CLE_ESSAI = "nsi-python-essai";

function essayer(code) {
  try {
    localStorage.setItem(CLE_ESSAI, JSON.stringify({ code, date: Date.now() }));
  } catch (e) {
    return false;
  }
  window.open("python.html", "_blank");
  return true;
}

function bouton(texte, titre, action) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-petit";
  b.textContent = texte;
  b.title = titre;
  b.addEventListener("click", () => action(b));
  return b;
}

function signaler(b, texte) {
  const avant = b.dataset.texte || (b.dataset.texte = b.textContent);
  b.textContent = texte;
  setTimeout(() => (b.textContent = avant), 1600);
}

// Habille un <pre> : coloration Python + boutons « Essayer » et « Copier »
export function habillerBlocPython(pre, code) {
  const elementCode = pre.querySelector("code") || pre;
  colorerPython(elementCode, code);
  const bloc = document.createElement("div");
  bloc.className = "bloc-code";
  pre.replaceWith(bloc);
  const actions = document.createElement("div");
  actions.className = "actions-code";
  actions.append(
    bouton("▶ Essayer", "Ouvrir ce code dans l'éditeur Python (nouvel onglet)", (b) => {
      if (!essayer(codeExecutable(code))) signaler(b, "Impossible : utilise Copier");
    }),
    bouton("Copier", "Copier le code", async (b) => {
      try {
        await navigator.clipboard.writeText(code);
        signaler(b, "Copié ✔");
      } catch (e) {
        signaler(b, "Copie refusée");
      }
    })
  );
  bloc.append(pre, actions);
}

// Blocs ```python d'une zone de Markdown
export function habillerBlocsMarkdown(racine) {
  for (const code of racine.querySelectorAll("pre > code.language-python, pre > code.language-py")) {
    habillerBlocPython(code.parentElement, code.textContent.replace(/\n$/, ""));
  }
}

// ---------- Notebook ----------

function sortiesDe(cellule) {
  const zone = document.createElement("div");
  zone.className = "sorties";
  const texteSortie = (texte, classe) => {
    const pre = document.createElement("pre");
    pre.className = "sortie" + (classe ? " " + classe : "");
    pre.textContent = texte.replace(/\u001b\[[0-9;]*m/g, ""); // retire les couleurs du terminal
    zone.appendChild(pre);
  };
  for (const s of cellule.outputs || []) {
    if (s.output_type === "stream") {
      texteSortie(texteDe(s.text), s.name === "stderr" ? "err" : "");
    } else if (s.output_type === "error") {
      texteSortie((s.traceback || [`${s.ename}: ${s.evalue}`]).join("\n"), "err");
    } else if (s.data) {
      const d = s.data;
      const image = ["image/png", "image/jpeg", "image/gif"].find((t) => d[t]);
      if (image) {
        const img = document.createElement("img");
        img.src = `data:${image};base64,${texteDe(d[image]).replace(/\s/g, "")}`;
        img.alt = "Résultat de la cellule";
        zone.appendChild(img);
      } else if (d["image/svg+xml"] || d["text/html"]) {
        const div = document.createElement("div");
        div.className = "sortie-html";
        div.innerHTML = DOMPurify.sanitize(texteDe(d["image/svg+xml"] || d["text/html"]), OPTIONS_NETTOYAGE);
        zone.appendChild(div);
      } else if (d["text/plain"]) {
        texteSortie(texteDe(d["text/plain"]));
      }
    }
  }
  return zone.children.length ? zone : null;
}

function celluleCode(cellule) {
  const code = texteDe(cellule.source).replace(/\s+$/, "");
  const div = document.createElement("div");
  div.className = "cellule cellule-code";
  const pre = document.createElement("pre");
  pre.appendChild(document.createElement("code"));
  div.appendChild(pre);
  // Cellule vide (à compléter) ou commande Jupyter (%%html…) : affichée telle quelle, sans boutons
  if (!code || /^\s*%/.test(code)) {
    pre.firstChild.textContent = code;
    if (!code) div.classList.add("cellule-vide");
  } else {
    habillerBlocPython(pre, code);
  }
  const sorties = sortiesDe(cellule);
  if (sorties) div.appendChild(sorties);
  return div;
}

export async function afficherNotebook(notebook, conteneur) {
  const cellules = notebook.cells;
  if (!Array.isArray(cellules)) throw new Error("format de notebook inconnu");
  if (cellules.some((c) => c.cell_type === "markdown" && contientDesMaths(texteDe(c.source)))) {
    await chargerKatex();
  }
  const racine = document.createElement("div");
  racine.className = "notebook";
  for (const c of cellules) {
    let el = null;
    if (c.cell_type === "markdown") {
      el = document.createElement("div");
      el.className = "cellule cellule-md";
      el.innerHTML = markdownVersHtml(texteDe(c.source), c.attachments);
      if (!el.textContent.trim() && !el.querySelector("img, svg")) continue;
    } else if (c.cell_type === "code") {
      el = celluleCode(c);
    }
    if (el) racine.appendChild(el);
  }
  conteneur.appendChild(racine);
  finaliser(racine);
}

export async function afficherMarkdown(texte, conteneur) {
  if (contientDesMaths(texte)) await chargerKatex();
  const racine = document.createElement("div");
  racine.className = "markdown";
  racine.innerHTML = markdownVersHtml(texte);
  conteneur.appendChild(racine);
  finaliser(racine);
}

// Retouches communes une fois le contenu dans la page
function finaliser(racine) {
  habillerBlocsMarkdown(racine);
  for (const img of racine.querySelectorAll('img[src="#image-absente"]')) {
    const note = document.createElement("span");
    note.className = "image-absente";
    note.textContent = "[image absente du notebook]";
    img.replaceWith(note);
  }
  for (const a of racine.querySelectorAll('a[href^="http"]')) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
}
