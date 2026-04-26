// LÉGENDE — barre de couleur + labels de mode

import { etat } from "./config.js";

export function creerLegende(conteneur) {
    const svg = conteneur.append("svg")
        .attr("width",90).attr("height",175)
        .style("position","absolute").style("bottom","30px").style("right","30px")
        .style("z-index",10).style("pointer-events","none");

    const defs = svg.append("defs");
    const grad = defs.append("linearGradient").attr("id","legendGrad") // utilise <defs> pour un dégradé linéaire
        .attr("x1","0").attr("y1","1").attr("x2","0").attr("y2","0");

    const stops = {
        faible: grad.append("stop").attr("offset","0%"),
        moyen:  grad.append("stop").attr("offset","50%"),
        fort:   grad.append("stop").attr("offset","100%"),
    };

    const g = svg.append("g").attr("transform","translate(10,10)");
    g.append("rect").attr("x",0).attr("y",0).attr("width",14).attr("height",120)
        .attr("rx",3).attr("fill","url(#legendGrad)");

    [{y:0,label:"Élevée"},{y:60,label:"Modérée"},{y:120,label:"Faible"}].forEach(t => {
        g.append("line").attr("x1",14).attr("y1",t.y).attr("x2",19).attr("y2",t.y)
            .attr("stroke","rgba(160,180,160,0.5)").attr("stroke-width",1);
        g.append("text").attr("x",23).attr("y",t.y+4)
            .attr("fill","rgba(160,180,160,0.8)").attr("font-size","10px")
            .attr("font-family","'Segoe UI',system-ui,sans-serif").text(t.label);
    });

    const modeLabel = g.append("text").attr("x",15).attr("y",138)
        .attr("fill","rgba(140,160,140,0.7)").attr("font-size","7px")
        .attr("font-family","'Segoe UI',system-ui,sans-serif").attr("text-anchor","middle");
    const typeLabel = g.append("text").attr("x",15).attr("y",150)
        .attr("fill","rgba(120,140,120,0.5)").attr("font-size","6px")
        .attr("font-family","'Segoe UI',system-ui,sans-serif").attr("text-anchor","middle");

    function mettreAJour() {
        if (etat.modeParticule === "particule") {
            stops.faible.attr("stop-color","#14283c");
            stops.moyen .attr("stop-color","#3c6e52");
            stops.fort  .attr("stop-color","#c8b46e");
            modeLabel.text("Particules");
            typeLabel.text("flux continu");
        } else {
            stops.faible.attr("stop-color","#1a2e10");
            stops.moyen .attr("stop-color","#5a5418");
            stops.fort  .attr("stop-color","#a08828");
            modeLabel.text("Microplastiques");
            typeLabel.text("débris — jitter");
        }
    }

    mettreAJour();
    return { mettreAJour };
}