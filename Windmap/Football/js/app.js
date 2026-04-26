import { loadMatchTracking } from "./dataLoader.js";
import {
  wireControls,
  setPlayPauseLabel,
  setBallToggleLabel,
  setParticlesToggleLabel,
} from "./controls.js";
import { drawMatchHeatmapOverlay, invalidateHeatmapCache } from "./heatmap.js";
import {
  drawPitch,
  drawTeamPlayers,
  drawBall,
  drawBallTrail,
  drawPlayersTrail,
} from "./visualization.js";
import { createParticleSystem } from "./particles.js";

("use strict");

const PITCH_RATIO = 105 / 70;
const DEFAULT_FRAME_RATE = 25;
const PLAYER_TRAIL_LENGTH = 18;
const BALL_TRAIL_LENGTH = 22;

const MATCH_FILES = {
  Sample_Game_1: {
    home: "data/Sample_Game_1/Sample_Game_1_RawTrackingData_Home_Team.csv",
    away: "data/Sample_Game_1/Sample_Game_1_RawTrackingData_Away_Team.csv",
  },
  Sample_Game_2: {
    home: "data/Sample_Game_2/Sample_Game_2_RawTrackingData_Home_Team.csv",
    away: "data/Sample_Game_2/Sample_Game_2_RawTrackingData_Away_Team.csv",
  },
};

const canvas = document.getElementById("pitchCanvas");
const matchSelect = document.getElementById("matchSelect");
const heatmapModeSelect = document.getElementById("heatmapModeSelect");
const teamSelect = document.getElementById("teamSelect");
const playerSelect = document.getElementById("playerSelect");
const goStartBtn = document.getElementById("goStartBtn");
const rewindBtn = document.getElementById("rewindBtn");
const stepBackBtn = document.getElementById("stepBackBtn");
const playPauseBtn = document.getElementById("playPauseBtn");
const stepForwardBtn = document.getElementById("stepForwardBtn");
const fastForwardBtn = document.getElementById("fastForwardBtn");
const goEndBtn = document.getElementById("goEndBtn");
const ballToggleBtn = document.getElementById("ballToggleBtn");
const particlesToggleBtn = document.getElementById("particlesToggleBtn");
const speedSelect = document.getElementById("speedSelect");
const frameSlider = document.getElementById("frameSlider");
const frameInfo = document.getElementById("frameInfo");

if (!canvas) {
  throw new Error("Missing #pitchCanvas element");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Canvas 2D context unavailable");
}

const dataState = {
  selectedMatch: matchSelect ? matchSelect.value : "Sample_Game_1",
  selectedTeam: teamSelect ? teamSelect.value : "Home",
  selectedPlayer: "",
  heatmapMode: heatmapModeSelect ? heatmapModeSelect.value : "team",
  matchData: null,
};

const playback = {
  isPlaying: false,
  speed: Number(speedSelect?.value) || 1,
  frameRateHz: DEFAULT_FRAME_RATE,
  frameIndex: 0,
  frameAccumulator: 0,
};

const viewOptions = {
  showBall: true,
  showParticles: true,
};

const viewState = {
  width: 300,
  height: 200,
  pitchX: 0,
  pitchY: 0,
  pitchW: 300,
  pitchH: 200,
};

const particleSystem = createParticleSystem();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCurrentTeamData() {
  return dataState.matchData?.teams?.[dataState.selectedTeam] || null;
}

function getCurrentFrame(teamKey) {
  const teamData = dataState.matchData?.teams?.[teamKey];
  if (!teamData || !teamData.frames || !teamData.frames.length) return null;
  const safeIndex = clamp(playback.frameIndex, 0, teamData.frames.length - 1);
  return teamData.frames[safeIndex] || null;
}

function normalizedToCanvas(normalizedX, normalizedY) {
  const x = viewState.pitchX + clamp(normalizedX, 0, 1) * viewState.pitchW;
  const y = viewState.pitchY + clamp(normalizedY, 0, 1) * viewState.pitchH;
  return { x, y };
}

function findNearestFrameIndexByMinute(teamData, minute) {
  if (!teamData || !teamData.frames || !teamData.frames.length) return 0;

  const targetSeconds = Math.max(0, minute * 60);
  const frames = teamData.frames;

  let left = 0;
  let right = frames.length - 1;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (frames[mid].time < targetSeconds) left = mid + 1;
    else right = mid;
  }

  const current = left;
  const previous = Math.max(0, current - 1);

  const currentDist = Math.abs((frames[current]?.time || 0) - targetSeconds);
  const prevDist = Math.abs((frames[previous]?.time || 0) - targetSeconds);

  return prevDist <= currentDist ? previous : current;
}

function getPlayerTrail(teamData, playerId, endIndex, length) {
  if (!teamData || !playerId || !teamData.frames || !teamData.frames.length) {
    return [];
  }

  const result = [];
  const startIndex = Math.max(0, endIndex - length + 1);

  for (let i = startIndex; i <= endIndex; i += 1) {
    const point = teamData.frames[i]?.players?.[playerId];
    if (point) {
      result.push({ x: point.x, y: point.y });
    }
  }

  return result;
}

function getBallTrail(homeTeam, awayTeam, endIndex, length) {
  const result = [];
  const maxFrames = Math.max(
    homeTeam?.frames?.length || 0,
    awayTeam?.frames?.length || 0,
  );

  if (!maxFrames) return result;

  const safeEnd = clamp(endIndex, 0, maxFrames - 1);
  const startIndex = Math.max(0, safeEnd - length + 1);

  for (let i = startIndex; i <= safeEnd; i += 1) {
    const ball = homeTeam?.frames?.[i]?.ball || awayTeam?.frames?.[i]?.ball;
    if (ball) {
      result.push({ x: ball.x, y: ball.y });
    }
  }

  return result;
}

function updateViewState(width, height) {
  viewState.width = width;
  viewState.height = height;

  const margin = width * 0.02;
  viewState.pitchX = margin;
  viewState.pitchY = margin;
  viewState.pitchW = width - margin * 2;
  viewState.pitchH = height - margin * 2;
}

function resizeCanvas() {
  const panel = canvas.parentElement;
  if (!panel) return;

  const cssWidth = panel.clientWidth;
  const cssHeight = panel.clientHeight;

  let finalWidth = cssWidth;
  let finalHeight = finalWidth / PITCH_RATIO;

  if (finalHeight > cssHeight) {
    finalHeight = cssHeight;
    finalWidth = finalHeight * PITCH_RATIO;
  }

  finalWidth = Math.max(240, finalWidth);
  finalHeight = Math.max(160, finalHeight);

  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = `${finalWidth}px`;
  canvas.style.height = `${finalHeight}px`;

  canvas.width = Math.floor(finalWidth * dpr);
  canvas.height = Math.floor(finalHeight * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  updateViewState(finalWidth, finalHeight);
}

function updateFrameSliderBounds() {
  if (!frameSlider) return;

  const teamData = getCurrentTeamData();
  if (!teamData || !teamData.frames || !teamData.frames.length) {
    frameSlider.min = "0";
    frameSlider.max = "0";
    frameSlider.step = "0.01";
    frameSlider.value = "0";
    return;
  }

  const firstFrame = teamData.frames[0];
  const lastFrame = teamData.frames[teamData.frames.length - 1];

  frameSlider.min = "0";
  frameSlider.max = String(
    Math.max(0, (lastFrame.time - firstFrame.time) / 60),
  );
  frameSlider.step = "0.01";
}

function updateFrameInfo() {
  if (!frameInfo) return;

  const teamData = getCurrentTeamData();
  if (!teamData || !teamData.frames || !teamData.frames.length) {
    frameInfo.textContent = "Aucune donnee";
    if (frameSlider) frameSlider.value = "0";
    return;
  }

  const safeIndex = clamp(playback.frameIndex, 0, teamData.frames.length - 1);
  const frame = teamData.frames[safeIndex];

  const minute = frame.time / 60;
  frameInfo.textContent = `Periode ${frame.period} | Minute ${minute.toFixed(2)} | Frame ${frame.frame}`;

  if (frameSlider) {
    const firstTime = teamData.frames[0]?.time || 0;
    frameSlider.value = String(Math.max(0, (frame.time - firstTime) / 60));
  }
}

function populatePlayerSelect() {
  if (!playerSelect) return;

  const teamData = getCurrentTeamData();
  playerSelect.innerHTML = "";

  const playerIds = Object.keys(teamData?.players || {}).sort((a, b) => {
    return Number(a) - Number(b);
  });

  if (!playerIds.length) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Aucun joueur";
    playerSelect.appendChild(emptyOption);
    dataState.selectedPlayer = "";
    return;
  }

  for (let i = 0; i < playerIds.length; i += 1) {
    const playerId = playerIds[i];
    const option = document.createElement("option");
    option.value = playerId;
    option.textContent = `Joueur ${playerId}`;
    playerSelect.appendChild(option);
  }

  const canKeepSelection = playerIds.includes(dataState.selectedPlayer);
  dataState.selectedPlayer = canKeepSelection
    ? dataState.selectedPlayer
    : playerIds[0];
  playerSelect.value = dataState.selectedPlayer;
}

function refreshHeatmapSelectorsState() {
  const isPlayerMode = dataState.heatmapMode === "player";

  if (playerSelect) {
    playerSelect.disabled = !isPlayerMode;
  }

  if (teamSelect) {
    teamSelect.disabled = dataState.heatmapMode === "both";
  }
}

function getTrailPayload() {
  const trails = {
    Home: [],
    Away: [],
  };

  const homeTeam = dataState.matchData?.teams?.Home;
  const awayTeam = dataState.matchData?.teams?.Away;

  if (!homeTeam && !awayTeam) return trails;

  if (dataState.heatmapMode === "both") {
    const homeIds = Object.keys(homeTeam?.players || {});
    const awayIds = Object.keys(awayTeam?.players || {});

    for (let i = 0; i < homeIds.length; i += 1) {
      const trail = getPlayerTrail(
        homeTeam,
        homeIds[i],
        playback.frameIndex,
        PLAYER_TRAIL_LENGTH,
      );
      if (trail.length > 1) trails.Home.push(trail);
    }

    for (let i = 0; i < awayIds.length; i += 1) {
      const trail = getPlayerTrail(
        awayTeam,
        awayIds[i],
        playback.frameIndex,
        PLAYER_TRAIL_LENGTH,
      );
      if (trail.length > 1) trails.Away.push(trail);
    }

    return trails;
  }

  if (dataState.heatmapMode === "player" && dataState.selectedPlayer) {
    const teamData = getCurrentTeamData();
    const trail = getPlayerTrail(
      teamData,
      dataState.selectedPlayer,
      playback.frameIndex,
      PLAYER_TRAIL_LENGTH,
    );

    if (trail.length > 1) {
      trails[dataState.selectedTeam].push(trail);
    }

    return trails;
  }

  const selectedTeamData = getCurrentTeamData();
  const selectedIds = Object.keys(selectedTeamData?.players || {});

  for (let i = 0; i < selectedIds.length; i += 1) {
    const trail = getPlayerTrail(
      selectedTeamData,
      selectedIds[i],
      playback.frameIndex,
      PLAYER_TRAIL_LENGTH,
    );
    if (trail.length > 1) trails[dataState.selectedTeam].push(trail);
  }

  return trails;
}

function emitParticlesFromFrame(
  frame,
  teamKey,
  playerIdsOverride = null,
  sampleStep = 3,
) {
  if (!frame || !frame.players || !viewOptions.showParticles) return;

  const playerIds =
    Array.isArray(playerIdsOverride) && playerIdsOverride.length
      ? playerIdsOverride
      : Object.keys(frame.players);
  if (!playerIds.length) return;

  const safeStep = Math.max(1, Number(sampleStep) || 1);

  for (let i = 0; i < playerIds.length; i += safeStep) {
    const point = frame.players[playerIds[i]];
    if (!point) continue;
    particleSystem.emitTrail(point, teamKey, 1);
  }
}

function render() {
  drawPitch(ctx, viewState);

  const matchData = dataState.matchData;
  if (!matchData || !matchData.teams) return;

  drawMatchHeatmapOverlay(
    ctx,
    viewState,
    matchData,
    dataState.heatmapMode,
    dataState.selectedTeam,
    dataState.selectedPlayer,
    playback.frameIndex,
  );

  const homeFrame = getCurrentFrame("Home");
  const awayFrame = getCurrentFrame("Away");

  const trails = getTrailPayload();
  drawPlayersTrail(ctx, trails.Home, "Home", viewState, normalizedToCanvas);
  drawPlayersTrail(ctx, trails.Away, "Away", viewState, normalizedToCanvas);

  drawTeamPlayers(ctx, homeFrame, "Home", viewState, normalizedToCanvas);
  drawTeamPlayers(ctx, awayFrame, "Away", viewState, normalizedToCanvas);

  const ballTrail = getBallTrail(
    matchData.teams.Home,
    matchData.teams.Away,
    playback.frameIndex,
    BALL_TRAIL_LENGTH,
  );
  const currentBall = homeFrame?.ball || awayFrame?.ball || null;

  if (viewOptions.showBall) {
    drawBallTrail(ctx, ballTrail, viewState, normalizedToCanvas);
    drawBall(ctx, currentBall, viewState, normalizedToCanvas);
  }

  if (viewOptions.showParticles) {
    const selectedFrame =
      dataState.selectedTeam === "Home" ? homeFrame : awayFrame;

    if (dataState.heatmapMode === "both") {
      emitParticlesFromFrame(homeFrame, "Home");
      emitParticlesFromFrame(awayFrame, "Away");
    } else if (dataState.heatmapMode === "player" && dataState.selectedPlayer) {
      emitParticlesFromFrame(
        selectedFrame,
        dataState.selectedTeam,
        [dataState.selectedPlayer],
        1,
      );
    } else {
      emitParticlesFromFrame(selectedFrame, dataState.selectedTeam);
    }

    particleSystem.draw(ctx, viewState);
  }
}

function tickPlayback(deltaSeconds) {
  const teamData = getCurrentTeamData();
  if (!teamData || !teamData.frames || !teamData.frames.length) return;

  if (!viewOptions.showParticles) {
    particleSystem.reset();
  } else {
    particleSystem.update(deltaSeconds, viewState);
  }

  if (!playback.isPlaying) return;

  const maxIndex = teamData.frames.length - 1;
  const frameAdvance = deltaSeconds * playback.frameRateHz * playback.speed;
  const totalAdvance = playback.frameAccumulator + frameAdvance;
  const wholeFrames = Math.floor(totalAdvance);

  playback.frameAccumulator = totalAdvance - wholeFrames;

  if (wholeFrames <= 0) return;

  playback.frameIndex = Math.min(maxIndex, playback.frameIndex + wholeFrames);

  if (playback.frameIndex >= maxIndex) {
    playback.isPlaying = false;
    setPlayPauseLabel(playPauseBtn, playback.isPlaying);
  }

  updateFrameInfo();
}

async function loadSelectedMatch() {
  const matchId = dataState.selectedMatch;
  const paths = MATCH_FILES[matchId];

  if (!paths) {
    dataState.matchData = null;
    if (frameInfo) frameInfo.textContent = "Match introuvable";
    return;
  }

  playback.isPlaying = false;
  setPlayPauseLabel(playPauseBtn, playback.isPlaying);
  playback.frameIndex = 0;
  playback.frameAccumulator = 0;

  if (frameInfo) {
    frameInfo.textContent = "Chargement des donnees...";
  }

  try {
    dataState.matchData = await loadMatchTracking(paths.home, paths.away);
    playback.frameRateHz =
      dataState.matchData.frameRateHz || DEFAULT_FRAME_RATE;

    invalidateHeatmapCache();
    particleSystem.reset();

    populatePlayerSelect();
    refreshHeatmapSelectorsState();
    updateFrameSliderBounds();
    updateFrameInfo();
  } catch (error) {
    dataState.matchData = null;
    if (frameInfo) {
      frameInfo.textContent = "Erreur de chargement des CSV";
    }
    console.error(error);
  }
}

function setupControls() {
  wireControls({
    teamSelect,
    playerSelect,
    goStartBtn,
    rewindBtn,
    stepBackBtn,
    playPauseBtn,
    stepForwardBtn,
    fastForwardBtn,
    goEndBtn,
    ballToggleBtn,
    particlesToggleBtn,
    speedSelect,
    frameSlider,
    playback,
    dataState,
    viewOptions,
    invalidateHeatmapCache,
    getCurrentTeamData,
    populatePlayerSelect,
    updateFrameSliderBounds,
    updateFrameInfo,
    findNearestFrameIndexByMinute,
  });

  setPlayPauseLabel(playPauseBtn, playback.isPlaying);
  setBallToggleLabel(ballToggleBtn, viewOptions.showBall);
  setParticlesToggleLabel(particlesToggleBtn, viewOptions.showParticles);

  if (matchSelect) {
    matchSelect.addEventListener("change", async function () {
      dataState.selectedMatch = matchSelect.value;
      await loadSelectedMatch();
    });
  }

  if (heatmapModeSelect) {
    heatmapModeSelect.addEventListener("change", function () {
      dataState.heatmapMode = heatmapModeSelect.value;
      invalidateHeatmapCache();
      particleSystem.reset();
      refreshHeatmapSelectorsState();
      updateFrameInfo();
    });
  }

  if (teamSelect) {
    teamSelect.addEventListener("change", function () {
      particleSystem.reset();
    });
  }

  if (playerSelect) {
    playerSelect.addEventListener("change", function () {
      particleSystem.reset();
    });
  }
}

function startLoop() {
  let lastTimestamp = performance.now();

  function loop(now) {
    const deltaSeconds = Math.max(0, (now - lastTimestamp) / 1000);
    lastTimestamp = now;

    tickPlayback(deltaSeconds);
    render();

    window.requestAnimationFrame(loop);
  }

  window.requestAnimationFrame(loop);
}

async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  setupControls();
  refreshHeatmapSelectorsState();

  await loadSelectedMatch();

  startLoop();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  void init();
}
