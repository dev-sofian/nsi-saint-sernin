// Configuration Firebase du site.
// Ces valeurs ne sont PAS secrètes : elles identifient le projet et sont visibles
// par tout visiteur. La sécurité repose sur firestore.rules (côté serveur).
// Pour les remplir : voir docs/FIREBASE.md, étape 2.

export const configFirebase = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// Tant que la configuration est vide, le site fonctionne sans comptes (comme avant).
export const firebaseConfigure = Boolean(configFirebase.apiKey && configFirebase.projectId);
