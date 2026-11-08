// Pilote le worker Python (python-worker.js) : exécuter, arrêter, délai maximum.
//
//   const ex = new Executeur();
//   const etat = await ex.executer(code, ["ligne 1"], { surSortie, surErreur });
//   // etat : "fini" | "erreur" | "arrete" | "delai"

const DELAI_MAX_MS = 20000; // au-delà : probablement une boucle infinie

export class Executeur {
  constructor(url = "assets/js/python-worker.js") {
    this.url = url;
    this.worker = null;
    this.pret = null;
    this.enCours = null; // { terminer(etat) } pendant une exécution
  }

  // Lance le chargement de Python (quelques secondes la première fois).
  demarrer() {
    if (!this.pret) {
      this.worker = new Worker(this.url);
      this.pret = new Promise((resoudre, rejeter) => {
        this.worker.addEventListener("message", function attente({ data }) {
          if (data.type === "pret") resoudre();
          if (data.type === "echec") rejeter(new Error(data.message));
        });
        this.worker.addEventListener("error", (e) => rejeter(e));
      });
      this.pret.catch(() => this.detruire());
    }
    return this.pret;
  }

  executer(code, entrees, { surSortie = () => {}, surErreur = () => {}, delaiMax = DELAI_MAX_MS } = {}) {
    if (this.enCours) return Promise.reject(new Error("deja-en-cours"));
    return new Promise((resoudre, rejeter) => {
      let minuteur = null;
      const terminer = (etat) => {
        clearTimeout(minuteur);
        if (this.worker) this.worker.removeEventListener("message", ecoute);
        this.enCours = null;
        resoudre(etat);
      };
      const ecoute = ({ data }) => {
        if (data.type === "sortie") surSortie(data.texte);
        else if (data.type === "erreur") surErreur(data.texte);
        else if (data.type === "fin") terminer(data.ok ? "fini" : "erreur");
      };
      this.enCours = { terminer };

      this.demarrer().then(() => {
        if (!this.enCours) return; // arrêté pendant le chargement
        this.worker.addEventListener("message", ecoute);
        minuteur = setTimeout(() => this.arreter("delai"), delaiMax);
        this.worker.postMessage({ code, entrees });
      }, (e) => {
        this.enCours = null;
        rejeter(e);
      });
    });
  }

  // Arrête net l'exécution : le worker est détruit, Python sera rechargé au prochain lancement.
  arreter(etat = "arrete") {
    const enCours = this.enCours;
    this.detruire();
    if (enCours) enCours.terminer(etat);
  }

  detruire() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.pret = null;
  }
}
