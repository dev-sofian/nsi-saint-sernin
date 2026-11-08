// Salle de classe : visio Jitsi Meet (serveur public meet.jit.si) + Python partagé
// dans une fenêtre flottante. Visio, partage d'écran, tchat et main levée sont fournis par Jitsi.

import { ecouterCompte, firebaseConfigure } from "./auth.js";
import { Salle } from "./salle.js";
import { PythonPartage, rafraichirEditeur } from "./python-partage.js";
import { creerFenetre } from "./fenetre.js";

const DOMAINE = "meet.jit.si";
const PREFIXE = "nsi-st-sernin-"; // évite de tomber dans la salle d'inconnus

const $ = (id) => document.getElementById(id);
const form = $("form-salle");
const pseudoInput = $("pseudo");
const salleInput = $("salle");
const zone = $("jitsi");

let compte = null;
let api = null;      // visio Jitsi
let salle = null;    // Salle (Realtime Database)
let python = null;   // PythonPartage
let pythonEtaitActif = null;

const fenetre = creerFenetre($("fenetre-python"), {
  cle: "python",
  position: { x: Math.max(16, innerWidth - 620), y: 140, l: 600, h: 560 },
  surChangement: rafraichirEditeur,
});

// "NSI Terminale B" -> "nsi-terminale-b"
function nettoyer(nom) {
  return nom
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 40);
}

function message(texte) {
  $("visio-message").textContent = texte;
}

// Pré-remplit la salle (et le prénom sans comptes) si on les a déjà tapés.
try {
  pseudoInput.value = localStorage.getItem("nsi-pseudo") || "";
  salleInput.value = new URLSearchParams(location.search).get("salle") || localStorage.getItem("nsi-salle") || "";
} catch (e) {}

// ---------- Compte ----------

ecouterCompte((c) => {
  compte = c;
  if (!firebaseConfigure) {
    // Site sans comptes : visio seule, avec un prénom.
    form.hidden = false;
    pseudoInput.hidden = false;
    pseudoInput.required = true;
    return;
  }
  $("visio-connexion").hidden = Boolean(c);
  $("visio-banni").hidden = !(c && c.banni);
  form.hidden = !c || c.banni;
  $("visio-identite").textContent = c ? `Tu entres en tant que ${c.pseudo}.` : "";
  if ((!c || c.banni) && api) quitter();
});

// ---------- Visio ----------

function chargerScriptJitsi() {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve();
    const s = document.createElement("script");
    s.src = `https://${DOMAINE}/external_api.js`;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function demarrerVisio(nomJitsi, pseudo) {
  try {
    await chargerScriptJitsi();
  } catch (e) {
    zone.replaceChildren();
    const p = document.createElement("p");
    p.className = "muted";
    p.style.padding = "16px";
    p.textContent = "Impossible de charger la visio. Utilise le bouton « Visio dans un onglet ».";
    zone.append(p);
    return;
  }
  zone.replaceChildren();
  api = new JitsiMeetExternalAPI(DOMAINE, {
    roomName: nomJitsi,
    parentNode: zone,
    width: "100%",
    height: "100%",
    lang: "fr",
    userInfo: { displayName: pseudo },
    configOverwrite: {
      prejoinPageEnabled: false,
      startWithAudioMuted: true,
      startWithVideoMuted: true,
    },
    interfaceConfigOverwrite: {
      TOOLBAR_BUTTONS: [
        "microphone", "camera", "desktop", "chat", "raisehand",
        "participants-pane", "tileview", "fullscreen", "settings", "hangup",
      ],
    },
  });
  api.addListener("readyToClose", quitter);
}

// ---------- Salle ----------

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const nom = nettoyer(salleInput.value);
  if (!nom) {
    salleInput.focus();
    return;
  }
  const pseudo = compte ? compte.pseudo : pseudoInput.value.trim();
  try {
    if (!compte) localStorage.setItem("nsi-pseudo", pseudo);
    localStorage.setItem("nsi-salle", salleInput.value.trim());
  } catch (e) {}

  await quitter();
  const nomJitsi = PREFIXE + nom;
  $("lien-externe").href = `https://${DOMAINE}/${nomJitsi}#userInfo.displayName=${encodeURIComponent(JSON.stringify(pseudo))}`;
  $("nom-salle").textContent = nom;
  form.hidden = true;
  $("barre-salle").hidden = false;
  message("");

  demarrerVisio(nomJitsi, pseudo);

  // Python partagé (seulement avec les comptes activés)
  $("btn-python").hidden = !compte;
  if (compte) {
    try {
      salle = await Salle.rejoindre(nom, compte);
      python = new PythonPartage(salle);
      python.demarrer();
      salle.addEventListener("change", majBarre);
      salle.addEventListener("erreur", () => message("Accès à la salle refusé."));
      $("role-salle").textContent = "…";
      majBarre();
    } catch (e) {
      console.error(e);
      message("Python partagé indisponible pour le moment.");
      $("btn-python").hidden = true;
    }
  }
});

function majBarre() {
  if (!salle || !salle.pret) return;
  $("role-salle").textContent = salle.estHote ? "Hôte" : "Participant";
  const actif = salle.pythonActif;

  const btnModule = $("btn-module-python");
  btnModule.hidden = !salle.estHote;
  btnModule.textContent = actif ? "Désactiver Python pour tous" : "Activer Python pour tous";

  const btnPython = $("btn-python");
  btnPython.disabled = !(actif || salle.estHote);
  btnPython.title = btnPython.disabled ? "L'hôte n'a pas encore activé le Python" : "";

  // L'hôte active le Python : la fenêtre s'ouvre chez tout le monde.
  if (actif && pythonEtaitActif !== true) fenetre.ouvrir();
  if (!actif && pythonEtaitActif === true && !salle.estHote) fenetre.fermer();
  pythonEtaitActif = actif;
}

$("btn-python").addEventListener("click", () => fenetre.basculer());

$("btn-module-python").addEventListener("click", async (ev) => {
  const bouton = ev.currentTarget;
  bouton.disabled = true;
  try {
    await salle.activerPython(!salle.pythonActif);
  } catch (e) {
    console.error(e);
    message("Action refusée.");
  } finally {
    bouton.disabled = false;
  }
});

$("btn-quitter").addEventListener("click", quitter);

async function quitter() {
  if (api) {
    api.removeListener("readyToClose", quitter);
    api.dispose();
    api = null;
  }
  if (python) python.quitter();
  if (salle) await salle.quitter();
  python = null;
  salle = null;
  pythonEtaitActif = null;
  fenetre.fermer();
  $("barre-salle").hidden = true;
  form.hidden = firebaseConfigure ? !compte || compte.banni : false;
  zone.replaceChildren();
}
