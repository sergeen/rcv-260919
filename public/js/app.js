/**
 * REQUIEM CABARET VOLTAIRE 2026 - MAIN CONTROLLER
 * Coordinates Stage, Modifiers, Scenes, Mapping Groups, Predefined Templates,
 * Action Modals, WebSocket real-time synchronization, and USB Serial streaming.
 */

class App {
  constructor() {
    this.ws = null;
    this.wsConnected = false;
    this.isServerSimulated = true;
    this.wifiIp = 'localhost';

    // Sub-controllers
    this.stage = new StageEngine(this);
    this.modifiers = new ModifiersController(this);
    this.scenesController = new ScenesController(this);

    // Predefined circle templates (4 slots)
    this.predefinedTemplates = [
      { index: 0, color: '#00b48a', glitch: 0, size: 60, fill: '#00b48a' },
      { index: 1, color: '#002699', glitch: 25, size: 70, fill: '#002699' },
      { index: 2, color: '#66ff00', glitch: 55, size: 65, fill: '#66ff00' },
      { index: 3, color: '#ffffff', glitch: 90, size: 70, fill: 'transparent' }
    ];
    this.selectedPresetIndex = null;

    // Elements
    this.initDomReferences();
    this.bindDomEvents();

    // WebSocket init
    this.connectWebSocket();

    // Mobile default landscape initialization
    this.initMobileLandscape();
  }

  initMobileLandscape() {
    // Detect mobile / touch devices (desktop remains completely as is)
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
                     (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1024);

    if (isMobile) {
      const lockLandscape = () => {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      };

      lockLandscape();
      ['pointerdown', 'touchstart', 'click'].forEach(evt => {
        window.addEventListener(evt, lockLandscape, { once: true, passive: true });
      });
    }
  }

  initDomReferences() {
    this.mappingsListEl = document.getElementById('mappingsList');
    this.addMappingBtn = document.getElementById('addMappingBtn');

    this.createdCirclesListEl = document.getElementById('createdCirclesList');
    this.predefinedCirclesEl = document.getElementById('predefinedCircles');
    this.addCircleDefaultBtn = document.getElementById('addCircleDefaultBtn');

    this.btnDeleteElement = document.getElementById('btnDeleteElement');
    this.btnToggleOffElement = document.getElementById('btnToggleOffElement');

    // Confirm Modal
    this.confirmModal = document.getElementById('confirmModal');
    this.confirmMessage = document.getElementById('confirmMessage');
    this.confirmYesBtn = document.getElementById('confirmYesBtn');
    this.confirmNoBtn = document.getElementById('confirmNoBtn');

    // Connection info modal
    this.connectionModal = document.getElementById('connectionModal');
    this.statusIndicator = document.getElementById('statusIndicator');
    this.wifiIpDisplay = document.getElementById('wifiIpDisplay');
    this.qrCodeContainer = document.getElementById('qrCodeContainer');
    this.btnFullscreen = document.getElementById('btnFullscreen');
  }

  bindDomEvents() {
    // Fullscreen toggle button
    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('click', () => {
        this.toggleFullscreen();
      });

      const updateFullscreenIcon = () => {
        const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.btnFullscreen.classList.toggle('active', isFull);
        this.btnFullscreen.innerHTML = isFull
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
               <path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M4 10h6m0 0V4m0 6L3 3m17 7h-6m0 0V4m0 6l7-7"/>
             </svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
               <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
             </svg>`;
      };

      document.addEventListener('fullscreenchange', updateFullscreenIcon);
      document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
    }

    // Add mapping group button
    if (this.addMappingBtn) {
      this.addMappingBtn.addEventListener('click', () => this.addNewMappingGroup());
    }

    // Add circle default button (+)
    if (this.addCircleDefaultBtn) {
      this.addCircleDefaultBtn.addEventListener('click', () => {
        this.activateCirclePlacement(null);
      });
    }

    // Action: Borrar Elemento
    if (this.btnDeleteElement) {
      this.btnDeleteElement.addEventListener('click', () => {
        const selected = this.stage.getSelectedItems();
        if (selected.length === 0) {
          alert('Selecciona primero un elemento (círculo o segmento) para borrar.');
          return;
        }
        const names = selected.map(s => s.elementKind === 'circle' ? `Círculo ${s.id}` : `Segmento ${s.id}`).join(', ');
        this.showConfirmModal(`¿Confirmar borrado de: ${names}?`, () => {
          this.deleteSelectedElements();
        });
      });
    }

    // Action: Apagar Elemento
    if (this.btnToggleOffElement) {
      this.btnToggleOffElement.addEventListener('click', () => {
        this.toggleSelectedElementsOff();
      });
    }

    // Status indicator click -> show connection details
    if (this.statusIndicator) {
      this.statusIndicator.addEventListener('click', () => {
        if (this.connectionModal) this.connectionModal.classList.toggle('hidden');
      });
    }

    const closeConnModal = document.getElementById('closeConnModal');
    if (closeConnModal) {
      closeConnModal.addEventListener('click', () => {
        if (this.connectionModal) this.connectionModal.classList.add('hidden');
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /* WEBSOCKET SYNCHRONIZATION & HARDWARE STREAMING                             */
  /* -------------------------------------------------------------------------- */
  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}//${host}`);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.wsConnected = true;
      this.updateStatusBadge();
    };

    this.ws.onclose = () => {
      this.wsConnected = false;
      this.updateStatusBadge();
      setTimeout(() => this.connectWebSocket(), 2000);
    };

    this.ws.onerror = () => {
      this.wsConnected = false;
      this.updateStatusBadge();
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          this.handleServerMessage(msg);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      }
    };
  }

  handleServerMessage(msg) {
    if (msg.type === 'INIT') {
      if (msg.wifiIp) this.wifiIp = msg.wifiIp;
      if (msg.serial) {
        this.isServerSimulated = msg.serial.simulated;
        this.updateStatusBadge();
      }
      if (msg.state) {
        this.applyFullState(msg.state);
      }
    } else if (msg.type === 'SERIAL_STATUS') {
      this.isServerSimulated = msg.serial.simulated;
      this.updateStatusBadge();
    } else if (msg.type === 'STATE_UPDATE') {
      this.applyFullState(msg.state, false);
    } else if (msg.type === 'SCENE_CHANGED') {
      this.scenesController.selectScene(msg.sceneId);
    }
  }

  sendLedFrame(uint8Array) {
    if (this.ws && this.wsConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(uint8Array.buffer);
    }
  }

  syncStateToServer() {
    if (this.ws && this.wsConnected && this.ws.readyState === WebSocket.OPEN) {
      const fullState = this.getFullState();
      this.ws.send(JSON.stringify({
        type: 'SYNC_STATE',
        state: fullState
      }));
    }
  }

  updateStatusBadge() {
    if (!this.statusIndicator) return;
    if (!this.wsConnected) {
      this.statusIndicator.innerHTML = '<span class="dot red"></span> DESCONECTADO';
    } else if (this.isServerSimulated) {
      this.statusIndicator.innerHTML = '<span class="dot yellow"></span> SIMULADO (USB)';
    } else {
      this.statusIndicator.innerHTML = '<span class="dot green"></span> MEGA 2560 CONECTADO';
    }

    if (this.wifiIpDisplay) {
      this.wifiIpDisplay.textContent = `http://${this.wifiIp}:${window.location.port || 3000}`;
    }
  }

  /* -------------------------------------------------------------------------- */
  /* STATE MANAGEMENT                                                           */
  /* -------------------------------------------------------------------------- */
  getFullState() {
    const scenesData = this.scenesController.getExportData();
    return {
      activeSceneId: scenesData.activeSceneId,
      scenes: scenesData.scenes,
      predefinedCircles: this.predefinedTemplates,
      selectedElementIds: Array.from(this.stage.selectedIds)
    };
  }

  applyFullState(state, updateSelection = true) {
    if (!state) return;

    if (state.predefinedCircles && Array.isArray(state.predefinedCircles)) {
      this.predefinedTemplates = state.predefinedCircles;
      this.renderPredefinedCirclesUI();
    }

    if (state.scenes) {
      this.scenesController.loadScenesData(state.scenes, state.activeSceneId || '~');
      const activeScene = state.scenes[state.activeSceneId || '~'];
      if (activeScene) {
        this.applySceneElements(activeScene);
      }
    }

    if (updateSelection && state.selectedElementIds) {
      this.stage.selectedIds = new Set(state.selectedElementIds);
      this.onSelectionChanged();
    }
  }

  getCurrentElementsSnapshot() {
    return {
      segments: JSON.parse(JSON.stringify(this.stage.segments)),
      circles: JSON.parse(JSON.stringify(this.stage.circles))
    };
  }

  applySceneElements(sceneData) {
    this.stage.segments = (sceneData.segments || []).map(s => ({ ...s }));
    this.stage.circles = (sceneData.circles || []).map(c => ({ ...c }));
    this.renderMappingsTable();
    this.renderCreatedCirclesUI();
    this.onSelectionChanged();
  }

  /* -------------------------------------------------------------------------- */
  /* MAPPING GROUPS (SEGMENTS)                                                  */
  /* -------------------------------------------------------------------------- */
  getNextSegmentId() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const count = this.stage.segments.length;
    const firstIdx = count % (alphabet.length - 1);
    const secondIdx = firstIdx + 1;
    return `${alphabet[firstIdx]}${alphabet[secondIdx]}`;
  }

  addNewMappingGroup() {
    const id = this.getNextSegmentId();

    // Calculate start & end LED indices
    let lastEnd = 0;
    for (const s of this.stage.segments) {
      if (s.endLed > lastEnd) lastEnd = s.endLed;
    }
    const startLed = lastEnd + 1;
    const endLed = startLed + 39; // 40 LEDs default group

    // Calculate staggered coordinates on stage
    const offset = (this.stage.segments.length * 35) % 150;
    const newSeg = {
      id: id,
      p1: { x: 180 + offset, y: 150 + offset },
      p2: { x: 800 - offset, y: 350 - offset },
      startLed: startLed,
      endLed: endLed,
      off: false
    };

    this.stage.segments.push(newSeg);
    this.stage.selectElement(`segment-${newSeg.id}`, false);
    this.scenesController.markActiveSceneModified();
    this.renderMappingsTable();
    this.syncStateToServer();
  }

  renderMappingsTable() {
    if (!this.mappingsListEl) return;
    this.mappingsListEl.innerHTML = '';

    this.stage.segments.forEach(seg => {
      const isSelected = this.stage.selectedIds.has(`segment-${seg.id}`);
      const row = document.createElement('div');
      row.className = `mapping-row ${isSelected ? 'selected' : ''} ${seg.off ? 'is-off' : ''}`;
      row.dataset.id = seg.id;

      const offBadge = seg.off ? '<span class="off-badge blink-fade">OFF</span>' : '';

      row.innerHTML = `
        <div class="col-name">${seg.id} ${offBadge}</div>
        <div class="col-led col-start" data-prop="startLed">${seg.startLed}</div>
        <div class="col-led col-end" data-prop="endLed">${seg.endLed}</div>
      `;

      // Single click selects/multi-selects
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('col-led')) {
          // Edit LED index prompt
          const prop = e.target.dataset.prop;
          const current = seg[prop];
          const val = prompt(`Modificar ${prop === 'startLed' ? 'LED inicial' : 'LED final'} para segmento ${seg.id}:`, current);
          if (val !== null && !isNaN(parseInt(val, 10))) {
            seg[prop] = Math.max(1, parseInt(val, 10));
            this.scenesController.markActiveSceneModified();
            this.renderMappingsTable();
            this.syncStateToServer();
          }
          return;
        }
        this.stage.toggleElementSelection(`segment-${seg.id}`);
      });

      this.mappingsListEl.appendChild(row);
    });
  }

  /* -------------------------------------------------------------------------- */
  /* CIRCLES MANAGEMENT (ACTIVE & PREDEFINED)                                   */
  /* -------------------------------------------------------------------------- */
  getNextCircleId() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const used = new Set(this.stage.circles.map(c => c.id));
    for (let i = 0; i < letters.length; i++) {
      if (!used.has(letters[i])) return letters[i];
    }
    return `C${this.stage.circles.length + 1}`;
  }

  renderCreatedCirclesUI() {
    if (!this.createdCirclesListEl) return;
    this.createdCirclesListEl.innerHTML = '';

    this.stage.circles.forEach(c => {
      const isSelected = this.stage.selectedIds.has(`circle-${c.id}`);
      const badge = document.createElement('div');
      badge.className = `circle-badge ${isSelected ? 'active blink-fade' : ''} ${c.off ? 'is-off' : ''}`;
      badge.dataset.id = c.id;

      badge.innerHTML = `
        <span class="badge-letter">${c.id}</span>
        ${c.off ? '<span class="badge-off blink-fade">OFF</span>' : ''}
      `;

      // Multi-select toggle
      badge.addEventListener('click', () => {
        this.stage.toggleElementSelection(`circle-${c.id}`);
      });

      this.createdCirclesListEl.appendChild(badge);
    });
  }

  renderPredefinedCirclesUI() {
    if (!this.predefinedCirclesEl) return;
    this.predefinedCirclesEl.innerHTML = '';

    this.predefinedTemplates.forEach((preset, idx) => {
      const circleBtn = document.createElement('div');
      circleBtn.className = `preset-circle-btn ${this.selectedPresetIndex === idx ? 'active' : ''}`;
      circleBtn.dataset.index = idx;

      circleBtn.style.backgroundColor = preset.fill || preset.color;
      circleBtn.style.borderColor = '#00ff41';

      circleBtn.addEventListener('click', () => {
        this.selectPredefinedSlot(idx);
      });

      this.predefinedCirclesEl.appendChild(circleBtn);
    });
  }

  selectPredefinedSlot(index) {
    this.selectedPresetIndex = index;
    const preset = this.predefinedTemplates[index];

    // Show its current parameters on the sliders
    this.modifiers.setColorFromValue(this.modifiers.findValueFromHex(preset.color), false);
    this.modifiers.setGlitchFromValue(preset.glitch, false);
    this.modifiers.setSizeFromValue(preset.size, false);

    // Prepare placement mode
    this.activateCirclePlacement(index);
    this.renderPredefinedCirclesUI();
  }

  activateCirclePlacement(presetIndex) {
    const template = presetIndex !== null ? this.predefinedTemplates[presetIndex] : {
      color: this.modifiers.currentColor.hex,
      glitch: this.modifiers.currentGlitch,
      size: this.modifiers.currentSize
    };

    this.stage.placementMode = {
      presetIndex: presetIndex,
      color: template.color,
      glitch: template.glitch,
      size: template.size
    };
    this.stage.canvas.style.cursor = 'crosshair';
  }

  completeCirclePlacement(x, y, placementData) {
    const newId = this.getNextCircleId();
    const newCircle = {
      id: newId,
      x: Math.round(x),
      y: Math.round(y),
      size: placementData.size,
      color: placementData.color,
      glitch: placementData.glitch,
      off: false
    };

    this.stage.circles.push(newCircle);
    this.stage.selectElement(`circle-${newCircle.id}`, false);
    this.scenesController.markActiveSceneModified();

    this.renderCreatedCirclesUI();
    this.syncStateToServer();
  }

  /* -------------------------------------------------------------------------- */
  /* SELECTION & MODIFIERS                                                      */
  /* -------------------------------------------------------------------------- */
  onSelectionChanged() {
    this.renderMappingsTable();
    this.renderCreatedCirclesUI();

    const selected = this.stage.getSelectedItems();
    if (selected.length > 0) {
      this.modifiers.syncWithSelection(selected);
    }
  }

  applyModifierToSelected(prop, value) {
    const selected = this.stage.getSelectedItems();

    // If no elements are selected but a predefined template is selected, update that template!
    if (selected.length === 0 && this.selectedPresetIndex !== null) {
      const preset = this.predefinedTemplates[this.selectedPresetIndex];
      preset[prop] = value;
      if (prop === 'color') preset.fill = value;
      this.renderPredefinedCirclesUI();
      this.syncStateToServer();
      return;
    }

    if (selected.length === 0) return;

    selected.forEach(item => {
      if (item.elementKind === 'circle') {
        const c = this.stage.circles.find(x => x.id === item.id);
        if (c) c[prop] = value;
      } else if (item.elementKind === 'segment') {
        // Size only affects circles
        if (prop !== 'size') {
          const s = this.stage.segments.find(x => x.id === item.id);
          if (s) s[prop] = value;
        }
      }
    });

    this.scenesController.markActiveSceneModified();
    this.syncStateToServer();
  }

  deleteSelectedElements() {
    const toDelete = new Set(this.stage.selectedIds);
    this.stage.circles = this.stage.circles.filter(c => !toDelete.has(`circle-${c.id}`));
    this.stage.segments = this.stage.segments.filter(s => !toDelete.has(`segment-${s.id}`));
    this.stage.clearSelection();

    this.scenesController.markActiveSceneModified();
    this.renderMappingsTable();
    this.renderCreatedCirclesUI();
    this.syncStateToServer();
  }

  toggleSelectedElementsOff() {
    const selected = this.stage.getSelectedItems();
    if (selected.length === 0) {
      alert('Selecciona primero un elemento para apagar o encender.');
      return;
    }

    selected.forEach(item => {
      if (item.elementKind === 'circle') {
        const c = this.stage.circles.find(x => x.id === item.id);
        if (c) c.off = !c.off;
      } else if (item.elementKind === 'segment') {
        const s = this.stage.segments.find(x => x.id === item.id);
        if (s) s.off = !s.off;
      }
    });

    this.scenesController.markActiveSceneModified();
    this.renderMappingsTable();
    this.renderCreatedCirclesUI();
    this.syncStateToServer();
  }

  toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(err => console.warn('Fullscreen error:', err));
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.warn('Exit fullscreen error:', err));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  showConfirmModal(message, onConfirm) {
    if (!this.confirmModal) {
      if (confirm(message)) onConfirm();
      return;
    }
    this.confirmMessage.textContent = message;
    this.confirmModal.classList.remove('hidden');

    const handleYes = () => {
      this.confirmModal.classList.add('hidden');
      this.confirmYesBtn.removeEventListener('click', handleYes);
      this.confirmNoBtn.removeEventListener('click', handleNo);
      onConfirm();
    };

    const handleNo = () => {
      this.confirmModal.classList.add('hidden');
      this.confirmYesBtn.removeEventListener('click', handleYes);
      this.confirmNoBtn.removeEventListener('click', handleNo);
    };

    this.confirmYesBtn.addEventListener('click', handleYes);
    this.confirmNoBtn.addEventListener('click', handleNo);
  }
}

// Instantiate on load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
