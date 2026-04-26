export function startParticleSystem({
    mapDiv,
    projection,
    dataGeo,
    incomeByCode,
    particleNumber,
    colorScale,
    width,
    height
  }) {
  
    const particleCanvas = document.createElement("canvas"); 
    particleCanvas.width = width;	
    particleCanvas.height = height;	
  
    // Position exactly over the SVG
    particleCanvas.style.position = "absolute";
    particleCanvas.style.left = "0";
    particleCanvas.style.top = "0";
    particleCanvas.style.pointerEvents = "none"; 
    particleCanvas.style.mixBlendMode = "screen";	
    
    // Append to the map div
    mapDiv.node().appendChild(particleCanvas); 
    const ctx = particleCanvas.getContext("2d");
    
    const particleMultiplierSlider = document.getElementById("particleMultiplier");
    const multiplierDisplay = document.getElementById("multiplierValue")
    let particles = [];


    // preload the center and the largest polygone
    dataGeo.features.forEach(feature => {
      feature.properties.trueCenter = getTrueCenter(feature);
      
      feature.properties.borderRing = extractLargestRing(feature); 
    });

    function extractLargestRing(feature) {
      let mainCoords = [];

      if (feature.geometry.type === "Polygon") {
          // Take the outer boundary of the single polygon
          mainCoords = feature.geometry.coordinates[0];
      } else if (feature.geometry.type === "MultiPolygon") {
          // Loop through EVERY polygon to find the biggest one
          let maxPoints = 0;
          let largestRing = [];

          feature.geometry.coordinates.forEach(poly => {
              const ring = poly[0]; //poly[0] contains outer coastline of the lands
              if (ring && ring.length > maxPoints) {
                  maxPoints = ring.length;
                  largestRing = ring;
              }
          });
          mainCoords = largestRing;
      }

      return mainCoords;
    }

    function createParticle(countryFeature, income, isInitial = false) {
      const startPos = getRandomPointFromRing(countryFeature.properties.borderRing);
      const endPos = countryFeature.properties.trueCenter;
      
      // getting the distance between boarder and the center
      const distance = d3.geoDistance(startPos, endPos);
      
      // correction for the speed that the particles travel with
      const baseFrames = distance * 800; 
      const exactLifespan = Math.max(180, Math.floor(baseFrames)); // failsafe to make sure all the particles are moving by 180 frames minimum

      // a function that returns [longitude, latitude] of particle over the course of its movement
      const interpolator = d3.geoInterpolate(startPos, endPos);

      let startingAge = 0;
      // desynchronisation of particles with random starting age 
      if (isInitial) {
          startingAge = Math.floor(Math.random() * exactLifespan);
      }

      return {
          interpolator: interpolator, 
          age: startingAge,
          maxLife: exactLifespan,
          value: income,
          feature: countryFeature 
      };
    }

    function getTrueCenter(feature) {
      if (feature.geometry.type === "Polygon") {
          return d3.geoCentroid(feature);
      }
      
      if (feature.geometry.type === "MultiPolygon") {
          let maxArea = -1;
          let largestPolyCoords = null;

          // Trouver le plus grand polygone
          feature.geometry.coordinates.forEach(poly => {
              const area = d3.geoArea({ type: "Polygon", coordinates: poly });
              if (area > maxArea) {
                  maxArea = area;
                  largestPolyCoords = poly;
              }
          });

          // Renvoyer le centre de ce polygone uniquement
          return d3.geoCentroid({ type: "Polygon", coordinates: largestPolyCoords });
      }
    
      return d3.geoCentroid(feature); // Sécurité
    }
    
    function getRandomPointFromRing(ringArray) {
      // Failsafe in case a country has broken data
      if (!ringArray || ringArray.length === 0) return [0, 0]; 

      // Instantly pick a random coordinate
      const randomIndex = Math.floor(Math.random() * ringArray.length);
      return ringArray[randomIndex];
    }
      
    function initParticles() {
      particles = [];

      const currentMultiplier = parseFloat(particleMultiplierSlider.value);

      dataGeo.features.forEach(feature => {
        const income = incomeByCode.get(feature.id);
        if (income) {
          const perimeter = d3.geoLength(feature);
          const numParticles = Math.floor(((perimeter * particleNumber(income)) / 10) * currentMultiplier);
          for (let i = 0; i < numParticles; i++) {
            particles.push(createParticle(feature, income, true));
          }
        }
      });
    }
  
    initParticles();

    particleMultiplierSlider.addEventListener("input", () => {
      multiplierDisplay.textContent = parseFloat(particleMultiplierSlider.value).toFixed(1);
      initParticles();
    })
  
    let lastRotate = projection.rotate();
    let lastScale = projection.scale(); 
    ctx.fillStyle = "black"; 
  
    let timer = d3.timer((elapsed) => {
      const currentRotate = projection.rotate();
      const currentScale = projection.scale();
  
      const isMoving = 
        Math.abs(currentRotate[0] - lastRotate[0]) > 0.01 ||
        Math.abs(currentRotate[1] - lastRotate[1]) > 0.01 ||
        Math.abs(currentScale - lastScale) > 0.1;

      // to leave no trail
      ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  
      ctx.globalCompositeOperation = "lighter";
      const cameraCenter = [-currentRotate[0], -currentRotate[1]];
  
      for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.age += 1;

        if (p.age >= p.maxLife) {
            particles.splice(i, 1);
            particles.push(createParticle(p.feature, p.value, false));
            continue; 
        }

        // 2. Trouver sa position actuelle (t = pourcentage du trajet de 0.0 à 1.0)
        const t = p.age / p.maxLife;
        const currentGeoPos = p.interpolator(t); // returns current [lon, lat]

        // 3. Dessiner seulement si c'est la face visible du globe
        const distanceToCamera = d3.geoDistance(currentGeoPos, cameraCenter);
        if (distanceToCamera < 1.57 && !isMoving) {
            const coords = projection(currentGeoPos);
            if (coords) {
                const [x, y] = coords;
                
                // Un fondu entrant et sortant très doux (en cloche)
                const lifePercent = p.age / p.maxLife;
                // opacity calculation 0 at beginning, 0 at end
                const alpha = Math.sin(lifePercent * Math.PI); 

                ctx.beginPath();
                ctx.globalAlpha = alpha * 0.9; // 0.9 = opacity max
                ctx.fillStyle = colorScale(p.value);
                ctx.arc(x, y, 1.5, 0, 2 * Math.PI); 
            }
        }
      }
      
      lastRotate = currentRotate;
      lastScale = currentScale;
    });
      
    return {
      particleCanvas,
      stop() {
        if (timer) {
          timer.stop();
          timer = null;
        }
        particleCanvas.remove();
      }
    };
  }