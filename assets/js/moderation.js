// Actions de modération partagées par la page admin et la salle de visio.
// Vérifiées pour de vrai par database.rules.json (admins connectés avec GitHub uniquement).

import { firebase } from "./auth.js";

// Une entrée du journal de modération, à ajouter dans une écriture groupée (update).
export function entreeJournal(fb, auteurUid, action, cibleUid, details) {
  const { d, db } = fb;
  const cle = d.push(d.ref(db, "journal")).key;
  return {
    [`journal/${cle}`]: {
      action, cibleUid, details: String(details).slice(0, 300), auteurUid, date: d.serverTimestamp(),
    },
  };
}

// Bannit un compte : il ne peut plus entrer dans aucune salle ni modifier son profil.
// Sa demande d'accès éventuelle est supprimée. Ne le sort pas de la visio : appeler
// /api/exclure en plus (voir admin.js et visio.js).
export async function bannirCompte({ uid, pseudo, motif }) {
  const fb = await firebase();
  const moi = fb.auth.currentUser.uid;
  pseudo = (pseudo || "?").slice(0, 40);
  motif = (motif || "").slice(0, 300);
  await fb.d.update(fb.d.ref(fb.db), {
    [`bans/${uid}`]: { pseudo, motif, auteurUid: moi, date: fb.d.serverTimestamp() },
    [`demandes/${uid}`]: null,
    ...entreeJournal(fb, moi, "ban", uid, `${pseudo} : ${motif}`),
  });
}
