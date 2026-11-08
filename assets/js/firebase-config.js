// Configuration Firebase du site.
// Ces valeurs ne sont PAS secrètes : elles identifient le projet et sont visibles
// par tout visiteur. La sécurité repose sur database.rules.json (côté serveur).
// Pour les remplir : voir docs/FIREBASE.md, étape 2.

export const configFirebase = {
  apiKey: "AIzaSyCH7dyutEgOzNpXoMdQSl7PaiYhNi3wMnE",
  authDomain: "nsi-saint-sernin.firebaseapp.com",
  projectId: "nsi-saint-sernin",
  storageBucket: "nsi-saint-sernin.firebasestorage.app",
  messagingSenderId: "33132653562",
  appId: "1:33132653562:web:b24b0a0217c7d4f0e41243",
  measurementId: "G-993GQ6KL52",
  // Adresse de la Realtime Database (docs/FIREBASE.md, étape 5) : à vérifier dans la console,
  // Realtime Database → Données, l'adresse affichée en haut doit être exactement celle-ci.
  databaseURL: "https://nsi-saint-sernin-default-rtdb.europe-west1.firebasedatabase.app",
};

// Tant que la configuration est vide, le site fonctionne sans comptes (comme avant).
export const firebaseConfigure = Boolean(
  configFirebase.apiKey && configFirebase.projectId && configFirebase.databaseURL
);
