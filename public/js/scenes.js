/**
 * REQUIEM CABARET VOLTAIRE 2026 - SCENES CONTROLLER
 * Professional lighting-desk scene manager with RECORD workflow.
 * Scenes (! ? / [ - : > ~) act as stored memories.
 * Hitting RECORD arms record mode; tapping a scene button records the live look into that scene.
 * Tapping a scene normally recalls that scene's stored look.
 */

class ScenesController {
  constructor(app) {
    this.app = app;
    this.sceneSymbols = ['!', '?', '/', '[', '-', ':', '>', '~'];
    this.activeSceneId = '~';
    this.scenes = {};
    this.storedPresets = {};
    this.isRecordArmed = false;

    this.initDefaultScenes();
    this.bindEvents();
  }

  initDefaultScenes() {
    this.sceneSymbols.forEach(sym => {
      if (!this.scenes[sym]) {
        this.scenes[sym] = {
          isCustomized: false,
          segments: [],
          circles: []
        };
      }
      if (!this.storedPresets[sym]) {
        this.storedPresets[sym] = structuredClone(this.scenes[sym]);
      }
    });
  }

  loadScenesData(scenesData, activeId = '~', storedPresetsData = null) {
    if (scenesData) {
      this.scenes = Object.assign({}, scenesData);
      this.sceneSymbols.forEach(sym => {
        if (!this.scenes[sym]) {
          this.scenes[sym] = { isCustomized: false, segments: [], circles: [] };
        }
      });
    }

    if (storedPresetsData) {
      this.storedPresets = Object.assign({}, storedPresetsData);
    } else {
      this.storedPresets = structuredClone(this.scenes);
    }

    this.activeSceneId = activeId || '~';
    this.updateSceneButtonsUI();
  }

  bindEvents() {
    const pad = document.getElementById('scenesGrid') || document.getElementById('scenesDiamondPad');
    if (!pad) return;

    pad.addEventListener('click', (e) => {
      // 1. Check if REC button was clicked
      const recBtn = e.target.closest('#btnRecordScene, .btn-rec');
      if (recBtn) {
        this.toggleRecordMode();
        return;
      }

      // 2. Check if a Scene button was clicked
      const btn = e.target.closest('.scene-grid-btn, .scene-diamond-btn');
      if (!btn) return;
      const sceneId = btn.dataset.scene;
      if (sceneId) {
        if (this.isRecordArmed) {
          this.recordCurrentStageToScene(sceneId);
        } else {
          this.selectScene(sceneId);
        }
      }
    });
  }

  toggleRecordMode() {
    this.isRecordArmed = !this.isRecordArmed;
    this.updateRecordUI();
  }

  updateRecordUI() {
    const recBtn = document.getElementById('btnRecordScene');
    const pad = document.getElementById('scenesGrid') || document.getElementById('scenesDiamondPad');

    if (recBtn) {
      recBtn.classList.toggle('armed', this.isRecordArmed);
    }
    if (pad) {
      pad.classList.toggle('rec-armed', this.isRecordArmed);
    }
  }

  /**
   * Record current live stage look into the chosen scene (Classic Console Workflow)
   */
  recordCurrentStageToScene(sceneId) {
    const snapshot = this.app.getCurrentElementsSnapshot();

    const newLook = {
      isCustomized: true,
      segments: structuredClone(snapshot.segments),
      circles: structuredClone(snapshot.circles)
    };

    this.storedPresets[sceneId] = structuredClone(newLook);
    this.scenes[sceneId] = structuredClone(newLook);

    this.activeSceneId = sceneId;
    this.isRecordArmed = false;
    this.updateRecordUI();
    this.updateSceneButtonsUI();

    // Visual confirmation flash on the recorded button
    const btn = document.querySelector(`.scene-grid-btn[data-scene="${sceneId}"]`);
    if (btn) {
      btn.classList.add('recorded-flash');
      setTimeout(() => btn.classList.remove('recorded-flash'), 600);
    }

    // Persist full state to server and save to disk
    this.app.syncStateToServer();
  }

  /**
   * Recall a recorded scene's look onto the stage
   */
  selectScene(newSceneId) {
    const target = this.storedPresets[newSceneId] || this.scenes[newSceneId];
    this.activeSceneId = newSceneId;
    this.updateSceneButtonsUI();

    // If target scene has segments, use them. If not, preserve current stage segments
    const currentSnapshot = this.app.getCurrentElementsSnapshot();
    const segmentsToLoad = (target && target.segments && target.segments.length > 0)
      ? structuredClone(target.segments)
      : structuredClone(currentSnapshot.segments);
    const circlesToLoad = (target && target.circles)
      ? structuredClone(target.circles)
      : [];

    this.app.applySceneElements({ segments: segmentsToLoad, circles: circlesToLoad });
    this.markActiveSceneModified();
    this.app.syncStateToServer();
  }

  /**
   * Live modification hook (called during slider/drag operations).
   * Keeps this.scenes[this.activeSceneId] in sync with the live stage so that
   * live sync and LED engine always use current positions.
   * Does NOT overwrite this.storedPresets (which only updates on REC).
   */
  markActiveSceneModified() {
    if (this.app && this.app.stage && this.scenes[this.activeSceneId]) {
      this.scenes[this.activeSceneId].segments = structuredClone(this.app.stage.segments);
      this.scenes[this.activeSceneId].circles = structuredClone(this.app.stage.circles);
    }
  }

  updateSceneButtonsUI() {
    const buttons = document.querySelectorAll('.scene-grid-btn, .scene-diamond-btn');
    buttons.forEach(btn => {
      const isCurrent = btn.dataset.scene === this.activeSceneId;
      btn.classList.toggle('active', isCurrent);
    });
  }

  getExportData() {
    this.markActiveSceneModified();
    return {
      activeSceneId: this.activeSceneId,
      scenes: this.scenes,
      storedPresets: this.storedPresets
    };
  }
}

window.ScenesController = ScenesController;
