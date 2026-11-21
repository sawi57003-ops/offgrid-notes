// Firebase web config for Offgrid.
// The apiKey below is a public client identifier (Firebase web apps ship it
// in client code by design). It is NOT a private key. Abuse is prevented by
// Firebase App Check (enforced) + Firestore security rules (see README).
// Project "offgrid-notes" created 21 Nov 2026 (Spark FREE, no billing, no Analytics).
// AI Logic: Gemini Developer API (free). Firestore: asia-southeast1 (test mode, 30 days).

export const firebaseConfig = {
  apiKey: "AIzaSyDCo28fdaFrbSTOrk-i4h-2VFPQEb6qQD0",
  authDomain: "offgrid-notes.firebaseapp.com",
  projectId: "offgrid-notes",
  storageBucket: "offgrid-notes.firebasestorage.app",
  messagingSenderId: "521676222647",
  appId: "1:521676222647:web:146efe6a3e84d7cabb9d32",
};

// App Check debug token registered in the Firebase console for this project
// (App Check > Apps > Manage debug tokens). Debug tokens are accepted for
// #BuildHybridAI submissions. Replace with reCAPTCHA v3 for production.
export const appCheckDebugToken = "ce444219-5f0a-4034-b658-a4366a7a3bd5";
