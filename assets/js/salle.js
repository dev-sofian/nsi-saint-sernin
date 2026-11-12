// Salle de classe (Realtime Database, branche salons/{nom}) : hôte, présence, droits de
// modification du Python, modules activés, mains levées, tchat, demande de partage d'écran.
//
//   const salle = await Salle.rejoindre("nsi-terminale-b", compte);
//   salle.addEventListener("change", () => { salle.estHote; salle.pythonActif; salle.partage; … });
//   salle.addEventListener("messages", () => salle.messages);
//   await salle.quitter();
//
// Les droits calculés ici servent à l'affichage ; database.rules.json les vérifie pour de vrai.

import { firebase } from "./auth.js";

const NB_MESSAGES = 100; // seuls les derniers messages du tchat sont chargés

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
    this.etat = { hote: null, editeurs: {}, modules: {}, participants: {}, mains: {}, partage: null };
    this.messages = [];
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

    // Présence : on s'inscrit, et le serveur nous retire tout seul si la connexion coupe
    // (avec notre main levée). À chaque reconnexion (.info/connected repasse à true), on se réinscrit.
    this.refPresence = this.ref(`participants/${this.uid}`);
    this.refMain = this.ref(`mains/${this.uid}`);
    this.ecouter(d.ref(db, ".info/connected"), async (snap) => {
      if (snap.val() !== true || this.partie) return;
      try {
        await d.onDisconnect(this.refPresence).remove();
        await d.onDisconnect(this.refMain).remove();
        await d.set(this.refPresence, { pseudo: this.compte.pseudo, depuis: d.serverTimestamp() });
      } catch (e) {
        console.error("Présence impossible", e);
      }
    });

    for (const cle of ["hote", "editeurs", "modules", "participants", "mains", "partage"]) {
      this.ecouter(this.ref(cle), (snap) => {
        const vide = cle === "hote" || cle === "partage" ? null : {};
        this.etat[cle] = snap.val() ?? vide;
        this.charges.add(cle);
        this.dispatchEvent(new Event("change"));
      });
    }

    this.ecouter(d.query(this.ref("messages"), d.limitToLast(NB_MESSAGES)), (snap) => {
      const liste = [];
      snap.forEach((enfant) => { liste.push({ id: enfant.key, ...enfant.val() }); });
      this.messages = liste;
      this.dispatchEvent(new Event("messages"));
    });
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

  get partageActif() {
    return this.etat.modules.partage === true;
  }

  // Demande de partage d'écran en cours : { cible, statut, par, date } ou null.
  get partage() {
    return this.etat.partage;
  }

  get mainLevee() {
    return Boolean(this.etat.mains[this.uid]);
  }

  // Mains levées, dans l'ordre où elles ont été levées.
  get mains() {
    return Object.entries(this.etat.mains)
      .map(([uid, m]) => ({ uid, pseudo: m.pseudo, date: m.date }))
      .sort((a, b) => (a.date || 0) - (b.date || 0));
  }

  get participants() {
    const ordreMains = new Map(this.mains.map((m, i) => [m.uid, i + 1]));
    return Object.entries(this.etat.participants).map(([uid, p]) => ({
      uid,
      pseudo: p.pseudo,
      estHote: uid === this.etat.hote,
      peutEditer: uid === this.etat.hote || this.etat.editeurs[uid] === true,
      main: ordreMains.get(uid) || 0, // 0 = main baissée, sinon rang
    }));
  }

  pseudoDe(uid) {
    return this.etat.participants[uid]?.pseudo || "quelqu'un";
  }

  // ---------- Actions de l'hôte ----------

  activerPython(actif) {
    return this.fb.d.set(this.ref("modules/python"), actif);
  }

  activerPartage(actif) {
    return this.fb.d.set(this.ref("modules/partage"), actif);
  }

  autoriser(uid, oui) {
    const ref = this.ref(`editeurs/${uid}`);
    return oui ? this.fb.d.set(ref, true) : this.fb.d.remove(ref);
  }

  baisserMain(uid) {
    return this.fb.d.remove(this.ref(`mains/${uid}`));
  }

  // Prévient la personne visée. Le droit réel de partager est donné par le serveur de visio.
  demanderPartage(cible) {
    const { d } = this.fb;
    return d.set(this.ref("partage"), { cible, statut: "demande", par: this.uid, date: d.serverTimestamp() });
  }

  terminerPartage() {
    return this.fb.d.remove(this.ref("partage"));
  }

  supprimerMessage(id) {
    return this.fb.d.remove(this.ref(`messages/${id}`));
  }

  viderTchat() {
    return this.fb.d.remove(this.ref("messages"));
  }

  // ---------- Actions de chacun ----------

  leverMain(oui) {
    const { d } = this.fb;
    return oui
      ? d.set(this.refMain, { pseudo: this.compte.pseudo, date: d.serverTimestamp() })
      : d.remove(this.refMain);
  }

  // Réponse de la personne visée par une demande de partage : "accepte", "refuse" ou "fini".
  repondrePartage(statut) {
    return this.fb.d.set(this.ref("partage/statut"), statut);
  }

  envoyerMessage(texte) {
    const { d } = this.fb;
    texte = (texte || "").trim().slice(0, 500);
    if (!texte) return Promise.resolve();
    return d.push(this.ref("messages"), {
      par: this.uid, pseudo: this.compte.pseudo, texte, date: d.serverTimestamp(),
    });
  }

  async quitter() {
    this.partie = true;
    this.desabonnements.forEach((arreter) => arreter());
    this.desabonnements = [];
    try {
      await this.fb.d.onDisconnect(this.refPresence).cancel();
      await this.fb.d.onDisconnect(this.refMain).cancel();
      await this.fb.d.remove(this.refMain);
      await this.fb.d.remove(this.refPresence);
    } catch (e) { /* déjà déconnecté */ }
  }
}
