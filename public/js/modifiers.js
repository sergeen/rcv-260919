/**
 * REQUIEM CABARET VOLTAIRE 2026 - MODIFIERS ENGINE
 * Controls COLOR, GLICH, and SIZE parameters with multi-select propagation.
 */

class ModifiersController {
  constructor(app) {
    this.app = app;

    // Spectrum lookup for WS2812B vibrancy (White at bottom max value)
    this.colorSpectrum = [
      { pos: 0.00, hex: '#ff0022', r: 255, g: 0,   b: 34  }, // Vivid Red
      { pos: 0.08, hex: '#ff4400', r: 255, g: 68,  b: 0   }, // Orange
      { pos: 0.16, hex: '#ffaa00', r: 255, g: 170, b: 0   }, // Amber
      { pos: 0.24, hex: '#ffea00', r: 255, g: 234, b: 0   }, // Yellow
      { pos: 0.32, hex: '#44ff00', r: 68,  g: 255, b: 0   }, // Lime
      { pos: 0.40, hex: '#00ff41', r: 0,   g: 255, b: 65  }, // Cyber Green
      { pos: 0.48, hex: '#00ffaa', r: 0,   g: 255, b: 170 }, // Turquoise
      { pos: 0.56, hex: '#00d0ff', r: 0,   g: 208, b: 255 }, // Cyan
      { pos: 0.64, hex: '#0055ff', r: 0,   g: 85,  b: 255 }, // Deep Blue
      { pos: 0.72, hex: '#6600ff', r: 102, g: 0,   b: 255 }, // Electric Indigo
      { pos: 0.80, hex: '#bb00ff', r: 187, g: 0,   b: 255 }, // Violet
      { pos: 0.88, hex: '#ff0077', r: 255, g: 0,   b: 119 }, // Hot Magenta
      { pos: 0.94, hex: '#ffe2c0', r: 255, g: 226, b: 192 }, // Warm White
      { pos: 1.00, hex: '#ffffff', r: 255, g: 255, b: 255 }  // Pure White (bottom max)
    ];

    // Current slider values
    this.currentColor = { hex: '#0055ff', r: 0, g: 85, b: 255 };
    this.currentGlitch = 0;
    this.currentSize = 70;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.colorSlider = document.getElementById('colorSlider');
    this.colorSwatch = document.getElementById('colorSwatch');

    this.glitchSlider = document.getElementById('glitchSlider');
    this.glichBoxes = [
      document.getElementById('glichBox1'),
      document.getElementById('glichBox2'),
      document.getElementById('glichBox3')
    ];

    this.sizeSlider = document.getElementById('sizeSlider');
    this.sizeValueLabel = document.getElementById('sizeValueLabel');
  }

  bindEvents() {
    // COLOR SLIDER
    // Sliders in HTML are range inputs (min: 0, max: 100)
    // Value 100 = bottom max value = white
    if (this.colorSlider) {
      this.colorSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.setColorFromValue(val);
      });
    }

    // GLICH SLIDER
    if (this.glitchSlider) {
      this.glitchSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setGlitchFromValue(val);
      });
    }

    // SIZE SLIDER
    if (this.sizeSlider) {
      this.sizeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.setSizeFromValue(val);
      });
    }
  }

  getColorAtValue(val) {
    // val is 0..100
    const ratio = Math.max(0, Math.min(1, val / 100.0));
    for (let i = 0; i < this.colorSpectrum.length - 1; i++) {
      const p1 = this.colorSpectrum[i];
      const p2 = this.colorSpectrum[i + 1];
      if (ratio >= p1.pos && ratio <= p2.pos) {
        const range = p2.pos - p1.pos;
        const localT = (ratio - p1.pos) / range;
        const r = Math.round(p1.r + (p2.r - p1.r) * localT);
        const g = Math.round(p1.g + (p2.g - p1.g) * localT);
        const b = Math.round(p1.b + (p2.b - p1.b) * localT);
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        return { hex, r, g, b };
      }
    }
    const last = this.colorSpectrum[this.colorSpectrum.length - 1];
    return { hex: last.hex, r: last.r, g: last.g, b: last.b };
  }

  findValueFromHex(hex) {
    if (!hex) return 64; // default blue
    hex = hex.toLowerCase();
    let closestVal = 64;
    let minDiff = Infinity;
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;

    for (let v = 0; v <= 100; v += 2) {
      const col = this.getColorAtValue(v);
      const diff = Math.abs(col.r - r) + Math.abs(col.g - g) + Math.abs(col.b - b);
      if (diff < minDiff) {
        minDiff = diff;
        closestVal = v;
      }
    }
    return closestVal;
  }

  setColorFromValue(val, propagate = true) {
    const col = this.getColorAtValue(val);
    this.currentColor = col;

    if (this.colorSwatch) {
      this.colorSwatch.style.backgroundColor = col.hex;
      this.colorSwatch.style.boxShadow = `0 0 10px ${col.hex}`;
    }

    if (this.colorSlider && this.colorSlider.value != val) {
      this.colorSlider.value = val;
    }

    if (propagate && this.app) {
      this.app.applyModifierToSelected('color', col.hex);
    }
  }

  setGlitchFromValue(val, propagate = true) {
    this.currentGlitch = Math.max(0, Math.min(100, val));

    // Update UI indicator boxes □□□
    // Box 1: 1 - 33%
    // Box 2: 34 - 66%
    // Box 3: 67 - 100%
    if (this.glichBoxes[0]) this.glichBoxes[0].classList.toggle('active', this.currentGlitch >= 1);
    if (this.glichBoxes[1]) this.glichBoxes[1].classList.toggle('active', this.currentGlitch >= 34);
    if (this.glichBoxes[2]) this.glichBoxes[2].classList.toggle('active', this.currentGlitch >= 67);

    if (this.glitchSlider && this.glitchSlider.value != val) {
      this.glitchSlider.value = val;
    }

    if (propagate && this.app) {
      this.app.applyModifierToSelected('glitch', this.currentGlitch);
    }
  }

  setSizeFromValue(val, propagate = true) {
    this.currentSize = Math.max(10, Math.min(150, val));

    if (this.sizeValueLabel) {
      this.sizeValueLabel.textContent = `${this.currentSize}%`;
    }

    if (this.sizeSlider && this.sizeSlider.value != val) {
      this.sizeSlider.value = val;
    }

    if (propagate && this.app) {
      // Size affects only circles
      this.app.applyModifierToSelected('size', this.currentSize);
    }
  }

  /**
   * Sync slider positions with whatever is currently selected
   */
  syncWithSelection(elements) {
    if (!elements || elements.length === 0) return;
    const first = elements[0];

    if (first.color) {
      const val = this.findValueFromHex(first.color);
      this.setColorFromValue(val, false);
    }
    if (first.glitch !== undefined) {
      this.setGlitchFromValue(first.glitch, false);
    }
    if (first.size !== undefined) {
      this.setSizeFromValue(first.size, false);
    }
  }
}

window.ModifiersController = ModifiersController;
