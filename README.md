# Offgrid — field notes with hybrid AI

Offline-first notes for people who work where the signal doesn't reach:
field researchers, journalists, students, travelers. Write anywhere, even in
airplane mode. AI helps where it can run: **on-device first, cloud when it
matters**.

Built for **#BuildHybridAI 2026** with Firebase AI Logic hybrid inference.

## The hybrid behavior (the point of the app)

| Job | Routing | Why |
|---|---|---|
| Summarize a note | `PREFER_ON_DEVICE` | Short, private, instant, works offline |
| Extract action items (structured JSON) | `PREFER_ON_DEVICE` | Same — fast + private |
| Suggest a title | `PREFER_ON_DEVICE` | Same |
| Deep dive a long document into a full brief | `PREFER_IN_CLOUD` | Long context + capability need the cloud |

Every AI result shows a badge with **where it actually ran**, taken from
`response.inferenceSource` (`ON_DEVICE` / `IN_CLOUD`), plus latency in ms.
Nothing is faked: if the device has no on-device model and there is no
connection, the app says so plainly.

On-device inference uses the Chrome Prompt API (Gemini Nano, Chrome 139+
desktop). If Gemini Nano isn't available, the Firebase AI Logic SDK falls
back to the cloud model automatically. The diagnostics panel shows
`LanguageModel.availability()`, network state, the last inference source,
and the Remote Config values live.

## Firebase products used

- **AI Logic (hybrid inference)** — `firebase/ai`, `getGenerativeModel` with
  `InferenceMode.PREFER_ON_DEVICE` / `PREFER_IN_CLOUD`, `initializeDeviceModel()`
  on a user gesture, structured output via `responseSchema` (cloud) and
  `responseConstraint` (on-device).
- **App Check** — enforced for AI Logic. No debug token ships in this repo
  (the one briefly committed was revoked 21 Nov 2026); use reCAPTCHA v3.
- **Firestore** — notes sync under `users/{uid}/notes`, with persistent local
  cache so notes work fully offline and sync when connectivity returns.
- **Authentication** — anonymous sign-in (no account needed to try it).
- **Remote Config** — `summary_words` (default 80) and `summary_style`
  (default `"bullets"`) tune the summarizer without a redeploy.

## Run it

No build step — static files only.

```bash
# from this directory, serve over http://localhost (the Prompt API needs a
# secure context; file:// will not work for on-device inference)
python3 -m http.server 8080
# open http://localhost:8080
```

1. Use Chrome 139+ on desktop.
2. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled**, then restart Chrome.
3. (First run) click **Prepare on-device model** — Gemini Nano downloads in the background once, then stays cached.
4. Create or open a note, click **Summarize**. The badge tells you where it ran.

## Firebase setup (to run your own copy)

1. Create a Firebase project (Spark plan — free, no billing).
2. AI Services → AI Logic → Get started → Gemini Developer API.
3. Register a Web app, copy its config into `firebase-config.js`.
4. App Check → Apps → set up reCAPTCHA v3 (no debug token in this repo).
5. Authentication → enable Anonymous. Firestore → create database.
   Remote Config → add `summary_words` (80) and `summary_style` ("bullets").
6. Firestore rules (per-user notes, anonymous auth):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/notes/{noteId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## What was built during the hackathon period

Everything in this repo: the offline-first notes app, the four hybrid AI
actions with honest inference-source badges, Firestore sync + anonymous auth,
Remote Config tuning, App Check debug setup, and the demo video.

## License

MIT — see `LICENSE`.
