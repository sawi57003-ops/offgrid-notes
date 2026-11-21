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

// App Check debug token REVOKED 21 Nov 2026 (it was committed to the public
// repo by mistake). No debug token ships in this repo. For a working demo,
// register reCAPTCHA v3 in App Check instead.
