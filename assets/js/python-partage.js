// Éditeur Python partagé en temps réel dans une salle (branche salons/{nom}/python).
//
// Synchronisation du code (« synchronisation différentielle ») :
//   - chacun garde `base` = la dernière version du serveur qu'il connaît ;
//   - à chaque frappe, on envoie son texte dans une TRANSACTION : si quelqu'un d'autre a
//     modifié le code entre-temps, on applique nos changements (diff base → local) sur
//     la version du serveur au lieu de l'écraser ;
//   - quand une version distante arrive, on y réapplique nos changements pas encore envoyés.
//   Chaque version porte un numéro `v` (+1 à chaque écriture, vérifié par les règles).
//
// Exécution : une seule personne exécute (celle qui clique, dans un Web Worker) et publie
// la sortie dans python/sortie : tout le monde voit le même résultat en même temps.

import { Executeur } from "./executeur.js";

const LIMITE_CODE = 20000;
const LIMITE_SORTIE = 20000;
const LIMITE_ERREUR = 5000;
const DELAI_ENVOI_MS = 40;      // regroupe les frappes très rapprochées
const DELAI_CURSEUR_MS = 150;
const DELAI_SORTIE_MS = 250;    // la sortie est publiée au fil de l'exécution
const CODE_DEPART = "# Code partagé de la salle : tout le monde voit les modifications en direct.\n\n";

const ETATS = {
  en_cours: "en cours…",
  fini: "terminé",
  erreur: "terminé avec une erreur",
  arrete: "arrêté",
  delai: "arrêté (trop long)",
  interrompu: "interrompu (déconnexion)",
};

const $ = (id) => document.getElementById(id);

// diff-match-patch et CodeMirror sont chargés par visio.html (CDN). On ne les utilise qu'au
// dernier moment : si un CDN est bloqué, seule la fenêtre Python est indisponible, pas la visio.
let dmp = null;

// Applique les changements faits entre `base` et `local` sur la version `distant`.
export function fusionner(base, local, distant) {
  if (local === base) return distant;
  if (distant === base) return local;
  return dmp.patch_apply(dmp.patch_make(base, local), distant)[0];
}

// Remplace le texte de l'éditeur en ne touchant que la partie qui change :
// le curseur et la sélection de la personne restent en place.
function remplacerTexte(cm, nouveau) {
  const actuel = cm.getValue();
  if (actuel === nouveau) return;
  let debut = 0;
  const max = Math.min(actuel.length, nouveau.length);
  while (debut < max && actuel[debut] === nouveau[debut]) debut++;
  let finA = actuel.length;
  let finN = nouveau.length;
  while (finA > debut && finN > debut && actuel[finA - 1] === nouveau[finN - 1]) { finA--; finN--; }
  cm.replaceRange(nouveau.slice(debut, finN), cm.posFromIndex(debut), cm.posFromIndex(finA), "distant");
}

function normaliser(val) {
  return val && typeof val.texte === "string"
    ? { texte: val.texte, v: Number(val.v) || 0, par: val.par, pseudo: val.pseudo }
    : { texte: "", v: 0 };
}

function tronquer(texte, max) {
  return texte.length <= max ? texte : texte.slice(0, max - 60) + "\n… (sortie trop longue, coupée)\n";
}

// Couleur stable pour chaque personne (curseurs).
function couleur(uid) {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 75% 55%)`;
}

// ---------- Éditeur (créé une seule fois pour la page) ----------

let cm = null;
let instance = null;

function editeur() {
  if (!window.CodeMirror || !window.diff_match_patch) throw new Error("bibliotheques-python-absentes");
  dmp ??= new diff_match_patch();
  if (!cm) {
    cm = CodeMirror.fromTextArea($("py-editeur"), {
      mode: "python",
      theme: "dracula",
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      readOnly: true,
      extraKeys: {
        Tab: (ed) => ed.replaceSelection("    "),
        "Ctrl-Enter": () => instance?.executer(),
        "Cmd-Enter": () => instance?.executer(),
      },
    });
  }
  return cm;
}

// À appeler quand la fenêtre est affichée ou redimensionnée.
export function rafraichirEditeur() {
  if (cm) cm.refresh();
}

// ---------- Python partagé ----------

export class PythonPartage {
  constructor(salle) {
    this.salle = salle;
    this.d = salle.fb.d;
    this.uid = salle.uid;
    this.pseudo = salle.compte.pseudo;
    this.cm = editeur();

    this.base = { texte: "", v: 0 };
    this.pret = false;        // première version reçue ?
    this.enVol = false;       // une transaction est en cours
    this.enAttente = null;    // version distante reçue pendant la transaction
    this.minuteurEnvoi = null;

    this.executeur = new Executeur();
    this.execLocale = false;
    this.sortie = null;
    this.marqueurs = new Map(); // uid -> { repere, l, c }
    this.minuteurCurseur = null;
    this.avaitLeDroit = false;
    this.controle = new AbortController(); // retire tous les écouteurs DOM à la sortie

    this.refCode = salle.ref("python/code");
    this.refSortie = salle.ref("python/sortie");
    this.refCurseurs = salle.ref("python/curseurs");
    this.refMonCurseur = salle.ref(`python/curseurs/${this.uid}`);

    this.surChangement = (_cm, chg) => {
      if (chg.origin !== "distant" && this.pret) this.planifierEnvoi();
    };
    this.surCurseur = () => this.planifierCurseur();
  }

  demarrer() {
    instance = this;
    const { cm, salle } = this;
    cm.setValue("");
    cm.clearHistory();
    this.afficherInfo("Chargement du code…");

    salle.ecouter(this.refCode, (snap) => this.recu(snap.val()));
    salle.ecouter(this.refSortie, (snap) => this.afficherSortie(snap.val()));
    salle.ecouter(this.refCurseurs, (snap) => this.afficherCurseurs(snap.val() || {}));
    salle.addEventListener("change", () => this.majDroits(), { signal: this.controle.signal });

    cm.on("change", this.surChangement);
    cm.on("cursorActivity", this.surCurseur);

    const options = { signal: this.controle.signal };
    $("py-executer").addEventListener("click", () => this.executer(), options);
    $("py-arreter").addEventListener("click", () => this.arreter(), options);
    $("py-telecharger").addEventListener("click", () => this.telecharger(), options);
    $("py-fichier").addEventListener("change", (ev) => this.ouvrirFichier(ev), options);
    $("py-btn-participants").addEventListener("click", () => {
      $("py-participants").hidden = !$("py-participants").hidden;
      this.afficherParticipants();
    }, options);

    this.afficherSortie(null);
    this.majDroits();
  }

  // ---------- Réception du code ----------

  recu(valeur) {
    const val = normaliser(valeur);
    if (!this.pret) {
      this.pret = true;
      this.base = val;
      remplacerTexte(this.cm, val.texte);
      this.cm.clearHistory();
      this.afficherInfo("");
      // Salle neuve : l'hôte écrit un premier commentaire.
      if (valeur === null && this.salle.peutEditer) this.cm.setValue(CODE_DEPART);
      return;
    }
    if (val.v <= this.base.v) return; // déjà connue (souvent notre propre écriture)
    if (this.enVol) {
      if (!this.enAttente || val.v > this.enAttente.v) this.enAttente = val;
      return;
    }
    this.integrer(val);
  }

  integrer(val) {
    const local = this.cm.getValue();
    remplacerTexte(this.cm, fusionner(this.base.texte, local, val.texte));
    this.base = val;
    if (val.par && val.par !== this.uid) this.afficherInfo(`Modifié par ${val.pseudo || "quelqu'un"}`);
    if (this.cm.getValue() !== this.base.texte) this.planifierEnvoi();
  }

  // ---------- Envoi du code ----------

  planifierEnvoi() {
    if (!this.salle.peutEditer) return;
    clearTimeout(this.minuteurEnvoi);
    this.minuteurEnvoi = setTimeout(() => this.envoyer(), DELAI_ENVOI_MS);
  }

  async envoyer() {
    if (this.enVol || !this.pret || this.ferme) return;
    const envoye = this.cm.getValue();
    if (envoye === this.base.texte) return;
    if (envoye.length > LIMITE_CODE) {
      this.afficherInfo(`Code trop long (${LIMITE_CODE} caractères maximum) : modification non partagée.`, true);
      return;
    }
    this.enVol = true;
    const baseEnvoi = this.base;
    try {
      const resultat = await this.d.runTransaction(this.refCode, (actuel) => {
        const serveur = normaliser(actuel);
        const texte = serveur.v === baseEnvoi.v ? envoye : fusionner(baseEnvoi.texte, envoye, serveur.texte);
        if (texte === serveur.texte) return; // rien à changer : on annule
        return { texte: texte.slice(0, LIMITE_CODE), v: serveur.v + 1, par: this.uid, pseudo: this.pseudo };
      }, { applyLocally: false });
      const serveur = normaliser(resultat.snapshot.val());
      // Ce qu'on a tapé pendant la transaction est réappliqué sur la version enregistrée.
      remplacerTexte(this.cm, fusionner(envoye, this.cm.getValue(), serveur.texte));
      this.base = serveur;
    } catch (e) {
      console.error("Envoi du code refusé", e);
      this.afficherInfo("Modification refusée : tu n'as plus le droit de modifier.", true);
      remplacerTexte(this.cm, this.base.texte);
    } finally {
      this.enVol = false;
    }
    if (this.enAttente) {
      const attente = this.enAttente;
      this.enAttente = null;
      if (attente.v > this.base.v) this.integrer(attente);
    }
    if (this.cm.getValue() !== this.base.texte) this.planifierEnvoi();
  }

  // ---------- Curseurs des autres ----------

  planifierCurseur() {
    if (!this.salle.peutEditer || this.minuteurCurseur || this.ferme) return;
    this.minuteurCurseur = setTimeout(async () => {
      this.minuteurCurseur = null;
      const pos = this.cm.getCursor();
      try {
        if (!this.curseurPublie) {
          this.curseurPublie = true;
          await this.d.onDisconnect(this.refMonCurseur).remove();
        }
        await this.d.set(this.refMonCurseur, { l: pos.line, c: pos.ch, pseudo: this.pseudo });
      } catch (e) { /* droit retiré entre-temps */ }
    }, DELAI_CURSEUR_MS);
  }

  // Un repère coloré par personne ; seuls les curseurs qui ont bougé sont redessinés
  // (leur étiquette réapparaît alors quelques secondes, voir .curseur-nom dans style.css).
  afficherCurseurs(curseurs) {
    for (const [uid, m] of this.marqueurs) {
      const c = curseurs[uid];
      if (!c || c.l !== m.l || c.c !== m.c) {
        m.repere.clear();
        this.marqueurs.delete(uid);
      }
    }
    for (const [uid, c] of Object.entries(curseurs)) {
      if (uid === this.uid || this.marqueurs.has(uid)) continue;
      const trait = document.createElement("span");
      trait.className = c.l === 0 ? "curseur-distant curseur-ligne1" : "curseur-distant"; // étiquette sous la 1re ligne
      trait.style.borderColor = couleur(uid);
      const nom = document.createElement("span");
      nom.className = "curseur-nom";
      nom.style.background = couleur(uid);
      nom.textContent = c.pseudo;
      trait.append(nom);
      const repere = this.cm.setBookmark({ line: c.l, ch: c.c }, { widget: trait, insertLeft: true });
      this.marqueurs.set(uid, { repere, l: c.l, c: c.c });
    }
  }

  // ---------- Droits ----------

  majDroits() {
    const { salle } = this;
    if (!salle.pret) return;
    const peut = salle.peutEditer;
    this.cm.setOption("readOnly", !peut);
    $("py-droits").textContent = peut ? (salle.estHote ? "Hôte : tu peux modifier" : "Tu peux modifier") : "Lecture seule";
    $("py-droits").classList.toggle("badge-prof", peut);
    $("py-label-fichier").hidden = !peut;
    $("py-entrees-bloc").hidden = !peut;
    $("py-btn-participants").hidden = !salle.estHote;
    if (!salle.estHote) $("py-participants").hidden = true;

    if (peut && !this.avaitLeDroit) {
      this.executeur.demarrer().catch(() => {}); // précharge Python
    }
    if (!peut && this.avaitLeDroit) {
      this.d.remove(this.refMonCurseur).catch(() => {});
      remplacerTexte(this.cm, this.base.texte); // annule ce qui n'a pas pu être envoyé
    }
    this.avaitLeDroit = peut;
    this.majBoutons();
    this.afficherParticipants();
  }

  afficherParticipants() {
    const liste = $("py-participants");
    if (liste.hidden || !this.salle.estHote) return;
    liste.replaceChildren();
    const titre = document.createElement("p");
    titre.className = "petit muted";
    titre.textContent = "Qui peut modifier et exécuter le code ?";
    liste.append(titre);
    const autres = this.salle.participants.filter((p) => p.uid !== this.uid);
    if (!autres.length) {
      const vide = document.createElement("p");
      vide.className = "muted";
      vide.textContent = "Personne d'autre dans la salle pour l'instant.";
      liste.append(vide);
    }
    for (const p of autres) {
      const ligne = document.createElement("label");
      ligne.className = "ligne-participant";
      const caseACocher = document.createElement("input");
      caseACocher.type = "checkbox";
      caseACocher.checked = p.peutEditer;
      caseACocher.disabled = p.estHote;
      caseACocher.addEventListener("change", () => {
        this.salle.autoriser(p.uid, caseACocher.checked).catch((e) => {
          console.error(e);
          caseACocher.checked = !caseACocher.checked;
        });
      });
      const nom = document.createElement("span");
      nom.textContent = p.pseudo + (p.estHote ? " (hôte)" : "");
      ligne.append(caseACocher, nom);
      liste.append(ligne);
    }
  }

  // ---------- Exécution partagée ----------

  majBoutons() {
    const s = this.sortie;
    const enCoursAilleurs = s?.etat === "en_cours" && s.par !== this.uid;
    $("py-executer").disabled = !this.salle.peutEditer || this.execLocale || enCoursAilleurs;
    $("py-arreter").hidden = !(s?.etat === "en_cours" && (s.par === this.uid || this.salle.estHote));
  }

  async executer() {
    if ($("py-executer").disabled || this.execLocale) return;
    const code = this.cm.getValue();
    const champ = $("py-entrees").value.replace(/\r/g, "");
    const entrees = champ ? champ.split("\n") : [];
    this.execLocale = true;
    this.majBoutons();

    let texte = "";
    let erreur = "";
    let tropLong = false;
    let minuteur = null;
    const publier = () => {
      minuteur = null;
      this.d.update(this.refSortie, {
        texte: tronquer(texte, LIMITE_SORTIE),
        erreur: tronquer(erreur, LIMITE_ERREUR),
      }).catch(() => {});
    };
    const planifier = () => { if (!minuteur) minuteur = setTimeout(publier, DELAI_SORTIE_MS); };

    try {
      await this.d.set(this.refSortie, {
        texte: "", erreur: "", etat: "en_cours", par: this.uid, pseudo: this.pseudo, date: this.d.serverTimestamp(),
      });
      // Si on perd la connexion pendant l'exécution, les autres verront « interrompu ».
      const siDeconnexion = this.d.onDisconnect(this.d.child(this.refSortie, "etat"));
      await siDeconnexion.set("interrompu");

      let etat;
      try {
        etat = await this.executeur.executer(code, entrees, {
          surSortie: (t) => {
            if (tropLong) return;
            texte += t;
            if (texte.length > LIMITE_SORTIE) { tropLong = true; this.executeur.arreter("arrete"); }
            planifier();
          },
          surErreur: (t) => { erreur += t; planifier(); },
        });
      } catch (e) {
        console.error(e);
        etat = "erreur";
        erreur += "Impossible de charger Python : vérifie ta connexion.\n";
      }
      clearTimeout(minuteur);
      if (tropLong) erreur += "\nArrêt : le programme affiche trop de texte.\n";
      else if (etat === "delai") erreur += "\nArrêt automatique après 20 secondes (boucle infinie ?).\n";
      else if (etat === "arrete") erreur += "\nExécution arrêtée.\n";

      await this.d.update(this.refSortie, {
        texte: tronquer(texte, LIMITE_SORTIE),
        erreur: tronquer(erreur, LIMITE_ERREUR),
        etat,
      });
      await siDeconnexion.cancel();
    } catch (e) {
      console.error("Publication de la sortie impossible", e);
      this.afficherInfo("Exécution refusée : tu n'as pas le droit d'exécuter.", true);
    } finally {
      this.execLocale = false;
      this.majBoutons();
    }
  }

  arreter() {
    if (this.execLocale) this.executeur.arreter("arrete");
    else this.d.update(this.refSortie, { arret: true }).catch((e) => console.error(e));
  }

  afficherSortie(val) {
    this.sortie = val;
    const consoleEl = $("py-console");
    consoleEl.replaceChildren();
    if (!val) {
      const vide = document.createElement("span");
      vide.className = "muted";
      vide.textContent = "La sortie du programme s'affichera ici, pour tout le monde.";
      consoleEl.append(vide);
      $("py-sortie-info").textContent = "";
    } else {
      const texte = document.createElement("span");
      texte.textContent = val.texte || "";
      const erreur = document.createElement("span");
      erreur.className = "err";
      erreur.textContent = val.erreur || "";
      consoleEl.append(texte, erreur);
      consoleEl.scrollTop = consoleEl.scrollHeight;
      $("py-sortie-info").textContent = `· exécuté par ${val.pseudo} · ${ETATS[val.etat] || val.etat}`;
      // L'hôte a demandé l'arrêt de NOTRE exécution.
      if (val.arret && val.par === this.uid && this.execLocale) this.executeur.arreter("arrete");
    }
    this.majBoutons();
  }

  // ---------- Fichiers ----------

  telecharger() {
    const nom = window.prompt("Nom du fichier :", "programme.py");
    if (!nom) return;
    const blob = new Blob([this.cm.getValue()], { type: "text/x-python" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = nom.endsWith(".py") ? nom : nom + ".py";
    lien.click();
    URL.revokeObjectURL(lien.href);
  }

  ouvrirFichier(ev) {
    const fichier = ev.target.files[0];
    ev.target.value = ""; // permet de rouvrir le même fichier
    if (!fichier || !this.salle.peutEditer) return;
    if (!window.confirm(`Remplacer le code de toute la salle par « ${fichier.name} » ?`)) return;
    const lecteur = new FileReader();
    lecteur.onload = () => this.cm.setValue(String(lecteur.result));
    lecteur.readAsText(fichier);
  }

  afficherInfo(texte, erreur = false) {
    const info = $("py-info");
    info.textContent = texte;
    info.classList.toggle("err", erreur);
  }

  // ---------- Sortie de la salle ----------

  quitter() {
    this.ferme = true;
    clearTimeout(this.minuteurEnvoi);
    clearTimeout(this.minuteurCurseur);
    this.controle.abort();
    this.cm.off("change", this.surChangement);
    this.cm.off("cursorActivity", this.surCurseur);
    this.marqueurs.forEach((m) => m.repere.clear());
    this.marqueurs.clear();
    this.executeur.detruire();
    this.d.onDisconnect(this.refMonCurseur).cancel().catch(() => {});
    this.d.remove(this.refMonCurseur).catch(() => {});
    this.cm.setOption("readOnly", true);
    if (instance === this) instance = null;
  }
}
