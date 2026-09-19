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

    this.glitchInterval = null;
    this.lastRenderTime = 0;
    this.hasActiveGlitch = false;

    // Check for active glitch circles periodically and start/stop the continuous timer
    this._checkGlitchState();
  }

  /**
   * Start continuous rendering at 30 FPS (only when glitch effects are active).
   */
  _startGlitchTimer() {
    if (this.glitchInterval) return;
    const intervalMs = Math.round(1000 / 30); // ~33ms for 30 FPS
    this.glitchInterval = setInterval(() => {
      this.glitchEngine.update();
      this.renderFrame();
    }, intervalMs);
  }

  _stopGlitchTimer() {
    if (this.glitchInterval) {
      clearInterval(this.glitchInterval);
      this.glitchInterval = null;
    }
  }

  /**
   * Evaluate whether any active circles have glitch > 0 and start/stop the timer accordingly.
   * Called after every state change.
   */
  _checkGlitchState() {
    const state = this.getStateFn();
    if (!state || !state.scenes) {
      this._stopGlitchTimer();
      this.hasActiveGlitch = false;
      return;
    }

    const activeSceneId = state.activeSceneId || '~';
    const scene = state.scenes[activeSceneId];
    if (!scene || !scene.circles) {
      this._stopGlitchTimer();
      this.hasActiveGlitch = false;
      return;
    }

    const hasGlitch = scene.circles.some(c => !c.off && c.glitch > 0);

    if (hasGlitch && !this.hasActiveGlitch) {
      this.hasActiveGlitch = true;
      this._startGlitchTimer();
    } else if (!hasGlitch && this.hasActiveGlitch) {
      this.hasActiveGlitch = false;
      this._stopGlitchTimer();
    }
  }

  /**
   * Immediate render trigger (called on live drag / slider updates).
   * Always renders a frame and re-evaluates whether glitch timer is needed.
   */
  triggerLiveUpdate() {
    const now = Date.now();
    // Allow high responsiveness during active dragging (min 16ms between frames)
    if (now - this.lastRenderTime >= 16) {
      this.glitchEngine.update();
      this.renderFrame();
    }
    this._checkGlitchState();
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

    // Pre-parse active circle colors once per frame (avoid hex parsing in hot loop)
    const activeCircles = (scene.circles || []).filter(c => !c.off).map(c => {
      const hex = c.color || '#0055ff';
      const seed = (c.id && c.id.charCodeAt(0)) || 65;
      const glitch = c.glitch || 0;
      const baseR = (c.size / 100) * 110;
      const jitter = this.glitchEngine ? this.glitchEngine.getCircleRadiusJitter(glitch, seed) : 0;
      return {
        x: c.x,
        y: c.y,
        radius: Math.max(10, baseR + jitter),
        cr: parseInt(hex.slice(1, 3), 16) || 0,
        cg: parseInt(hex.slice(3, 5), 16) || 0,
        cb: parseInt(hex.slice(5, 7), 16) || 0,
        glitch: glitch,
        seed: seed
      };
    });

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

        let r = 0;
        let g = 0;
        let b = 0;

        // Test collision with active circles from top to bottom in z-order (highest index is on top).
        // When circles overlap, they do not mix; the circle on top determines the color.
        for (let j = activeCircles.length - 1; j >= 0; j--) {
          const ac = activeCircles[j];
          const dist = Math.hypot(lx - ac.x, ly - ac.y);

          if (dist <= ac.radius) {
            // Apply glitch transformation for the top circle
            const glitched = this.glitchEngine.processLed(
              { r: ac.cr, g: ac.cg, b: ac.cb },
              ac.glitch,
              physicalIdx + 1,
              ac.seed
            );

            r = glitched.r;
            g = glitched.g;
            b = glitched.b;
            break; // Top circle determines the color; stop checking underlying circles
          }
        }

        const byteOffset = physicalIdx * 3;
        buffer[byteOffset] = r;
        buffer[byteOffset + 1] = g;
        buffer[byteOffset + 2] = b;
      }
    }

    // Send the compiled frame to the serial manager
    this.serialManager.sendLedFrame(buffer);
  }
}

module.exports = LedEngine;
