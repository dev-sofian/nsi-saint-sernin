// Audio, vidéo et partage d'écran de la salle, avec LiveKit (serveur auto-hébergé).
// La bibliothèque livekit-client est chargée par visio.html (variable globale LivekitClient).
//
//   const media = new Media({ grille, ecran, ecranVideo, ecranLegende, sons });
//   media.addEventListener("etat", majBoutons);          // micro / caméra / écran ont changé
//   media.addEventListener("ecran", (ev) => ev.detail);  // MON partage d'écran démarre (true) ou s'arrête (false)
//   media.addEventListener("deconnexion", (ev) => ev.detail); // "exclu", "doublon", "salle-fermee", "reseau"
//   await media.connecter(url, jeton);
//
// Économie de débit (≈ 120 Mbit/s montants chez l'hébergeur pour 15 personnes) :
// caméras et micros coupés en entrant, vignettes en basse définition (simulcast),
// la vidéo n'est reçue que si sa vignette est visible (adaptiveStream).

function lk() {
  if (!window.LivekitClient) throw new Error("livekit-absent");
  return window.LivekitClient;
}

function initiales(nom) {
  return (nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join("") || "?";
}

function role(participant) {
  try { return JSON.parse(participant.metadata || "{}").role || "eleve"; } catch (e) { return "eleve"; }
}

export class Media extends EventTarget {
  constructor(elements) {
    super();
    this.el = elements;
    this.room = null;
    this.tuiles = new Map();  // identité -> { el, video, initiales, nom, micCoupe, main, piste }
    this.ecrans = [];         // partages d'écran en cours : [{ identite, nom, piste }]
    this.mains = new Set();   // identités qui ont la main levée (affichée sur la vignette)
    this.depart = false;
  }

  signaler(nom, detail) {
    this.dispatchEvent(new CustomEvent(nom, { detail }));
  }

  get connecte() {
    return Boolean(this.room && this.room.state === "connected");
  }

  async connecter(url, jeton) {
    const LK = lk();
    const room = new LK.Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: LK.VideoPresets.h360.resolution },
      publishDefaults: {
        simulcast: true,
        videoSimulcastLayers: [LK.VideoPresets.h180],
        screenShareEncoding: LK.ScreenSharePresets.h1080fps15.encoding,
      },
    });
    this.room = room;
    this.depart = false;
    const E = LK.RoomEvent;
    const maj = (_pub, p) => this.majTuile(p);

    room
      .on(E.ParticipantConnected, (p) => this.majTuile(p))
      .on(E.ParticipantDisconnected, (p) => this.retirer(p.identity))
      .on(E.TrackSubscribed, (piste, pub, p) => this.pisteRecue(piste, pub, p))
      .on(E.TrackUnsubscribed, (piste, pub, p) => this.pisteRetiree(piste, pub, p))
      .on(E.TrackMuted, maj)
      .on(E.TrackUnmuted, maj)
      .on(E.LocalTrackPublished, (pub, p) => this.localChange(pub, p, true))
      .on(E.LocalTrackUnpublished, (pub, p) => this.localChange(pub, p, false))
      .on(E.ActiveSpeakersChanged, (parlent) => this.parleurs(parlent))
      .on(E.ParticipantPermissionsChanged, () => this.signaler("etat"))
      .on(E.AudioPlaybackStatusChanged, () => this.signaler("etat"))
      .on(E.Reconnecting, () => this.signaler("reseau", "reconnexion"))
      .on(E.Reconnected, () => this.signaler("reseau", "ok"))
      .on(E.Disconnected, (raison) => this.deconnecte(raison));

    await room.connect(url, jeton);
    this.majTuile(room.localParticipant);
    room.remoteParticipants.forEach((p) => this.majTuile(p));
    this.signaler("etat");
  }

  // ---------- Vignettes ----------

  creerTuile(p) {
    const el = document.createElement("div");
    el.className = "tuile";
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // le son passe par des éléments <audio> séparés
    const ini = document.createElement("div");
    ini.className = "tuile-initiales";
    const legende = document.createElement("div");
    legende.className = "tuile-legende";
    const nom = document.createElement("span");
    nom.className = "tuile-nom";
    const micCoupe = document.createElement("span");
    micCoupe.className = "tuile-icone";
    micCoupe.textContent = "micro coupé";
    const main = document.createElement("span");
    main.className = "tuile-icone tuile-main";
    main.textContent = "✋";
    main.title = "Main levée";
    legende.append(nom, micCoupe, main);
    el.append(video, ini, legende);
    if (p.isLocal) el.classList.add("tuile-moi");
    this.el.grille.append(el);
    const tuile = { el, video, initiales: ini, nom, micCoupe, main, piste: null };
    this.tuiles.set(p.identity, tuile);
    return tuile;
  }

  majTuile(p) {
    if (!p) return;
    const LK = lk();
    const t = this.tuiles.get(p.identity) || this.creerTuile(p);
    const camera = p.getTrackPublication(LK.Track.Source.Camera);
    const piste = camera && camera.track && !camera.isMuted ? camera.track : null;
    if (piste !== t.piste) {
      if (t.piste) t.piste.detach(t.video);
      if (piste) piste.attach(t.video);
      t.piste = piste;
    }
    t.video.hidden = !piste;
    t.initiales.hidden = Boolean(piste);
    t.initiales.textContent = initiales(p.name);
    const micro = p.getTrackPublication(LK.Track.Source.Microphone);
    t.micCoupe.hidden = Boolean(micro && !micro.isMuted);
    t.nom.textContent = (p.name || "?") + (p.isLocal ? " (toi)" : "");
    t.main.hidden = !this.mains.has(p.identity);
    t.el.dataset.role = role(p);
  }

  retirer(identite) {
    const t = this.tuiles.get(identite);
    if (t) {
      if (t.piste) t.piste.detach(t.video);
      t.el.remove();
      this.tuiles.delete(identite);
    }
    this.retirerEcran(identite);
  }

  parleurs(liste) {
    const actifs = new Set(liste.map((p) => p.identity));
    for (const [identite, t] of this.tuiles) t.el.classList.toggle("parle", actifs.has(identite));
  }

  // Mains levées (venant de la base Firebase) affichées sur les vignettes.
  afficherMains(uids) {
    this.mains = new Set(uids);
    for (const [identite, t] of this.tuiles) t.main.hidden = !this.mains.has(identite);
  }

  // ---------- Pistes reçues ----------

  pisteRecue(piste, pub, p) {
    const LK = lk();
    if (piste.kind === "audio") {
      const audio = piste.attach();
      audio.dataset.identite = p.identity;
      this.el.sons.append(audio);
      return;
    }
    if (pub.source === LK.Track.Source.ScreenShare) this.ajouterEcran(p, piste);
    else this.majTuile(p);
  }

  pisteRetiree(piste, pub, p) {
    const LK = lk();
    if (piste.kind === "audio") {
      piste.detach().forEach((el) => el.remove());
      return;
    }
    if (pub.source === LK.Track.Source.ScreenShare) this.retirerEcran(p.identity);
    else this.majTuile(p);
  }

  localChange(pub, p, publiee) {
    const LK = lk();
    if (pub.source === LK.Track.Source.ScreenShare) {
      if (publiee && pub.track) this.ajouterEcran(p, pub.track);
      else this.retirerEcran(p.identity);
      this.signaler("ecran", publiee);
    }
    this.majTuile(p);
    this.signaler("etat");
  }

  // ---------- Écran partagé (grand cadre au-dessus des vignettes) ----------

  ajouterEcran(p, piste) {
    this.ecrans = this.ecrans.filter((e) => e.identite !== p.identity);
    this.ecrans.push({ identite: p.identity, nom: p.name || "?", local: p.isLocal, piste });
    this.afficherEcran();
  }

  retirerEcran(identite) {
    const avant = this.ecrans.length;
    this.ecrans = this.ecrans.filter((e) => {
      if (e.identite !== identite) return true;
      e.piste.detach(this.el.ecranVideo);
      return false;
    });
    if (this.ecrans.length !== avant) this.afficherEcran();
  }

  // Un seul écran affiché à la fois : le plus récent.
  afficherEcran() {
    const actuel = this.ecrans[this.ecrans.length - 1];
    for (const e of this.ecrans) if (e !== actuel) e.piste.detach(this.el.ecranVideo);
    this.el.ecran.hidden = !actuel;
    if (!actuel) return;
    actuel.piste.attach(this.el.ecranVideo);
    this.el.ecranLegende.textContent = actuel.local ? "Tu partages ton écran" : `Écran de ${actuel.nom}`;
    this.signaler("etat");
  }

  get identiteEcranAffiche() {
    return this.ecrans[this.ecrans.length - 1]?.identite || null;
  }

  // ---------- Boutons ----------

  get micro() {
    return Boolean(this.room?.localParticipant.isMicrophoneEnabled);
  }

  get camera() {
    return Boolean(this.room?.localParticipant.isCameraEnabled);
  }

  get ecranPartage() {
    return Boolean(this.room?.localParticipant.isScreenShareEnabled);
  }

  // Faux si le navigateur bloque le son (il faut un clic : bouton « Activer le son »).
  get sonAutorise() {
    return !this.room || this.room.canPlaybackAudio;
  }

  async activerSon() {
    if (this.room) await this.room.startAudio();
    this.signaler("etat");
  }

  async basculerMicro() {
    await this.room.localParticipant.setMicrophoneEnabled(!this.micro);
    this.majTuile(this.room.localParticipant);
    this.signaler("etat");
  }

  async basculerCamera() {
    await this.room.localParticipant.setCameraEnabled(!this.camera);
    this.majTuile(this.room.localParticipant);
    this.signaler("etat");
  }

  // Le navigateur demande toujours quelle fenêtre ou quel écran partager :
  // impossible de partager l'écran de quelqu'un sans son accord.
  async partagerEcran(oui) {
    if (!this.room) return;
    await this.room.localParticipant.setScreenShareEnabled(oui, { audio: false });
    this.signaler("etat");
  }

  // ---------- Fin ----------

  deconnecte(raison) {
    const R = lk().DisconnectReason;
    this.nettoyer();
    if (this.depart) return;
    let detail = "reseau";
    if (raison === R.PARTICIPANT_REMOVED) detail = "exclu";
    else if (raison === R.DUPLICATE_IDENTITY) detail = "doublon";
    else if (raison === R.ROOM_DELETED) detail = "salle-fermee";
    this.signaler("deconnexion", detail);
  }

  nettoyer() {
    for (const identite of [...this.tuiles.keys()]) this.retirer(identite);
    this.el.sons.replaceChildren();
    this.ecrans = [];
    this.el.ecran.hidden = true;
    this.signaler("etat");
  }

  async deconnecter() {
    this.depart = true;
    const room = this.room;
    this.room = null;
    if (room) await room.disconnect();
    this.nettoyer();
  }
}
