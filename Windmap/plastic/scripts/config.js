// CONFIG — paramètres globaux de la simulation
export const largeur = 900;
export const hauteur = 600;

export const CONFIG = {
    ROTATION_VITESSE:   0.08,
    DRAG_SENSIBILITE:   0.35,
    INERTIE:            0.90,
    FORCE:              0.05,
    VIT_REDUITE:        0.6,
    DECAY_HEAT:         0.985,
    INJECT_HEAT:        0.05,
    VIE_MIN:            200,
    VIE_MAX:            400,
    TRAIL_LEN:          5,
    VITESSE_MORT:       0.0001,
    HEAT_STEP:          4,
    HEAT_SEUIL:         0.05,
    HEAT_ALPHA:         0.55,
    NB_PARTICULES:      3000,
    ECHELLE_INITIALE:   290,
    TOOLTIP_RAYON_MAX:  0.015,
    DENSITE_MAX:        200,
};

export const etat = {
    modeParticule: "particule",   // "particule" | "microplastique"
    enInteraction: false,
    afficherHeatmap: true,
};