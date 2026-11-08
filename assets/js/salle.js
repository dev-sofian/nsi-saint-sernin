// Salle de classe (Realtime Database, branche salons/{nom}) : hôte, présence,
// droits de modification du Python, modules activés.
//
//   const salle = await Salle.rejoindre("nsi-terminale-b", compte);
//   salle.addEventListener("change", () => { salle.estHote; salle.peutEditer; salle.pythonActif; … });
//   await salle.quitter();
//
// Les droits calculés ici servent à l'affichage ; database.rules.json les vérifie pour de vrai.

import { firebase } from "./auth.js";

export class Salle extends EventTarget {
  static async rejoindre(nom, compte) {
    const salle = new Salle(await firebase(), nom, compte);
    await salle.demarrer();
    return salle;
  }

  constructor(fb, nom, compte) {
    super();
    this.fb = fb;
    this.nom = nom;
    this.compte = compte;
    this.uid = compte.uid;
    this.etat = { hote: null, editeurs: {}, modules: {}, participants: {} };
    this.charges = new Set(); // branches déjà reçues du serveur
    this.desabonnements = [];
  }

  ref(chemin) {
    return this.fb.d.ref(this.fb.db, chemin ? `salons/${this.nom}/${chemin}` : `salons/${this.nom}`);
  }

  // Écoute une branche ; l'écoute est arrêtée automatiquement par quitter().
  ecouter(ref, fn) {
    const arreter = this.fb.d.onValue(ref, fn, (e) => {
      console.error("Lecture refusée", e);
      this.dispatchEvent(new CustomEvent("erreur", { detail: e }));
    });
    this.desabonnements.push(arreter);
  }

  async demarrer() {
    const { d, db } = this.fb;

    // Le premier arrivé dans une salle neuve en devient l'hôte.
    await d.runTransaction(this.ref("hote"), (actuel) => (actuel === null ? this.uid : undefined))
      .catch((e) => console.warn("Hôte non modifié", e));

    // Présence : on s'inscrit, et le serveur nous retire tout seul si la connexion coupe.
    // À chaque reconnexion (.info/connected repasse à true), on se réinscrit.
    this.refPresence = this.ref(`participants/${this.uid}`);
    this.ecouter(d.ref(db, ".info/connected"), async (snap) => {
      if (snap.val() !== true || this.partie) return;
      try {
        await d.onDisconnect(this.refPresence).remove();
        await d.set(this.refPresence, { pseudo: this.compte.pseudo, depuis: d.serverTimestamp() });
      } catch (e) {
        console.error("Présence impossible", e);
      }
    });

    for (const cle of ["hote", "editeurs", "modules", "participants"]) {
      this.ecouter(this.ref(cle), (snap) => {
        this.etat[cle] = snap.val() ?? (cle === "hote" ? null : {});
        this.charges.add(cle);
        this.dispatchEvent(new Event("change"));
      });
    }
  }

  // Vrai quand hôte, droits et modules ont été reçus (avant, les droits seraient faux).
  get pret() {
    return ["hote", "editeurs", "modules"].every((cle) => this.charges.has(cle));
  }

  // Hôte de la salle, ou admin, ou prof : mêmes pouvoirs.
  get estHote() {
    return this.etat.hote === this.uid || this.compte.role === "admin" || this.compte.role === "prof";
  }

  get peutEditer() {
    return this.estHote || this.etat.editeurs[this.uid] === true;
  }

  get pythonActif() {
    return this.etat.modules.python === true;
  }

  get participants() {
    return Object.entries(this.etat.participants).map(([uid, p]) => ({
      uid,
      pseudo: p.pseudo,
      estHote: uid === this.etat.hote,
      peutEditer: uid === this.etat.hote || this.etat.editeurs[uid] === true,
    }));
  }

  activerPython(actif) {
    return this.fb.d.set(this.ref("modules/python"), actif);
  }

  autoriser(uid, oui) {
    const ref = this.ref(`editeurs/${uid}`);
    return oui ? this.fb.d.set(ref, true) : this.fb.d.remove(ref);
  }

  async quitter() {
    this.partie = true;
    this.desabonnements.forEach((arreter) => arreter());
    this.desabonnements = [];
    try {
      await this.fb.d.onDisconnect(this.refPresence).cancel();
      await this.fb.d.remove(this.refPresence);
    } catch (e) { /* déjà déconnecté */ }
  }
}
