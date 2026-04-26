export function startParticleSystem2({
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
  
    particleCanvas.style.position = "absolute";
    particleCanvas.style.left = "0";
    particleCanvas.style.top = "0";
    particleCanvas.style.pointerEvents = "none"; 
    particleCanvas.style.mixBlendMode = "screen";	
    
    mapDiv.node().appendChild(particleCanvas); 
    const ctx = particleCanvas.getContext("2d");
    
    const particleMultiplierSlider = document.getElementById("particleMultiplier");
    const multiplierDisplay = document.getElementById("multiplierValue")
    let particles = [];

    dataGeo.features.forEach(feature => {
      feature.properties.trueCenter = getTrueCenter(feature);
      
      feature.properties.borderRing = extractLargestRing(feature); 
    });

    function extractLargestRing(feature) {
      let mainCoords = [];

      if (feature.geometry.type === "Polygon") {
          mainCoords = feature.geometry.coordinates[0];
      } else if (feature.geometry.type === "MultiPolygon") {
          let maxPoints = 0;
          let largestRing = [];

          feature.geometry.coordinates.forEach(poly => {
              const ring = poly[0]; 
              if (ring && ring.length > maxPoints) {
                  maxPoints = ring.length;
                  largestRing = ring;
              }
          });
          mainCoords = largestRing;
      }

      return mainCoords;
    }

    function getTrueCenter(feature) {
      if (feature.geometry.type === "Polygon") {
          return d3.geoCentroid(feature);
      }
      
      if (feature.geometry.type === "MultiPolygon") {
          let maxArea = -1;
          let largestPolyCoords = null;

          feature.geometry.coordinates.forEach(poly => {
              const area = d3.geoArea({ type: "Polygon", coordinates: poly });
              if (area > maxArea) {
                  maxArea = area;
                  largestPolyCoords = poly;
              }
          });

          return d3.geoCentroid({ type: "Polygon", coordinates: largestPolyCoords });
      }
    
      return d3.geoCentroid(feature);
    }

    function getRandomPointFromRing(ringArray) {
        // Failsafe
        if (!ringArray || ringArray.length === 0) return [0, 0]; 

        // 1. Pick a random index, making sure we don't pick the very last one 
        // so we can safely grab the "next" point to form a line segment.
        const randomIndex = Math.floor(Math.random() * (ringArray.length - 1));
        
        const pt1 = ringArray[randomIndex];
        const pt2 = ringArray[randomIndex + 1]; // The next dot in the border

        // 2. Create a mini-route between these two specific border dots
        const segmentInterpolator = d3.geoInterpolate(pt1, pt2);
        
        // 3. Pick a random spot ANYWHERE along that line segment
        const smoothBorderPoint = segmentInterpolator(Math.random());

        return smoothBorderPoint;
    }

    function createParticle(countryFeature, income, isInitial = false) {
      // 1. Emitter: Get random coordinates within the country's bounding box
      // Note: You will need to use d3.geoBounds(countryFeature) to get the [min, max] coordinates
      const borderPoint = getRandomPointFromRing(countryFeature.properties.borderRing);
      const centerPoint = countryFeature.properties.trueCenter;

      const interpolator = d3.geoInterpolate(centerPoint, borderPoint);

      const randomProgress = Math.sqrt(Math.random());

      const staticGeoPos = interpolator(randomProgress);

      const randomLon = staticGeoPos[0];
      const randomLat = staticGeoPos[1];

      // 4. Evolution: 4 seconds at 60fps = 240 frames
      const exactLifespan = 240; 
      let startingAge = isInitial ? Math.floor(Math.random() * exactLifespan) : 0;

      // Calculate a random target size between 5px and 15px (10 +/- 5)
      const targetSize = 5 + Math.random() * 10;

      // 5. Color: Pick a random gray
      const grays = ["#dac464ff", "#ddbb5cff", "#ff9c4aff", "#cfc85bff"];
      const randomGray = grays[Math.floor(Math.random() * grays.length)];

      return {
          lon: randomLon,
          lat: randomLat,
          age: startingAge,
          maxLife: exactLifespan,
          maxSize: targetSize,
          color: randomGray,
          value: income,
          feature: countryFeature 
      };
    }

    function initParticles() {
      particles = [];

      const currentMultiplier = parseFloat(particleMultiplierSlider.value);

      dataGeo.features.forEach(feature => {
        const income = incomeByCode.get(feature.id);
        if (income) {
          const perimeter = d3.geoLength(feature);
          let numParticles = Math.floor(((perimeter * particleNumber(income)) / 10) * currentMultiplier);
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


      ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
  
      ctx.globalCompositeOperation = "lighter";
      const cameraCenter = [-currentRotate[0], -currentRotate[1]];
  
      for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; // 1. DEFINE 'p'
        p.age += 1;           // 2. AGE THE PARTICLE

        // 3. RESPAWN LOGIC
        if (p.age >= p.maxLife) {
            particles.splice(i, 1);
            particles.push(createParticle(p.feature, p.value, false));
            continue; 
        }

        // 4. Draw only if it's on the front of the globe
        const distanceToCamera = d3.geoDistance([p.lon, p.lat], cameraCenter);
        
        if (distanceToCamera < 1.57 && !isMoving) {
          const coords = projection([p.lon, p.lat]);
            
          if (coords) {
            const [x, y] = coords;
                
            const lifePercent = p.age / p.maxLife; 
                
            // Math.sin(lifePercent * PI) creates a perfect curve: 0 -> 1 -> 0
            const growthCurve = Math.sin(lifePercent * Math.PI); 

            // Phase 1, 2, and 3 calculated automatically by the curve
            const currentOpacity = growthCurve * 0.5; // Peaks at 0.5
            const currentSize = growthCurve * p.maxSize; // Peaks at random target size

            const gradient = ctx.createRadialGradient(x, y, 0, x, y, currentSize);
            gradient.addColorStop(0, p.color); // Center is solid
            gradient.addColorStop(1, "transparent"); // Edge is blurry/transparent

            ctx.beginPath();
            ctx.globalAlpha = currentOpacity;
            ctx.fillStyle = gradient;
                
            ctx.arc(x, y, currentSize, 0, 2 * Math.PI); 
            ctx.fill();
                
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