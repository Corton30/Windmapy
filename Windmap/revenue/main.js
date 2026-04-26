import { createGlobe } from "./globe.js";
import { attachInteractions } from "./interactions.js";
import { startParticleSystem } from "./particles.js";
import { startParticleSystem2 } from "./particles2.js";

// 1. Build the base SVG Globe
const globeParams = await createGlobe();

// 2. Attach SVG interactions (Drag, Zoom, Click)
attachInteractions(globeParams);

// 3. Layer the Canvas Particle System on top
const modeToggle = document.getElementById("mode"); // Added quotes

let currentSystem = null;

function switchMode() {
	if (currentSystem && currentSystem.stop) {
		currentSystem.stop();
	}
	if (modeToggle.checked) {
		currentSystem = startParticleSystem2(globeParams);
	} else {
		currentSystem = startParticleSystem(globeParams);
	}
}

modeToggle.addEventListener("change", switchMode);

switchMode();