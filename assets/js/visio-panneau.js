// Panneau latéral de la salle : participants (mains levées, actions de l'hôte) et tchat.
// Tout le texte venant des utilisateurs est inséré avec textContent (jamais innerHTML).

function el(balise, classe, texte) {
  const e = document.createElement(balise);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function petitBouton(texte, titre, action) {
  const b = el("button", "btn btn-petit", texte);
  b.type = "button";
  b.title = titre;
  b.addEventListener("click", async () => {
    b.disabled = true;
    try { await action(); } finally { b.disabled = false; }
  });
  return b;
}

function heure(ms) {
  return typeof ms === "number" ? new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
}

// actions = { demanderEcran(uid), arreterEcran(), exclure(uid), bannir(uid), baisserMain(uid), erreur(e) }
export class Panneau {
  constructor(elements, actions) {
    this.el = elements;
    this.actions = actions;
    this.salle = null;
    this.estAdmin = false;
  }

  attacher(salle, estAdmin) {
    this.salle = salle;
    this.estAdmin = estAdmin;
    this.el.messages.replaceChildren();
    this.rendreParticipants();
    this.rendreTchat();
  }

  detacher() {
    this.salle = null;
    this.el.participants.replaceChildren();
    this.el.messages.replaceChildren();
    this.el.nb.textContent = "";
  }

  // ---------- Participants ----------

  rendreParticipants() {
    const { salle } = this;
    if (!salle) return;
    const moi = salle.uid;
    const partage = salle.partage;
    const liste = salle.participants.sort((a, b) =>
      (b.estHote - a.estHote) || ((a.main || 1e9) - (b.main || 1e9)) || a.pseudo.localeCompare(b.pseudo, "fr"));

    this.el.nb.textContent = String(liste.length);
    this.el.participants.replaceChildren();
    for (const p of liste) {
      const ligne = el("div", "ligne-participant-salle");
      const nom = el("span", "participant-nom", p.pseudo + (p.uid === moi ? " (toi)" : ""));
      ligne.append(nom);
      if (p.estHote) ligne.append(el("span", "badge", "hôte"));
      if (p.main) ligne.append(el("span", "badge badge-main", `✋ ${p.main}`));
      const partageCible = partage && partage.cible === p.uid;
      if (partageCible) ligne.append(el("span", "badge", partage.statut === "accepte" ? "partage son écran" : "demande d'écran…"));

      if (salle.estHote && p.uid !== moi) {
        const actions = el("span", "participant-actions");
        if (p.main) actions.append(petitBouton("Baisser", "Baisser sa main", () => this.essayer(() => this.actions.baisserMain(p.uid))));
        if (salle.partageActif) {
          actions.append(partageCible
            ? petitBouton("Stop écran", "Arrêter son partage d'écran", () => this.essayer(() => this.actions.arreterEcran()))
            : petitBouton("Écran", "Lui demander de partager son écran", () => this.essayer(() => this.actions.demanderEcran(p.uid))));
        }
        if (!p.estHote) actions.append(petitBouton("Exclure", "Le sortir de la salle (il peut revenir)", () => this.essayer(() => this.actions.exclure(p.uid, p.pseudo))));
        if (this.estAdmin) actions.append(petitBouton("Bannir", "Bloquer son compte", () => this.essayer(() => this.actions.bannir(p.uid, p.pseudo))));
        ligne.append(actions);
      }
      this.el.participants.append(ligne);
    }
  }

  async essayer(action) {
    try {
      await action();
    } catch (e) {
      this.actions.erreur(e);
    }
  }

  // ---------- Tchat ----------

  rendreTchat() {
    const { salle } = this;
    if (!salle) return;
    const zone = this.el.messages;
    const enBas = zone.scrollHeight - zone.scrollTop - zone.clientHeight < 40;
    zone.replaceChildren();
    if (!salle.messages.length) zone.append(el("p", "petit muted", "Aucun message pour l'instant."));
    for (const m of salle.messages) {
      const ligne = el("div", "message-tchat");
      const entete = el("div", "message-entete");
      entete.append(el("strong", "", m.pseudo), el("span", "petit muted", heure(m.date)));
      if (salle.estHote) {
        const suppr = petitBouton("×", "Supprimer ce message", () => this.essayer(() => salle.supprimerMessage(m.id)));
        suppr.classList.add("message-suppr");
        entete.append(suppr);
      }
      ligne.append(entete, el("div", "message-texte", m.texte));
      if (m.par === salle.uid) ligne.classList.add("message-moi");
      zone.append(ligne);
    }
    this.el.vider.hidden = !salle.estHote;
    if (enBas) zone.scrollTop = zone.scrollHeight;
  }
}
