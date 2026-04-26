// ========================================
// PARTICLES.JS - Système de particules canvas
// Responsable de :
// - Générer des particules légères en couche d'ambiance
// - Animer leur déplacement, leur taille et leur opacité
// - Rendre un effet visuel discret autour du jeu
// ========================================

"use strict";

const TEAM_COLORS = {
  Home: { r: 14, g: 82, b: 214 },
  Away: { r: 196, g: 44, b: 37 },
  Neutral: { r: 222, g: 198, b: 132 },
};

const DEFAULT_OPTIONS = {
  maxParticles: 120,
  lifeSeconds: 0.45,
  dotRadius: 2,
};

// Limite une valeur entre 0 et 1 (normalisation de coordonnées/intensité).
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// Convertit un point normalisé du terrain en coordonnées canvas à l'écran.
function toCanvasPoint(point, viewState) {
  return {
    x: viewState.pitchX + clamp01(point.x) * viewState.pitchW,
    y: viewState.pitchY + clamp01(point.y) * viewState.pitchH,
  };
}

// Crée une particule avec sa position, sa couleur et sa durée de vie.
function createParticle(point, color, options) {
  return {
    x: clamp01(point.x),
    y: clamp01(point.y),
    age: 0,
    life: options.lifeSeconds,
    color,
  };
}

// Résout une couleur depuis une clé d'équipe ou retourne la couleur passée.
function resolveColor(colorOrTeamKey) {
  if (!colorOrTeamKey) return TEAM_COLORS.Neutral;
  if (typeof colorOrTeamKey === "string") {
    return TEAM_COLORS[colorOrTeamKey] || TEAM_COLORS.Neutral;
  }
  return colorOrTeamKey;
}

// Fabrique et expose une instance de système de particules configurable.
export function createParticleSystem(userOptions = {}) {
  const options = {
    ...DEFAULT_OPTIONS,
    ...userOptions,
  };

  const particles = [];

  // Supprime toutes les particules actives.
  function reset() {
    particles.length = 0;
  }

  // Ajoute une ou plusieurs particules selon l'intensité demandée.
  function pushParticle(point, colorKey, intensity) {
    if (!point || particles.length >= options.maxParticles) return;

    const color = resolveColor(colorKey);
    const spawnCount = Math.max(1, Math.round(intensity || 1));
    for (
      let i = 0;
      i < spawnCount && particles.length < options.maxParticles;
      i += 1
    ) {
      particles.push(createParticle(point, color, options));
    }
  }

  // Émet une traînée légère de particules (généralement continue).
  function emitTrail(point, colorKey, intensity = 1) {
    pushParticle(point, colorKey, intensity);
  }

  // Met à jour l'âge des particules et retire celles arrivées en fin de vie.
  function update(deltaSeconds, viewState) {
    void viewState;

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.age += deltaSeconds;
      if (particle.age >= particle.life) {
        particles.splice(i, 1);
      }
    }
  }

  // Dessine toutes les particules visibles sur le canvas avec fondu d'opacité.
  function draw(ctx, viewState) {
    if (!particles.length) return;

    ctx.save();

    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i];
      const alpha = Math.max(0, 1 - particle.age / particle.life) * 0.62;
      const pos = toCanvasPoint(particle, viewState);

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, options.dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${alpha})`;
      ctx.fill();
    }

    ctx.restore();
  }

  return {
    reset,
    emitTrail,
    update,
    draw,
  };
}
