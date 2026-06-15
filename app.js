// app.js
import {
  db,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  onSnapshot
} from "./firebase.js";

/* ============================================================
   ETAT GLOBAL
   ============================================================ */
let MATCHES = [];          // chargé depuis matches.json
let currentUser = null;    // { pseudo }
let currentGroup = null;   // { code, name }
let predictions = {};      // { matchId: { type, home, away, result } }
let groupMembers = [];     // [{pseudo, points}]
let unsubscribeMembers = null;
let unsubscribeMatches = null;
let activeMatchForModal = null;
let liveMatchesData = {};  // résultats des matchs depuis Firestore

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ============================================================
   UTILITAIRES
   ============================================================ */
function showToast(message, type = "") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = "toast show " + type;
  setTimeout(() => {
    toast.className = "toast";
  }, 2500);
}

function generateGroupCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function sanitizePseudo(pseudo) {
  return pseudo.trim().replace(/\s+/g, " ").slice(0, 20);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);

  const options = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Casablanca"
  };

  return d.toLocaleString("fr-FR", options) + " (Maroc)";
}

function isMatchStarted(match) {
  return new Date() >= new Date(match.date);
}

function getMatchResult(homeScore, awayScore) {
  if (homeScore > awayScore) return "1";
  if (homeScore < awayScore) return "2";
  return "N";
}

/* ============================================================
   CALCUL DES POINTS
   Barème :
   - Score exact = 5 pts
   - Bon résultat (1/N/2) = 3 pts
   - Faux = 0 pt
   ============================================================ */
function calculatePoints(prediction, realHome, realAway) {
  if (
    realHome === null ||
    realAway === null ||
    realHome === undefined ||
    realAway === undefined
  ) {
    return null;
  }

  const realResult = getMatchResult(realHome, realAway);

  if (prediction.type === "score") {
    if (prediction.home === realHome && prediction.away === realAway) {
      return { points: 5, label: "Score exact" };
    }

    const predResult = getMatchResult(prediction.home, prediction.away);

    if (predResult === realResult) {
      return { points: 3, label: "Bon résultat" };
    }

    return { points: 0, label: "Raté" };
  }

  if (prediction.type === "result") {
    if (prediction.result === realResult) {
      return { points: 3, label: "Bon résultat" };
    }

    return { points: 0, label: "Raté" };
  }

  return null;
}

function formatPredictionText(prediction, match) {
  if (!prediction) return "";

  if (prediction.type === "score") {
    return `Ton prono : ${prediction.home} - ${prediction.away}`;
  }

  if (prediction.type === "result") {
    const labels = {
      "1": match.home,
      "N": "Nul",
      "2": match.away
    };

    return `Ton prono : ${labels[prediction.result] || prediction.result}`;
  }

  return "";
}

/* ============================================================
   CHARGEMENT DES MATCHS
   ============================================================ */
async function loadMatches() {
  try {
    const res = await fetch("./matches.json");
    MATCHES = await res.json();
    MATCHES.sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch (e) {
    console.error("Erreur chargement matches.json", e);
    showToast("Erreur de chargement des matchs", "error");
  }
}

/* ============================================================
   FIRESTORE STRUCTURE
   groups/{code}
     - name
     - code
     - createdAt
   groups/{code}/members/{pseudo}
     - pseudo
     - points
   groups/{code}/predictions/{pseudo}_{matchId}
     - pseudo, matchId, type, home, away, result, createdAt
   groups/{code}/results/{matchId}
     - home, away
   ============================================================ */

/* ---------- CREATION DE GROUPE ---------- */
async function createGroup(groupName, pseudo) {
  let code = generateGroupCode();

  let exists = await getDoc(doc(db, "groups", code));
  let tries = 0;

  while (exists.exists() && tries < 5) {
    code = generateGroupCode();
    exists = await getDoc(doc(db, "groups", code));
    tries++;
  }

  await setDoc(doc(db, "groups", code), {
    name: groupName,
    code: code,
    createdBy: pseudo,
    createdAt: Date.now()
  });

  await setDoc(doc(db, "groups", code, "members", pseudo), {
    pseudo: pseudo,
    points: 0,
    joinedAt: Date.now()
  });

  return { code, name: groupName };
}

/* ---------- REJOINDRE UN GROUPE ---------- */
async function joinGroup(code, pseudo) {
  code = code.trim().toUpperCase();

  const groupRef = doc(db, "groups", code);
  const groupSnap = await getDoc(groupRef);

  if (!groupSnap.exists()) {
    throw new Error("Code de groupe invalide");
  }

  const memberRef = doc(db, "groups", code, "members", pseudo);
  const memberSnap = await getDoc(memberRef);

  if (!memberSnap.exists()) {
    await setDoc(memberRef, {
      pseudo: pseudo,
      points: 0,
      joinedAt: Date.now()
    });
  }

  return { code, name: groupSnap.data().name };
}

/* ---------- SAUVEGARDER UN PRONOSTIC ---------- */
async function savePrediction(matchId, predictionData) {
  const predId = `${currentUser.pseudo}_${matchId}`;
  const predRef = doc(db, "groups", currentGroup.code, "predictions", predId);

  await setDoc(predRef, {
    pseudo: currentUser.pseudo,
    matchId: matchId,
    ...predictionData,
    updatedAt: Date.now()
  });

  predictions[matchId] = predictionData;
}

/* ---------- CHARGER MES PRONOSTICS ---------- */
async function loadMyPredictions() {
  predictions = {};

  const predsRef = collection(db, "groups", currentGroup.code, "predictions");
  const q = query(predsRef, where("pseudo", "==", currentUser.pseudo));
  const snap = await getDocs(q);

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    predictions[data.matchId] = data;
  });
}

/* ---------- LISTENER RESULTATS DES MATCHS ---------- */
function listenToResults() {
  if (unsubscribeMatches) unsubscribeMatches();

  const resultsRef = collection(db, "groups", currentGroup.code, "results");

  unsubscribeMatches = onSnapshot(resultsRef, (snapshot) => {
    liveMatchesData = {};

    snapshot.forEach((docSnap) => {
      liveMatchesData[docSnap.id] = docSnap.data();
    });

    renderMatches();
    recalculateAndUpdateRanking();
  });
}

/* ---------- CALCUL & MAJ DU CLASSEMENT ---------- */
async function recalculateAndUpdateRanking() {
  const predsRef = collection(db, "groups", currentGroup.code, "predictions");
  const predsSnap = await getDocs(predsRef);

  const pointsByPseudo = {};

  predsSnap.forEach((docSnap) => {
    const pred = docSnap.data();
    const result = liveMatchesData[pred.matchId];

    if (!result) return;

    const calc = calculatePoints(pred, result.home, result.away);

    if (calc === null) return;

    if (!pointsByPseudo[pred.pseudo]) {
      pointsByPseudo[pred.pseudo] = 0;
    }

    pointsByPseudo[pred.pseudo] += calc.points;
  });

  const membersRef = collection(db, "groups", currentGroup.code, "members");
  const membersSnap = await getDocs(membersRef);

  for (const memberDoc of membersSnap.docs) {
    const member = memberDoc.data();
    const newPoints = pointsByPseudo[member.pseudo] || 0;

    if (member.points !== newPoints) {
      await updateDoc(doc(db, "groups", currentGroup.code, "members", member.pseudo), {
        points: newPoints
      });
    }
  }
}

/* ---------- LISTENER MEMBRES ---------- */
function listenToMembers() {
  if (unsubscribeMembers) unsubscribeMembers();

  const membersRef = collection(db, "groups", currentGroup.code, "members");

  unsubscribeMembers = onSnapshot(membersRef, (snapshot) => {
    groupMembers = [];

    snapshot.forEach((docSnap) => {
      groupMembers.push(docSnap.data());
    });

    groupMembers.sort((a, b) => (b.points || 0) - (a.points || 0));

    renderRanking();
  });
}

/* ============================================================
   RENDU - MATCHS
   ============================================================ */
function renderMatches() {
  const container = $("#matches-list");
  container.innerHTML = "";

  let lastStage = "";

  MATCHES.forEach((match) => {
    if (match.stage !== lastStage) {
      const stageTitle = document.createElement("div");
      stageTitle.className = "stage-title";
      stageTitle.textContent = match.stage;
      container.appendChild(stageTitle);
      lastStage = match.stage;
    }

    const started = isMatchStarted(match);
    const result = liveMatchesData[match.id];
    const hasResult =
      result &&
      result.home !== undefined &&
      result.home !== null &&
      result.away !== undefined &&
      result.away !== null;

    const myPred = predictions[match.id];

    const card = document.createElement("div");
    card.className = "match-card";

    if (started) card.classList.add("locked");
    if (myPred) card.classList.add("has-prediction");

    let statusHtml = "";

    if (hasResult) {
      statusHtml = `<span class="match-status status-finished">Terminé</span>`;
    } else if (started) {
      statusHtml = `<span class="match-status status-locked">En cours / Terminé</span>`;
    } else {
      statusHtml = `<span class="match-status status-open">Ouvert</span>`;
    }

    let bottomInfo = "";

    if (hasResult) {
      bottomInfo = `<span class="match-result-tag">Résultat : ${result.home} - ${result.away}</span>`;

      if (myPred) {
        const predText = formatPredictionText(myPred, match);
        bottomInfo += `<span class="match-prediction-tag">✓ ${predText}</span>`;

        const calc = calculatePoints(myPred, result.home, result.away);

        if (calc) {
          const cls =
            calc.points === 5
              ? "win-exact"
              : calc.points === 3
                ? "win-result"
                : "win-zero";

          bottomInfo += `<span class="match-points-tag ${cls}">+${calc.points} pts — ${calc.label}</span>`;
        }
      } else {
        bottomInfo += `<span class="match-prediction-tag" style="color:#9ca3af;">Aucun pronostic saisi</span>`;
      }
    } else if (myPred) {
      const predText = formatPredictionText(myPred, match);
      bottomInfo = `<span class="match-prediction-tag">✓ ${predText}</span>`;
    } else if (!started) {
      bottomInfo = `<span class="match-prediction-tag" style="color:#9ca3af;">Pas encore pronostiqué</span>`;
    } else {
      bottomInfo = `<span class="match-prediction-tag" style="color:#9ca3af;">Aucun pronostic saisi</span>`;
    }

    card.innerHTML = `
      <div class="match-teams">
        <div class="team home">
          <span class="team-flag">${match.homeFlag}</span>
          <span>${match.home}</span>
        </div>
        <span class="match-vs">VS</span>
        <div class="team away">
          <span>${match.away}</span>
          <span class="team-flag">${match.awayFlag}</span>
        </div>
      </div>

      <div class="match-meta">
        <span class="match-date">${formatDate(match.date)}</span>
        ${statusHtml}
        ${bottomInfo}
      </div>
    `;

    if (!started) {
      card.addEventListener("click", () => openPredictionModal(match));
    }

    container.appendChild(card);
  });
}

/* ============================================================
   RENDU - CLASSEMENT
   ============================================================ */
function renderRanking() {
  const container = $("#ranking-list");
  container.innerHTML = "";

  if (groupMembers.length === 0) {
    container.innerHTML = `
      <p style="text-align:center;color:var(--text-light);padding:20px;">
        Aucun membre pour le moment.
      </p>
    `;
    return;
  }

  groupMembers.forEach((member, index) => {
    const item = document.createElement("div");
    item.className = "ranking-item";

    if (member.pseudo === currentUser.pseudo) {
      item.classList.add("is-me");
    }

    let medal = "";

    if (index === 0) medal = "🥇";
    else if (index === 1) medal = "🥈";
    else if (index === 2) medal = "🥉";
    else medal = `${index + 1}`;

    item.innerHTML = `
      <div class="rank-position">${medal}</div>
      <div class="rank-name">
        ${member.pseudo}${member.pseudo === currentUser.pseudo ? " (toi)" : ""}
      </div>
      <div class="rank-points">
        ${member.points || 0} <small>pts</small>
      </div>
    `;

    container.appendChild(item);
  });
}

/* ============================================================
   MODAL PRONOSTIC
   ============================================================ */
let selectedMode = "result";
let selectedResult = null;

function openPredictionModal(match) {
  activeMatchForModal = match;
  selectedMode = "result";
  selectedResult = null;

  $("#modal-title").textContent = "Faire un pronostic";
  $("#modal-match-info").textContent = `${match.home} vs ${match.away} — ${formatDate(match.date)}`;

  $("#opt-home-label").textContent = `1 (${match.home})`;
  $("#opt-away-label").textContent = `2 (${match.away})`;
  $("#score-home-label").textContent = match.home;
  $("#score-away-label").textContent = match.away;

  $$(".mode-btn").forEach((button) => button.classList.remove("active"));
  $$(".result-opt").forEach((button) => button.classList.remove("selected"));

  $("#input-score-home").value = "";
  $("#input-score-away").value = "";
  $("#modal-error").textContent = "";

  const existing = predictions[match.id];

  if (existing) {
    if (existing.type === "score") {
      selectedMode = "score";
      $("#input-score-home").value = existing.home;
      $("#input-score-away").value = existing.away;
    } else {
      selectedMode = "result";
      selectedResult = existing.result;
    }
  }

  $$(".mode-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === selectedMode);
  });

  $$(".predict-mode").forEach((panel) => panel.classList.remove("active"));
  $(`#mode-${selectedMode}`).classList.add("active");

  if (selectedResult) {
    $$(".result-opt").forEach((button) => {
      if (button.dataset.val === selectedResult) {
        button.classList.add("selected");
      }
    });
  }

  $("#modal-overlay").classList.add("active");
}

function closeModal() {
  $("#modal-overlay").classList.remove("active");
  activeMatchForModal = null;
}

async function handleSavePrediction() {
  if (!activeMatchForModal) return;

  if (isMatchStarted(activeMatchForModal)) {
    $("#modal-error").textContent = "Ce match a déjà commencé, impossible de pronostiquer.";
    return;
  }

  let predictionData = null;

  if (selectedMode === "result") {
    if (!selectedResult) {
      $("#modal-error").textContent = "Choisis 1, Nul ou 2.";
      return;
    }

    predictionData = {
      type: "result",
      result: selectedResult
    };
  } else {
    const home = parseInt($("#input-score-home").value, 10);
    const away = parseInt($("#input-score-away").value, 10);

    if (Number.isNaN(home) || Number.isNaN(away) || home < 0 || away < 0) {
      $("#modal-error").textContent = "Entre un score valide pour les deux équipes.";
      return;
    }

    predictionData = {
      type: "score",
      home,
      away
    };
  }

  try {
    await savePrediction(activeMatchForModal.id, predictionData);
    showToast("Pronostic enregistré !", "success");
    closeModal();
    renderMatches();
  } catch (e) {
    console.error(e);
    $("#modal-error").textContent = "Erreur lors de l'enregistrement.";
  }
}

/* ============================================================
   NAVIGATION ENTRE ECRANS
   ============================================================ */
function showScreen(screenId) {
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  $(`#${screenId}`).classList.add("active");
}

function switchTab(tabName) {
  $$(".tab-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  $$(".tab-content").forEach((content) => content.classList.remove("active"));
  $(`#tab-${tabName}`).classList.add("active");
}

/* ============================================================
   PERSISTENCE LOCALE
   ============================================================ */
function saveSession() {
  localStorage.setItem("wc2026_pseudo", currentUser.pseudo);

  if (currentGroup) {
    localStorage.setItem("wc2026_group_code", currentGroup.code);
    localStorage.setItem("wc2026_group_name", currentGroup.name);
  }
}

function clearSession() {
  localStorage.removeItem("wc2026_pseudo");
  localStorage.removeItem("wc2026_group_code");
  localStorage.removeItem("wc2026_group_name");
}

function loadSession() {
  const pseudo = localStorage.getItem("wc2026_pseudo");
  const groupCode = localStorage.getItem("wc2026_group_code");
  const groupName = localStorage.getItem("wc2026_group_name");

  if (pseudo) {
    currentUser = { pseudo };

    if (groupCode && groupName) {
      currentGroup = {
        code: groupCode,
        name: groupName
      };

      return "main";
    }

    return "group";
  }

  return "login";
}

/* ============================================================
   ENTREE DANS LE GROUPE
   ============================================================ */
async function enterGroup() {
  $("#current-pseudo").textContent = currentUser.pseudo;
  $("#current-group-name").textContent = currentGroup.name;
  $("#current-group-code").textContent = currentGroup.code;

  showScreen("screen-main");
  switchTab("matches");

  await loadMyPredictions();
  renderMatches();
  listenToResults();
  listenToMembers();
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function setupEventListeners() {
  $("#btn-login").addEventListener("click", () => {
    const pseudo = sanitizePseudo($("#input-pseudo").value);

    if (!pseudo) {
      $("#login-error").textContent = "Merci d'entrer un pseudo.";
      return;
    }

    currentUser = { pseudo };
    $("#welcome-pseudo").textContent = pseudo;

    saveSession();
    showScreen("screen-group");
  });

  $("#input-pseudo").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      $("#btn-login").click();
    }
  });

  $("#btn-logout-1").addEventListener("click", () => {
    currentUser = null;
    clearSession();
    $("#input-pseudo").value = "";
    showScreen("screen-login");
  });

  $("#btn-logout-2").addEventListener("click", () => {
    if (unsubscribeMembers) unsubscribeMembers();
    if (unsubscribeMatches) unsubscribeMatches();

    currentUser = null;
    currentGroup = null;
    predictions = {};

    clearSession();
    $("#input-pseudo").value = "";

    showScreen("screen-login");
  });

  $("#btn-create-group").addEventListener("click", async () => {
    const groupName = $("#input-group-name").value.trim();

    if (!groupName) {
      $("#group-error").textContent = "Entre un nom de groupe.";
      return;
    }

    $("#btn-create-group").disabled = true;
    $("#group-error").textContent = "";

    try {
      currentGroup = await createGroup(groupName, currentUser.pseudo);
      saveSession();
      showToast(`Groupe créé ! Code : ${currentGroup.code}`, "success");
      await enterGroup();
    } catch (e) {
      console.error(e);
      $("#group-error").textContent = "Erreur lors de la création du groupe.";
    } finally {
      $("#btn-create-group").disabled = false;
    }
  });

  $("#btn-join-group").addEventListener("click", async () => {
    const code = $("#input-join-code").value.trim();

    if (!code) {
      $("#group-error").textContent = "Entre un code d'invitation.";
      return;
    }

    $("#btn-join-group").disabled = true;
    $("#group-error").textContent = "";

    try {
      currentGroup = await joinGroup(code, currentUser.pseudo);
      saveSession();
      showToast(`Tu as rejoint "${currentGroup.name}" !`, "success");
      await enterGroup();
    } catch (e) {
      $("#group-error").textContent = e.message || "Erreur lors de la connexion au groupe.";
    } finally {
      $("#btn-join-group").disabled = false;
    }
  });

  $$(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $$(".mode-btn").forEach((button) => {
    button.addEventListener("click", () => {
      selectedMode = button.dataset.mode;

      $$(".mode-btn").forEach((btn) => {
        btn.classList.toggle("active", btn === button);
      });

      $$(".predict-mode").forEach((panel) => panel.classList.remove("active"));
      $(`#mode-${selectedMode}`).classList.add("active");

      $("#modal-error").textContent = "";
    });
  });

  $$(".result-opt").forEach((button) => {
    button.addEventListener("click", () => {
      selectedResult = button.dataset.val;

      $$(".result-opt").forEach((btn) => {
        btn.classList.toggle("selected", btn === button);
      });

      $("#modal-error").textContent = "";
    });
  });

  $("#modal-close").addEventListener("click", closeModal);

  $("#modal-overlay").addEventListener("click", (e) => {
    if (e.target === $("#modal-overlay")) {
      closeModal();
    }
  });

  $("#btn-save-prediction").addEventListener("click", handleSavePrediction);
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  setupEventListeners();

  await loadMatches();

  const screen = loadSession();

  if (screen === "main") {
    $("#current-pseudo").textContent = currentUser.pseudo;
    await enterGroup();
  } else if (screen === "group") {
    $("#welcome-pseudo").textContent = currentUser.pseudo;
    showScreen("screen-group");
  } else {
    showScreen("screen-login");
  }
}

init();
