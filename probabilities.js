// probabilities.js
// Base interne de calcul des probabilités et des points
// Note équipe : échelle interne élargie de 1050 à 1950
// Barème joueur :
// - Avant le 20 juin 2026 : ancien barème 5 / 3 / 0
// - À partir du 20 juin 2026 : bon résultat 2 à 10 pts + bonus score exact +3 pts

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
   2. DATE DE BASCULE DU NOUVEAU BARÈME
   ============================================================ */

// Les matchs dont la date est >= 2026-06-20 utilisent le nouveau barème.
// Les matchs avant cette date gardent l’ancien barème :
// Score exact = 5 pts
// Bon résultat = 3 pts
// Mauvais résultat = 0 pt
const NEW_SCORING_START_DATE = "2026-06-20";

function isNewScoringApplicable(match) {
  if (!match || !match.date) return false;

  const matchDate = String(match.date).slice(0, 10);

  return matchDate >= NEW_SCORING_START_DATE;
}

/* ============================================================
   3. UTILITAIRES
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
   4. PROBABILITÉ DU NUL
   Le nul dépend de l'écart de force.

   Plus les équipes sont proches :
   - le nul est relativement probable.

   Plus l'écart est élevé :
   - le nul devient une vraie surprise.
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
   5. CALCUL DES PROBABILITÉS 1 / N / 2

   Résultat retourné :
   {
     "1": probabilité victoire équipe domicile,
     "N": probabilité match nul,
     "2": probabilité victoire équipe extérieur
   }

   Formule :
   - On utilise une logique type Elo.
   - Le diviseur 650 rend la formule plus progressive,
     car notre échelle de notes est large : 1050 à 1950.
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

  // Probabilité de victoire de l'équipe à domicile hors nul
  const expectedHome = 1 / (1 + Math.pow(10, -diff / 650));

  // Probabilité propre du nul
  const drawProbability = getDrawProbabilityFromRatingDiff(diff);

  // On répartit le reste entre victoire domicile et victoire extérieur
  const remainingProbability = 1 - drawProbability;

  const homeProbability = expectedHome * remainingProbability;
  const awayProbability = remainingProbability - homeProbability;

  const p1 = roundPercent(homeProbability);
  const pN = roundPercent(drawProbability);

  // Correction d'arrondi pour que le total fasse exactement 100 %
  const p2 = 100 - p1 - pN;

  return {
    "1": p1,
    "N": pN,
    "2": p2
  };
}

/* ============================================================
   6. ANCIEN BARÈME — MATCHS AVANT LE 20 JUIN 2026

   Règles :
   - Score exact = 5 pts
   - Bon résultat = 3 pts
   - Mauvais résultat = 0 pt
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
   7. NOUVEAU BARÈME DES POINTS ENTRE 2 ET 10

   Plus le résultat pronostiqué est improbable,
   plus il rapporte de points.

   Exemple :
   - Favori à 75 % : 2 pts
   - Résultat à 45 % : 5 pts
   - Nul surprise à 15 % : 8 pts
   - Exploit à moins de 6 % : 10 pts
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
   8. CALCUL DES POINTS D'UN PRONOSTIC

   Règle de transition :
   - Avant le 20 juin 2026 :
     ancien barème 5 / 3 / 0

   - À partir du 20 juin 2026 :
     bon résultat = 2 à 10 pts selon probabilité
     score exact = bonus +3 pts
     mauvais résultat = 0 pt
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

  // Application prospective uniquement :
  // les matchs avant le 20 juin restent sur l’ancien barème.
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

  const basePoints = getResultPointsFromProbability(probability);
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
   9. BARÈME D'UN MATCH

   Permet d'afficher dans l'application :
   Maroc : 5 pts
   Nul : 7 pts
   Écosse : 8 pts

   Pour les matchs avant le 20 juin, on affiche l’ancien barème.
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
      points: getResultPointsFromProbability(probabilities["1"]),
      scoringMode: "dynamic"
    },
    "N": {
      result: "N",
      label: "Nul",
      probability: probabilities["N"],
      points: getResultPointsFromProbability(probabilities["N"]),
      scoringMode: "dynamic"
    },
    "2": {
      result: "2",
      label: match.away,
      probability: probabilities["2"],
      points: getResultPointsFromProbability(probabilities["2"]),
      scoringMode: "dynamic"
    }
  };
}

/* ============================================================
   10. TEXTE COURT POUR L'INTERFACE
   ============================================================ */

export function formatPointsScale(match) {
  const scale = getMatchPointsScale(match);

  if (scale["1"].scoringMode === "legacy") {
    return `${scale["1"].label} : 3 pts • Nul : 3 pts • ${scale["2"].label} : 3 pts`;
  }

  return `${scale["1"].label} : ${scale["1"].points} pts (${scale["1"].probability} %) • Nul : ${scale["N"].points} pts (${scale["N"].probability} %) • ${scale["2"].label} : ${scale["2"].points} pts (${scale["2"].probability} %)`;
}

/* ============================================================
   11. TEXTE DÉTAILLÉ POUR L'INTERFACE OU L'ADMIN
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
