// ========================================
// DATALOADER.JS - Chargement et parsing des CSV
// Responsable de :
// - Fetcher les fichiers CSV du serveur
// - Parser la structure de suivi (tracking)
// - Normaliser les coordonnées XY entre 0-1
// - Construire les structures de données (équipes, joueurs, frames)
// ========================================
"";
"use strict";

// Convertit une valeur en nombre en gérant les cas null/undefined/NaN
function parseNumber(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === "nan") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// Divise une ligne CSV en tableau
function splitCsvLine(line) {
  // Dataset rows are simple comma-separated values without quoted commas.
  return line.split(",");
}

// Borne une valeur entre 0 et 1 (normalisation)
function clamp01(value) {
  if (value === null || value === undefined) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// Normalise une paire de coordonnées XY en vérifiant qu'elles sont valides
function normalizeXY(x, y) {
  const nx = clamp01(x);
  const ny = clamp01(y);
  if (nx === null || ny === null) return null;
  return { x: nx, y: ny };
}

// Génère une clé unique pour un timestamp (utilisée pour l'indexage rapide)
function buildTimeKey(time) {
  // Avoid float precision drift while keeping direct access by timestamp.
  return Number(time).toFixed(3); //3 decimales = millisecond precision
}

// ========== CHARGEMENT DES FICHIERS CSV ==========

// Fetch et parse un seul CSV de suivi d'une équipe
async function loadTeamTrackingCsv(teamName, csvPath) {
  const response = await fetch(csvPath);
  if (!response.ok) {
    throw new Error(`Failed to load ${teamName} CSV: ${csvPath}`);
  }
  const csvText = await response.text();
  return parseTrackingCsv(csvText, teamName);
}

// Charge les données de suivi pour les deux équipes d'un match
async function loadMatchTracking(homeCsvPath, awayCsvPath) {
  const [home, away] = await Promise.all([
    loadTeamTrackingCsv("Home", homeCsvPath),
    loadTeamTrackingCsv("Away", awayCsvPath),
  ]);

  return {
    teams: {
      Home: home,
      Away: away,
    },
    frameRateHz: 25, // Fréquence d'échantillonnage typique des données
  };
}

// ========== PARSING DU CSV  ==========

// Parse un fichier CSV de football
// Extrait les positions des joueurs, balle, période, frame, temps
function parseTrackingCsv(csvText, teamName) {
  const lines = String(csvText)
    .replace(/\r\n/g, "\n") // Normalize Windows line endings to Unix style
    .replace(/\r/g, "\n") // Normalize old Mac line endings to Unix style
    .split("\n") // Split into lines
    .filter((line) => line.trim().length > 0);

  if (lines.length < 4) {
    throw new Error("Tracking CSV format invalid: not enough lines");
  }

  // Lit les données de structure du CSV : numéros de maillots et colonnes des joueurs
  const jerseyHeader = splitCsvLine(lines[1]);
  const columnHeader = splitCsvLine(lines[2]);

  // Construit une liste des colonnes des joueurs (numéro de maillot, indices X/Y)
  const playerColumns = [];

  for (let i = 3; i < columnHeader.length - 1; i += 2) {
    const label = (columnHeader[i] || "").trim();
    if (!label.startsWith("Player")) continue; // Skip non-player columns (e.g. Ball, Time, etc.)

    const jerseyNumber =
      (jerseyHeader[i] || "").trim() || label.replace("Player", ""); // Fallback to "PlayerX" if jersey number is missing
    playerColumns.push({
      playerId: jerseyNumber,
      xIndex: i,
      yIndex: i + 1,
    });
  }

  const ballXIndex = columnHeader.findIndex(
    (header) => String(header).trim() === "Ball", // Find the index of the "Ball" column
  );
  const ballYIndex = ballXIndex >= 0 ? ballXIndex + 1 : -1; //

  // Initialise les structures de données pour les joueurs et frames
  const players = {};
  const frames = [];

  playerColumns.forEach((col) => {
    players[col.playerId] = {
      playerId: col.playerId,
      team: teamName,
      frames: [],
    };
  });

  // Parse chaque ligne du CSV (une ligne = une frame)
  for (let lineIndex = 3; lineIndex < lines.length; lineIndex += 1) {
    const row = splitCsvLine(lines[lineIndex]);

    const period = parseNumber(row[0]);
    const frame = parseNumber(row[1]);
    const time = parseNumber(row[2]);

    if (period === null || frame === null || time === null) continue;

    // Structure d'une frame avec tous les joueurs et la balle
    const frameEntry = {
      period,
      frame,
      time,
      players: {},
      ball: null,
    };

    // Extrait les positions de chaque joueur
    for (let i = 0; i < playerColumns.length; i += 1) {
      const col = playerColumns[i];
      const x = parseNumber(row[col.xIndex]);
      const y = parseNumber(row[col.yIndex]);
      const normalized = normalizeXY(x, y);

      // Missing coordinates (NaN) are skipped but timeline is preserved.
      if (!normalized) continue;

      const playerFrame = {
        period,
        frame,
        time,
        x: normalized.x,
        y: normalized.y,
      };

      players[col.playerId].frames.push(playerFrame); // Add frame to player's timeline
      frameEntry.players[col.playerId] = {
        x: normalized.x,
        y: normalized.y,
      };
    }

    if (ballXIndex >= 0 && ballYIndex >= 0) {
      // If ball columns exist, extract ball position
      const ballX = parseNumber(row[ballXIndex]);
      const ballY = parseNumber(row[ballYIndex]);
      const normalizedBall = normalizeXY(ballX, ballY);
      frameEntry.ball = normalizedBall;
    }

    frames.push(frameEntry);
  }

  // Crée des index rapides pour accéder aux frames par période:frame ou temps exact
  const frameIndex = {};
  const timeIndex = {};
  for (let i = 0; i < frames.length; i += 1) {
    const key = `${frames[i].period}:${frames[i].frame}`;
    frameIndex[key] = i;
    timeIndex[buildTimeKey(frames[i].time)] = i;
  }

  // Retourne la structure complète de l'équipe
  return {
    teamName,
    players,
    frames,
    frameIndex,
    timeIndex,
    meta: {
      frameCount: frames.length,
      playerCount: Object.keys(players).length,
    },
  };
}

export { loadMatchTracking };
