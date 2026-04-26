// PARTICULES — physique et deux modes de rendu

import { CONFIG, etat }            from "./config.js";
import { getVector, getHeat }      from "./champs.js";
import { clampH, plasticCSS }      from "./palette.js";
import { ctx, pathCanvas, sphere,
         projection }              from "./globe.js";
import { logCurrentMaxHeat }       from "./heatmap.js";
import { largeur, hauteur }        from "./config.js";

// Création d'une particule 
export function creerParticule(choisirFeature) {
    const f = choisirFeature();
    return {
        lon:        f.geometry.coordinates[0],
        lat:        f.geometry.coordinates[1],
        vx: 0, vy: 0, age: 0,
        vieMax:     Math.random() * CONFIG.VIE_MAX + CONFIG.VIE_MIN,
        jitterSeed: Math.random() * 1000,
        history:    []
    };
}

export function ajusterParticules(particules, n, choisirFeature) {
    while (particules.length < n) particules.push(creerParticule(choisirFeature));
    while (particules.length > n) particules.pop();
}

// Même seed → même décalage à chaque frame : pas de scintillement.
function jitter(seed, amplitude) {
    return ((Math.sin(seed * 127.1) * 43758.5453) % 1) * amplitude * 2 - amplitude;
}

// Mode A — flux continu 
function dessinerParticulesFlux(particules) {
    particules.forEach(p => {
        if (p.history.length < 2) return;
        const ratioVie = p.age / p.vieMax;
        const h = clampH(
            logCurrentMaxHeat > 0
                ? Math.log(1 + getHeat(p.lon, p.lat)) / logCurrentMaxHeat
                : 0
        );
        ctx.beginPath();
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = Math.min(1, Math.sin(ratioVie * Math.PI) * 1.5);
        ctx.strokeStyle = plasticCSS(h);
        ctx.moveTo(p.history[0][0], p.history[0][1]);
        for (let k = 1; k < p.history.length; k++)
            ctx.lineTo(p.history[k][0], p.history[k][1]);
        ctx.stroke();
    });
}

// Mode B — débris brisés
function dessinerParticulesDebris(particules) {
    particules.forEach(p => {
        if (p.history.length < 2) return;
        const ratioVie = p.age / p.vieMax;
        const h   = clampH(
            logCurrentMaxHeat > 0
                ? Math.log(1 + getHeat(p.lon, p.lat)) / logCurrentMaxHeat
                : 0
        );
        const hSq = h * h; // accentue la différence aux faibles concentrations

        ctx.beginPath();
        ctx.lineWidth   = 0.3 + hSq * 2.9;
        ctx.globalAlpha = Math.min(1, Math.sin(ratioVie * Math.PI) * 1.5) * (0.25 + hSq * 0.75);
        ctx.strokeStyle = plasticCSS(h);

        const amp = 0.4 + h * 1.4;
        ctx.moveTo(
            p.history[0][0] + jitter(p.jitterSeed,     amp),
            p.history[0][1] + jitter(p.jitterSeed + 1, amp)
        );
        for (let k = 1; k < p.history.length; k++) {
            ctx.lineTo(
                p.history[k][0] + jitter(p.jitterSeed + k * 2,     amp),
                p.history[k][1] + jitter(p.jitterSeed + k * 2 + 1, amp)
            );
        }
        ctx.stroke();
    });
}

// Boucle principale — physique + dispatch rendu 
export function dessinerParticules(particules, choisirFeature) {
    ctx.clearRect(0, 0, largeur, hauteur);
    if (etat.enInteraction) {
        particules.forEach(p => { p.history = []; }); // si on interagit avec l'écran les particules s'effacent
        return;
    }

    ctx.save();
    ctx.beginPath(); pathCanvas(sphere); ctx.clip();
    ctx.globalCompositeOperation = "source-over";

    const centreGlobe = projection.invert([largeur / 2, hauteur / 2]);

    // Mise à jour physique 
    particules.forEach(p => {
        const [dx, dy] = getVector(p.lon, p.lat);
        p.vx = p.vx * CONFIG.INERTIE + dx * CONFIG.FORCE; // formule inertie (mouvement naturel)
        p.vy = p.vy * CONFIG.INERTIE + dy * CONFIG.FORCE;

        const cosLat = Math.max(Math.cos(p.lat * Math.PI / 180), 0.01); // Correction sphérique pour simuler sur une sphère
        p.lon += p.vx / cosLat;
        p.lat += p.vy;
        p.age++;

        if (p.lon > 180)  p.lon -= 360;
        if (p.lon < -180) p.lon += 360;
        p.lat = Math.max(-89, Math.min(89, p.lat));

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (p.age > p.vieMax || (p.age > 10 && speed < CONFIG.VITESSE_MORT)) { // particule morte ou coincée
            Object.assign(p, creerParticule(choisirFeature)); return;          // Renaissance de la particule
        }

        if (d3.geoDistance(centreGlobe, [p.lon, p.lat]) < Math.PI / 2) { // si particule visible devant le globe on la dessine
            const coordPixel = projection([p.lon, p.lat]);
            p.history.push(coordPixel);
            if (p.history.length > CONFIG.TRAIL_LEN) p.history.shift();
        } else {
            p.history = []; // sinon on ne la dessine plus
        }
    });

    // Dispatch selon le mode actif
    if (etat.modeParticule === "particule") {
        dessinerParticulesFlux(particules);
    } else {
        dessinerParticulesDebris(particules);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
}