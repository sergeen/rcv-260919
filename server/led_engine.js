/**
 * REQUIEM CABARET VOLTAIRE 2026 - SERVER LED ENGINE
 * Authoritative geometric collision engine and FastLED frame dispatcher.
 * Calculates physical LED states from active scene segments and circles,
 * applies the artistic GlitchEngine, and streams frames directly to USB Serial.
 */

const path = require('path');
const GlitchEngine = require(path.join(__dirname, '..', 'public', 'js', 'glitch.js'));

class LedEngine {
  constructor(serialManager, getStateFn) {
    this.serialManager = serialManager;
    this.getStateFn = getStateFn;
    this.glitchEngine = new GlitchEngine();

    this.isRunning = false;
    this.fps = 30;
    this.interval = null;
    this.lastRenderTime = 0;

    this.start();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    const intervalMs = Math.round(1000 / this.fps); // ~33ms for 30 FPS

    this.interval = setInterval(() => {
      this.glitchEngine.update();
      this.renderFrame();
    }, intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }

  /**
   * Immediate render trigger (called on live drag / slider updates)
   */
  triggerLiveUpdate() {
    const now = Date.now();
    // Allow high responsiveness during active dragging (min 20ms between frames)
    if (now - this.lastRenderTime >= 20) {
      this.renderFrame();
    }
  }

  renderFrame() {
    this.lastRenderTime = Date.now();

    const state = this.getStateFn();
    if (!state || !state.scenes) return;

    const activeSceneId = state.activeSceneId || '~';
    const scene = state.scenes[activeSceneId];
    if (!scene || !scene.segments || scene.segments.length === 0) {
      return;
    }

    // Determine max physical LED index across all active segments
    let maxLed = 0;
    for (const seg of scene.segments) {
      if (seg.endLed && seg.endLed > maxLed) {
        maxLed = seg.endLed;
      }
    }
    if (maxLed <= 0) return;

    // Allocate RGB buffer (3 bytes per physical LED)
    const buffer = Buffer.alloc(maxLed * 3);
    const activeCircles = (scene.circles || []).filter(c => !c.off);

    // Render each segment
    for (const seg of scene.segments) {
      if (seg.off) continue;

      const count = Math.max(1, (seg.endLed - seg.startLed) + 1);
      const dx = (seg.p2 ? seg.p2.x : 0) - (seg.p1 ? seg.p1.x : 0);
      const dy = (seg.p2 ? seg.p2.y : 0) - (seg.p1 ? seg.p1.y : 0);

      for (let i = 0; i < count; i++) {
        const physicalIdx = seg.startLed + i - 1; // 0-indexed byte offset
        if (physicalIdx < 0 || physicalIdx >= maxLed) continue;

        const t = count === 1 ? 0 : i / (count - 1);
        const lx = (seg.p1 ? seg.p1.x : 0) + t * dx;
        const ly = (seg.p1 ? seg.p1.y : 0) + t * dy;

        let blendedR = 0;
        let blendedG = 0;
        let blendedB = 0;

        // Test collision with active circles
        for (const c of activeCircles) {
          const r = (c.size / 100) * 110;
          const dist = Math.hypot(lx - c.x, ly - c.y);

          if (dist <= r) {
            // Parse circle hex color
            const hex = c.color || '#0055ff';
            const cr = parseInt(hex.slice(1, 3), 16) || 0;
            const cg = parseInt(hex.slice(3, 5), 16) || 0;
            const cb = parseInt(hex.slice(5, 7), 16) || 0;

            const circleSeed = (c.id && c.id.charCodeAt(0)) || 65;

            // Apply glitch transformation
            const glitched = this.glitchEngine.processLed(
              { r: cr, g: cg, b: cb },
              c.glitch || 0,
              physicalIdx + 1,
              circleSeed
            );

            // Additive blending clamped to 255
            blendedR = Math.min(255, blendedR + glitched.r);
            blendedG = Math.min(255, blendedG + glitched.g);
            blendedB = Math.min(255, blendedB + glitched.b);
          }
        }

        const byteOffset = physicalIdx * 3;
        buffer[byteOffset] = blendedR;
        buffer[byteOffset + 1] = blendedG;
        buffer[byteOffset + 2] = blendedB;
      }
    }

    // Send the compiled frame to the serial manager
    this.serialManager.sendLedFrame(buffer);
  }
}

module.exports = LedEngine;
