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
    });
  }

  loadScenesData(scenesData, activeId = '~') {
    if (scenesData) {
      this.scenes = Object.assign({}, scenesData);
      this.sceneSymbols.forEach(sym => {
        if (!this.scenes[sym]) {
          this.scenes[sym] = { isCustomized: false, segments: [], circles: [] };
        }
      });
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

    this.scenes[sceneId] = {
      isCustomized: true,
      segments: structuredClone(snapshot.segments),
      circles: structuredClone(snapshot.circles)
    };

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
    const target = this.scenes[newSceneId];
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
    this.app.syncStateToServer();
  }

  /**
   * Live modification hook (called during slider/drag operations).
   * In console workflow, live stage changes are live on the stage and strip,
   * but do not permanently overwrite scenes until RECORD is pressed.
   */
  markActiveSceneModified() {
    // In record-based workflow, live changes don't overwrite the stored scene memory.
    // The user presses REC -> Scene to store.
  }

  updateSceneButtonsUI() {
    const buttons = document.querySelectorAll('.scene-grid-btn, .scene-diamond-btn');
    buttons.forEach(btn => {
      const isCurrent = btn.dataset.scene === this.activeSceneId;
      btn.classList.toggle('active', isCurrent);
    });
  }

  getExportData() {
    return {
      activeSceneId: this.activeSceneId,
      scenes: this.scenes
    };
  }
}

window.ScenesController = ScenesController;
