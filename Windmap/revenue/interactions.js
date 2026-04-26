export function attachInteractions({ svg, projection, path, incomeByCode, colorScale, width, height }) {

    let state = {
        selectedCountryCoords: null // Stores lon/lat of clicked country to pin the label
    };

    svg.selectAll(".countries").on("click", selectCountry);
    
    // 1. DRAG
    const comportementDrag = d3.drag()
        .on("drag", function(event) { 
            const rotate = projection.rotate(); 
            const k = 0.25; 
            projection.rotate([
                rotate[0] + event.dx * k, 
                rotate[1] - event.dy * k   
            ]);
            rafraichirAffichage();
        });

    svg.call(comportementDrag);

    // 2. ZOOM
    svg.on('wheel', function(event) {
        event.preventDefault(); // Prevent page scroll
        let value = projection.scale();
        if (event.deltaY < 0) {
            value = value * 1.10;
        } else if (event.deltaY > 0) {
            value = value / 1.10;
        }
        projection.scale(value);
        rafraichirAffichage();
    });

    // 3. SHOW INFO & GENERATE DYNAMIC LABEL
    function showCountryInfo(d) {
        const code = d.id;
        const name = d.properties.name;
        const yearlyIncome = incomeByCode.get(code);

        if (!yearlyIncome) return;

        // Store coords so the label tracks accurately during drag/zoom
        state.selectedCountryCoords = d3.geoCentroid(d);

        const monthlyIncome = yearlyIncome / 12;
        const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD', maximumFractionDigits: 0
        }).format(monthlyIncome);
        
        svg.selectAll(".countries")
            .classed("selected", false)
            .style("fill", null); 
                
        // Highlight clicked path
        svg.selectAll(".countries")
            .filter(dd => dd.id === d.id)
            .classed("selected", true)
            .style("fill", colorScale(yearlyIncome));

        // Draw Label
        const coords = projection(state.selectedCountryCoords);
        if (!coords) return;

        const currentScale = projection.scale();
        const fontSize = (currentScale / 300) * 14; // Dynamically scale font size

        const label = svg.append("text")
            .attr("class", "incomeText")
            .attr("x", coords[0])
            .attr("y", coords[1])
            .attr("text-anchor", "middle")
            .style("font-size", `${fontSize}px`);
                
        label.append("tspan")
            .attr("x", coords[0])
            .attr("dy", -fontSize * 0.5)
            .text(name);

        label.append("tspan")
            .attr("class", "incomeValueSpan")
            .attr("x", coords[0])
            .attr("dy", fontSize * 1.2)  
            .style("fill", "#ffdf70") // Golden text for income
            .text(formatted);           
    }
            
    function shortestAngleDelta(a, b) {
        let d = (b - a) % 360;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        return d;
    }

    // 4. ANIMATED ROTATION TO COUNTRY
    let spinning = null; 
    function selectCountry(event, d) {
        svg.selectAll(".incomeText").remove();
        state.selectedCountryCoords = null;
                
        const [lon, lat] = d3.geoCentroid(d);
        const target = [-lon, -lat, 0];
        const start = projection.rotate();
        const startScale = projection.scale();
        const zoomTarget = 600;

        if (spinning) spinning.stop();

        const duration = 900; 
        const t0 = performance.now(); 
        
        spinning = d3.timer(() => { 
            const t = (performance.now() - t0) / duration;

            if (t >= 1) { 
                projection.rotate(target);
                rafraichirAffichage();
                spinning.stop();
                showCountryInfo(d);
                spinning = null;
                return;
            }

            const e = d3.easeCubicInOut(t);
            const r = [
                start[0] + shortestAngleDelta(start[0], target[0]) * e,
                start[1] + shortestAngleDelta(start[1], target[1]) * e,
                0
            ];

            let s;
            if (e < 0.5) {
                const u = e / 0.5; 
                s = startScale + (zoomTarget - startScale) * u;
            } else {
                const u = (e - 0.5) / 0.5; 
                s = zoomTarget + (500  - zoomTarget) * u; // Return to default scale 300
            }

            projection.rotate(r);
            projection.scale(s);
            rafraichirAffichage();
        });
    }

    // 5. MASTER RENDER UPDATE
    function rafraichirAffichage() {
        // Redraw Map Paths
        svg.select(".ocean").attr("d", path);
        svg.selectAll(".countries").attr("d", path);           
        svg.select(".graticule").attr("d", path);
        svg.select(".halo").attr("r", projection.scale() * 1.15);

        // Keep Label Pinned to Geography & Scaled Correctly
        const activeLabel = svg.select(".incomeText");
        if (!activeLabel.empty() && state.selectedCountryCoords) {
            const coords = projection(state.selectedCountryCoords);
            if (coords) {
                const currentScale = projection.scale();
                const fontSize = (currentScale / 300) * 14;

                activeLabel
                    .attr("x", coords[0])
                    .attr("y", coords[1])
                    .style("font-size", `${fontSize}px`);
                
                activeLabel.selectAll("tspan").attr("x", coords[0]);
                activeLabel.select(".incomeValueSpan").attr("dy", fontSize * 1.2);
            }
        }
    }
}