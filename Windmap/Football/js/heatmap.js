// ========================================
// HEATMAP.JS - Calcul et rendu des cartes de chaleur
// Responsable de :
// - Accumuler les visites des joueurs par cellule
// - Calculer l'intensité des heatmaps
// - Rendu des overlays de chaleur sur le terrain
// Supporte les modes : joueur solo / équipe / deux équipes
// ========================================

"use strict";

// Configuration de la grille de heatmap (105m x 70m avec cellules de 1m)
const HEATMAP_GRID = {
  pitchWidthMeters: 105,
  pitchHeightMeters: 70,
  cellSizeMeters: 1,
  cols: Math.ceil(105 / 1),
  rows: Math.ceil(70 / 1),
};

// État persistant de la heatmap (caches et accumulation de visites)
const heatmapState = {
  cacheKeyBase: "",
  cachedFrameIndex: -1,
  homeCells: new Float32Array(HEATMAP_GRID.cols * HEATMAP_GRID.rows),
  awayCells: new Float32Array(HEATMAP_GRID.cols * HEATMAP_GRID.rows),
  previousHomeCellByPlayer: {},
  previousAwayCellByPlayer: {},
  maxHomeVisits: 0,
  maxAwayVisits: 0,
};

// Couleurs des deux équipes
const TEAM_BLUE = { r: 42, g: 112, b: 255 };
const TEAM_RED = { r: 235, g: 68, b: 58 };

// ========== FONCTIONS DE GRILLE ==========

// Convertit des coordonnées normalisées en index de cellule de grille (0-1 -> 0-104 pour X, 0-69 pour Y)
function getHeatmapCellIndex(normalizedX, normalizedY) {
  const clampedX = Math.max(0, Math.min(0.999999, normalizedX));
  const clampedY = Math.max(0, Math.min(0.999999, normalizedY));
  const col = Math.floor(clampedX * HEATMAP_GRID.cols);
  const row = Math.floor(clampedY * HEATMAP_GRID.rows);
  return row * HEATMAP_GRID.cols + col;
}

// Ajoute une entrée de visite à une cellule et ses voisines
function addCellEntryWithNeighbors(cells, cellIndex) {
  const cols = HEATMAP_GRID.cols;
  const rows = HEATMAP_GRID.rows;
  const centerCol = cellIndex % cols;
  const centerRow = Math.floor(cellIndex / cols);

  // Center cell gets +1 when a player enters it.
  cells[cellIndex] += 1;

  // 8-neighborhood gets a lighter spill to smooth transitions.
  for (let dRow = -1; dRow <= 1; dRow += 1) {
    for (let dCol = -1; dCol <= 1; dCol += 1) {
      if (dRow === 0 && dCol === 0) continue;

      const nRow = centerRow + dRow;
      const nCol = centerCol + dCol;
      if (nRow < 0 || nRow >= rows || nCol < 0 || nCol >= cols) continue;

      const neighborIndex = nRow * cols + nCol;
      cells[neighborIndex] += 0.25;
    }
  }
}

// Réinitialise l'état d'accumulation de la heatmap
function resetAccumulationState() {
  heatmapState.homeCells.fill(0);
  heatmapState.awayCells.fill(0);
  heatmapState.maxHomeVisits = 0;
  heatmapState.maxAwayVisits = 0;
  heatmapState.previousHomeCellByPlayer = {};
  heatmapState.previousAwayCellByPlayer = {};
  heatmapState.cachedFrameIndex = -1;
}

// Initialise les mappings cellules pour tous les joueurs d'une équipe.
// Utile pour les 3 modes
// qu'une équipe est prise en compte dans la heatmap.
function initializePlayerCellMap(teamData, previousCellByPlayer) {
  if (!teamData || !teamData.players) return;
  const playerIds = Object.keys(teamData.players);
  for (let i = 0; i < playerIds.length; i += 1) {
    const playerId = playerIds[i];
    if (!Object.prototype.hasOwnProperty.call(previousCellByPlayer, playerId)) {
      // Initialisation à -1 pour indiquer que le joueur n'était dans aucune cellule au départ
      previousCellByPlayer[playerId] = -1;
    }
  }
}

// ========== ACCUMULATION DE HEATMAP ==========

// Accumule les visites de cellules pour une équipe sur les frames.
// mode "equipe complete" et au mode "joueur solo".
function accumulateTeamCellsRange(
  teamData,
  cells,
  previousCellByPlayer,
  startFrameIndex,
  endFrameIndex,
  onlyPlayerId,
) {
  if (!teamData || !teamData.frames.length || endFrameIndex < startFrameIndex) {
    return;
  }

  initializePlayerCellMap(teamData, previousCellByPlayer);
  const playerIds = onlyPlayerId
    ? [onlyPlayerId]
    : Object.keys(teamData.players);

  for (let i = startFrameIndex; i <= endFrameIndex; i += 1) {
    const frame = teamData.frames[i];
    if (!frame) continue;

    for (let p = 0; p < playerIds.length; p += 1) {
      const playerId = playerIds[p];
      const point = frame.players[playerId]; // Point de ce joueur à cette frame
      if (!point) {
        previousCellByPlayer[playerId] = -1;
        continue;
      }
      // Si le joueur a changé de cellule depuis la dernière frame, on ajoute une visite à la nouvelle cellule (et ses voisines) et on met à jour le mapping.
      const cellIndex = getHeatmapCellIndex(point.x, point.y);
      if (cellIndex !== previousCellByPlayer[playerId]) {
        addCellEntryWithNeighbors(cells, cellIndex);
        previousCellByPlayer[playerId] = cellIndex;
      }
    }
  }
}

// Trouve la valeur maximale dans un tableau de cellules pour normaliser les intensités de la heatmap.
function getMaxValue(cells) {
  let maxValue = 0;
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] > maxValue) maxValue = cells[i];
  }
  return maxValue;
}

// ========== CONSTRUCTION PRINCIPALE ==========

// Reconstruit la heatmap de façon incrémentale jusqu'à la frame spécifiée.
// Pour les 3 modes
function rebuildHeatmap(
  matchData,
  heatmapMode,
  selectedTeam,
  upToFrameIndex,
  selectedPlayer,
) {
  const homeFramesCount = matchData?.teams?.Home?.frames?.length || 0;
  const awayFramesCount = matchData?.teams?.Away?.frames?.length || 0;
  const cacheKeyBase = `${heatmapMode}:${selectedTeam}:${selectedPlayer || "none"}:${homeFramesCount}:${awayFramesCount}`;
  //exemple: "player:Home:10:4500:4500"
  const safeFrameIndex = Math.max(0, Number(upToFrameIndex) || 0);

  if (!matchData || !matchData.teams) return;

  const homeMaxFrame = Math.max(0, homeFramesCount - 1);
  const awayMaxFrame = Math.max(0, awayFramesCount - 1);
  const targetFrameIndex = Math.min(safeFrameIndex, homeMaxFrame, awayMaxFrame);

  if (
    heatmapState.cacheKeyBase !== cacheKeyBase ||
    targetFrameIndex < heatmapState.cachedFrameIndex
  ) {
    heatmapState.cacheKeyBase = cacheKeyBase;
    resetAccumulationState();
  }

  if (targetFrameIndex === heatmapState.cachedFrameIndex) return;

  const isPlayerMode = heatmapMode === "player";
  const shouldBuildHome =
    heatmapMode === "both" ||
    (selectedTeam === "Home" && (!isPlayerMode || Boolean(selectedPlayer)));
  const shouldBuildAway =
    heatmapMode === "both" ||
    (selectedTeam === "Away" && (!isPlayerMode || Boolean(selectedPlayer)));

  const startFrame = heatmapState.cachedFrameIndex + 1;

  if (shouldBuildHome) {
    accumulateTeamCellsRange(
      matchData.teams.Home,
      heatmapState.homeCells,
      heatmapState.previousHomeCellByPlayer,
      startFrame,
      targetFrameIndex,
      isPlayerMode && selectedTeam === "Home" ? selectedPlayer : null,
    );
    heatmapState.maxHomeVisits = getMaxValue(heatmapState.homeCells);
  }

  if (shouldBuildAway) {
    accumulateTeamCellsRange(
      matchData.teams.Away,
      heatmapState.awayCells,
      heatmapState.previousAwayCellByPlayer,
      startFrame,
      targetFrameIndex,
      isPlayerMode && selectedTeam === "Away" ? selectedPlayer : null,
    );
    heatmapState.maxAwayVisits = getMaxValue(heatmapState.awayCells);
  }

  heatmapState.cachedFrameIndex = targetFrameIndex;
}

// ========== RENDU CANVAS ==========

// Dessine une grille de lignes sur le terrain
function drawGrid(ctx, viewState, cols, rows, cellW, cellH) {
  ctx.strokeStyle = "rgba(233, 255, 240, 0.14)";
  ctx.lineWidth = 0.6;
  for (let col = 0; col <= cols; col += 1) {
    const x = viewState.pitchX + col * cellW;
    ctx.beginPath();
    ctx.moveTo(x, viewState.pitchY);
    ctx.lineTo(x, viewState.pitchY + viewState.pitchH);
    ctx.stroke();
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = viewState.pitchY + row * cellH;
    ctx.beginPath();
    ctx.moveTo(viewState.pitchX, y);
    ctx.lineTo(viewState.pitchX + viewState.pitchW, y);
    ctx.stroke();
  }
}

// Invalide le cache pour forcer une reconstruction
export function invalidateHeatmapCache() {
  heatmapState.cacheKeyBase = "";
  heatmapState.cachedFrameIndex = -1;
}

// Dessine l'overlay d'une seule équipe.
// modes "joueur solo" et "equipe complete".
function drawSingleTeamLayer(
  ctx,
  cells,
  maxVisits,
  color,
  viewState,
  cols,
  rows,
  cellW,
  cellH,
) {
  if (maxVisits <= 0) return;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const visits = cells[index];
      if (visits <= 0) continue;

      const intensity = Math.min(1, visits / maxVisits);
      const alpha = 0.12 + intensity * 0.58;
      const x = viewState.pitchX + col * cellW;
      const y = viewState.pitchY + row * cellH;

      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
      ctx.fillRect(x, y, cellW, cellH);
    }
  }
}

// Fonction principale de rendu : assemble et dessine la heatmap complète.
//3 modes.
export function drawMatchHeatmapOverlay(
  ctx,
  viewState,
  matchData,
  heatmapMode,
  selectedTeam,
  selectedPlayer,
  currentFrameIndex,
) {
  rebuildHeatmap(
    matchData,
    heatmapMode,
    selectedTeam,
    currentFrameIndex,
    selectedPlayer,
  );

  const cols = HEATMAP_GRID.cols;
  const rows = HEATMAP_GRID.rows;
  const cellW = viewState.pitchW / cols;
  const cellH = viewState.pitchH / rows;

  ctx.save();

  if (heatmapMode === "team" || heatmapMode === "player") {
    const isHome = selectedTeam === "Home";
    const cells = isHome ? heatmapState.homeCells : heatmapState.awayCells;
    const maxVisits = isHome
      ? heatmapState.maxHomeVisits
      : heatmapState.maxAwayVisits;
    const color = isHome ? TEAM_BLUE : TEAM_RED;
    drawSingleTeamLayer(
      ctx,
      cells,
      maxVisits,
      color,
      viewState,
      cols,
      rows,
      cellW,
      cellH,
    );
  } else if (heatmapMode === "both") {
    drawSingleTeamLayer(
      ctx,
      heatmapState.homeCells,
      heatmapState.maxHomeVisits,
      TEAM_BLUE,
      viewState,
      cols,
      rows,
      cellW,
      cellH,
    );
    drawSingleTeamLayer(
      ctx,
      heatmapState.awayCells,
      heatmapState.maxAwayVisits,
      TEAM_RED,
      viewState,
      cols,
      rows,
      cellW,
      cellH,
    );
  }

  drawGrid(ctx, viewState, cols, rows, cellW, cellH);

  ctx.restore();
}
