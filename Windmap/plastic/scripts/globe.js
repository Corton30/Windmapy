// GLOBE — projection orthographique et couches DOM

import { largeur, hauteur, CONFIG } from "./config.js";

export const projection = d3.geoOrthographic() // Terre ronde
    .translate([largeur / 2, hauteur / 2])     // Définition du centre
    .scale(CONFIG.ECHELLE_INITIALE)            // niveau de zoom initial
    .rotate([-25, -12, 0]);                    // inclinaison de départ

export const sphere    = { type: "Sphere" };
export const graticule = d3.geoGraticule();

// Création des couches DOM
d3.select("#ma-carte").html("");

const conteneur = d3.select("#ma-carte")
    .style("position", "relative")
    .style("width",  largeur + "px")
    .style("height", hauteur + "px");

// Couche 1 — SVG fond (océan + graticule)
const svgFond = conteneur.append("svg")
    .attr("width", largeur).attr("height", hauteur)
    .style("position","absolute").style("top","0").style("left","0").style("z-index",1);
export const gFond = svgFond.append("g");

// Couche 2 — Canvas heatmap
const canvasHeat = conteneur.append("canvas")
    .attr("width", largeur).attr("height", hauteur)
    .style("position","absolute").style("top","0").style("left","0").style("z-index",2)
    .style("pointer-events","none");
export const ctxHeat = canvasHeat.node().getContext("2d");

// Canvas offscreen pour le rendu heatmap avant flou
export const offCanvasHeat = document.createElement("canvas");
offCanvasHeat.width  = largeur;
offCanvasHeat.height = hauteur;
export const offCtxHeat = offCanvasHeat.getContext("2d");

// Couche 3 — Canvas particules
const canvas = conteneur.append("canvas")
    .attr("width", largeur).attr("height", hauteur)
    .style("position","absolute").style("top","0").style("left","0").style("z-index",3)
    .style("pointer-events","none");
export const ctx = canvas.node().getContext("2d");

// Couche 4 — SVG pays
const svgPays = conteneur.append("svg")
    .attr("width", largeur).attr("height", hauteur)
    .style("position","absolute").style("top","0").style("left","0").style("z-index",4)
    .style("pointer-events","none");
export const gPays = svgPays.append("g");

// svgFond exposé pour attacher drag/zoom dans main.js
export { svgFond, conteneur };

// Chemins D3 
export const path           = d3.geoPath().projection(projection);
export const pathCanvas     = d3.geoPath().projection(projection).context(ctx);
export const pathCanvasHeat = d3.geoPath().projection(projection).context(ctxHeat);

// Mise à jour projection (appelée à chaque frame) 
export function mettreAJourProjection() {
    gFond.selectAll(".ocean").attr("d", path);
    gFond.selectAll(".graticule").attr("d", path);
    gPays.selectAll(".pays").attr("d", path);
}