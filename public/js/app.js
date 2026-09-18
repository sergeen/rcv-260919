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
    this.isSegmentsLocked = false;

    // Elements
    this.initDomReferences();
    this.bindDomEvents();

    this.lastInteractionTime = Date.now();

    // WebSocket init
    this.connectWebSocket();

    // Mobile default landscape initialization
    this.initMobileLandscape();
  }

  markUserInteracted() {
    this.lastInteractionTime = Date.now();
  }

  shouldStreamFrames() {
    // Stream frames if dragging, interacting recently, or glitch is active
    if (this.stage && this.stage.dragTarget) return true;
    if (Date.now() - this.lastInteractionTime < 4000) return true;
    if (this.stage && this.stage.circles) {
      return this.stage.circles.some(c => !c.off && c.glitch > 0);
    }
    return false;
  }

  sendLiveStageUpdate() {
    this.markUserInteracted();
    if (this.ws && this.wsConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'STAGE_LIVE_UPDATE',
        sceneId: this.scenesController.activeSceneId,
        segments: this.stage.segments,
        circles: this.stage.circles
      }));
    }
  }

  sendLiveModifierUpdate(prop, value) {
    this.markUserInteracted();
    if (this.ws && this.wsConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'MODIFIER_LIVE_UPDATE',
        sceneId: this.scenesController.activeSceneId,
        segments: this.stage.segments,
        circles: this.stage.circles,
        prop: prop,
        value: value
      }));
    }
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
    this.btnLockSegments = document.getElementById('btnLockSegments');
    this.mappingsSection = document.querySelector('.mappings-section');

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

    // Prompt Modal (In-app, no fullscreen exit)
    this.promptModal = document.getElementById('promptModal');
    this.promptTitle = document.getElementById('promptTitle');
    this.promptMessage = document.getElementById('promptMessage');
    this.promptInput = document.getElementById('promptInput');
    this.promptOkBtn = document.getElementById('promptOkBtn');
    this.promptCancelBtn = document.getElementById('promptCancelBtn');

    // Alert Notice Modal (In-app, no fullscreen exit)
    this.alertModal = document.getElementById('alertModal');
    this.alertTitle = document.getElementById('alertTitle');
    this.alertMessage = document.getElementById('alertMessage');
    this.alertOkBtn = document.getElementById('alertOkBtn');

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

    // Lock segments button
    if (this.btnLockSegments) {
      this.btnLockSegments.addEventListener('click', () => this.toggleSegmentsLock());
    }

    // Add circle default button (+)
    if (this.addCircleDefaultBtn) {
      this.addCircleDefaultBtn.addEventListener('click', () => {
        if (this.stage.placementMode && this.selectedPresetIndex === null) {
          this.deactivateCirclePlacement();
        } else {
          this.stage.clearSelection();
          this.selectedPresetIndex = null;
          this.activateCirclePlacement(null);
          this.renderPredefinedCirclesUI();
        }
      });
    }

    // Action: Borrar Elemento
    if (this.btnDeleteElement) {
      this.btnDeleteElement.addEventListener('click', () => {
        const selected = this.stage.getSelectedItems();
        if (selected.length === 0) {
          this.showAlert('Selecciona primero un elemento (círculo o segmento) para borrar.', 'SIN SELECCIÓN');
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
    } else if (msg.type === 'STAGE_LIVE_UPDATE' || msg.type === 'MODIFIER_LIVE_UPDATE') {
      if (msg.sceneId === this.scenesController.activeSceneId) {
        if (!this.stage.dragTarget) {
          const countChanged = (this.stage.circles.length !== msg.circles.length) || (this.stage.segments.length !== msg.segments.length);
          this.stage.segments = msg.segments.map(s => ({ ...s }));
          this.stage.circles = msg.circles.map(c => ({ ...c }));
          if (countChanged) {
            this.renderMappingsTable();
            this.renderCreatedCirclesUI();
          }
          if (msg.type === 'MODIFIER_LIVE_UPDATE' && msg.prop) {
            const selected = this.stage.getSelectedItems();
            if (selected.length > 0) {
              this.modifiers.syncWithSelection(selected);
            }
          }
        }
      }
    } else if (msg.type === 'SCENE_CHANGED') {
      this.scenesController.selectScene(msg.sceneId);
    } else if (msg.type === 'SEGMENTS_LOCK_UPDATE') {
      this.toggleSegmentsLock(msg.isLocked);
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
      selectedElementIds: Array.from(this.stage.selectedIds),
      segmentsLocked: this.isSegmentsLocked
    };
  }

  applyFullState(state, updateSelection = true) {
    if (!state) return;

    if (state.segmentsLocked !== undefined) {
      this.toggleSegmentsLock(state.segmentsLocked);
    }

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
  toggleSegmentsLock(forceState = null) {
    if (forceState !== null) {
      this.isSegmentsLocked = !!forceState;
    } else {
      this.isSegmentsLocked = !this.isSegmentsLocked;
    }

    if (this.btnLockSegments) {
      this.btnLockSegments.classList.toggle('active', this.isSegmentsLocked);
      this.btnLockSegments.title = this.isSegmentsLocked
        ? 'Segmentos bloqueados (click para desbloquear)'
        : 'Bloquear edición de segmentos';
    }

    if (this.mappingsSection) {
      this.mappingsSection.classList.toggle('is-locked', this.isSegmentsLocked);
    }

    if (this.addMappingBtn) {
      this.addMappingBtn.disabled = this.isSegmentsLocked;
    }

    // When locked, deselect any currently selected segments
    if (this.isSegmentsLocked) {
      let changed = false;
      this.stage.selectedIds.forEach(id => {
        if (id.startsWith('segment-')) {
          this.stage.selectedIds.delete(id);
          changed = true;
        }
      });
      if (changed) {
        this.onSelectionChanged();
      }
    }

    // Sync lock status across devices
    if (this.ws && this.wsConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SEGMENTS_LOCK_UPDATE',
        isLocked: this.isSegmentsLocked
      }));
    }
  }

  getNextSegmentId() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const count = this.stage.segments.length;
    const firstIdx = count % (alphabet.length - 1);
    const secondIdx = firstIdx + 1;
    return `${alphabet[firstIdx]}${alphabet[secondIdx]}`;
  }

  addNewMappingGroup() {
    if (this.isSegmentsLocked) return;

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

      // Single click selects/multi-selects (if not locked)
      row.addEventListener('click', (e) => {
        if (this.isSegmentsLocked) return;
        this.deactivateCirclePlacement();

        if (e.target.classList.contains('col-led')) {
          const prop = e.target.dataset.prop;
          const current = seg[prop];
          const label = prop === 'startLed' ? 'LED inicial' : 'LED final';
          this.showPrompt(
            `SEGMENTO ${seg.id}`,
            `Modificar ${label}:`,
            current,
            (val) => {
              if (this.isSegmentsLocked) return;
              const num = parseInt(val, 10);
              if (!isNaN(num) && num > 0) {
                seg[prop] = num;
                this.scenesController.markActiveSceneModified();
                this.renderMappingsTable();
                this.syncStateToServer();
              }
            }
          );
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
        this.deactivateCirclePlacement();
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
      const isSelected = (this.selectedPresetIndex === idx);
      circleBtn.className = `preset-circle-btn ${isSelected ? 'active' : ''}`;
      circleBtn.dataset.index = idx;

      // The colors of the predefined circles are the same as set in the parameters
      circleBtn.style.backgroundColor = preset.color || '#0055ff';

      circleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectPredefinedSlot(idx);
      });

      this.predefinedCirclesEl.appendChild(circleBtn);
    });
  }

  selectPredefinedSlot(index) {
    // Toggle off if already selected
    if (this.selectedPresetIndex === index) {
      this.deactivateCirclePlacement();
      return;
    }

    this.selectedPresetIndex = index;
    const preset = this.predefinedTemplates[index];

    // Clear any selection on the stage so sliders focus on this predefined circle
    this.stage.clearSelection();

    // Show its current saved parameters on the sliders
    if (preset.color) {
      this.modifiers.setColorFromValue(this.modifiers.findValueFromHex(preset.color), false);
    }
    if (preset.glitch !== undefined) {
      this.modifiers.setGlitchFromValue(preset.glitch, false);
    }
    if (preset.size !== undefined) {
      this.modifiers.setSizeFromValue(preset.size, false);
    }

    // Activate placement mode
    this.activateCirclePlacement(index);
    this.renderPredefinedCirclesUI();
  }

  deactivateCirclePlacement() {
    this.selectedPresetIndex = null;
    if (this.stage) {
      this.stage.placementMode = null;
      if (this.stage.canvas) {
        this.stage.canvas.style.cursor = 'default';
      }
    }
    this.renderPredefinedCirclesUI();
  }

  activateCirclePlacement(presetIndex) {
    let color, glitch, size;
    if (presetIndex !== null && this.predefinedTemplates[presetIndex]) {
      const p = this.predefinedTemplates[presetIndex];
      color = p.color || '#0055ff';
      glitch = p.glitch !== undefined ? p.glitch : 0;
      size = p.size !== undefined ? p.size : 60;
    } else {
      color = this.modifiers.currentColor.hex;
      glitch = this.modifiers.currentGlitch;
      size = this.modifiers.currentSize;
    }

    this.stage.placementMode = {
      presetIndex: presetIndex,
      color: color,
      glitch: glitch,
      size: size
    };
    if (this.stage.canvas) {
      this.stage.canvas.style.cursor = 'crosshair';
    }
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

    // Auto-deselect the predefined circle option and exit placement mode after placement
    this.deactivateCirclePlacement();

    this.scenesController.markActiveSceneModified();
    this.renderCreatedCirclesUI();
    this.syncStateToServer();
    this.sendLiveStageUpdate();
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
    // If a predefined template is selected, update that template!
    if (this.selectedPresetIndex !== null) {
      const preset = this.predefinedTemplates[this.selectedPresetIndex];
      if (preset) {
        preset[prop] = value;
        if (prop === 'color') {
          preset.fill = value;
        }
        if (this.stage.placementMode) {
          this.stage.placementMode[prop] = value;
        }
        // Immediately update button color and persist state
        this.renderPredefinedCirclesUI();
        this.syncStateToServer();
      }
      return;
    }

    const selected = this.stage.getSelectedItems();
    if (selected.length === 0) return;

    selected.forEach(item => {
      if (item.elementKind === 'circle') {
        const c = this.stage.circles.find(x => x.id === item.id);
        if (c) c[prop] = value;
      } else if (item.elementKind === 'segment' && !this.isSegmentsLocked) {
        // Size only affects circles
        if (prop !== 'size') {
          const s = this.stage.segments.find(x => x.id === item.id);
          if (s) s[prop] = value;
        }
      }
    });

    this.scenesController.markActiveSceneModified();
    this.sendLiveModifierUpdate(prop, value);
  }

  deleteSelectedElements() {
    const toDelete = new Set(this.stage.selectedIds);
    this.stage.circles = this.stage.circles.filter(c => !toDelete.has(`circle-${c.id}`));
    if (!this.isSegmentsLocked) {
      this.stage.segments = this.stage.segments.filter(s => !toDelete.has(`segment-${s.id}`));
    }
    this.stage.clearSelection();

    this.scenesController.markActiveSceneModified();
    this.renderMappingsTable();
    this.renderCreatedCirclesUI();
    this.syncStateToServer();
    this.sendLiveStageUpdate();
  }

  toggleSelectedElementsOff() {
    const selected = this.stage.getSelectedItems();
    if (selected.length === 0) {
      this.showAlert('Selecciona primero un elemento para apagar o encender.', 'SIN SELECCIÓN');
      return;
    }

    selected.forEach(item => {
      if (item.elementKind === 'circle') {
        const c = this.stage.circles.find(x => x.id === item.id);
        if (c) c.off = !c.off;
      } else if (item.elementKind === 'segment' && !this.isSegmentsLocked) {
        const s = this.stage.segments.find(x => x.id === item.id);
        if (s) s.off = !s.off;
      }
    });

    this.scenesController.markActiveSceneModified();
    this.renderMappingsTable();
    this.renderCreatedCirclesUI();
    this.syncStateToServer();
    this.sendLiveStageUpdate();
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

  showAlert(message, title = 'ATENCIÓN') {
    if (!this.alertModal) return;
    if (this.alertTitle) this.alertTitle.textContent = title;
    if (this.alertMessage) this.alertMessage.textContent = message;
    this.alertModal.classList.remove('hidden');

    const handleOk = () => {
      this.alertModal.classList.add('hidden');
      this.alertOkBtn.removeEventListener('click', handleOk);
    };
    this.alertOkBtn.addEventListener('click', handleOk);
  }

  showPrompt(title, message, defaultValue, onConfirm) {
    if (!this.promptModal) return;
    if (this.promptTitle) this.promptTitle.textContent = title;
    if (this.promptMessage) this.promptMessage.textContent = message;
    if (this.promptInput) {
      this.promptInput.value = defaultValue;
    }
    this.promptModal.classList.remove('hidden');
    if (this.promptInput) {
      setTimeout(() => {
        this.promptInput.focus();
        this.promptInput.select();
      }, 50);
    }

    const cleanup = () => {
      this.promptModal.classList.add('hidden');
      this.promptOkBtn.removeEventListener('click', handleOk);
      this.promptCancelBtn.removeEventListener('click', handleCancel);
      this.promptInput.removeEventListener('keydown', handleKey);
    };

    const handleOk = () => {
      const val = this.promptInput.value.trim();
      cleanup();
      if (val !== '' && onConfirm) {
        onConfirm(val);
      }
    };

    const handleCancel = () => {
      cleanup();
    };

    const handleKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleOk();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    this.promptOkBtn.addEventListener('click', handleOk);
    this.promptCancelBtn.addEventListener('click', handleCancel);
    this.promptInput.addEventListener('keydown', handleKey);
  }

  showConfirmModal(message, onConfirm) {
    if (!this.confirmModal) return;
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
