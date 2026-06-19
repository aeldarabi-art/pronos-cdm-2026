// probabilities.js
// Base interne de calcul des probabilités et des points
// Note équipe : échelle interne élargie de 1050 à 1950
// Barème matchs :
// - Avant le 20 juin 2026 : ancien barème 5 / 3 / 0
// - À partir du 20 juin 2026 : bon résultat 2 à 10 pts + bonus score exact +3 pts
//
// Challenge Champion du Monde :
// - Choix verrouillé le 23 juin 2026 à 23h59 heure Maroc
// - Barème de 20 à 80 pts selon la difficulté du choix
//
// Challenge Classements groupes :
// - Choix verrouillé le 23 juin 2026 à 23h59 heure Maroc
// - 1 pt par équipe placée exactement au bon rang
// - 4 pts maximum par groupe
// - 48 pts maximum sur les 12 groupes
//
// Les probabilités restent internes et ne doivent pas être affichées aux utilisateurs.

/* ============================================================
   1. NOTES DE FORCE INTERNES DES ÉQUIPES
   ============================================================ */

export const TEAM_RATINGS = {
  "Argentine": 1950,
  "France": 1940,
  "Espagne": 1925,
  "Angleterre": 1910,
  "Portugal": 1885,
  "Brésil": 1875,
  "Maroc": 1820,
  "Pays-Bas": 1805,
  "Belgique": 1785,
  "Allemagne": 1780,

  "Croatie": 1735,
  "Colombie": 1725,
  "Mexique": 1715,
  "Sénégal": 1705,
  "Uruguay": 1695,
  "États-Unis": 1685,
  "Japon": 1675,
  "Suisse": 1665,
  "Suède": 1655,
  "Côte d'Ivoire": 1630,

  "Iran": 1615,
  "Turquie": 1600,
  "Équateur": 1585,
  "Autriche": 1575,
  "Corée du Sud": 1565,
  "Norvège": 1555,
  "Australie": 1540,
  "Algérie": 1530,
  "Égypte": 1520,
  "Canada": 1515,

  "Ghana": 1505,
  "Écosse": 1495,
  "Paraguay": 1485,
  "Tchéquie": 1475,
  "Bosnie-Herzégovine": 1460,
  "Cap-Vert": 1445,
  "Arabie Saoudite": 1435,
  "RD Congo": 1425,
  "Tunisie": 1410,
  "Ouzbékistan": 1395,

  "Nouvelle-Zélande": 1375,
  "Afrique du Sud": 1355,
  "Panama": 1335,
  "Qatar": 1305,
  "Irak": 1285,
  "Jordanie": 1265,
  "Curaçao": 1160,
  "Haïti": 1050
};

const DEFAULT_RATING = 1500;

/* ============================================================
   2. GROUPES COUPE DU MONDE 2026
   ============================================================ */

export const WORLD_CUP_GROUPS = {
  A: ["Mexique", "Afrique du Sud", "Corée du Sud", "Tchéquie"],
  B: ["Canada", "Bosnie-Herzégovine", "Qatar", "Suisse"],
  C: ["Brésil", "Maroc", "Haïti", "Écosse"],
  D: ["États-Unis", "Paraguay", "Australie", "Turquie"],
  E: ["Allemagne", "Curaçao", "Côte d'Ivoire", "Équateur"],
  F: ["Pays-Bas", "Japon", "Suède", "Tunisie"],
  G: ["Belgique", "Égypte", "Iran", "Nouvelle-Zélande"],
  H: ["Espagne", "Cap-Vert", "Arabie Saoudite", "Uruguay"],
  I: ["France", "Sénégal", "Irak", "Norvège"],
  J: ["Argentine", "Algérie", "Autriche", "Jordanie"],
  K: ["Portugal", "RD Congo", "Ouzbékistan", "Colombie"],
  L: ["Angleterre", "Croatie", "Ghana", "Panama"]
};

export function getWorldCupGroups() {
  return WORLD_CUP_GROUPS;
}

export function getGroupLetters() {
  return Object.keys(WORLD_CUP_GROUPS);
}

export function getTeamsByGroup(groupLetter) {
  return WORLD_CUP_GROUPS[groupLetter] || [];
}

/* ============================================================
   3. DATE DE BASCULE DU NOUVEAU BARÈME DES MATCHS
   ============================================================ */

// Matchs avant le 20 juin 2026 : ancien barème.
// Matchs à partir du 20 juin 2026 : nouveau barème dynamique.
const NEW_SCORING_START_DATE = "2026-06-20";

function isNewScoringApplicable(match) {
  if (!match || !match.date) return false;

  const matchDate = String(match.date).slice(0, 10);

  return matchDate >= NEW_SCORING_START_DATE;
}

/* ============================================================
   4. CHALLENGE CHAMPION DU MONDE
   ============================================================ */

// Deadline : 23 juin 2026 à 23h59, heure Maroc.
export const WINNER_CHALLENGE_DEADLINE = "2026-06-23T23:59:59+01:00";

export const WINNER_CHALLENGE_POINTS = {
  // Très grands favoris — 20 pts
  "Argentine": 20,
  "France": 20,
  "Espagne": 20,

  // Favoris — 25 pts
  "Angleterre": 25,
  "Brésil": 25,
  "Portugal": 25,
  "Allemagne": 25,

  // Outsiders sérieux — 30 pts
  "Pays-Bas": 30,
  "Belgique": 30,
  "Uruguay": 30,
  "Colombie": 30,
  "Croatie": 30,

  // Outsiders forts — 35 pts
  "Maroc": 35,
  "Mexique": 35,
  "Sénégal": 35,
  "États-Unis": 35,
  "Japon": 35,
  "Suisse": 35,
  "Suède": 35,

  // Surprises crédibles — 45 pts
  "Côte d'Ivoire": 45,
  "Iran": 45,
  "Turquie": 45,
  "Équateur": 45,
  "Autriche": 45,
  "Corée du Sud": 45,
  "Norvège": 45,
  "Australie": 45,
  "Algérie": 45,
  "Égypte": 45,
  "Canada": 45,
  "Ghana": 45,
  "Écosse": 45,

  // Grosses surprises — 60 pts
  "Paraguay": 60,
  "Tchéquie": 60,
  "Bosnie-Herzégovine": 60,
  "Cap-Vert": 60,
  "Arabie Saoudite": 60,
  "RD Congo": 60,
  "Tunisie": 60,
  "Ouzbékistan": 60,

  // Très gros exploits — 70 pts
  "Nouvelle-Zélande": 70,
  "Afrique du Sud": 70,
  "Panama": 70,
  "Qatar": 70,

  // Énormes exploits — 80 pts
  "Irak": 80,
  "Jordanie": 80,
  "Curaçao": 80,
  "Haïti": 80
};

export function isWinnerChallengeOpen() {
  return new Date() <= new Date(WINNER_CHALLENGE_DEADLINE);
}

export function getWinnerChallengePoints(teamName) {
  return WINNER_CHALLENGE_POINTS[teamName] || 80;
}

export function getWinnerChallengeTeams() {
  return Object.entries(WINNER_CHALLENGE_POINTS)
    .map(([team, points]) => ({
      team,
      points,
      rating: getTeamRating(team)
    }))
    .sort((a, b) => {
      if (a.points !== b.points) return a.points - b.points;
      return b.rating - a.rating;
    });
}

export function calculateWinnerChallengePoints(predictedTeam, realChampionTeam) {
  if (!predictedTeam || !realChampionTeam) {
    return null;
  }

  if (predictedTeam !== realChampionTeam) {
    return {
      points: 0,
      label: "Champion incorrect",
      expectedPoints: getWinnerChallengePoints(predictedTeam)
    };
  }

  const points = getWinnerChallengePoints(predictedTeam);

  return {
    points,
    label: "Champion trouvé",
    expectedPoints: points
  };
}

export function formatWinnerChallengeDeadline() {
  return "23 juin 2026 à 23h59";
}

/* ============================================================
   5. CHALLENGE CLASSEMENTS GROUPES
   ============================================================ */

// Même deadline que le challenge Champion.
export const GROUP_STANDINGS_DEADLINE = "2026-06-23T23:59:59+01:00";

// Nouveau barème équilibré : 1 point par position exacte.
export const GROUP_STANDING_POINTS_PER_EXACT_POSITION = 1;

export function isGroupStandingsChallengeOpen() {
  return new Date() <= new Date(GROUP_STANDINGS_DEADLINE);
}

export function formatGroupStandingsDeadline() {
  return "23 juin 2026 à 23h59";
}

export function getGroupStandingMaxPointsPerGroup() {
  return 4 * GROUP_STANDING_POINTS_PER_EXACT_POSITION;
}

export function getGroupStandingMaxTotalPoints() {
  return getGroupLetters().length * getGroupStandingMaxPointsPerGroup();
}

export function isValidGroupStanding(groupLetter, standing) {
  const teams = getTeamsByGroup(groupLetter);

  if (!Array.isArray(standing)) return false;
  if (standing.length !== teams.length) return false;

  const uniqueTeams = new Set(standing);

  if (uniqueTeams.size !== teams.length) return false;

  return standing.every((team) => teams.includes(team));
}

export function calculateSingleGroupStandingPoints(predictedStanding, realStanding) {
  const maxPoints = 4 * GROUP_STANDING_POINTS_PER_EXACT_POSITION;

  if (!Array.isArray(predictedStanding) || !Array.isArray(realStanding)) {
    return {
      points: 0,
      exactPositions: 0,
      maxPoints
    };
  }

  let exactPositions = 0;

  for (let i = 0; i < realStanding.length; i++) {
    if (predictedStanding[i] === realStanding[i]) {
      exactPositions++;
    }
  }

  const points = exactPositions * GROUP_STANDING_POINTS_PER_EXACT_POSITION;

  return {
    points,
    exactPositions,
    maxPoints: realStanding.length * GROUP_STANDING_POINTS_PER_EXACT_POSITION
  };
}

export function calculateAllGroupStandingsPoints(predictedGroups, realGroups) {
  if (!predictedGroups || !realGroups) {
    return {
      points: 0,
      details: {}
    };
  }

  let totalPoints = 0;
  const details = {};

  getGroupLetters().forEach((groupLetter) => {
    const predictedStanding = predictedGroups[groupLetter];
    const realStanding = realGroups[groupLetter];

    if (!predictedStanding || !realStanding) {
      details[groupLetter] = {
        points: 0,
        exactPositions: 0,
        maxPoints: getGroupStandingMaxPointsPerGroup()
      };

      return;
    }

    const calculation = calculateSingleGroupStandingPoints(
      predictedStanding,
      realStanding
    );

    totalPoints += calculation.points;

    details[groupLetter] = calculation;
  });

  return {
    points: totalPoints,
    details
  };
}

/* ============================================================
   6. UTILITAIRES
   ============================================================ */

export function getTeamRating(teamName) {
  return TEAM_RATINGS[teamName] || DEFAULT_RATING;
}

export function getMatchResult(homeScore, awayScore) {
  const h = Number(homeScore);
  const a = Number(awayScore);

  if (h > a) return "1";
  if (h < a) return "2";
  return "N";
}

function roundPercent(value) {
  return Math.round(value * 100);
}

/* ============================================================
   7. PROBABILITÉ DU NUL
   ============================================================ */

function getDrawProbabilityFromRatingDiff(diff) {
  const absDiff = Math.abs(diff);

  if (absDiff <= 80) return 0.32;
  if (absDiff <= 180) return 0.29;
  if (absDiff <= 300) return 0.25;
  if (absDiff <= 450) return 0.21;
  if (absDiff <= 650) return 0.16;

  return 0.12;
}

/* ============================================================
   8. CALCUL DES PROBABILITÉS INTERNES 1 / N / 2
   ============================================================ */

export function getMatchProbabilities(match) {
  if (!match || !match.home || !match.away) {
    return {
      "1": 34,
      "N": 32,
      "2": 34
    };
  }

  const homeRating = getTeamRating(match.home);
  const awayRating = getTeamRating(match.away);

  const diff = homeRating - awayRating;

  const expectedHome = 1 / (1 + Math.pow(10, -diff / 650));

  const drawProbability = getDrawProbabilityFromRatingDiff(diff);
  const remainingProbability = 1 - drawProbability;

  const homeProbability = expectedHome * remainingProbability;
  const awayProbability = remainingProbability - homeProbability;

  const p1 = roundPercent(homeProbability);
  const pN = roundPercent(drawProbability);
  const p2 = 100 - p1 - pN;

  return {
    "1": p1,
    "N": pN,
    "2": p2
  };
}

/* ============================================================
   9. ANCIEN BARÈME — MATCHS AVANT LE 20 JUIN 2026
   ============================================================ */

function calculateLegacyPredictionPoints(prediction, realHome, realAway) {
  if (
    realHome === null ||
    realAway === null ||
    realHome === undefined ||
    realAway === undefined ||
    !prediction
  ) {
    return null;
  }

  const realResult = getMatchResult(realHome, realAway);

  if (prediction.type === "score") {
    const predictedResult = getMatchResult(prediction.home, prediction.away);

    const isExactScore =
      Number(prediction.home) === Number(realHome) &&
      Number(prediction.away) === Number(realAway);

    if (isExactScore) {
      return {
        points: 5,
        label: "Score exact",
        probability: null,
        basePoints: 5,
        exactBonus: 0,
        scoringMode: "legacy"
      };
    }

    if (predictedResult === realResult) {
      return {
        points: 3,
        label: "Bon résultat",
        probability: null,
        basePoints: 3,
        exactBonus: 0,
        scoringMode: "legacy"
      };
    }

    return {
      points: 0,
      label: "Raté",
      probability: null,
      basePoints: 0,
      exactBonus: 0,
      scoringMode: "legacy"
    };
  }

  if (prediction.type === "result") {
    if (prediction.result === realResult) {
      return {
        points: 3,
        label: "Bon résultat",
        probability: null,
        basePoints: 3,
        exactBonus: 0,
        scoringMode: "legacy"
      };
    }

    return {
      points: 0,
      label: "Raté",
      probability: null,
      basePoints: 0,
      exactBonus: 0,
      scoringMode: "legacy"
    };
  }

  return null;
}

/* ============================================================
   10. BARÈME DE BASE DES POINTS ENTRE 2 ET 10
   ============================================================ */

export function getResultPointsFromProbability(probability) {
  const p = Number(probability);

  if (p >= 70) return 2;
  if (p >= 60) return 3;
  if (p >= 50) return 4;
  if (p >= 40) return 5;
  if (p >= 30) return 6;
  if (p >= 20) return 7;
  if (p >= 12) return 8;
  if (p >= 6) return 9;

  return 10;
}

/* ============================================================
   11. AJUSTEMENT DU NUL
   ============================================================ */

function getDynamicResultPoints(match, result, probabilities) {
  const basePoints = getResultPointsFromProbability(probabilities[result]);

  if (!match || !result || !probabilities) {
    return basePoints;
  }

  const homeRating = getTeamRating(match.home);
  const awayRating = getTeamRating(match.away);

  const diff = homeRating - awayRating;
  const absDiff = Math.abs(diff);

  if (result !== "N" || absDiff <= 80) {
    return basePoints;
  }

  let penalty = 1;

  if (absDiff > 300) {
    penalty = 2;
  }

  if (absDiff > 600) {
    penalty = 3;
  }

  return Math.max(2, basePoints - penalty);
}

/* ============================================================
   12. CALCUL DES POINTS D'UN PRONOSTIC MATCH
   ============================================================ */

export function calculatePredictionPoints(prediction, realHome, realAway, match) {
  if (
    realHome === null ||
    realAway === null ||
    realHome === undefined ||
    realAway === undefined ||
    !prediction ||
    !match
  ) {
    return null;
  }

  if (!isNewScoringApplicable(match)) {
    return calculateLegacyPredictionPoints(prediction, realHome, realAway);
  }

  const realResult = getMatchResult(realHome, realAway);
  const probabilities = getMatchProbabilities(match);

  let predictedResult = null;
  let isExactScore = false;

  if (prediction.type === "score") {
    predictedResult = getMatchResult(prediction.home, prediction.away);

    isExactScore =
      Number(prediction.home) === Number(realHome) &&
      Number(prediction.away) === Number(realAway);
  }

  if (prediction.type === "result") {
    predictedResult = prediction.result;
  }

  if (!predictedResult) {
    return null;
  }

  const probability = probabilities[predictedResult];

  if (predictedResult !== realResult) {
    return {
      points: 0,
      label: "Raté",
      probability,
      basePoints: 0,
      exactBonus: 0,
      scoringMode: "dynamic"
    };
  }

  const basePoints = getDynamicResultPoints(match, predictedResult, probabilities);
  const exactBonus = isExactScore ? 3 : 0;
  const totalPoints = basePoints + exactBonus;

  return {
    points: totalPoints,
    label: isExactScore ? "Score exact" : "Bon résultat",
    probability,
    basePoints,
    exactBonus,
    scoringMode: "dynamic"
  };
}

/* ============================================================
   13. BARÈME VISIBLE D'UN MATCH
   ============================================================ */

export function getMatchPointsScale(match) {
  if (!isNewScoringApplicable(match)) {
    return {
      "1": {
        result: "1",
        label: match.home,
        probability: null,
        points: 3,
        scoringMode: "legacy"
      },
      "N": {
        result: "N",
        label: "Nul",
        probability: null,
        points: 3,
        scoringMode: "legacy"
      },
      "2": {
        result: "2",
        label: match.away,
        probability: null,
        points: 3,
        scoringMode: "legacy"
      }
    };
  }

  const probabilities = getMatchProbabilities(match);

  return {
    "1": {
      result: "1",
      label: match.home,
      probability: probabilities["1"],
      points: getDynamicResultPoints(match, "1", probabilities),
      scoringMode: "dynamic"
    },
    "N": {
      result: "N",
      label: "Nul",
      probability: probabilities["N"],
      points: getDynamicResultPoints(match, "N", probabilities),
      scoringMode: "dynamic"
    },
    "2": {
      result: "2",
      label: match.away,
      probability: probabilities["2"],
      points: getDynamicResultPoints(match, "2", probabilities),
      scoringMode: "dynamic"
    }
  };
}

/* ============================================================
   14. TEXTE COURT POUR L'INTERFACE PUBLIQUE
   ============================================================ */

export function formatPointsScale(match) {
  const scale = getMatchPointsScale(match);

  if (scale["1"].scoringMode === "legacy") {
    return `${scale["1"].label} : 3 pts • Nul : 3 pts • ${scale["2"].label} : 3 pts`;
  }

  return `${scale["1"].label} : ${scale["1"].points} pts • Nul : ${scale["N"].points} pts • ${scale["2"].label} : ${scale["2"].points} pts`;
}

/* ============================================================
   15. DÉTAILS INTERNES MATCHS
   ============================================================ */

export function getMatchProbabilityDetails(match) {
  const probabilities = getMatchProbabilities(match);
  const scale = getMatchPointsScale(match);

  return {
    scoringMode: scale["1"].scoringMode,
    home: {
      team: match.home,
      rating: getTeamRating(match.home),
      probability: probabilities["1"],
      points: scale["1"].points
    },
    draw: {
      team: "Nul",
      probability: probabilities["N"],
      points: scale["N"].points
    },
    away: {
      team: match.away,
      rating: getTeamRating(match.away),
      probability: probabilities["2"],
      points: scale["2"].points
    }
  };
}
