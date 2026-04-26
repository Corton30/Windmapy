// TOOLTIP — affichage contextuel en trois états :

import { CONFIG }       from "./config.js";
import { clampH, plasticCSS } from "./palette.js";
import { LOG_MAX_FIXE_REF }   from "./main.js"; 

// Construction du DOM du tooltip 
export function creerTooltip(conteneur) {
    const tooltip = conteneur.append("div")
        .style("position","absolute").style("bottom","14px").style("left","30px")
        .style("z-index",10).style("background","rgba(5,12,25,0.90)")
        .style("border","1px solid rgba(180,140,80,0.25)").style("border-radius","10px")
        .style("padding","11px 15px").style("font-family","'Segoe UI',system-ui,sans-serif")
        .style("color","#b0c4c8").style("pointer-events","none")
        .style("min-width","210px").style("max-width","280px")
        .style("opacity","0").style("transition","opacity 0.18s");

    const tt = {
        el:       tooltip,
        coords:   tooltip.append("div").style("font-size","10px").style("color","#4a6a6a").style("margin-bottom","7px").style("letter-spacing","0.04em"),
        location: tooltip.append("div").style("font-size","12px").style("font-weight","600").style("color","#8a7a5a").style("margin-bottom","2px"),
        country:  tooltip.append("div").style("font-size","10px").style("color","#5a7a7a").style("margin-bottom","8px"),
    };
    tooltip.append("div").style("border-top","0.5px solid rgba(180,140,80,0.2)").style("margin-bottom","8px");
    const row = tooltip.append("div").style("display","flex").style("align-items","baseline").style("gap","5px").style("margin-bottom","4px");
    tt.value  = row.append("div").style("font-size","18px").style("font-weight","700");
    tt.unit   = row.append("div").style("font-size","10px").style("color","#5a7a7a").style("max-width","130px").style("line-height","1.3");
    tt.type   = tooltip.append("div").style("font-size","10px").style("padding","2px 7px").style("border-radius","99px").style("display","inline-block").style("margin-bottom","7px");

    const barWrap = tooltip.append("div");
    barWrap.append("div").style("font-size","9px").style("color","#4a6a6a").style("margin-bottom","3px").text("Échelle de concentration");
    tt.barBg = barWrap.append("div")
        .style("width","100%").style("height","6px").style("border-radius","3px")
        .style("background","linear-gradient(to right,#1a2e10,#5a5418,#a08828)")
        .style("position","relative").style("overflow","hidden");
    tt.cursor = tt.barBg.append("div")
        .style("position","absolute").style("top","0").style("width","3px").style("height","100%")
        .style("background","rgba(255,255,255,0.85)").style("border-radius","2px")
        .style("transform","translateX(-50%)").style("left","0%");
    tt.source = tooltip.append("div")
        .style("font-size","9px").style("color","#3a5a5a")
        .style("margin-top","6px").style("border-top","0.5px solid rgba(180,140,80,0.15)").style("padding-top","5px");

    return tt;
}

// Détection géographique 
export function detecterOcean(lon, lat) {
    if (lat > 66)  return "Océan Arctique";
    if (lat < -60) return "Océan Austral";
    if (lat > 30 && lat < 46 && lon > -6  && lon < 42)   return "Mer Méditerranée";
    if (lat > 12 && lat < 30 && lon > 32  && lon < 43)   return "Mer Rouge";
    if (lat > 22 && lat < 31 && lon > 48  && lon < 60)   return "Golfe Persique";
    if (lat > 52 && lat < 66 && lon > -30 && lon < 30)   return "Mer du Nord / Baltique";
    if (lat > 40 && lat < 48 && lon > 27  && lon < 42)   return "Mer Noire";
    if (lat > 8  && lat < 25 && lon > -90 && lon < -58)  return "Mer des Caraïbes";
    if (lat > 18 && lat < 31 && lon > -98 && lon < -80)  return "Golfe du Mexique";
    if (lat > 0  && lat < 25 && lon > 100 && lon < 121)  return "Mer de Chine méridionale";
    if (lat > 30 && lat < 46 && lon > 121 && lon < 142)  return "Mer du Japon";
    if (lat > -15&& lat < 5  && lon > 95  && lon < 120)  return "Mer de Java";
    if (lat > 50 && lat < 66 && lon > -170&& lon < -120) return "Mer de Béring";
    if (lon > 20  && lon < 100 && lat > -60 && lat < 25) return "Océan Indien";
    if (lon > 100 && lat > -60 && lat < 65)              return "Océan Pacifique";
    if (lon < -70 && lat > -60 && lat < 65)              return "Océan Pacifique";
    if (lon > -80 && lon < 20  && lat > -60 && lat < 65) return "Océan Atlantique";
    return "Océan";
}

export function detecterPays(lon, lat, dataGeo) {
    for (let i = 0; i < dataGeo.features.length; i++) {
        if (d3.geoContains(dataGeo.features[i], [lon, lat]))
            return dataGeo.features[i].properties.name || "Terre";
    }
    return null;
}

function trouverPointProche(lon, lat, dataPlastique) {
    let minDist = Infinity, plusProche = null;
    for (let i = 0; i < dataPlastique.features.length; i++) {
        const dist = d3.geoDistance([lon, lat], dataPlastique.features[i].geometry.coordinates);
        if (dist < minDist) { minDist = dist; plusProche = dataPlastique.features[i]; }
    }
    return minDist <= CONFIG.TOOLTIP_RAYON_MAX ? plusProche : null;
}

function styleMesureType(type) {
    const t = (type || "").toLowerCase();
    if (t.includes("sediment")||t.includes("beach")) return {label:"Sédiment / Plage", bg:"rgba(80,55,15,0.35)",  color:"#c8a43e"};
    if (t.includes("water")   ||t.includes("surface"))return {label:"Eau de surface",  bg:"rgba(20,80,80,0.35)",  color:"#6ec8c8"};
    if (t.includes("biota")   ||t.includes("fish"))   return {label:"Faune marine",     bg:"rgba(20,80,50,0.35)",  color:"#6ec890"};
    return {label:type||"Type inconnu", bg:"rgba(50,50,60,0.35)", color:"#8898aa"};
}

const traductionNiveau = {
    "Very Low":"Très faible","Low":"Faible",
    "Medium":"Modérée","High":"Élevée","Very High":"Critique"
};

// Mise à jour du tooltip 
export function gererSurvol(event, { projection, largeur, hauteur, particules,
                                     dataGeo, dataPlastique, tt, logMaxFixe }) {
    const [mx, my] = d3.pointer(event);
    const geo = projection.invert([mx, my]);
    if (!geo) { tt.el.style("opacity","0"); return; }

    const [lon, lat] = geo;
    const centre = projection.invert([largeur / 2, hauteur / 2]);
    if (d3.geoDistance(centre, [lon, lat]) >= Math.PI / 2) { tt.el.style("opacity","0"); return; }

    const coordsStr = `${Math.abs(lat).toFixed(2)}° ${lat>=0?"N":"S"}  —  ${Math.abs(lon).toFixed(2)}° ${lon>=0?"E":"O"}`;
    tt.coords.text(coordsStr);

    const pays    = detecterPays(lon, lat, dataGeo);
    const feature = pays ? null : trouverPointProche(lon, lat, dataPlastique);

    // Scanner de densité (lissage géré dans main.js)
    let densiteBrute = 0;
    if (!pays) {
        particules.forEach(p => {
            const dLon = Math.min(Math.abs(p.lon - lon), 360 - Math.abs(p.lon - lon));
            if (dLon < 4 && Math.abs(p.lat - lat) < 4) densiteBrute++;
        });
    }

    mettreAJourContenu(lon, lat, pays, feature, densiteBrute, tt, logMaxFixe);
    tt.el.style("opacity","1");

    return densiteBrute; // main.js applique le lissage exponentiel
}

function mettreAJourContenu(lon, lat, pays, feature, densiteSimulee, tt, logMaxFixe) {
    if (pays) {
        tt.location.text(pays);
        tt.country.text("Zone terrestre — données marines indisponibles");
        tt.value.text("—").style("color","#3a5a5a");
        tt.unit.text("");
        tt.type.text("🗺 Terre émergée").style("background","rgba(40,55,40,0.4)").style("color","#7a9a7a").style("display","inline-block");
        tt.barBg.style("opacity","0.3");
        tt.cursor.style("left","0%");
        tt.source.text("Passez sur l'océan pour voir les données microplastiques");
        return;
    }
    tt.barBg.style("opacity","1");

    if (feature) {
        const props  = feature.properties;
        const valeur = parseFloat(props.Microplastics_measurement) || 0;
        const hNorm  = clampH(Math.log(1 + valeur) / logMaxFixe);
        const st     = styleMesureType(props.Measurement_Type);
        const niv    = props.Concentration_class_text
            ? (traductionNiveau[props.Concentration_class_text] || props.Concentration_class_text)
            : "Mesure directe";
        let unite = props.Unit || "";
        if (unite.includes("pieces/m3"))        unite = "fragments / m³ d'eau";
        else if (unite.includes("pieces kg-1")) unite = "fragments / kg de sédiment sec";
        else if (unite.includes("pieces"))      unite = "fragments";
        tt.location.text(props.Location?.trim() || detecterOcean(lon, lat));
        tt.country.text((props.Country || detecterOcean(lon, lat)) + " • " + niv);
        tt.value.text("~ " + valeur.toLocaleString("fr-FR",{maximumFractionDigits:4})).style("color",plasticCSS(hNorm));
        tt.unit.text(unite);
        tt.type.text("📍 " + st.label).style("background",st.bg).style("color",st.color).style("display","inline-block");
        tt.cursor.style("left",(hNorm*100).toFixed(1)+"%");
        tt.source.text(props.Source ? `Source : ${props.Source}` : "");
        return;
    }

    const h = clampH(densiteSimulee / CONFIG.DENSITE_MAX);
    tt.location.text(detecterOcean(lon, lat));
    let niv = "Traces détectables";
    if (h > 0.15) niv = "Faible";
    if (h > 0.35) niv = "Modérée";
    if (h > 0.60) niv = "Élevée";
    if (h > 0.85) niv = "Gyre — zone d'accumulation";
    tt.country.text("Concentration simulée : " + niv);
    if (h > 0.05) {
        tt.value.text(`Indice : ${Math.round(h*100)} %`).style("color",plasticCSS(h));
        tt.type.text("Zone de dérive — modèle d'advection").style("background","rgba(60,110,80,0.25)").style("color","#6ec8a0").style("display","inline-block");
    } else {
        tt.value.text("< 1 %").style("color","#3a5a5a");
        tt.type.style("display","none");
    }
    tt.unit.text("");
    tt.source.text("Calculé en temps réel à partir des courants marins");
    tt.cursor.style("left",(h*100).toFixed(1)+"%");
}