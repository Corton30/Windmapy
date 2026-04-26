// CHAMPS — vecteurs de courants et grille heatmap

import { CONFIG } from "./config.js";

export const field = { nx: 0, ny: 0, dataU: null, dataV: null }; // données courants marins: dataU (Est-Ouest) dataV (Nord-Sud)

export const heatField = {
    nx: 180, ny: 90,
    data: new Float32Array(180 * 90) // Float32Array:  structure plus rapide à lire pour le processeur 
};

export function getVector(lon, lat) {
    if (!field.nx || !field.ny) return [0, 0];
    let lon_norm = (lon + 180) % 360;            // Normalisation spatiale (Terre ronde)
    if (lon_norm < 0) lon_norm += 360;
    const x = Math.max(0, Math.min(Math.floor((lon_norm / 360) * field.nx), field.nx - 1));
    const y = Math.max(0, Math.min(Math.floor(((lat + 90)  / 180) * field.ny), field.ny - 1));
    const index = y * field.nx + x; // formule indice 1D
    return [
        (field.dataU[index] || 0) * CONFIG.VIT_REDUITE,
        (field.dataV[index] || 0) * CONFIG.VIT_REDUITE
    ];
}

export function getHeat(lon, lat) {
    const i  = (lon + 180) / 360 * heatField.nx;
    const j  = (90 - lat)  / 180 * heatField.ny;
    const fi = Math.floor(i), ci = Math.min(fi + 1, heatField.nx - 1); // point haut-gauche
    const fj = Math.floor(j), cj = Math.min(fj + 1, heatField.ny - 1); // point bas-droite
    const tx = i - fi, ty = j - fj;                                    // Distances entre les points
    const h00 = heatField.data[fj * heatField.nx + fi] || 0;
    const h10 = heatField.data[fj * heatField.nx + ci] || 0;
    const h01 = heatField.data[cj * heatField.nx + fi] || 0;
    const h11 = heatField.data[cj * heatField.nx + ci] || 0;
    return h00*(1-tx)*(1-ty) + h10*tx*(1-ty) + h01*(1-tx)*ty + h11*tx*ty; // formule interpolation bilinéaire
}