// HEATMAP — mise à jour et rendu

import { CONFIG, etat }                          from "./config.js";
import { heatField, getHeat }                    from "./champs.js";
import { plasticRGB }                            from "./palette.js";
import { ctxHeat, offCtxHeat, offCanvasHeat,
         pathCanvasHeat, sphere }                from "./globe.js";
import { largeur, hauteur }                      from "./config.js";

let frameCount        = 0;
export let currentMaxHeat    = 1;
export let logCurrentMaxHeat = 0;

export function mettreAJourHeatmap(particules) {
    if (etat.enInteraction) return;

    // Décroissance (chaleur s'estompe petit à petit quand les particules quittent la zone)
    for (let i = 0; i < heatField.data.length; i++)
        heatField.data[i] *= CONFIG.DECAY_HEAT;

    // Injection depuis les positions actuelles des particules
    particules.forEach(p => {
        const i = Math.floor((p.lon + 180) / 360 * heatField.nx);
        const j = Math.floor((90 - p.lat)  / 180 * heatField.ny);
        if (i >= 0 && i < heatField.nx && j >= 0 && j < heatField.ny)
            heatField.data[j * heatField.nx + i] += CONFIG.INJECT_HEAT;
    });

    // Diffusion spatiale (lissage 3×3)
    const copy = new Float32Array(heatField.data);
    for (let j = 1; j < heatField.ny - 1; j++) {
        for (let i = 1; i < heatField.nx - 1; i++) {
            let sum = 0;
            for (let dj = -1; dj <= 1; dj++)
                for (let di = -1; di <= 1; di++)
                    sum += copy[(j + dj) * heatField.nx + (i + di)];
            heatField.data[j * heatField.nx + i] = sum / 9;
        }
    }

    // Recalibrage du maximum toutes les 60 frames (1 seconde)
    frameCount++;
    if (frameCount % 60 === 0) {
        let maxVal = 0;
        for (let i = 0; i < heatField.data.length; i++)
            if (heatField.data[i] > maxVal) maxVal = heatField.data[i];
        currentMaxHeat    = Math.max(maxVal, 1);
        logCurrentMaxHeat = Math.log(1 + currentMaxHeat);
    }
}

export function dessinerHeatmap() {
    offCtxHeat.clearRect(0, 0, largeur, hauteur);
    const imageData = offCtxHeat.createImageData(largeur, hauteur); // avec cela on modifie directement la mémoire vidéo
    const data = imageData.data;

    for (let y = 0; y < hauteur; y += CONFIG.HEAT_STEP) {
        for (let x = 0; x < largeur; x += CONFIG.HEAT_STEP) {
            const geo = /* projection */ window._projection.invert([x, y]);
            if (!geo) continue;
            const h = Math.max(0, Math.min(1,
                logCurrentMaxHeat > 0
                    ? Math.log(1 + getHeat(geo[0], geo[1])) / logCurrentMaxHeat
                    : 0
            ));
            if (h < CONFIG.HEAT_SEUIL) continue;
            const [r, g, b] = plasticRGB(h);
            const alpha = h * 255 * CONFIG.HEAT_ALPHA;
            for (let dy = 0; dy < CONFIG.HEAT_STEP; dy++) {
                for (let dx = 0; dx < CONFIG.HEAT_STEP; dx++) {
                    const idx = ((y + dy) * largeur + (x + dx)) * 4;
                    data[idx] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = alpha;
                }
            }
        }
    }
    offCtxHeat.putImageData(imageData, 0, 0);
    ctxHeat.clearRect(0, 0, largeur, hauteur);
    ctxHeat.save();
    ctxHeat.beginPath(); pathCanvasHeat(sphere); ctxHeat.clip();
    ctxHeat.filter = "blur(8px)";
    ctxHeat.drawImage(offCanvasHeat, 0, 0);
    ctxHeat.restore();
    ctxHeat.filter = "none";
}