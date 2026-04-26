export async function createGlobe() {
    const width = 1800;
    const height = 750;

    const mapDiv = d3.select("#map");

    // 1. CRÉATION DE LA ZONE DE DESSIN (SVG)
    const svg = mapDiv.append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("position", "absolute")
        .style("top", "0")
        .style("left", "0");

    // 2. LA MATHÉMATIQUE (Projection)
    let rotationActuelle = [-20, -10, 0]; 
    const projection = d3.geoOrthographic()             
        .rotate(rotationActuelle)
        .scale(300)                     
        .translate([width / 2, height / 2]); 

    // 3. LE CRAYON
    const path = d3.geoPath().projection(projection);

    const incomeByCode = new Map();

    // 4. CHARGEMENT DES DONNÉES
    const [dataGeo, rows] = await Promise.all([
        d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson"),
        d3.csv("./gni_per_capita_2024_countrycode.csv"),
    ]);

    rows.forEach(r => {
        const v = +r["2024"];
        if (Number.isFinite(v)) incomeByCode.set(r["Country Code"], v);
    });

    // --- CINEMATIC LIGHTING DEFS ---
    const defs = svg.append("defs");

    // A. Ocean Gradient (Simulates 3D Volume)
    const oceanGradient = defs.append("radialGradient")
        .attr("id", "ocean-gradient")
        .attr("cx", "35%") // Light source from top-left
        .attr("cy", "35%")
        .attr("r", "65%");
    oceanGradient.append("stop").attr("offset", "0%").attr("stop-color", "#0b1c2c");
    oceanGradient.append("stop").attr("offset", "100%").attr("stop-color", "#020813");

    // B. Atmospheric Glow (Soft halo behind the earth)
    const glowGradient = defs.append("radialGradient")
        .attr("id", "glow-gradient")
        .attr("cx", "50%").attr("cy", "50%").attr("r", "50%");
    glowGradient.append("stop").attr("offset", "80%").attr("stop-color", "rgba(11, 28, 44, 0.8)");
    glowGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(2, 8, 19, 0)");

    // --- DRAWING THE LAYERS ---

    // Layer 1: Atmospheric Halo (Slightly larger than the globe)
    svg.append("circle")
        .attr("class", "halo")
        .attr("cx", width / 2).attr("cy", height / 2)
        .attr("r", projection.scale() * 1.15)
        .style("fill", "url(#glow-gradient)")
        .style("pointer-events", "none");

    // Layer 2: Ocean Sphere
    svg.append("path")
        .datum({ type: "Sphere" })
        .attr("class", "ocean")
        .attr("d", path)
        .style("fill", "url(#ocean-gradient)");

    // Layer 3: Graticule (Technical UI grid lines)
    const graticule = d3.geoGraticule();
    svg.append("path")
        .datum(graticule)
        .attr("class", "graticule")
        .attr("d", path)
        .style("fill", "none")
        .style("stroke", "rgba(255, 255, 255, 0.05)")
        .style("stroke-width", "0.5px");

    // Layer 4: Countries
    svg.append("g")            
        .selectAll("path")     
        .data(dataGeo.features)
        .join("path")          
        .attr("class", "countries")
        .attr("d", path);

    // --- SCALES ---
    const values = Array.from(incomeByCode.values()).filter(v => Number.isFinite(v));
    const sorted = values.slice().sort(d3.ascending); 
    const lo = d3.quantileSorted(sorted, 0.05); 
    const hi = d3.quantileSorted(sorted, 0.95); 

    const particleNumber = d3.scaleLinear()
        .domain([lo, 18000, hi])
        .range([20, 110, 250])
        .clamp(true);
    
    const colorScale = d3.scaleLinear()   
        .domain([lo, 24000, hi]) // 18000 yearly = 1500 monthly
        .range(["#e2beffff", "#ffdb4cff", "#ff5500ff"]) // Hex codes: White, Gold, Vibrant Orange
        .clamp(true);

    // Return everything needed by interactions and particles
    return { mapDiv, svg, projection, path, dataGeo, incomeByCode, particleNumber, colorScale, width, height };    
}