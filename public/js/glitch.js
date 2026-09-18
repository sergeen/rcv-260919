/**
 * REQUIEM CABARET VOLTAIRE 2026 - ARTISTIC GLITCH ENGINE
 * Inspirations: Cabaret Voltaire (Dada noise / tape loops)
 *               Nam June Paik (analog deflection / chromatic aberration)
 *               Ryoji Ikeda (high-frequency algorithmic strobe / test pattern)
 */

class GlitchEngine {
  constructor() {
    this.frameCount = 0;
    this.lastStrobeTime = performance.now();
    this.strobeState = true;
  }

  update() {
    this.frameCount++;
  }

  /**
   * Helper: fast deterministic pseudo-random hash based on coordinates/index and frame
   */
  hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 3628273) ^ 0x5bf03635;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  /**
   * Process an LED's color through the glitch engine
   * @param {Object} baseRgb - { r: 0..255, g: 0..255, b: 0..255 }
   * @param {number} glitch - Glitch value (0 to 100)
   * @param {number} ledIndex - Physical LED index on strip
   * @param {number} circleSeed - Unique seed of the controlling circle
   * @returns {Object} Resulting { r, g, b }
   */
  processLed(baseRgb, glitch, ledIndex, circleSeed = 0) {
    if (glitch <= 0) {
      return baseRgb;
    }

    const t = this.frameCount;
    const gNorm = glitch / 100.0; // 0.0 to 1.0

    // Phase 3: High-Frequency Stroboscopic Sublime (67% - 100%)
    if (glitch >= 67) {
      const strobeProgress = (glitch - 67) / 33.0; // 0.0 to 1.0
      // Frequency scales from 14Hz up to 45Hz
      const strobePeriodFrames = Math.max(1, Math.round(5 - (strobeProgress * 4))); // 1 to 5 frames
      const isStrobeOff = (Math.floor(t / strobePeriodFrames) % 2 === 0);

      // Random sub-burst dropout
      const burstNoise = this.hash(ledIndex, Math.floor(t / 2), circleSeed);

      if (isStrobeOff) {
        // High glitch: near total blackout during off-cycle
        return { r: 0, g: 0, b: 0 };
      }

      // At extreme values (>= 90%), polychromatic strobism
      if (glitch >= 90 && burstNoise > 0.4) {
        const polyPhase = (Math.floor(t / 2) + ledIndex) % 4;
        if (polyPhase === 0) return { r: 255, g: 255, b: 255 }; // Blinding white
        if (polyPhase === 1) return { r: 255, g: 0, b: 40 };   // Neon crimson
        if (polyPhase === 2) return { r: 0, g: 255, b: 200 };  // Electric cyan
        if (polyPhase === 3) return { r: 240, g: 255, b: 0 };  // Hyper yellow
      }

      // Searing flash boost
      return {
        r: Math.min(255, Math.round(baseRgb.r * 1.3 + 40)),
        g: Math.min(255, Math.round(baseRgb.g * 1.3 + 40)),
        b: Math.min(255, Math.round(baseRgb.b * 1.3 + 40))
      };
    }

    // Phase 2: Chromatic Shatter & Bit-Flip Spikes (34% - 66%)
    if (glitch >= 34) {
      const phase2Progress = (glitch - 34) / 33.0;
      const noise = this.hash(ledIndex, Math.floor(t / 3), circleSeed);

      // Cluster dropouts: 2 to 4 adjacent LEDs stutter together
      const clusterId = Math.floor(ledIndex / 3);
      const clusterNoise = this.hash(clusterId, Math.floor(t / 4), circleSeed);
      if (clusterNoise < (0.15 + phase2Progress * 0.25)) {
        return { r: 0, g: 0, b: 0 };
      }

      // Chromatic Channel Splitting / Bit-Flip Spikes
      if (noise < (0.10 + phase2Progress * 0.30)) {
        const mode = Math.floor(noise * 100) % 5;
        switch (mode) {
          case 0: // Drop Red, boost Cyan
            return { r: 0, g: Math.min(255, baseRgb.g + 80), b: Math.min(255, baseRgb.b + 120) };
          case 1: // Invert to complementary color
            return { r: 255 - baseRgb.r, g: 255 - baseRgb.g, b: 255 - baseRgb.b };
          case 2: // Pure Green channel spike
            return { r: 0, g: 255, b: 20 };
          case 3: // Pure Violet spike
            return { r: 220, g: 0, b: 255 };
          case 4: // Electric White flash
            return { r: 255, g: 255, b: 255 };
        }
      }

      // Organic jitter
      const sag = 0.75 + (noise * 0.45);
      return {
        r: Math.min(255, Math.round(baseRgb.r * sag)),
        g: Math.min(255, Math.round(baseRgb.g * sag)),
        b: Math.min(255, Math.round(baseRgb.b * sag))
      };
    }

    // Phase 1: Analog Degradation & Tape Sag (1% - 33%)
    const phase1Progress = glitch / 33.0;
    const noise = this.hash(ledIndex, Math.floor(t / 5), circleSeed);

    // Sporadic single-LED micro-dropout
    if (noise < (0.04 + phase1Progress * 0.12)) {
      return { r: 0, g: 0, b: 0 };
    }

    // Voltage sag simulation: subtle organic brightness dips
    const sag = 0.85 + (noise * 0.15) - (phase1Progress * 0.15);
    return {
      r: Math.round(baseRgb.r * sag),
      g: Math.round(baseRgb.g * sag),
      b: Math.round(baseRgb.b * sag)
    };
  }

  /**
   * Helper: Get dynamic jitter for circle radius (Cabaret Voltaire boundary twitch)
   */
  getCircleRadiusJitter(glitch, circleSeed) {
    if (glitch < 30) return 0;
    const progress = (glitch - 30) / 70.0;
    const noise = this.hash(circleSeed, Math.floor(this.frameCount / 2), 999);
    if (noise > 0.75) {
      return (noise - 0.75) * 4 * (progress * 14); // +/- pixels jitter
    }
    return 0;
  }
}

// Export for browser and Node.js
if (typeof window !== 'undefined') {
  window.GlitchEngine = GlitchEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GlitchEngine;
}
