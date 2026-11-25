// Offgrid — offline-first field notes with Firebase AI Logic hybrid inference.
// Short jobs run PREFER_ON_DEVICE (Gemini Nano in Chrome when available).
// Long documents run PREFER_IN_CLOUD (Gemini in the cloud).
// Every result displays response.inferenceSource, so the badge reports what
// actually ran — never a guess.
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getRemoteConfig, fetchAndActivate, getString, getNumber } from "firebase/remote-config";
import {
  getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema,
} from "firebase/ai";
import { firebaseConfig } from "./firebase-config.js";

// reCAPTCHA site key (public by design, like the Firebase apiKey).
// Score-based key created 26 Nov 2026 in Google Cloud Console, registered in
// Firebase Console > App Check as "Fraud Defense" (reCAPTCHA Enterprise).
const RECAPTCHA_SITE_KEY = "6LdKSzEuAAAAALHxsn9J4DJfsb-32Wvaax2FeUG6";

const $ = (id) => document.getElementById(id);
const els = {
  net: $("netPill"), device: $("devicePill"), cloud: $("cloudPill"),
  search: $("search"), list: $("notesList"), newBtn: $("newNoteBtn"),
  title: $("noteTitle"), body: $("noteBody"), words: $("wordCount"), save: $("saveState"),
  summarize: $("summarizeBtn"), actions: $("actionsBtn"), titleBtn: $("titleBtn"),
  deepdive: $("deepdiveBtn"), prepare: $("prepareDeviceBtn"), progress: $("deviceProgress"),
  result: $("aiResult"), tasksWrap: $("tasksWrap"), tasksList: $("tasksList"),
  diagDevice: $("diagDevice"), diagNet: $("diagNet"), diagLast: $("diagLast"),
  diagSummary: $("diagSummary"), diagSync: $("diagSync"),
};

// ---------- Local store (source of truth; works with zero network) ----------
const LS_KEY = "offgrid.notes.v1";
let notes = loadLocal();
let activeId = notes[0]?.id ?? null;
let saveTimer = null;

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted storage -> reseed */ }
  return seedNotes();
}
function persistLocal() { localStorage.setItem(LS_KEY, JSON.stringify(notes)); }
function seedNotes() {
  const now = Date.now();
  return [
    {
      id: "sample-field", title: "Field visit — mangrove nursery, 21 Nov",
      body: "Met the nursery team at 08:00. 400 seedlings ready for the December planting, but the brackish-water pump failed twice this week and the spare impeller is still in Jakarta. Sari will confirm the delivery date tomorrow. The team asked for a simple offline checklist they can use in the field without signal. Budget note: the second pump costs about half the monthly fuel budget, so we should check the warranty first before buying. Next visit: 28 Nov, bring the soil test kit.",
      tasks: [], ai: null, createdAt: now - 86400000, updatedAt: now - 3600000,
    },
    {
      id: "sample-lecture", title: "Lecture notes — hybrid inference",
      body: "Hybrid inference means the app tries the on-device model first and falls back to the cloud when the device cannot run it. On-device wins on privacy, latency, cost and offline use. The cloud wins on capability: long context, tools, multimodal files. Firebase AI Logic exposes one SDK for both. Modes: prefer_on_device, only_on_device, prefer_in_cloud, only_in_cloud. The response carries inferenceSource: ON_DEVICE or IN_CLOUD, so the UI can show honestly where each answer came from. App Check is enforced; debug tokens are accepted for submissions.",
      tasks: [], ai: null, createdAt: now - 172800000, updatedAt: now - 7200000,
    },
  ];
}
const activeNote = () => notes.find((n) => n.id === activeId) ?? null;

// ---------- Firebase (optional: app works local-only without config) ----------
let fb = null; // { app, auth, db, ai, rc, uid }
let models = {};
let deviceReady = false;

const CONFIGURED = Boolean(firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE"));

async function initFirebase() {
  if (!CONFIGURED) {
    els.diagSync.textContent = "local only — add firebase-config.js to enable sync + AI";
    els.cloud.textContent = "● cloud: not configured";
    return;
  }
  try {
    const app = initializeApp(firebaseConfig);
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
    const auth = getAuth(app);
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const rc = getRemoteConfig(app);
    rc.settings = { minimumFetchIntervalMillis: 3600000 };
    rc.defaultConfig = { summary_words: 80, summary_style: "bullets" };
    fb = { app, auth, db, ai, rc, uid: null };

    await fetchAndActivate(rc).catch(() => {});
    els.diagSummary.textContent =
      `Remote Config: ${getNumber(rc, "summary_words")} words, style "${getString(rc, "summary_style")}"`;

    onAuthStateChanged(auth, (user) => {
      if (user) {
        fb.uid = user.uid;
        els.diagSync.textContent = `signed in anonymously (${user.uid.slice(0, 8)}…), syncing`;
        subscribeRemote();
      }
    });
    await signInAnonymously(auth);
    els.cloud.textContent = "● cloud: ready";
    els.cloud.classList.add("cloud");
  } catch (err) {
    console.error("Firebase init failed", err);
    els.cloud.textContent = "● cloud: init failed — local only";
    els.diagSync.textContent = `local only (Firebase init failed: ${err.message})`;
  }
}

function notesCol() {
  return collection(fb.db, "users", fb.uid, "notes");
}
function subscribeRemote() {
  onSnapshot(notesCol(), (snap) => {
    let changed = false;
    snap.docChanges().forEach((ch) => {
      const remote = { id: ch.doc.id, ...ch.doc.data() };
      const i = notes.findIndex((n) => n.id === remote.id);
      if (ch.type === "removed") {
        if (i >= 0) { notes.splice(i, 1); changed = true; }
      } else if (i < 0 || (remote.updatedAt ?? 0) > (notes[i].updatedAt ?? 0)) {
        if (i < 0) notes.push(remote); else notes[i] = remote;
        changed = true;
      }
    });
    if (changed) { persistLocal(); renderList(); if (!activeNote() && notes[0]) activeId = notes[0].id; renderEditor(); }
  }, (err) => { els.diagSync.textContent = `sync error: ${err.message}`; });
}
async function syncUp(note) {
  if (!fb?.uid) return;
  try { await setDoc(doc(notesCol(), note.id), note, { merge: true }); }
  catch (err) { console.warn("sync up failed (kept locally)", err); }
}
async function syncDelete(id) {
  if (!fb?.uid) return;
  try { await deleteDoc(doc(notesCol(), id)); } catch { /* kept locally */ }
}

// ---------- Hybrid AI ----------
function summaryParams() {
  if (!fb) return { words: 80, style: "bullets" };
  return {
    words: getNumber(fb.rc, "summary_words") || 80,
    style: getString(fb.rc, "summary_style") || "bullets",
  };
}

function getModel(kind) {
  if (!fb) throw new Error("Firebase is not configured — add firebase-config.js first.");
  if (models[kind]) return models[kind];
  const cloudModel = "gemini-3.8-flash";
  if (kind === "deepdive") {
    models[kind] = getGenerativeModel(fb.ai, {
      mode: InferenceMode.PREFER_IN_CLOUD,
      inCloudParams: { model: cloudModel, generationConfig: { maxOutputTokens: 1200 } },
      onDeviceParams: { createOptions: { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] } },
    });
  } else if (kind === "actions") {
    const schema = Schema.object({
      properties: { items: Schema.array({ items: Schema.object({ properties: { text: Schema.string() } }) }) },
    });
    models[kind] = getGenerativeModel(fb.ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: {
        model: cloudModel,
        generationConfig: { responseMimeType: "application/json", responseSchema: schema },
      },
      onDeviceParams: { promptOptions: { responseConstraint: schema } },
    });
  } else {
    models[kind] = getGenerativeModel(fb.ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: { model: cloudModel, generationConfig: { maxOutputTokens: 600 } },
      onDeviceParams: { createOptions: { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] } },
    });
  }
  return models[kind];
}

async function ensureDeviceModel(model) {
  if (deviceReady) return;
  // Must run on a user gesture and before the first prompt. Downloads Gemini
  // Nano in the background on first use; progress is shown honestly.
  await model.initializeDeviceModel((p) => {
    els.progress.textContent = `Downloading on-device model: ${Math.round(p * 100)}%`;
  });
  // initializeDeviceModel can resolve even when no on-device model is usable
  // on this device, so only claim readiness after verifying availability.
  let avail = "unknown";
  try {
    if (typeof LanguageModel !== "undefined") avail = await LanguageModel.availability();
  } catch { /* keep "unknown" */ }
  deviceReady = true;
  els.progress.textContent = avail === "available"
    ? "On-device model ready."
    : `On-device model ${avail} on this device — cloud fallback will be used.`;
  checkDevice();
}

function badgeFor(source) {
  if (source === "ON_DEVICE") return `<span class="badge on-device">On-device · Gemini Nano</span>`;
  if (source === "IN_CLOUD") return `<span class="badge in-cloud">Cloud · Gemini</span>`;
  return `<span class="badge error">Unknown source</span>`;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function runAI(kind, prompt, { stream = false } = {}) {
  const note = activeNote();
  if (!note) return;
  if (!fb) {
    els.result.innerHTML = `<span class="badge error">Not configured</span><br>Add your Firebase web config to <code>firebase-config.js</code> (see README) to enable AI. Notes still work fully offline.`;
    return;
  }
  const btn = { summarize: els.summarize, actions: els.actions, title: els.titleBtn, deepdive: els.deepdive }[kind];
  btn.disabled = true; btn.classList.add("busy");
  els.result.innerHTML = `<p class="placeholder">Thinking… ${kind === "deepdive" ? "long document — routing to the cloud." : "trying on-device first, cloud fallback if needed."}</p>`;
  const t0 = performance.now();
  try {
    const model = getModel(kind);
    if (kind !== "deepdive") await ensureDeviceModel(model);
    let text, source;
    if (stream) {
      const res = await model.generateContentStream(prompt);
      let out = "";
      for await (const chunk of res.stream) {
        out += chunk.text();
        els.result.innerHTML = `${badgeFor("STREAMING")}<br>${escapeHtml(out)}`;
        els.result.querySelector(".badge").textContent = "Generating…";
      }
      const final = await res.response;
      text = final.text(); source = final.inferenceSource;
    } else {
      const res = await model.generateContent(prompt);
      text = res.response.text(); source = res.response.inferenceSource;
    }
    const ms = Math.round(performance.now() - t0);
    note.ai = { kind, source, latencyMs: ms, at: Date.now() };
    els.diagLast.textContent = `${kind}: ${source} in ${ms} ms (${navigator.onLine ? "online" : "offline"})`;
    if (kind === "actions") {
      let items = [];
      try { items = JSON.parse(text).items ?? []; } catch { items = text.split("\n").filter(Boolean).map((t) => ({ text: t.replace(/^[-*•\d.)\s]+/, "") })); }
      note.tasks = items.map((it) => ({ text: it.text, done: false }));
      renderTasks(note);
      els.result.innerHTML = `${badgeFor(source)}<br>${escapeHtml(items.map((i) => "• " + i.text).join("\n") || text)}<div class="src-line">Source: ${source} · ${ms} ms · ${navigator.onLine ? "online" : "offline"} · saved to this note.</div>`;
    } else if (kind === "title") {
      const title = text.trim().replace(/^["']|["']$/g, "").split("\n")[0];
      note.title = title;
      els.title.value = title;
      els.result.innerHTML = `${badgeFor(source)}<br>${escapeHtml(title)}<div class="src-line">Source: ${source} · ${ms} ms · title applied to this note.</div>`;
    } else {
      els.result.innerHTML = `${badgeFor(source)}<br>${escapeHtml(text)}<div class="src-line">Source: ${source} · ${ms} ms · ${navigator.onLine ? "online" : "offline"} · model: ${source === "ON_DEVICE" ? "Gemini Nano (Chrome Prompt API)" : "Gemini cloud model"}.</div>`;
    }
    note.updatedAt = Date.now();
    persistLocal(); syncUp(note); renderList();
  } catch (err) {
    console.error("AI failed", err);
    els.result.innerHTML = `<span class="badge error">AI failed</span><br>${escapeHtml(err.message || String(err))}<div class="src-line">If the device has no on-device model and there is no connection, AI cannot run — that is the honest limit. Check the diagnostics panel.</div>`;
    els.diagLast.textContent = `${kind}: FAILED — ${err.message}`;
  } finally {
    btn.disabled = false; btn.classList.remove("busy");
  }
}

// ---------- Diagnostics ----------
async function checkDevice() {
  try {
    if (typeof LanguageModel === "undefined") {
      els.device.textContent = "● on-device: not available in this browser";
      els.diagDevice.textContent = "LanguageModel API missing — use Chrome 139+ desktop with the Gemini Nano flag enabled.";
      return;
    }
    const avail = await LanguageModel.availability();
    els.diagDevice.textContent = `LanguageModel.availability() = "${avail}"`;
    if (avail === "available") {
      els.device.textContent = "● on-device: Gemini Nano available";
      els.device.classList.add("ok");
    } else if (avail === "downloading" || avail === "downloadable") {
      els.device.textContent = `● on-device: model ${avail} — press “Prepare on-device model”`;
      els.device.classList.add("warn");
    } else {
      els.device.textContent = `● on-device: ${avail}`;
      els.device.classList.add("warn");
    }
  } catch (err) {
    els.device.textContent = "● on-device: check failed";
    els.diagDevice.textContent = `availability check failed: ${err.message}`;
  }
}
function checkNet() {
  const online = navigator.onLine;
  els.net.textContent = online ? "● online" : "● offline — notes + on-device AI still work";
  els.net.classList.toggle("ok", online);
  els.net.classList.toggle("warn", !online);
  els.diagNet.textContent = online ? "online" : "offline (airplane-mode friendly: local notes + on-device AI keep working)";
}
window.addEventListener("online", checkNet);
window.addEventListener("offline", checkNet);

// ---------- UI ----------
function renderList() {
  const q = els.search.value.trim().toLowerCase();
  const items = notes
    .filter((n) => !q || (n.title + " " + n.body).toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  els.list.innerHTML = items.map((n) => `
    <li data-id="${n.id}" class="${n.id === activeId ? "active" : ""}">
      <div class="t">${escapeHtml(n.title || "Untitled")}</div>
      <div class="s">${escapeHtml((n.body || "").slice(0, 80))}</div>
      <div><span>${new Date(n.updatedAt).toLocaleDateString()}</span><span>${n.ai ? (n.ai.source === "ON_DEVICE" ? "◐ on-device" : "☁ cloud") : ""}</span></div>
    </li>`).join("") || `<li>No notes match.</li>`;
  els.list.querySelectorAll("li[data-id]").forEach((li) =>
    li.addEventListener("click", () => { activeId = li.dataset.id; renderList(); renderEditor(); }));
}
function renderEditor() {
  const n = activeNote();
  if (!n) { els.title.value = ""; els.body.value = ""; els.words.textContent = "0 words"; return; }
  els.title.value = n.title; els.body.value = n.body;
  els.words.textContent = `${(n.body.trim().split(/\s+/).filter(Boolean).length)} words`;
  renderTasks(n);
}
function renderTasks(n) {
  if (!n?.tasks?.length) { els.tasksWrap.hidden = true; els.tasksList.innerHTML = ""; return; }
  els.tasksWrap.hidden = false;
  els.tasksList.innerHTML = n.tasks.map((t, i) =>
    `<li class="${t.done ? "done" : ""}"><input type="checkbox" data-i="${i}" ${t.done ? "checked" : ""}><span>${escapeHtml(t.text)}</span></li>`).join("");
  els.tasksList.querySelectorAll("input").forEach((cb) =>
    cb.addEventListener("change", () => {
      n.tasks[+cb.dataset.i].done = cb.checked;
      n.updatedAt = Date.now(); persistLocal(); syncUp(n); renderTasks(n);
    }));
}
function queueSave() {
  els.save.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const n = activeNote(); if (!n) return;
    n.title = els.title.value; n.body = els.body.value; n.updatedAt = Date.now();
    persistLocal(); syncUp(n); renderList();
    els.words.textContent = `${(n.body.trim().split(/\s+/).filter(Boolean).length)} words`;
    els.save.textContent = "Saved locally" + (fb?.uid ? " + syncing" : "");
  }, 400);
}

els.newBtn.addEventListener("click", () => {
  const n = { id: "n" + Date.now().toString(36), title: "", body: "", tasks: [], ai: null, createdAt: Date.now(), updatedAt: Date.now() };
  notes.unshift(n); activeId = n.id; persistLocal(); syncUp(n); renderList(); renderEditor(); els.title.focus();
});
els.title.addEventListener("input", queueSave);
els.body.addEventListener("input", queueSave);
els.search.addEventListener("input", renderList);
els.prepare.addEventListener("click", async () => {
  try {
    els.progress.textContent = "Preparing on-device model…";
    await ensureDeviceModel(getModel("summarize"));
  } catch (err) {
    els.progress.textContent = `Could not prepare model: ${err.message}`;
  }
});
els.summarize.addEventListener("click", () => {
  const n = activeNote(); if (!n?.body.trim()) return;
  const p = summaryParams();
  runAI("summarize",
    `Summarize the following field note in ${p.words} words or fewer, as ${p.style}. Keep facts, names, dates and numbers exact. Note:\n\n${n.body}`,
    { stream: true });
});
els.actions.addEventListener("click", () => {
  const n = activeNote(); if (!n?.body.trim()) return;
  runAI("actions",
    `Extract the concrete action items from this note as JSON: {"items": [{"text": "..."}]}. Only real tasks with an owner or a date if stated. Note:\n\n${n.body}`);
});
els.titleBtn.addEventListener("click", () => {
  const n = activeNote(); if (!n?.body.trim()) return;
  runAI("title", `Suggest a short title (max 6 words) for this note. Reply with only the title, no quotes.\n\n${n.body}`);
});
els.deepdive.addEventListener("click", () => {
  const n = activeNote(); if (!n?.body.trim()) return;
  runAI("deepdive",
    `Turn this short note into a detailed brief with sections: Background, Key points, Open questions, Next steps. Use only facts from the note; mark anything inferred as "inferred". Note:\n\n${n.body}`,
    { stream: true });
});

// ---------- Boot ----------
renderList();
renderEditor();
checkNet();
checkDevice();
initFirebase();
