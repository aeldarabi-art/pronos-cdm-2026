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

import {
  calculatePredictionPoints,
  formatPointsScale,
  getMatchPointsScale,

  getWinnerChallengeTeams,
  getWinnerChallengePoints,
  isWinnerChallengeOpen,
  formatWinnerChallengeDeadline,
  calculateWinnerChallengePoints,

  getWorldCupGroups,
  getGroupLetters,
  getTeamsByGroup,
  isGroupStandingsChallengeOpen,
  formatGroupStandingsDeadline,
  isValidGroupStanding,
  calculateAllGroupStandingsPoints,
  getGroupStandingMaxPointsPerGroup,
  getGroupStandingMaxTotalPoints
} from "./probabilities.js";

/* ============================================================
   ETAT GLOBAL
   ============================================================ */

let MATCHES = [];
let currentUser = null;
let currentGroup = null;

let predictions = {};
let groupMembers = [];
let liveMatchesData = {};

let winnerPrediction = null;
let winnerChallengeResult = null;

let groupStandingsPrediction = null;
let groupStandingsResult = null;

let unsubscribeMembers = null;
let unsubscribeMatches = null;
let activeMatchForModal = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ============================================================
   UTILITAIRES
   ============================================================ */

function showToast(message, type = "") {
  const toast = $("#toast");

  if (!toast) return;

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

function calculatePoints(prediction, realHome, realAway, match) {
  return calculatePredictionPoints(prediction, realHome, realAway, match);
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
  } catch (error) {
    console.error("Erreur chargement matches.json", error);
    showToast("Erreur de chargement des matchs", "error");
  }
}

/* ============================================================
   FIRESTORE - GROUPES
   ============================================================ */

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
    code,
    createdBy: pseudo,
    createdAt: Date.now()
  });

  await setDoc(doc(db, "groups", code, "members", pseudo), {
    pseudo,
    points: 0,
    joinedAt: Date.now()
  });

  return { code, name: groupName };
}

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
      pseudo,
      points: 0,
      joinedAt: Date.now()
    });
  }

  return { code, name: groupSnap.data().name };
}

/* ============================================================
   PRONOSTICS MATCHS
   ============================================================ */

async function savePrediction(matchId, predictionData) {
  const predId = `${currentUser.pseudo}_${matchId}`;
  const predRef = doc(db, "groups", currentGroup.code, "predictions", predId);

  await setDoc(predRef, {
    pseudo: currentUser.pseudo,
    matchId,
    ...predictionData,
    updatedAt: Date.now()
  });

  predictions[matchId] = predictionData;
}

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

/* ============================================================
   CHALLENGE CHAMPION DU MONDE
   ============================================================ */

async function loadMyWinnerPrediction() {
  winnerPrediction = null;

  if (!currentGroup || !currentUser) return;

  const winnerRef = doc(
    db,
    "groups",
    currentGroup.code,
    "winnerPredictions",
    currentUser.pseudo
  );

  const winnerSnap = await getDoc(winnerRef);

  if (winnerSnap.exists()) {
    winnerPrediction = winnerSnap.data();
  }
}

async function loadWinnerChallengeResult() {
  winnerChallengeResult = null;

  if (!currentGroup) return;

  const resultRef = doc(
    db,
    "groups",
    currentGroup.code,
    "challengeResults",
    "winner"
  );

  const resultSnap = await getDoc(resultRef);

  if (resultSnap.exists()) {
    winnerChallengeResult = resultSnap.data();
  }
}

async function saveWinnerPrediction(team) {
  if (!currentGroup || !currentUser) return;

  const pointsIfCorrect = getWinnerChallengePoints(team);

  await setDoc(
    doc(db, "groups", currentGroup.code, "winnerPredictions", currentUser.pseudo),
    {
      pseudo: currentUser.pseudo,
      team,
      pointsIfCorrect,
      updatedAt: Date.now()
    }
  );

  winnerPrediction = {
    pseudo: currentUser.pseudo,
    team,
    pointsIfCorrect,
    updatedAt: Date.now()
  };
}

function renderWinnerChallenge() {
  const deadlineLabel = $("#winner-deadline-label");
  const select = $("#select-winner-team");
  const preview = $("#winner-points-preview");
  const currentChoice = $("#winner-current-choice");
  const form = $("#winner-form");
  const lockedMessage = $("#winner-locked-message");
  const error = $("#winner-error");

  if (!select || !form) return;

  if (deadlineLabel) {
    deadlineLabel.textContent = formatWinnerChallengeDeadline();
  }

  if (error) {
    error.textContent = "";
  }

  const isOpen = isWinnerChallengeOpen();
  const teams = getWinnerChallengeTeams();

  select.innerHTML = `<option value="">Choisir une équipe</option>`;

  teams.forEach((item) => {
    const selected =
      winnerPrediction && winnerPrediction.team === item.team ? "selected" : "";

    select.innerHTML += `
      <option value="${item.team}" ${selected}>
        ${item.team} — ${item.points} pts
      </option>
    `;
  });

  if (winnerPrediction) {
    currentChoice.style.display = "block";

    let resultText = "";

    if (winnerChallengeResult && winnerChallengeResult.team) {
      const calc = calculateWinnerChallengePoints(
        winnerPrediction.team,
        winnerChallengeResult.team
      );

      resultText = `
        <br>
        Champion réel : <strong>${winnerChallengeResult.team}</strong>
        <br>
        Résultat du challenge : <strong>${calc.points} pts</strong> — ${calc.label}
      `;
    }

    currentChoice.innerHTML = `
      Ton choix actuel :
      <strong>${winnerPrediction.team}</strong>
      —
      <strong>${winnerPrediction.pointsIfCorrect} pts</strong> si champion.
      ${resultText}
    `;
  } else {
    currentChoice.style.display = "none";
    currentChoice.innerHTML = "";
  }

  const selectedTeam = select.value;

  if (selectedTeam) {
    const points = getWinnerChallengePoints(selectedTeam);

    preview.style.display = "block";
    preview.innerHTML = `
      Si <strong>${selectedTeam}</strong> remporte la Coupe du Monde,
      tu gagnes <strong>${points} pts</strong>.
    `;
  } else {
    preview.style.display = "none";
    preview.innerHTML = "";
  }

  if (!isOpen) {
    select.disabled = true;
    $("#btn-save-winner").disabled = true;
    lockedMessage.style.display = "block";
  } else {
    select.disabled = false;
    $("#btn-save-winner").disabled = false;
    lockedMessage.style.display = "none";
  }
}

async function handleSaveWinnerPrediction() {
  const error = $("#winner-error");
  const select = $("#select-winner-team");
  const button = $("#btn-save-winner");

  if (!select) return;

  if (!isWinnerChallengeOpen()) {
    error.textContent = "Le challenge Champion est verrouillé.";
    return;
  }

  const team = select.value;

  if (!team) {
    error.textContent = "Choisis une équipe championne.";
    return;
  }

  button.disabled = true;
  button.textContent = "Enregistrement...";

  try {
    await saveWinnerPrediction(team);
    renderWinnerChallenge();
    showToast("Choix Champion enregistré !", "success");
  } catch (errorObject) {
    console.error(errorObject);
    error.textContent = "Erreur lors de l’enregistrement du champion.";
  } finally {
    button.disabled = false;
    button.textContent = "Valider mon champion";
  }
}

/* ============================================================
   CHALLENGE CLASSEMENT DES GROUPES
   ============================================================ */

async function loadMyGroupStandingsPrediction() {
  groupStandingsPrediction = null;

  if (!currentGroup || !currentUser) return;

  const predictionRef = doc(
    db,
    "groups",
    currentGroup.code,
    "groupPredictions",
    currentUser.pseudo
  );

  const predictionSnap = await getDoc(predictionRef);

  if (predictionSnap.exists()) {
    groupStandingsPrediction = predictionSnap.data();
  }
}

async function loadGroupStandingsResult() {
  groupStandingsResult = null;

  if (!currentGroup) return;

  const resultRef = doc(
    db,
    "groups",
    currentGroup.code,
    "challengeResults",
    "groupStandings"
  );

  const resultSnap = await getDoc(resultRef);

  if (resultSnap.exists()) {
    groupStandingsResult = resultSnap.data();
  }
}

async function saveGroupStandingsPrediction(groupsData) {
  if (!currentGroup || !currentUser) return;

  await setDoc(
    doc(db, "groups", currentGroup.code, "groupPredictions", currentUser.pseudo),
    {
      pseudo: currentUser.pseudo,
      groups: groupsData,
      updatedAt: Date.now()
    }
  );

  groupStandingsPrediction = {
    pseudo: currentUser.pseudo,
    groups: groupsData,
    updatedAt: Date.now()
  };
}

function getSelectedGroupStanding(groupLetter) {
  const teams = [];

  for (let rank = 1; rank <= 4; rank++) {
    const select = document.querySelector(
      `.group-standing-select[data-group="${groupLetter}"][data-rank="${rank}"]`
    );

    if (!select || !select.value) {
      return null;
    }

    teams.push(select.value);
  }

  return teams;
}

function getAllSelectedGroupStandings() {
  const result = {};

  for (const groupLetter of getGroupLetters()) {
    const standing = getSelectedGroupStanding(groupLetter);

    if (!standing) {
      throw new Error(`Classement incomplet pour le groupe ${groupLetter}`);
    }

    if (!isValidGroupStanding(groupLetter, standing)) {
      throw new Error(`Classement invalide pour le groupe ${groupLetter}`);
    }

    result[groupLetter] = standing;
  }

  return result;
}

function renderGroupStandingCard(groupLetter) {
  const teams = getTeamsByGroup(groupLetter);
  const existingStanding =
    groupStandingsPrediction &&
    groupStandingsPrediction.groups &&
    groupStandingsPrediction.groups[groupLetter]
      ? groupStandingsPrediction.groups[groupLetter]
      : [];

  let rowsHtml = "";

  for (let rank = 1; rank <= teams.length; rank++) {
    const selectedTeam = existingStanding[rank - 1] || "";

    let optionsHtml = `<option value="">Choisir</option>`;

    teams.forEach((team) => {
      const selected = selectedTeam === team ? "selected" : "";

      optionsHtml += `
        <option value="${team}" ${selected}>${team}</option>
      `;
    });

    rowsHtml += `
      <div class="group-standing-row">
        <span class="group-standing-rank">${rank}</span>
        <select
          class="group-standing-select"
          data-group="${groupLetter}"
          data-rank="${rank}"
        >
          ${optionsHtml}
        </select>
      </div>
    `;
  }

  return `
    <div class="group-standing-card">
      <h3>Groupe ${groupLetter}</h3>

      <div class="group-standing-teams">
        ${teams.join(" · ")}
      </div>

      <div class="group-standing-rows">
        ${rowsHtml}
      </div>
    </div>
  `;
}

function renderGroupStandingsChallenge() {
  const deadlineLabel = $("#groups-deadline-label");
  const container = $("#groups-prediction-list");
  const currentChoice = $("#groups-current-choice");
  const form = $("#groups-form");
  const lockedMessage = $("#groups-locked-message");
  const error = $("#groups-error");

  if (!container || !form) return;

  if (deadlineLabel) {
    deadlineLabel.textContent = formatGroupStandingsDeadline();
  }

  if (error) {
    error.textContent = "";
  }

  const isOpen = isGroupStandingsChallengeOpen();

  let html = "";

  getGroupLetters().forEach((groupLetter) => {
    html += renderGroupStandingCard(groupLetter);
  });

  container.innerHTML = html;

  const selects = document.querySelectorAll(".group-standing-select");

  selects.forEach((select) => {
    select.addEventListener("change", () => {
      validateGroupStandingDuplicates(select.dataset.group);
    });
  });

  if (groupStandingsPrediction && groupStandingsPrediction.groups) {
    currentChoice.style.display = "block";

    let resultText = "";

    if (groupStandingsResult && groupStandingsResult.groups) {
      const calc = calculateAllGroupStandingsPoints(
        groupStandingsPrediction.groups,
        groupStandingsResult.groups
      );

      resultText = `
        <br>
        Résultat actuel du challenge :
        <strong>${calc.points} pts</strong>
        sur ${getGroupStandingMaxTotalPoints()} pts.
      `;
    }

    currentChoice.innerHTML = `
      Tes classements de groupes sont déjà enregistrés.
      <br>
      Maximum possible : <strong>${getGroupStandingMaxTotalPoints()} pts</strong>.
      ${resultText}
    `;
  } else {
    currentChoice.style.display = "none";
    currentChoice.innerHTML = "";
  }

  if (!isOpen) {
    selects.forEach((select) => {
      select.disabled = true;
    });

    $("#btn-save-groups").disabled = true;
    lockedMessage.style.display = "block";
  } else {
    selects.forEach((select) => {
      select.disabled = false;
    });

    $("#btn-save-groups").disabled = false;
    lockedMessage.style.display = "none";
  }
}

function validateGroupStandingDuplicates(groupLetter) {
  const selects = document.querySelectorAll(
    `.group-standing-select[data-group="${groupLetter}"]`
  );

  const selectedValues = [];

  selects.forEach((select) => {
    select.classList.remove("input-error");

    if (select.value) {
      selectedValues.push(select.value);
    }
  });

  selects.forEach((select) => {
    if (
      select.value &&
      selectedValues.filter((value) => value === select.value).length > 1
    ) {
      select.classList.add("input-error");
    }
  });
}

async function handleSaveGroupStandingsPrediction() {
  const error = $("#groups-error");
  const button = $("#btn-save-groups");

  if (!isGroupStandingsChallengeOpen()) {
    error.textContent = "Le challenge Classement des groupes est verrouillé.";
    return;
  }

  let groupsData = null;

  try {
    groupsData = getAllSelectedGroupStandings();
  } catch (err) {
    error.textContent = err.message || "Vérifie les classements saisis.";
    return;
  }

  button.disabled = true;
  button.textContent = "Enregistrement...";

  try {
    await saveGroupStandingsPrediction(groupsData);
    renderGroupStandingsChallenge();
    showToast("Classements de groupes enregistrés !", "success");
  } catch (errorObject) {
    console.error(errorObject);
    error.textContent = "Erreur lors de l’enregistrement des classements.";
  } finally {
    button.disabled = false;
    button.textContent = "Valider mes classements de groupes";
  }
}

/* ============================================================
   CALCUL & MAJ DU CLASSEMENT
   ============================================================ */

async function recalculateAndUpdateRanking() {
  if (!currentGroup) return;

  const pointsByPseudo = {};

  /* ---------- Points des matchs ---------- */

  const predsRef = collection(db, "groups", currentGroup.code, "predictions");
  const predsSnap = await getDocs(predsRef);

  predsSnap.forEach((docSnap) => {
    const pred = docSnap.data();
    const result = liveMatchesData[pred.matchId];

    if (!result) return;

    const match = MATCHES.find((m) => m.id === pred.matchId);

    if (!match) return;

    const calc = calculatePoints(pred, result.home, result.away, match);

    if (calc === null) return;

    if (!pointsByPseudo[pred.pseudo]) {
      pointsByPseudo[pred.pseudo] = 0;
    }

    pointsByPseudo[pred.pseudo] += calc.points;
  });

  /* ---------- Points du challenge Champion ---------- */

  await loadWinnerChallengeResult();

  if (winnerChallengeResult && winnerChallengeResult.team) {
    const winnerPredsRef = collection(
      db,
      "groups",
      currentGroup.code,
      "winnerPredictions"
    );

    const winnerPredsSnap = await getDocs(winnerPredsRef);

    winnerPredsSnap.forEach((docSnap) => {
      const prediction = docSnap.data();

      const calc = calculateWinnerChallengePoints(
        prediction.team,
        winnerChallengeResult.team
      );

      if (!calc) return;

      if (!pointsByPseudo[prediction.pseudo]) {
        pointsByPseudo[prediction.pseudo] = 0;
      }

      pointsByPseudo[prediction.pseudo] += calc.points;
    });
  }

  /* ---------- Points du challenge Classement des groupes ---------- */

  await loadGroupStandingsResult();

  if (groupStandingsResult && groupStandingsResult.groups) {
    const groupPredsRef = collection(
      db,
      "groups",
      currentGroup.code,
      "groupPredictions"
    );

    const groupPredsSnap = await getDocs(groupPredsRef);

    groupPredsSnap.forEach((docSnap) => {
      const prediction = docSnap.data();

      if (!prediction.groups) return;

      const calc = calculateAllGroupStandingsPoints(
        prediction.groups,
        groupStandingsResult.groups
      );

      if (!pointsByPseudo[prediction.pseudo]) {
        pointsByPseudo[prediction.pseudo] = 0;
      }

      pointsByPseudo[prediction.pseudo] += calc.points;
    });
  }

  /* ---------- Mise à jour des membres ---------- */

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

  if (!container) return;

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

    const scale = getMatchPointsScale(match);

    const pointsScaleHtml = `
      <div class="match-scale-box">
        <div class="match-scale-title">Barème</div>

        <div class="match-scale-line">
          <span>${scale["1"].label}</span>
          <strong>${scale["1"].points} pts</strong>
        </div>

        <div class="match-scale-line">
          <span>Nul</span>
          <strong>${scale["N"].points} pts</strong>
        </div>

        <div class="match-scale-line">
          <span>${scale["2"].label}</span>
          <strong>${scale["2"].points} pts</strong>
        </div>

        <div class="match-scale-note">
          ${
            scale["1"].scoringMode === "legacy"
              ? "Score exact : 5 pts"
              : "Score exact : +3 pts"
          }
        </div>
      </div>
    `;

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

        const calc = calculatePoints(myPred, result.home, result.away, match);

        if (calc) {
          const cls =
            calc.points === 0
              ? "win-zero"
              : calc.exactBonus > 0 || calc.label === "Score exact"
                ? "win-exact"
                : "win-result";

          let detail = "";

          if (calc.points > 0) {
            if (calc.scoringMode === "legacy") {
              detail = ` — ${calc.label}`;
            } else {
              detail = ` — ${calc.label} : ${calc.basePoints} pts`;

              if (calc.exactBonus > 0) {
                detail += ` + ${calc.exactBonus} bonus`;
              }
            }
          } else {
            detail = ` — ${calc.label}`;
          }

          bottomInfo += `<span class="match-points-tag ${cls}">+${calc.points} pts${detail}</span>`;
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

      ${pointsScaleHtml}

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

  if (!container) return;

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
   MODAL PRONOSTIC MATCH
   ============================================================ */

let selectedMode = "result";
let selectedResult = null;

function openPredictionModal(match) {
  activeMatchForModal = match;
  selectedMode = "result";
  selectedResult = null;

  const scale = getMatchPointsScale(match);

  $("#modal-title").textContent = "Faire un pronostic";

  $("#modal-match-info").innerHTML = `
    ${match.home} vs ${match.away} — ${formatDate(match.date)}
    <br>
    <span style="font-size:12px;color:#64748b;">
      Barème : ${formatPointsScale(match)} • ${
        scale["1"].scoringMode === "legacy"
          ? "Score exact : 5 pts"
          : "Score exact : +3 pts"
      }
    </span>
  `;

  $("#opt-home-label").textContent = `1 (${match.home}) — ${scale["1"].points} pts`;
  $("#opt-away-label").textContent = `2 (${match.away}) — ${scale["2"].points} pts`;

  const optDrawLabel = document.querySelector("#mode-result .result-opt[data-val='N'] span:last-child");

  if (optDrawLabel) {
    optDrawLabel.textContent = `Nul — ${scale["N"].points} pts`;
  }

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
  } catch (error) {
    console.error(error);
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

  if (tabName === "winner") {
    renderWinnerChallenge();
  }

  if (tabName === "groups") {
    renderGroupStandingsChallenge();
  }
}

/* ============================================================
   SESSION LOCALE
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
  await loadMyWinnerPrediction();
  await loadWinnerChallengeResult();
  await loadMyGroupStandingsPrediction();
  await loadGroupStandingsResult();

  renderMatches();
  renderWinnerChallenge();
  renderGroupStandingsChallenge();

  listenToResults();
  listenToMembers();

  await recalculateAndUpdateRanking();
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
    winnerPrediction = null;
    winnerChallengeResult = null;
    groupStandingsPrediction = null;
    groupStandingsResult = null;

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
    } catch (error) {
      console.error(error);
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
    } catch (error) {
      $("#group-error").textContent = error.message || "Erreur lors de la connexion au groupe.";
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

  const winnerSelect = $("#select-winner-team");

  if (winnerSelect) {
    winnerSelect.addEventListener("change", renderWinnerChallenge);
  }

  const winnerButton = $("#btn-save-winner");

  if (winnerButton) {
    winnerButton.addEventListener("click", handleSaveWinnerPrediction);
  }

  const groupsButton = $("#btn-save-groups");

  if (groupsButton) {
    groupsButton.addEventListener("click", handleSaveGroupStandingsPrediction);
  }
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
