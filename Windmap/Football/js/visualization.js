// ========================================
// VISUALIZATION.JS - Fonctions de dessin canvas
// Responsable de :
// - Dessiner le terrain de football
// - Tracer les zones réglementaires et buts
// - Renderer les positions des joueurs
// - Afficher la position de la balle
// ========================================

"use strict";

// Dessine les zones de réparation et zones de but sur le terrain
function drawPenaltyAreas(ctx, pitchX, pitchY, pitchW, pitchH, lineColor) {
  const penaltyDepth = pitchW * (16.5 / 105);
  const penaltyWidth = pitchH * (40.32 / 70);
  const goalAreaDepth = pitchW * (5.5 / 105);
  const goalAreaWidth = pitchH * (18.32 / 70);

  const penaltyY = pitchY + (pitchH - penaltyWidth) / 2;
  const goalAreaY = pitchY + (pitchH - goalAreaWidth) / 2;

  ctx.save();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = Math.max(2, pitchW * 0.003);

  ctx.strokeRect(pitchX, penaltyY, penaltyDepth, penaltyWidth);
  ctx.strokeRect(pitchX, goalAreaY, goalAreaDepth, goalAreaWidth);

  ctx.strokeRect(
    pitchX + pitchW - penaltyDepth,
    penaltyY,
    penaltyDepth,
    penaltyWidth,
  );
  ctx.strokeRect(
    pitchX + pitchW - goalAreaDepth,
    goalAreaY,
    goalAreaDepth,
    goalAreaWidth,
  );

  ctx.restore();
}

// Dessine les cages/buts aux deux extrémités du terrain
function drawGoals(ctx, pitchX, pitchY, pitchW, pitchH, lineColor) {
  const goalWidth = pitchH * (7.32 / 70);
  const goalDepth = pitchW * 0.022;
  const goalY = pitchY + (pitchH - goalWidth) / 2;

  ctx.save();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = Math.max(2, pitchW * 0.003);

  ctx.strokeRect(pitchX - goalDepth, goalY, goalDepth, goalWidth);
  ctx.beginPath();
  ctx.moveTo(pitchX, goalY);
  ctx.lineTo(pitchX, goalY + goalWidth);
  ctx.stroke();

  ctx.strokeRect(pitchX + pitchW, goalY, goalDepth, goalWidth);
  ctx.beginPath();
  ctx.moveTo(pitchX + pitchW, goalY);
  ctx.lineTo(pitchX + pitchW, goalY + goalWidth);
  ctx.stroke();

  ctx.restore();
}

// ========== DESSIN PRINCIPAL ==========

// Dessine le terrain complet : gazon, ligne médiane, cercle de centre, zones réglementaires
export function drawPitch(ctx, viewState) {
  const width = viewState.width;
  const height = viewState.height;
  const line = "#e9fff0";
  const grassA = "#75a95f";
  const grassB = "#6ea058";

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = grassA;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 10; i += 1) {
    const stripeX = (i * width) / 10;
    const stripeW = width / 10;
    ctx.fillStyle = i % 2 === 0 ? grassA : grassB;
    ctx.fillRect(stripeX, 0, stripeW, height);
  }

  const pitchX = viewState.pitchX;
  const pitchY = viewState.pitchY;
  const pitchW = viewState.pitchW;
  const pitchH = viewState.pitchH;

  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.strokeRect(pitchX, pitchY, pitchW, pitchH);

  ctx.beginPath();
  ctx.moveTo(width / 2, pitchY);
  ctx.lineTo(width / 2, height - pitchY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(width / 2, height / 2, width * 0.08, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(width / 2, height / 2, width * 0.0035, 0, Math.PI * 2);
  ctx.fillStyle = line;
  ctx.fill();

  drawPenaltyAreas(ctx, pitchX, pitchY, pitchW, pitchH, line);
  drawGoals(ctx, pitchX, pitchY, pitchW, pitchH, line);
}

// Dessine la balle sur le terrain
export function drawBall(ctx, ballPoint, viewState, normalizedToCanvas) {
  if (!ballPoint) return;

  const pos = normalizedToCanvas(ballPoint.x, ballPoint.y, false);
  const radius = Math.max(3.2, viewState.width * 0.0042);

  ctx.save();
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#fff8e5";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#2d2d2d";
  ctx.stroke();
  ctx.restore();
}

// Dessine une traînée simple derrière la balle
export function drawBallTrail(ctx, ballPoints, viewState, normalizedToCanvas) {
  if (!ballPoints || ballPoints.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255, 248, 229, 0.28)";
  ctx.lineWidth = Math.max(2, viewState.width * 0.0025);

  ctx.beginPath();
  for (let i = 0; i < ballPoints.length; i += 1) {
    const point = ballPoints[i];
    if (!point) continue;
    const pos = normalizedToCanvas(point.x, point.y, false);
    if (i === 0) ctx.moveTo(pos.x, pos.y);
    else ctx.lineTo(pos.x, pos.y);
  }
  ctx.stroke();

  for (let i = 0; i < ballPoints.length; i += 1) {
    const point = ballPoints[i];
    if (!point) continue;

    const pos = normalizedToCanvas(point.x, point.y, false);
    const alpha = 0.12 + (i / Math.max(1, ballPoints.length - 1)) * 0.25;
    const radius = Math.max(1.8, viewState.width * 0.002) + i * 0.12;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 248, 229, ${alpha})`;
    ctx.fill();
  }

  ctx.restore();
}

// Dessine une traînée discrète derrière un ou plusieurs joueurs sélectionnés
export function drawPlayersTrail(
  ctx,
  trails,
  teamKey,
  viewState,
  normalizedToCanvas,
) {
  if (!trails || !trails.length) return;

  const color = teamKey === "Home" ? "31, 85, 198" : "212, 74, 47";

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2.4, viewState.width * 0.0024);

  for (let t = 0; t < trails.length; t += 1) {
    const trail = trails[t];
    if (!trail || trail.length < 2) continue;

    ctx.beginPath();
    for (let i = 0; i < trail.length; i += 1) {
      const point = trail[i];
      if (!point) continue;
      const pos = normalizedToCanvas(point.x, point.y, false);
      if (i === 0) ctx.moveTo(pos.x, pos.y);
      else ctx.lineTo(pos.x, pos.y);
    }
    ctx.strokeStyle = `rgba(${color}, 0.46)`;
    ctx.stroke();

    for (let i = 0; i < trail.length; i += 1) {
      const point = trail[i];
      if (!point) continue;
      const pos = normalizedToCanvas(point.x, point.y, false);
      const alpha = 0.12 + (i / Math.max(1, trail.length - 1)) * 0.38;
      const radius = Math.max(1.6, viewState.width * 0.002) + i * 0.05;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${alpha})`;
      ctx.fill();
    }

    const tail = trail[trail.length - 1];
    if (tail) {
      const tailPos = normalizedToCanvas(tail.x, tail.y, false);
      ctx.beginPath();
      ctx.arc(
        tailPos.x,
        tailPos.y,
        Math.max(2.2, viewState.width * 0.0023),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(${color}, 0.6)`;
      ctx.fill();
    }
  }

  ctx.restore();
}

// Dessine tous les joueurs d'une équipe à leur position actuelle
export function drawTeamPlayers(
  ctx,
  frame,
  teamKey,
  viewState,
  normalizedToCanvas,
) {
  if (!frame || !frame.players) return;

  const color = teamKey === "Home" ? "#1f55c6" : "#d44a2f";
  const radius = Math.max(3.6, viewState.width * 0.0048);
  const playerIds = Object.keys(frame.players);

  ctx.save();
  for (let i = 0; i < playerIds.length; i += 1) {
    const point = frame.players[playerIds[i]];
    if (!point) continue;

    const pos = normalizedToCanvas(point.x, point.y, false);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.stroke();
  }
  ctx.restore();
}
