// Exécute du Python (Pyodide) dans un Web Worker, c'est-à-dire à part de la page.
// Avantage : une boucle infinie ne bloque pas la page, et on peut l'arrêter
// en détruisant le worker (voir executeur.js).
//
// Messages reçus  : { code, entrees: [lignes pour input()] }
// Messages envoyés : { type: "pret" } | { type: "echec", message }
//                    { type: "sortie", texte } | { type: "erreur", texte } | { type: "fin", ok }

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

// input() lit les lignes du champ « Entrées » au lieu d'ouvrir une fenêtre :
// tout le monde voit ainsi la même exécution, valeurs saisies comprises.
const PRELUDE = `
import builtins

def __creer_input(lignes):
    suite = iter(lignes)
    def input(invite=""):
        print(invite, end="")
        try:
            valeur = next(suite)
        except StopIteration:
            print()
            raise EOFError("input() : plus aucune entrée. Ajoute des lignes dans « Entrées ».") from None
        print(valeur)
        return valeur
    return input
`;

let pyodide = null;

const pret = (async () => {
  pyodide = await loadPyodide();
  pyodide.setStdout({ batched: (t) => postMessage({ type: "sortie", texte: t + "\n" }) });
  pyodide.setStderr({ batched: (t) => postMessage({ type: "erreur", texte: t + "\n" }) });
  pyodide.runPython(PRELUDE);
})();

pret.then(
  () => postMessage({ type: "pret" }),
  (e) => postMessage({ type: "echec", message: String(e) }),
);

// Garde seulement la partie utile du message d'erreur Python (à partir du code de l'élève).
function nettoyerErreur(e) {
  const lignes = String(e.message || e).trim().split("\n");
  const debut = lignes.findIndex((l) => l.includes('File "<exec>"'));
  return (debut >= 0 ? ["Traceback (most recent call last):", ...lignes.slice(debut)] : lignes).join("\n") + "\n";
}

onmessage = async ({ data }) => {
  await pret;
  const { code, entrees } = data;
  const espace = pyodide.globals.get("dict")(); // variables propres à cette exécution
  espace.set("__name__", "__main__");
  let ok = true;
  try {
    pyodide.globals.set("__lignes", pyodide.toPy(entrees || []));
    pyodide.runPython("builtins.input = __creer_input(__lignes)");
    await pyodide.loadPackagesFromImports(code);
    await pyodide.runPythonAsync(code, { globals: espace });
  } catch (e) {
    ok = false;
    pyodide.runPython("import sys; sys.stdout.flush()");
    postMessage({ type: "erreur", texte: nettoyerErreur(e) });
  } finally {
    pyodide.runPython("import sys; sys.stdout.flush(); sys.stderr.flush()");
    espace.destroy();
  }
  postMessage({ type: "fin", ok });
};
