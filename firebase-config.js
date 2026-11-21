// Firebase web config for Offgrid.
// The apiKey below is a public client identifier (Firebase web apps ship it
// in client code by design). It is NOT a private key. Abuse is prevented by
// Firebase App Check (enforced) + Firestore security rules (see README).
// HOW TO FILL IN: Firebase console > Project settings > Your apps > Web app.
// The browser task that created the project fills this file in; until then
// the app runs in local-only mode (notes + UI work, AI disabled).

export const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_AUTH_DOMAIN_HERE",
  projectId: "PASTE_PROJECT_ID_HERE",
  storageBucket: "PASTE_STORAGE_BUCKET_HERE",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID_HERE",
  appId: "PASTE_APP_ID_HERE",
};

// App Check debug token registered in the Firebase console for this project
// (App Check > Apps > Manage debug tokens). Debug tokens are accepted for
// #BuildHybridAI submissions. Replace with reCAPTCHA v3 for production.
export const appCheckDebugToken = "ce444219-5f0a-4034-b658-a4366a7a3bd5";
