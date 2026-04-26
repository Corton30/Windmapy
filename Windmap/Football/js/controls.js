// ========================================
// CONTROLS.JS - Gestion des interactions utilisateur
// Responsable de :
// - Câbler les événements des boutons et sliders
// - Mettre à jour l'état en réaction aux interactions
// - Gérer la lecture (play/pause, vitesse)
// - Basculer les options d'affichage
// ========================================

"use strict";

// Définit le label du bouton play/pause
export function setPlayPauseLabel(playPauseBtn, isPlaying) {
  if (!playPauseBtn) return;
  playPauseBtn.textContent = isPlaying ? "||" : ">";
}

// Définit le label du bouton masquer/afficher balle
export function setBallToggleLabel(ballToggleBtn, showBall) {
  if (!ballToggleBtn) return;
  ballToggleBtn.textContent = showBall ? "Masquer balle" : "Afficher balle";
}

// Définit le label du bouton masquer/afficher particules
export function setParticlesToggleLabel(particlesToggleBtn, showParticles) {
  if (!particlesToggleBtn) return;
  particlesToggleBtn.textContent = showParticles
    ? "Masquer particules"
    : "Afficher particules";
}

// ========== CÂBLAGE PRINCIPAL DES CONTRÔLES ==========

// Connecte tous les éléments UI aux gestionnaires d'événements
export function wireControls(options) {
  const {
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
  } = options; // Destructuration pour accéder facilement aux éléments et fonctions nécessaires

  // Fonction utilitaire : avance ou recule d'un nombre de frames
  function seekByFrames(frameDelta) {
    const teamData = getCurrentTeamData();
    if (!teamData || !teamData.frames || !teamData.frames.length) return;

    const maxIndex = teamData.frames.length - 1;
    const nextIndex = Math.max(
      0,
      Math.min(maxIndex, playback.frameIndex + frameDelta),
    );
    playback.frameIndex = nextIndex;
    playback.frameAccumulator = 0;
    updateFrameInfo();
  }

  // === INITIAL STATE ===
  setBallToggleLabel(ballToggleBtn, viewOptions.showBall);
  setParticlesToggleLabel(particlesToggleBtn, viewOptions.showParticles);

  // === ÉVÉNEMENT : SÉLECTION D'ÉQUIPE ===
  teamSelect.addEventListener("change", function () {
    dataState.selectedTeam = teamSelect.value;
    playback.frameIndex = 0;
    playback.frameAccumulator = 0;
    invalidateHeatmapCache(); // Invalide le cache de heatmap
    populatePlayerSelect(); // Met à jour la liste des joueurs en fonction de l'équipe sélectionnée
    updateFrameSliderBounds(); // Met à jour les limites du slider de temps en fonction de la durée de l'équipe sélectionnée
    updateFrameInfo(); // Met à jour les informations de la frame affichée (temps, période, etc.) pour refléter le changement d'équipe
  });

  // === ÉVÉNEMENT : SÉLECTION DE JOUEUR ===
  playerSelect.addEventListener("change", function () {
    dataState.selectedPlayer = playerSelect.value;
    invalidateHeatmapCache(); // Invalide le cache de heatmap pour forcer la régénération avec le nouveau joueur sélectionné
  });

  // === ÉVÉNEMENT : PLAY / PAUSE ===
  playPauseBtn.addEventListener("click", function () {
    playback.isPlaying = !playback.isPlaying;
    setPlayPauseLabel(playPauseBtn, playback.isPlaying); // Met à jour le label du bouton
  });

  // === ÉVÉNEMENTS : NAVIGATION RAPIDE ===
  // Rewind : recule de 5 secondes
  if (rewindBtn) {
    rewindBtn.addEventListener("click", function () {
      seekByFrames(-Math.round(playback.frameRateHz * 5));
    });
  }

  // Fast Forward : avance de 5 secondes
  if (fastForwardBtn) {
    fastForwardBtn.addEventListener("click", function () {
      seekByFrames(Math.round(playback.frameRateHz * 5));
    });
  }

  // Go Start : aller au début
  if (goStartBtn) {
    goStartBtn.addEventListener("click", function () {
      const teamData = getCurrentTeamData();
      if (!teamData || !teamData.frames || !teamData.frames.length) return;
      playback.frameIndex = 0;
      playback.frameAccumulator = 0;
      updateFrameInfo();
    });
  }

  // Go End : aller à la fin
  if (goEndBtn) {
    goEndBtn.addEventListener("click", function () {
      const teamData = getCurrentTeamData();
      if (!teamData || !teamData.frames || !teamData.frames.length) return;
      playback.frameIndex = teamData.frames.length - 1;
      playback.frameAccumulator = 0;
      playback.isPlaying = false;
      setPlayPauseLabel(playPauseBtn, playback.isPlaying);
      updateFrameInfo();
    });
  }

  // Step Back : recule de 2 frames
  if (stepBackBtn) {
    stepBackBtn.addEventListener("click", function () {
      seekByFrames(-2);
    });
  }

  // Step Forward : avance de 2 frames
  if (stepForwardBtn) {
    stepForwardBtn.addEventListener("click", function () {
      seekByFrames(2);
    });
  }

  // === ÉVÉNEMENT : BASCULE AFFICHAGE BALLE ===
  if (ballToggleBtn) {
    ballToggleBtn.addEventListener("click", function () {
      viewOptions.showBall = !viewOptions.showBall;
      setBallToggleLabel(ballToggleBtn, viewOptions.showBall);
    });
  }

  // === ÉVÉNEMENT : BASCULE AFFICHAGE PARTICULES ===
  if (particlesToggleBtn) {
    particlesToggleBtn.addEventListener("click", function () {
      viewOptions.showParticles = !viewOptions.showParticles;
      setParticlesToggleLabel(particlesToggleBtn, viewOptions.showParticles);
    });
  }

  // === ÉVÉNEMENT : SÉLECTION VITESSE ===
  speedSelect.addEventListener("change", function () {
    const speed = Number(speedSelect.value);
    playback.speed = Number.isFinite(speed) ? speed : 1;
  });

  // === ÉVÉNEMENT : SLIDER DE TEMPS ===
  frameSlider.addEventListener("input", function () {
    const teamData = getCurrentTeamData();
    const minuteValue = Number(frameSlider.value);
    const safeMinute = Number.isFinite(minuteValue) ? minuteValue : 0;
    playback.frameIndex = findNearestFrameIndexByMinute(teamData, safeMinute);
    playback.frameAccumulator = 0;
    updateFrameInfo();
  });
}
