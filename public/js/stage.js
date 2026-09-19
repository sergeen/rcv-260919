/**
 * REQUIEM CABARET VOLTAIRE 2026 - STAGE CANVAS ENGINE
 * High-performance interactive geometric engine for Segments and Circles.
 * Handles touch gestures, multi-selection, LED mapping, and real-time glitch rendering.
 */

class StageEngine {
  constructor(app) {
    this.app = app;
    this.canvas = document.getElementById('stageCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Logical stage coordinate system (1000 x 500)
    this.width = 1000;
    this.height = 500;
    this.scale = 1;

    this.segments = [];
    this.circles = [];
    this.selectedIds = new Set(); // e.g. "circle-A", "segment-AB"

    this.glitchEngine = new GlitchEngine();

    // Dragging / Multi-touch Interaction state (pointerId -> PointerState)
    this.activePointers = new Map();
    this.dragStart = { x: 500, y: 250 };
    this.lastLiveSyncTime = 0;

    // Mode for placing a new circle
    this.placementMode = null; // null or { presetIndex, template }

    this.initCanvasSize();
    this.bindEvents();
    this.startLoop();
  }

  get dragTarget() {
    return this.activePointers.size > 0 ? this.activePointers.values().next().value.target : null;
  }

  initCanvasSize() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.scale = rect.width / this.width;
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    setTimeout(resize, 100);
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
  }

  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const x = ((clientX - rect.left) / rect.width) * this.width;
    const y = ((clientY - rect.top) / rect.height) * this.height;
    return { x, y };
  }

  onPointerDown(e) {
    // Only accept primary button (left click) or touch/pen
    if (e.button !== undefined && e.button !== 0) return;

    if (e.pointerType === 'touch') {
      e.preventDefault();
    }

    const pos = this.getCanvasCoords(e);
    this.dragStart = { x: pos.x, y: pos.y };

    // Check if in placement mode
    if (this.placementMode) {
      const mode = this.placementMode;
      this.app.completeCirclePlacement(pos.x, pos.y, mode);
      return;
    }

    // Capture pointer to canvas so drag continues smoothly
    if (this.canvas.setPointerCapture) {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    }

    let target = null;

    // 1. Check segment endpoints (hit radius: 30px for touch)
    if (!this.app.isSegmentsLocked) {
      for (const seg of this.segments) {
        const d1 = Math.hypot(pos.x - seg.p1.x, pos.y - seg.p1.y);
        if (d1 < 30) {
          target = {
            type: 'handle',
            segment: seg,
            handle: 'p1',
            startX: seg.p1.x,
            startY: seg.p1.y
          };
          this.selectElement(`segment-${seg.id}`, e.shiftKey || false);
          break;
        }
        const d2 = Math.hypot(pos.x - seg.p2.x, pos.y - seg.p2.y);
        if (d2 < 30) {
          target = {
            type: 'handle',
            segment: seg,
            handle: 'p2',
            startX: seg.p2.x,
            startY: seg.p2.y
          };
          this.selectElement(`segment-${seg.id}`, e.shiftKey || false);
          break;
        }
      }
    }

    // 2. Check circles (from top to bottom in z-order: highest index on top)
    if (!target) {
      // Find which circles are already being dragged by another active finger
      const claimedCircleIds = new Set();
      for (const p of this.activePointers.values()) {
        if (p.target && p.target.type === 'circle' && p.target.circle) {
          claimedCircleIds.add(p.target.circle.id);
        }
      }

      for (let i = this.circles.length - 1; i >= 0; i--) {
        const c = this.circles[i];
        if (claimedCircleIds.has(c.id)) continue;

        const r = (c.size / 100) * 110;
        const d = Math.hypot(pos.x - c.x, pos.y - c.y);
        if (d <= r) {
          const id = `circle-${c.id}`;

          // Multi-touch selection: if already holding another circle, add this one too
          const isMulti = this.activePointers.size > 0 || e.shiftKey;
          if (!this.selectedIds.has(id)) {
            if (!isMulti) {
              this.selectedIds.clear();
            }
            this.selectedIds.add(id);
            this.app.onSelectionChanged();
          }

          target = {
            type: 'circle',
            circle: c,
            startX: c.x,
            startY: c.y
          };
          break;
        }
      }
    }

    // 3. Check segment line bodies
    if (!target && !this.app.isSegmentsLocked) {
      for (const seg of this.segments) {
        const dist = this.distToSegment(pos, seg.p1, seg.p2);
        if (dist < 20) {
          const id = `segment-${seg.id}`;
          if (!this.selectedIds.has(id)) {
            this.selectElement(id, false);
          }
          target = {
            type: 'segment_body',
            segment: seg,
            startP1: { ...seg.p1 },
            startP2: { ...seg.p2 }
          };
          break;
        }
      }
    }

    if (target) {
      this.activePointers.set(e.pointerId, {
        pointerId: e.pointerId,
        dragStart: { x: pos.x, y: pos.y },
        hasMoved: false,
        target: target
      });
    } else {
      // Tapped empty background: clear selection only if no other fingers are active
      if (this.activePointers.size === 0) {
        this.clearSelection();
      }
    }
  }

  onPointerMove(e) {
    // CRITICAL: Strict pointer isolation.
    // If this pointer did NOT originate on a stage element (e.g. moving a slider, badge, or menu),
    // IGNORE IT COMPLETELY. This prevents sliders from causing circles to jump to corners!
    const ptr = this.activePointers.get(e.pointerId);
    if (!ptr || !ptr.target) return;

    const pos = this.getCanvasCoords(e);
    const dx = pos.x - ptr.dragStart.x;
    const dy = pos.y - ptr.dragStart.y;

    if (Math.hypot(dx, dy) > 4) {
      ptr.hasMoved = true;
    }

    if (ptr.target.type === 'circle') {
      const c = ptr.target.circle;
      c.x = Math.max(20, Math.min(this.width - 20, ptr.target.startX + dx));
      c.y = Math.max(20, Math.min(this.height - 20, ptr.target.startY + dy));
      this.app.scenesController.markActiveSceneModified();
    } else if (ptr.target.type === 'handle') {
      const seg = ptr.target.segment;
      if (ptr.target.handle === 'p1') {
        seg.p1.x = Math.max(10, Math.min(this.width - 10, ptr.target.startX + dx));
        seg.p1.y = Math.max(10, Math.min(this.height - 10, ptr.target.startY + dy));
      } else {
        seg.p2.x = Math.max(10, Math.min(this.width - 10, ptr.target.startX + dx));
        seg.p2.y = Math.max(10, Math.min(this.height - 10, ptr.target.startY + dy));
      }
      this.app.scenesController.markActiveSceneModified();
    } else if (ptr.target.type === 'segment_body') {
      const seg = ptr.target.segment;
      seg.p1.x = Math.max(10, Math.min(this.width - 10, ptr.target.startP1.x + dx));
      seg.p1.y = Math.max(10, Math.min(this.height - 10, ptr.target.startP1.y + dy));
      seg.p2.x = Math.max(10, Math.min(this.width - 10, ptr.target.startP2.x + dx));
      seg.p2.y = Math.max(10, Math.min(this.height - 10, ptr.target.startP2.y + dy));
      this.app.scenesController.markActiveSceneModified();
    }

    // High-frequency live streaming to other devices and Arduino while dragging
    const now = performance.now();
    if (now - this.lastLiveSyncTime > 25) { // ~40 FPS
      this.lastLiveSyncTime = now;

      // Collect all circles currently moved by any active pointer
      const movedCircles = [];
      for (const p of this.activePointers.values()) {
        if (p.target && p.target.type === 'circle' && p.target.circle) {
          movedCircles.push({ circle: p.target.circle });
        }
      }

      if (movedCircles.length > 0) {
        this.app.sendDragUpdate(movedCircles);
      }

      // Check if any segment is currently being moved
      for (const p of this.activePointers.values()) {
        if (p.target && (p.target.type === 'handle' || p.target.type === 'segment_body')) {
          this.app.sendSegmentDragUpdate(p.target.segment.id, p.target.segment.p1, p.target.segment.p2);
        }
      }
    }
  }

  onPointerUp(e) {
    const ptr = this.activePointers.get(e.pointerId);
    if (!ptr) return;

    if (this.canvas.releasePointerCapture) {
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}
    }

    if (ptr.hasMoved) {
      this.app.scenesController.markActiveSceneModified();
      this.app.syncStateToServer();
    }

    this.activePointers.delete(e.pointerId);
  }

  distToSegment(p, v, w) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  bringCircleToFront(id) {
    const cid = id.startsWith('circle-') ? id.replace('circle-', '') : id;
    const idx = this.circles.findIndex(c => c.id === cid);
    if (idx !== -1 && idx !== this.circles.length - 1) {
      const [circle] = this.circles.splice(idx, 1);
      this.circles.push(circle);
      this.app.scenesController.markActiveSceneModified();
      this.app.syncStateToServer();
    }
  }

  selectElement(id, multi = false) {
    if (!multi) {
      if (this.selectedIds.has(id)) {
        // Toggle off if single clicked again
        this.selectedIds.delete(id);
      } else {
        this.selectedIds.clear();
        this.selectedIds.add(id);
      }
    } else {
      if (this.selectedIds.has(id)) {
        this.selectedIds.delete(id);
      } else {
        this.selectedIds.add(id);
      }
    }
    this.app.onSelectionChanged();
  }

  toggleElementSelection(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.app.onSelectionChanged();
  }

  clearSelection() {
    this.selectedIds.clear();
    this.app.onSelectionChanged();
  }

  getSelectedItems() {
    const list = [];
    this.selectedIds.forEach(id => {
      if (id.startsWith('circle-')) {
        const cid = id.replace('circle-', '');
        const c = this.circles.find(item => item.id === cid);
        if (c) list.push({ ...c, elementKind: 'circle' });
      } else if (id.startsWith('segment-')) {
        const sid = id.replace('segment-', '');
        const s = this.segments.find(item => item.id === sid);
        if (s) list.push({ ...s, elementKind: 'segment' });
      }
    });
    return list;
  }

  /**
   * Main render loop (60 FPS canvas preview). LED frames are produced server-side only.
   */
  startLoop() {
    const render = () => {
      this.glitchEngine.update();
      this.draw();
      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  }

  /**
   * Draw the stage elements on the Canvas
   */
  draw() {
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, cw, ch);

    // Dark stage background
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, cw, ch);

    // Apply scale to map logical (1000 x 500) to current canvas physical size
    const scaleX = cw / this.width;
    const scaleY = ch / this.height;
    this.ctx.scale(scaleX, scaleY);

    // Pre-parse active circles' colors once per frame (avoid hex parsing in hot loop)
    const parsedCircles = this.circles.filter(c => !c.off).map(c => {
      const hex = c.color || '#0055ff';
      const seed = c.id ? c.id.charCodeAt(0) : 65;
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

    // 1. Draw Segments (LED lines)
    for (const seg of this.segments) {
      this.drawSegment(seg, parsedCircles);
    }

    // 2. Draw Circles
    for (const c of this.circles) {
      this.drawCircle(c);
    }

    // 3. Draw Placement Preview if active
    if (this.placementMode) {
      this.ctx.save();
      this.ctx.strokeStyle = '#00ff41';
      this.ctx.setLineDash([6, 6]);
      this.ctx.beginPath();
      const r = (this.placementMode.size / 100) * 110;
      this.ctx.arc(this.dragStart.x || 500, this.dragStart.y || 250, r, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  drawSegment(seg, parsedCircles) {
    const isSelected = this.selectedIds.has(`segment-${seg.id}`);
    const isOff = seg.off === true;

    const dx = seg.p2.x - seg.p1.x;
    const dy = seg.p2.y - seg.p1.y;
    const count = Math.max(2, (seg.endLed - seg.startLed) + 1);

    // Connecting baseline (dim dotted line)
    this.ctx.save();
    this.ctx.strokeStyle = isOff ? '#1a331a' : (isSelected ? '#00ff41' : '#00aa2b');
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([3, 7]);
    this.ctx.beginPath();
    this.ctx.moveTo(seg.p1.x, seg.p1.y);
    this.ctx.lineTo(seg.p2.x, seg.p2.y);
    this.ctx.stroke();
    this.ctx.restore();

    // Render individual LED points along the segment
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const lx = seg.p1.x + t * dx;
      const ly = seg.p1.y + t * dy;
      const ledIdx = seg.startLed + i;

      // Check circle collisions for this LED point
      const activeColor = this.getLedColorAtPoint(lx, ly, ledIdx, isOff, parsedCircles);

      this.ctx.save();
      if (activeColor.lit) {
        // Glowing lit LED
        this.ctx.fillStyle = `rgb(${activeColor.r}, ${activeColor.g}, ${activeColor.b})`;
        this.ctx.shadowColor = `rgb(${activeColor.r}, ${activeColor.g}, ${activeColor.b})`;
        this.ctx.shadowBlur = 8;
        this.ctx.beginPath();
        this.ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        // Unlit LED representation (clean faint green point)
        this.ctx.fillStyle = isOff ? '#0c1a0c' : '#103310';
        this.ctx.beginPath();
        this.ctx.arc(lx, ly, 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }

    // Segment endpoints handles:
    // "The selected sements show solid ends the unselected are outlined"
    this.drawHandle(seg.p1.x, seg.p1.y, isSelected, isOff);
    this.drawHandle(seg.p2.x, seg.p2.y, isSelected, isOff);
  }

  drawHandle(x, y, isSelected, isOff) {
    this.ctx.save();
    const radius = 8;
    this.ctx.lineWidth = 2.5;

    if (isSelected) {
      // Solid filled handle (yellow if off, cyber green if on)
      this.ctx.fillStyle = isOff ? '#cc9900' : '#00ff41';
      this.ctx.strokeStyle = '#000000';
      this.ctx.shadowColor = isOff ? '#ffaa00' : '#00ff41';
      this.ctx.shadowBlur = 10;
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    } else {
      // Outlined hollow handle
      this.ctx.fillStyle = '#000000';
      this.ctx.strokeStyle = isOff ? '#aa7700' : '#00ff41';
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawCircle(c) {
    const isSelected = this.selectedIds.has(`circle-${c.id}`);
    const isOff = c.off === true;

    // Radius from size slider + Cabaret Voltaire dynamic glitch jitter
    const baseR = (c.size / 100) * 110;
    const jitter = isOff ? 0 : this.glitchEngine.getCircleRadiusJitter(c.glitch, c.id.charCodeAt(0));
    const r = Math.max(10, baseR + jitter);

    this.ctx.save();

    // "In the stage the selected circles are a solid line, the ones that are not selected are doted."
    if (isSelected) {
      this.ctx.setLineDash([]); // solid
      this.ctx.lineWidth = 3.5;
      this.ctx.strokeStyle = isOff ? '#ffaa00' : '#00ff41';
      this.ctx.shadowColor = isOff ? '#aa7700' : '#00ff41';
      this.ctx.shadowBlur = 12;
    } else {
      this.ctx.setLineDash([5, 6]); // dotted
      this.ctx.lineWidth = 2.2;
      this.ctx.strokeStyle = isOff ? '#886600' : '#00aa2b';
    }

    this.ctx.beginPath();
    this.ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    this.ctx.stroke();

    // Center letter identifier (yellow if off, green if active)
    this.ctx.font = 'bold 20px "Courier New", Courier, monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = isSelected ? '#00ff41' : '#00aa2b';
    if (isOff) this.ctx.fillStyle = '#ffaa00';
    this.ctx.fillText(c.id, c.x, c.y);

    this.ctx.restore();
  }

  /**
   * Determine LED color at position (lx, ly).
   * Accepts pre-parsed activeCircles array with cached {r, g, b} to avoid
   * re-parsing hex colors on every LED×circle collision.
   */
  getLedColorAtPoint(lx, ly, ledIndex, segmentIsOff, parsedCircles) {
    if (segmentIsOff) {
      return { lit: false, r: 0, g: 0, b: 0 };
    }

    // Test active circles from top to bottom in z-order (highest index is on top).
    // When circles overlap, they do not mix; the circle on top determines the color.
    for (let i = parsedCircles.length - 1; i >= 0; i--) {
      const pc = parsedCircles[i];
      const d = Math.hypot(lx - pc.x, ly - pc.y);

      if (d <= pc.radius) {
        // Run through glitch engine for the top circle
        const glitched = this.glitchEngine.processLed(
          { r: pc.cr, g: pc.cg, b: pc.cb },
          pc.glitch || 0,
          ledIndex,
          pc.seed
        );

        return {
          lit: true,
          r: glitched.r,
          g: glitched.g,
          b: glitched.b
        };
      }
    }

    return {
      lit: false,
      r: 0,
      g: 0,
      b: 0
    };
  }

}

window.StageEngine = StageEngine;
