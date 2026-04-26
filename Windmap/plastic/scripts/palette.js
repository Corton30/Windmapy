// PALETTE — deux LUT pré-calculées (une par mode) (Look-Up Table)

import { etat } from "./config.js";

const LUT_SIZE = 256;

function construireLUT(couleurs) {  // Crée un tableau de 256 couleurs pré-calculées une seule fois, au chargement de la page
    const scale = d3.scaleSequential()
        .domain([0, 1])
        .interpolator(d3.interpolateRgbBasis(couleurs));
    const lut = new Uint8Array(LUT_SIZE * 3); // Tableau d'entiers légers où chaque couleur est décomposée en R, G, B
    for (let i = 0; i < LUT_SIZE; i++) {
        const c = d3.color(scale(i / (LUT_SIZE - 1)));
        lut[i*3] = c.r; lut[i*3+1] = c.g; lut[i*3+2] = c.b;
    }
    return lut;
}

// Palette A — flux de particules
export const lutParticule = construireLUT(["#14283c","#3c6e52","#c8b46e"]);

// Palette B — microplastiques
export const lutMicro = construireLUT(["#1a2e10","#5a5418","#a08828"]);

export function clampH(h) {
    return isNaN(h) ? 0 : Math.max(0, Math.min(1, h));
}

function getLUT() {
    return etat.modeParticule === "particule" ? lutParticule : lutMicro;
}

export function plasticRGB(h) {
    const lut = getLUT();
    const i   = Math.min(LUT_SIZE - 1, Math.floor(clampH(h) * LUT_SIZE)) * 3;
    return [lut[i], lut[i+1], lut[i+2]];
}

export function plasticCSS(h) {
    const lut = getLUT();
    const i   = Math.min(LUT_SIZE - 1, Math.floor(clampH(h) * LUT_SIZE)) * 3;
    return `rgb(${lut[i]},${lut[i+1]},${lut[i+2]})`;
}