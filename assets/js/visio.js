// Salle de visio basée sur Jitsi Meet (serveur public meet.jit.si)
// Visio, partage d'écran, tchat et main levée sont fournis par Jitsi.

const DOMAINE = "meet.jit.si";
const PREFIXE = "nsi-en-ligne-"; // évite de tomber dans la salle d'inconnus

const form = document.getElementById("form-salle");
const pseudoInput = document.getElementById("pseudo");
const salleInput = document.getElementById("salle");
const lienExterne = document.getElementById("lien-externe");
const zone = document.getElementById("jitsi");

let api = null;

// "NSI Terminale B" -> "nsi-terminale-b"
function nettoyer(nom) {
  return nom
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Pré-remplit le prénom et la salle si on les a déjà tapés
try {
  pseudoInput.value = localStorage.getItem("nsi-pseudo") || "";
  salleInput.value = new URLSearchParams(location.search).get("salle") || localStorage.getItem("nsi-salle") || "";
} catch (e) {}

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

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const pseudo = pseudoInput.value.trim();
  const salle = PREFIXE + nettoyer(salleInput.value);
  try {
    localStorage.setItem("nsi-pseudo", pseudo);
    localStorage.setItem("nsi-salle", salleInput.value.trim());
  } catch (e) {}

  // Lien direct, utile si la visio intégrée est coupée ou bloquée
  lienExterne.href = `https://${DOMAINE}/${salle}#userInfo.displayName=${encodeURIComponent(JSON.stringify(pseudo))}`;
  lienExterne.hidden = false;

  try {
    await chargerScriptJitsi();
  } catch (e) {
    zone.innerHTML = '<p class="muted" style="padding:16px">Impossible de charger Jitsi. Utilise le bouton « Ouvrir dans un nouvel onglet ».</p>';
    return;
  }

  if (api) api.dispose();
  zone.innerHTML = "";
  api = new JitsiMeetExternalAPI(DOMAINE, {
    roomName: salle,
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
  api.addListener("readyToClose", () => {
    api.dispose();
    api = null;
    zone.innerHTML = '<p class="muted" style="padding:16px">Tu as quitté la salle.</p>';
  });
});
