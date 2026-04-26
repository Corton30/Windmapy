// MAIN 

import { CONFIG, etat, largeur, hauteur } from "./config.js";
import { projection, sphere, graticule,
         gFond, gPays, svgFond, conteneur,
         path, mettreAJourProjection }     from "./globe.js";
import { field, heatField }               from "./champs.js";
import { mettreAJourHeatmap,
         dessinerHeatmap }                from "./heatmap.js";
import { creerParticule, ajusterParticules,
         dessinerParticules }             from "./particule.js";
import { creerTooltip, gererSurvol }      from "./tooltip.js";
import { creerLegende }                   from "./legende.js";

// Exposé pour heatmap.js (évite une dépendance circulaire)
export let LOG_MAX_FIXE_REF = 1;

// Initialisation du DOM partagé
const tt      = creerTooltip(conteneur);
const legende = creerLegende(conteneur);

// Chargement des données 
Promise.all([
    d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson"),
    d3.json("data/microplastics.geojson"),
    d3.json("data/courants.json")
]).then(([dataGeo, dataPlastique, dataCourants]) => {

    // Courants marins
    field.nx    = dataCourants.nx;
    field.ny    = dataCourants.ny;
    field.dataU = new Float32Array(dataCourants.dataU);
    field.dataV = new Float32Array(dataCourants.dataV);

    // Normalisation des valeurs de pollution
    const allValues = dataPlastique.features
        .map(f => parseFloat(f.properties.Microplastics_measurement) || 1)
        .sort((a, b) => a - b);
    const MAX_POLLUTION_FIXE = allValues[Math.floor(allValues.length * 0.95)] || 1;
    LOG_MAX_FIXE_REF = Math.log(1 + MAX_POLLUTION_FIXE);

    // Poids de spawn pondérés par log(valeur)
    const poidsSpawn = dataPlastique.features.map(f =>
        Math.log(1 + (parseFloat(f.properties.Microplastics_measurement) || 1))
    );
    const totalPoids = poidsSpawn.reduce((s, w) => s + w, 0);

    function choisirFeature() {
        let r = Math.random() * totalPoids;
        for (let i = 0; i < dataPlastique.features.length; i++) {
            r -= poidsSpawn[i];
            if (r <= 0) return dataPlastique.features[i];
        }
        return dataPlastique.features[dataPlastique.features.length - 1];
    }

    // Fond géographique 
    gFond.append("path").datum(sphere).attr("class","ocean").attr("d",path)
        .attr("fill","#071e38").attr("stroke","#041428").attr("stroke-width",1);
    gFond.append("path").datum(graticule).attr("class","graticule").attr("d",path)
        .attr("fill","none").attr("stroke","rgba(255,255,255,0.05)").attr("stroke-width",0.5);
    gPays.selectAll(".pays").data(dataGeo.features).join("path").attr("class","pays").attr("d",path)
        .attr("fill","#111e14").attr("stroke","#243428").attr("stroke-width",0.6);

    // Particules
    let particules = [];
    ajusterParticules(particules, CONFIG.NB_PARTICULES, choisirFeature);

    d3.select("#particle-slider").on("input", function () {
        ajusterParticules(particules, +this.value, choisirFeature);
        d3.select("#particle-count-display").text(+this.value);
    });

    // Bouton Heatmap 
    d3.select("#btn-heat").on("click", async function () {
        etat.afficherHeatmap = !etat.afficherHeatmap;
        if (!etat.afficherHeatmap) {
            const { ctxHeat } = await import("./globe.js"); // import dynamique si besoin
            ctxHeat.clearRect(0, 0, largeur, hauteur);
        }
        d3.select("#btn-heat").text(etat.afficherHeatmap ? "🔥 Heatmap ON" : "🔥 Heatmap OFF");
    });

    // Bouton Mode 
    d3.select("#btn-mode").on("click", function () {
        etat.modeParticule = etat.modeParticule === "particule" ? "microplastique" : "particule";
        d3.select("#btn-mode").text(
            etat.modeParticule === "particule" ? "Mode : Particules" : "Mode : Microplastiques"
        );
        legende.mettreAJour();
        particules.forEach(p => { p.history = []; });
    });

    // Tooltip — survol 
    let densite_lissee = 0;
    svgFond.on("mousemove", function (event) {
        const densiteBrute = gererSurvol(event, {
            projection, largeur, hauteur, particules,
            dataGeo, dataPlastique, tt,
            logMaxFixe: LOG_MAX_FIXE_REF
        });
        // Lissage exponentiel centralisé ici
        if (densiteBrute !== undefined)
            densite_lissee = densite_lissee * 0.88 + densiteBrute * 0.12;
    });
    svgFond.on("mouseleave", () => tt.el.style("opacity","0"));

    // Boucle de rendu 
    function render() {
        mettreAJourProjection();
        mettreAJourHeatmap(particules);
        if (etat.afficherHeatmap) dessinerHeatmap();
        dessinerParticules(particules, choisirFeature);
    }

    // Interactions — zoom et drag 
    const zoom = d3.zoom().scaleExtent([0.6, 6])
        .on("start", () => { etat.enInteraction = true; })
        .on("zoom",  (event) => { projection.scale(CONFIG.ECHELLE_INITIALE * event.transform.k); render(); })
        .on("end",   () => { etat.enInteraction = false; render(); });
    svgFond.call(zoom).on("mousedown.zoom", null);

    let rotate = projection.rotate();
    function tickRotation() {
        if (!etat.enInteraction) {
            rotate[0] += CONFIG.ROTATION_VITESSE;
            projection.rotate(rotate);
            render();
        }
    }
    const timer = d3.timer(tickRotation);

    svgFond.call(d3.drag()
        .on("start", () => { timer.stop(); etat.enInteraction = true; })
        .on("drag", (event) => {
            rotate = projection.rotate();
            rotate[0] += event.dx * CONFIG.DRAG_SENSIBILITE;
            rotate[1] -= event.dy * CONFIG.DRAG_SENSIBILITE;
            rotate[1]  = Math.max(-85, Math.min(85, rotate[1]));
            projection.rotate(rotate); render();
        })
        .on("end", () => { etat.enInteraction = false; timer.restart(tickRotation); })
    );

    // Expose la projection pour heatmap.js
    window._projection = projection;

    render();

}).catch(error => { console.error("Erreur critique :", error); });