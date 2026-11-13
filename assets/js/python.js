// Éditeur Python dans le navigateur : CodeMirror (éditeur) + Pyodide (Python en WebAssembly)

const consoleEl = document.getElementById("console");
const statut = document.getElementById("statut");
const btnExecuter = document.getElementById("btn-executer");
const CLE_SAUVEGARDE = "nsi-python-code";

// --- Éditeur ---
const editeur = CodeMirror.fromTextArea(document.getElementById("editeur"), {
  mode: "python",
  theme: "dracula",
  lineNumbers: true,
  indentUnit: 4,
  tabSize: 4,
  indentWithTabs: false,
  extraKeys: {
    Tab: (cm) => cm.replaceSelection("    "),
    "Ctrl-Enter": () => executer(),
    "Cmd-Enter": () => executer(),
  },
});

// Restaure le dernier code tapé (si le navigateur le permet)
try {
  const sauvegarde = localStorage.getItem(CLE_SAUVEGARDE);
  if (sauvegarde) editeur.setValue(sauvegarde);
} catch (e) { /* stockage indisponible : pas grave */ }

// Code envoyé par le bouton « Essayer » de la page Cours (valable quelques minutes)
const CLE_ESSAI = "nsi-python-essai";
const CLE_PRECEDENT = "nsi-python-code-precedent";
const btnMonCode = document.getElementById("btn-mon-code");

function lireEssai() {
  try {
    const brut = localStorage.getItem(CLE_ESSAI);
    if (!brut) return null;
    localStorage.removeItem(CLE_ESSAI); // un seul usage : un rechargement ne réécrase pas le code
    const { code, date } = JSON.parse(brut);
    if (typeof code !== "string" || Date.now() - date > 5 * 60 * 1000) return null;
    return code;
  } catch (e) {
    return null;
  }
}

const essai = lireEssai();
if (essai !== null && essai !== editeur.getValue()) {
  // Le code de l'élève est mis de côté (et pas écrasé) : un bouton permet de le retrouver
  try { localStorage.setItem(CLE_PRECEDENT, editeur.getValue()); } catch (e) {}
  editeur.setValue(essai);
  btnMonCode.hidden = false;
}
btnMonCode.addEventListener("click", () => {
  let precedent = null;
  try { precedent = localStorage.getItem(CLE_PRECEDENT); } catch (e) {}
  if (precedent !== null) editeur.setValue(precedent);
  btnMonCode.hidden = true;
});

editeur.on("change", () => {
  try { localStorage.setItem(CLE_SAUVEGARDE, editeur.getValue()); } catch (e) {}
});

// --- Console ---
function ecrire(texte, classe) {
  const span = document.createElement("span");
  span.textContent = texte + "\n";
  if (classe) span.className = classe;
  consoleEl.appendChild(span);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// --- Chargement de Python ---
let pyodide = null;

async function chargerPython() {
  try {
    pyodide = await loadPyodide();
    pyodide.setStdout({ batched: (t) => ecrire(t) });
    pyodide.setStderr({ batched: (t) => ecrire(t, "err") });
    // input() ouvre une petite fenêtre de saisie
    pyodide.setStdin({
      stdin: () => {
        const reponse = window.prompt("input() :");
        return reponse === null ? "" : reponse;
      },
    });
    statut.textContent = "Python prêt ✔ (Ctrl+Entrée pour exécuter)";
    btnExecuter.disabled = false;
  } catch (e) {
    statut.textContent = "Impossible de charger Python. Vérifie ta connexion.";
    console.error(e);
  }
}

// --- Exécution ---
async function executer() {
  if (!pyodide || btnExecuter.disabled) return;
  btnExecuter.disabled = true;
  statut.textContent = "Exécution…";
  ecrire("──── exécution ────", "muted");
  try {
    await pyodide.loadPackagesFromImports(editeur.getValue());
    await pyodide.runPythonAsync(editeur.getValue());
  } catch (e) {
    // Garde seulement la fin du message d'erreur Python, plus lisible
    const lignes = String(e.message || e).trim().split("\n");
    const debut = lignes.findIndex((l) => l.includes('File "<exec>"'));
    ecrire((debut >= 0 ? lignes.slice(debut) : lignes).join("\n"), "err");
  } finally {
    btnExecuter.disabled = false;
    statut.textContent = "Python prêt ✔";
  }
}

btnExecuter.addEventListener("click", executer);
document.getElementById("btn-effacer").addEventListener("click", () => {
  consoleEl.textContent = "";
});

// --- Ouvrir un fichier .py ---
document.getElementById("fichier").addEventListener("change", (ev) => {
  const fichier = ev.target.files[0];
  if (!fichier) return;
  const lecteur = new FileReader();
  lecteur.onload = () => {
    editeur.setValue(lecteur.result);
    statut.textContent = `Fichier ouvert : ${fichier.name}`;
  };
  lecteur.readAsText(fichier);
  ev.target.value = ""; // permet de rouvrir le même fichier
});

// --- Télécharger le code ---
document.getElementById("btn-telecharger").addEventListener("click", () => {
  const nom = window.prompt("Nom du fichier :", "mon_programme.py");
  if (!nom) return;
  const blob = new Blob([editeur.getValue()], { type: "text/x-python" });
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(blob);
  lien.download = nom.endsWith(".py") ? nom : nom + ".py";
  lien.click();
  URL.revokeObjectURL(lien.href);
});

chargerPython();
